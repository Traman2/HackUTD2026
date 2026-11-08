// Test-only database: publish tests/voice-fixture on localhost:3010 first.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const host = "http://127.0.0.1:3010";
const database = process.env.VOICE_TEST_DATABASE || "voice-integration-check";
assert.match(database, /^voice-integration-check(?:-[a-z0-9]+)*$/);
process.env.SPACETIMEDB_HOST = host;
process.env.SPACETIMEDB_DB_NAME = database;
process.env.AGENT_API_KEY = "voice-test-only-key";
const { SpacetimeResolutionStore } = await import("../src/agents/spacetime-resolution-store.ts");
const { runResolutionTurn } = await import("../src/agents/resolution-agent.ts");
async function call(token: string, name: string, args: unknown[]) {
  const response = await fetch(`${host}/v1/database/${database}/call/${name}`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const body = await response.text();
  if (!response.ok) throw new Error(body);
  if (!body) return null;
  const value = JSON.parse(body); return typeof value === "string" ? JSON.parse(value) : value;
}
const token = (await (await fetch(`${host}/v1/identity`, { method: "POST" })).json() as { token: string }).token;
const username = `voice_${randomUUID().slice(0, 8)}`;
await call(token, "signup", [username, "demo-test", "Voice Test"]);
await call(token, "seed_voice_test", [randomUUID()]);
const response = await fetch(`${host}/v1/database/${database}/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "SELECT id FROM my_tickets" });
const ticketId = Number((await response.json() as { rows: unknown[][] }[])[0]!.rows[0]![0]);
const session = await call(token, "start_resolution_session", [ticketId, randomUUID()]);
const grant = await call(token, "authorize_resolution_voice", [session.sessionId]);
const store = new SpacetimeResolutionStore(session.sessionId, username);
try {
  await store.call("connect", { nonce: JSON.parse(grant.payload).nonce });
  const first = await runResolutionTurn(store, randomUUID(), "start");
  assert.match(first.turn.assistantTranscript, /Read the equipment tag/);
  const id = randomUUID();
  const before = await store.call("load");
  await store.call("reserve", { clientTurnId: id, text: "The equipment tag says AHU-03." });
  const saved = await store.call("save", { clientTurnId: id, revision: before.revision, ticketVersion: before.ticketVersion, modelId: "fixture",
    reply: { intent: "observe", stepOrder: 1, proposedStatus: "done", result: "Tag AHU-03", spokenText: "Save observation" } });
  assert.equal(saved.ticket.steps[0]!.status, "done");
  assert.equal(saved.pendingAction, null);
  assert.equal(saved.activeStepOrder, 2);
  assert.match(saved.turns.at(-1)!.assistantTranscript, /Look for water/);
  assert.doesNotMatch(saved.turns.at(-1)!.assistantTranscript, /confirm/i);
  const replay = await runResolutionTurn(store, id, "The equipment tag says AHU-03.");
  assert.equal(replay.snapshot.ticketVersion, saved.ticketVersion);
  assert.equal(replay.snapshot.revision, saved.revision);
  const finalId = randomUUID();
  const done = await runResolutionTurn(store, finalId, "I don't see anything");
  assert.equal(done.snapshot.ticket.steps[1]!.status, "done");
  assert.equal(done.snapshot.pendingAction, null);
  assert.equal(done.snapshot.ticket.status, "resolved");
  assert.equal(done.snapshot.status, "ended");
  assert.doesNotMatch(done.turn.assistantTranscript, /confirm/i);
  assert.match(done.turn.assistantTranscript, /ticket is resolved/);
  const repeated = await runResolutionTurn(store, finalId, "I don't see anything");
  assert.equal(repeated.snapshot.revision, done.snapshot.revision);
  await assert.rejects(call(token, "start_resolution_session", [ticketId, randomUUID()]), /reopen/i);
  console.log("PASS: immediate result save, next-step guidance, no confirmation actions, replay idempotency, automatic final resolution");
} finally { await store.close(); }
