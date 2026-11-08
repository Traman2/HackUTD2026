import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(new URL("../.env", import.meta.url))) loadEnvFile(new URL("../.env", import.meta.url));
const { AudioQueue, synthesizeVoice, transcribeAudio } = await import("../src/agents/voice-speech.ts");
let failed = false;
try {
  const audio = await synthesizeVoice("Voice guidance is ready.", AbortSignal.timeout(20000));
  console.log("ElevenLabs speech: PASS", audio.length, "MP3 bytes");
} catch (error) { failed = true; console.log("ElevenLabs speech: FAIL", error instanceof Error ? error.message : "UnknownError"); }
try {
  // Generate a known spoken fixture; silence alone cannot prove recognition.
  const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_16000`, {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY || "", "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Voice guidance is ready.", model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5" }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Speech fixture failed (HTTP ${response.status}).`); }
  const pcm = Buffer.from(await response.arrayBuffer());
  const queue = new AudioQueue();
  const done = transcribeAudio(queue, 16000, AbortSignal.timeout(20000), () => {});
  void done.catch(() => {});
  for (let i = 0; i < pcm.length; i += 3200) { queue.push(pcm.subarray(i, i + 3200)); await new Promise(resolve => setTimeout(resolve, 100)); }
  queue.end();
  const text = await done;
  if (!/voice guidance is ready/i.test(text)) throw new Error("Recognized speech did not match the known fixture.");
  console.log("ElevenLabs Scribe: PASS (spoken fixture recognized)");
} catch (error) { failed = true; console.log("ElevenLabs Scribe: FAIL", error instanceof Error ? error.message : "UnknownError"); }
process.exitCode = failed ? 1 : 0;
