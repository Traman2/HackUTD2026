import { WebSocket } from "ws";

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is required for voice.");
  return key;
}
export class AudioQueue implements AsyncIterable<Uint8Array> {
  private frames: Uint8Array[] = [];
  private wake?: () => void;
  private ended = false;
  push(frame: Uint8Array) {
    if (this.ended) throw new Error("Audio stream ended.");
    if (!frame.length || frame.length % 2 || frame.length > 16000 || this.frames.length >= 80) throw new Error("Audio buffer exceeded its limit.");
    this.frames.push(frame); this.wake?.(); this.wake = undefined;
  }
  end() { this.ended = true; this.wake?.(); this.wake = undefined; }
  async *[Symbol.asyncIterator]() {
    while (!this.ended || this.frames.length) {
      const frame = this.frames.shift();
      if (frame) yield frame;
      else await new Promise<void>(resolve => { this.wake = resolve; });
    }
  }
}
export async function transcribeAudio(queue: AudioQueue, sampleRate: number, signal: AbortSignal, partial: (text: string) => void) {
  signal.throwIfAborted();
  if (![8000, 16000, 24000, 48000].includes(sampleRate)) throw new Error("Unsupported PCM sample rate.");
  const url = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
  url.searchParams.set("model_id", "scribe_v2_realtime");
  url.searchParams.set("audio_format", `pcm_${sampleRate}`);
  url.searchParams.set("commit_strategy", "manual");
  url.searchParams.set("language_code", (process.env.VOICE_LANGUAGE_CODE || "en").split("-")[0]!);
  const socket = new WebSocket(url, { headers: { "xi-api-key": apiKey() }, handshakeTimeout: 10000 });
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let started = false;
    let committing = false;
    const timer = setTimeout(() => finish(new Error("ElevenLabs transcription timed out.")), 45000);
    const onAbort = () => finish(signal.reason instanceof Error ? signal.reason : new Error("Transcription cancelled."));
    function finish(error?: Error, text = "") {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      queue.end();
      socket.terminate();
      if (error) reject(error); else resolve(text.trim());
    }
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    socket.on("error", () => finish(new Error("ElevenLabs transcription connection failed.")));
    socket.on("unexpected-response", (_request, response) => {
      response.resume();
      finish(new Error(`ElevenLabs transcription rejected (HTTP ${response.statusCode}). Check API key permissions and credits.`));
    });
    socket.on("close", () => finish(new Error("ElevenLabs transcription closed before returning a transcript.")));
    socket.on("message", raw => {
      try {
        const event = JSON.parse(raw.toString()) as { message_type: string; text?: string };
        if (event.message_type === "session_started" && !started) {
          started = true;
          void (async () => {
            for await (const frame of queue) {
              if (settled) return;
              socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: Buffer.from(frame).toString("base64"), sample_rate: sampleRate }));
            }
            if (settled) return;
            committing = true;
            // A short silence tail makes the manual end-of-utterance commit explicit.
            socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: Buffer.alloc(sampleRate / 2).toString("base64"), sample_rate: sampleRate, commit: true }));
          })().catch(() => finish(new Error("Could not send audio to ElevenLabs.")));
        } else if (event.message_type === "partial_transcript") partial(event.text || "");
        else if (event.message_type === "committed_transcript" && committing) finish(undefined, event.text || "");
        else if (event.message_type === "error" || event.message_type.endsWith("_error") || ["auth_error", "quota_exceeded", "rate_limited", "unaccepted_terms", "throttled"].includes(event.message_type)) {
          finish(new Error(`ElevenLabs transcription failed (${event.message_type}). Check speech-to-text permission, credits, and account access.`));
        }
      } catch { finish(new Error("Invalid transcription response from ElevenLabs.")); }
    });
  });
}
export async function synthesizeVoice(text: string, signal: AbortSignal): Promise<Buffer> {
  const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST", signal, headers: { "xi-api-key": apiKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 1000), model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5" }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`ElevenLabs speech rejected (HTTP ${response.status}). Check text-to-speech permission, voice, and credits.`); }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error("ElevenLabs returned no speech audio.");
  return audio;
}
