import type { Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { isCompleteObservation, signedVoiceGrantSchema, voiceGrantSchema } from "../validation/resolution.ts";
import { SpacetimeResolutionStore, type VoiceSnapshot, type VoiceTurn } from "./spacetime-resolution-store.ts";
import { runResolutionTurn } from "./resolution-agent.ts";
import { AudioQueue, transcribeAudio, synthesizeVoice } from "./voice-speech.ts";

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("authenticate"), ticket: signedVoiceGrantSchema }),
  z.object({ type: z.literal("utterance.start"), clientTurnId: z.string().uuid(), sampleRate: z.union([z.literal(16000), z.literal(8000), z.literal(24000), z.literal(48000)]), actionId: z.string().max(100).optional(), revision: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("utterance.end") }),
  z.object({ type: z.literal("utterance.discard") }),
  z.object({ type: z.literal("photo.result"), requestId: z.string().max(100), photoId: z.string().regex(/^\d+$/).optional(), error: z.string().max(300).optional() }),
  z.object({ type: z.literal("text"), clientTurnId: z.string().uuid(), text: z.string().trim().min(1).max(4000), actionId: z.string().max(100).optional(), revision: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("repeat"), clientTurnId: z.string().uuid() }),
  z.object({ type: z.literal("playback.completed"), clientTurnId: z.string().uuid() }),
  z.object({ type: z.literal("ping") }), z.object({ type: z.literal("cancel") }),
]);

export function attachVoiceServer(server: Server, apiKey: string) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 20000, perMessageDeflate: false });
  const sessions = new Set<string>();
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/voice" || wss.clients.size >= 8) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
  });
  wss.on("connection", ws => {
    let store: SpacetimeResolutionStore | undefined;
    let authenticating = false;
    let authenticated = false;
    let busy = false;
    let lastActivity = Date.now();
    let recording: { queue: AudioQueue; result: Promise<string>; id: string; bytes: number; rate: number; timer: ReturnType<typeof setTimeout>; actionId?: string; revision?: number } | undefined;
    let abort = new AbortController();
    let capture: { requestId: string; clientTurnId: string; emergency: boolean; timer: ReturnType<typeof setTimeout> } | undefined;
    const send = (value: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
    const authTimer = setTimeout(() => { if (!store) ws.close(1008, "Authentication required"); }, 10000);
    const heartbeat = setInterval(() => {
      if (Date.now() - lastActivity > 180000) { ws.close(1000, "Session idle"); return; }
      if (store && !busy && !recording) void store.call("load").catch(() => ws.close(1008, "Voice access expired"));
    }, 25000);
    async function speak(snapshot: VoiceSnapshot, turn: VoiceTurn) {
      send({ type: "assistant.message", snapshot, turn });
      try {
        const audio = await synthesizeVoice(turn.assistantTranscript, AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]));
        if (!abort.signal.aborted) send({ type: "audio.ready", clientTurnId: turn.clientTurnId, contentType: "audio/mpeg", base64: audio.toString("base64") });
      } catch { if (!abort.signal.aborted) send({ type: "error", stage: "speech", message: "Speech failed. Start the agent to resume the checklist." }); }
    }
    async function turn(id: string, text: string, actionId?: string, revision?: number) {
      if (!store) throw new Error("Not authenticated.");
      const confirmation = actionId !== undefined && revision !== undefined ? { actionId, revision } : undefined;
      let result;
      try { result = await runResolutionTurn(store, id, text, confirmation); }
      catch (error) { await store.call("fail", { clientTurnId: id }).catch(() => {}); throw error; }
      if (result.snapshot.photoRequest) {
        requestPhoto(result.snapshot);
        if (result.snapshot.photoRequest.emergency) await speak(result.snapshot, result.turn);
        else send({ type: "assistant.message", snapshot: result.snapshot, turn: result.turn });
        return;
      }
      await speak(result.snapshot, result.turn);
      send({ type: "turn.completed" });
    }
    function requestPhoto(snapshot: VoiceSnapshot) {
      const request = snapshot.photoRequest!;
      capture = { ...request, timer: setTimeout(() => { void finishPhoto(request.requestId).catch(() => ws.close(1011, "Photo completion failed")); }, 30000) };
      send({ type: "photo.request", ...request, ticketId: snapshot.ticketId, snapshot });
    }
    async function finishPhoto(requestId: string, photoId?: string) {
      if (!store || !capture || capture.requestId !== requestId) return;
      const current = capture; clearTimeout(current.timer); capture = undefined; busy = true;
      try {
        const snapshot = await store.call("photoResult", { requestId, ...(photoId ? { photoId } : {}) });
        const turn = snapshot.turns.find(t => t.clientTurnId === current.clientTurnId)!;
        if (current.emergency) send({ type: "photo.completed", snapshot, turn });
        else await speak(snapshot, turn);
        send({ type: "turn.completed" });
      } finally { busy = false; }
    }
    ws.on("message", (raw, binary) => {
      if (binary) {
        if (!recording || !store) { ws.close(1008, "Audio requires an active utterance"); return; }
        try {
          const frame = Buffer.from(raw as Buffer);
          recording.bytes += frame.length;
          if (recording.bytes > recording.rate * 2 * 30) throw new Error("Utterance too long.");
          recording.queue.push(frame); lastActivity = Date.now();
        } catch { abort.abort(); recording.queue.end(); ws.close(1009, "Audio limit exceeded"); }
        return;
      }
      void (async () => {
        const msg = messageSchema.parse(JSON.parse(raw.toString()));
        lastActivity = Date.now();
        if (msg.type === "authenticate") {
          if (store || authenticating) throw new Error("Already authenticated.");
          authenticating = true;
          const expected = createHmac("sha256", apiKey).update(msg.ticket.payload).digest();
          if (!timingSafeEqual(expected, Buffer.from(msg.ticket.signature, "hex"))) throw new Error("Invalid voice authorization.");
          const grant = voiceGrantSchema.parse(JSON.parse(msg.ticket.payload));
          if (grant.expiresAt < Date.now() || grant.expiresAt > Date.now() + 65000 || sessions.has(grant.sessionId)) throw new Error("Voice authorization expired or session already connected.");
          sessions.add(grant.sessionId);
          store = new SpacetimeResolutionStore(grant.sessionId, grant.owner);
          const snapshot = await store.call("connect", { nonce: grant.nonce });
          authenticated = true;
          clearTimeout(authTimer);
          send({ type: "session.ready", snapshot });
          if (snapshot.photoRequest) requestPhoto(snapshot);
          return;
        }
        if (!store || !authenticated) throw new Error("Authenticate first.");
        if (msg.type === "ping") { send({ type: "pong" }); return; }
        if (msg.type === "photo.result") { await finishPhoto(msg.requestId, msg.photoId); return; }
        if (msg.type === "cancel") { abort.abort(); recording?.queue.end(); ws.close(1000, "Stopped"); return; }
        if (msg.type === "playback.completed") { await store.call("playback", { clientTurnId: msg.clientTurnId }); return; }
        if (msg.type === "utterance.discard") {
          if (recording) { const current = recording; recording = undefined; clearTimeout(current.timer); abort.abort(); current.queue.end(); }
          send({ type: "utterance.discarded" }); return;
        }
        if (msg.type === "utterance.end") {
          if (!recording) throw new Error("No active utterance.");
          const current = recording; recording = undefined; clearTimeout(current.timer); busy = true;
          current.queue.end();
          try {
            const text = await current.result;
            if (!isCompleteObservation(text)) { send({ type: "utterance.discarded" }); return; }
            send({ type: "transcript.final", text });
            await turn(current.id, text, current.actionId, current.revision);
          } finally { busy = false; }
          return;
        }
        if (busy || recording || capture) throw new Error("Wait for the current voice turn.");
        if (msg.type === "utterance.start") {
          await store.call("load");
          const queue = new AudioQueue();
          abort = new AbortController();
          const utteranceAbort = abort;
          const timer = setTimeout(() => { queue.end(); abort.abort(); ws.close(1008, "Utterance exceeded 30 seconds"); }, 31000);
          const result = transcribeAudio(queue, msg.sampleRate, AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]), text => send({ type: "transcript.partial", text }));
          // Attach rejection immediately: the provider can reject before utterance.end arrives.
          void result.catch(() => {
            queue.end(); clearTimeout(timer);
            if (utteranceAbort.signal.aborted) return;
            if (recording?.queue === queue) recording = undefined;
            send({ type: "error", stage: "transcription", message: "Transcription failed. Start the agent to retry." });
          });
          recording = { queue, result, id: msg.clientTurnId, bytes: 0, rate: msg.sampleRate, timer, actionId: msg.actionId, revision: msg.revision };
          send({ type: "utterance.ready" }); return;
        }
        busy = true; abort = new AbortController();
        try {
          if (msg.type === "text") await turn(msg.clientTurnId, msg.text, msg.actionId, msg.revision);
          else if (msg.type === "repeat") {
            const snapshot = await store.call("load");
            const saved = snapshot.turns.find(t => t.clientTurnId === msg.clientTurnId);
            if (!saved?.assistantTranscript) throw new Error("No saved reply to repeat.");
            await speak(snapshot, saved); send({ type: "turn.completed" });
          }
        } finally { busy = false; }
      })().catch(error => {
        const detail = error instanceof Error ? error.message.replace(/^.*fatal error:\s*/i, "") : "Voice request failed.";
        send({ type: "error", stage: "request", message: detail.length < 250 && !(error instanceof z.ZodError) ? detail : "Voice request failed. Reconnect or use the manual checklist." });
        if (!authenticated) ws.close(1008, "Authorization failed");
      });
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clearTimeout(authTimer); clearInterval(heartbeat); abort.abort();
      if (capture) clearTimeout(capture.timer);
      if (recording) { clearTimeout(recording.timer); recording.queue.end(); }
      if (store) { sessions.delete(store.sessionId); void store.close().catch(() => {}); }
    });
  });
  return wss;
}
