import { describe, it, expect } from "vitest";
import { AudioQueue, transcribeAudio } from "./voice-speech.ts";
import { canAutoCompleteObservation, checklistDefinition, confirmationIntent, isCompleteObservation } from "../validation/resolution.ts";
import { buildResolutionWorkflow } from "./resolution-agent.ts";
import type { VoiceSnapshot } from "./spacetime-resolution-store.ts";

describe("voice protocol rules", () => {
  it("accepts complete observations and clear short answers, not trailing fragments or filler", () => {
    for (const text of ["I can see water here.", "nothing unusual", "confirm", "I don't see anything."]) expect(isCompleteObservation(text)).toBe(true);
    for (const text of ["", "um uh", "I see", "there is water", "I can see water and"]) expect(isCompleteObservation(text)).toBe(false);
  });
  it("only automatically completes explicit no-issue reports for visual absence checks", () => {
    const step = { order: 1, kind: "observe", status: "pending", instruction: "Look for water around the unit.", expectedResult: "No water.", requiresPhoto: false };
    for (const text of ["nothing", "I don't see anything", "I don't see anything wrong", "I see nothing unusual", "nothing unusual", "no issues"]) expect(canAutoCompleteObservation(text, step)).toBe(true);
    for (const text of ["", "I see water", "I don't see anything but smoke", "I haven't checked", "maybe nothing", "nothing?"])
      expect(canAutoCompleteObservation(text, step)).toBe(false);
    expect(canAutoCompleteObservation("nothing", { ...step, requiresPhoto: true })).toBe(false);
    expect(canAutoCompleteObservation("nothing", { ...step, kind: "measure" })).toBe(false);
    expect(canAutoCompleteObservation("nothing", { ...step, instruction: "Read equipment tag", expectedResult: "AHU-03" })).toBe(false);
    expect(canAutoCompleteObservation("nothing", { ...step, status: "done" })).toBe(false);
  });
  it("proposes a no-issue visual result without asking for a second confirmation", async () => {
    const context = { sessionId: "test", activeStepOrder: 1, turns: [], ticket: { safetyNotes: "", steps: [
      { order: 1, kind: "observe", instruction: "Look for water.", expectedResult: "No water.", status: "pending", requiresPhoto: false },
    ] } } as unknown as VoiceSnapshot;
    const result = await buildResolutionWorkflow().invoke({ context, text: "I don't see anything" });
    expect(result.reply.proposedStatus).toBe("done");
    expect(result.reply.spokenText).not.toMatch(/confirm|saved/i);
  });
  it("cancels recognition before opening a provider connection", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Stopped by user"));
    await expect(transcribeAudio(new AudioQueue(), 16000, controller.signal, () => {})).rejects.toThrow("Stopped by user");
  });
  it("rejects unsupported audio before opening a provider connection", async () => {
    await expect(transcribeAudio(new AudioQueue(), 44100, new AbortController().signal, () => {})).rejects.toThrow("Unsupported PCM sample rate");
  });
  it("accepts only standalone confirmations", () => {
    expect(confirmationIntent("Yes, confirm.")).toBe("confirm");
    expect(confirmationIntent("No.")).toBe("reject");
    expect(confirmationIntent("Yes there is water by the panel")).toBeNull();
    expect(confirmationIntent("yesterday I confirmed the tag")).toBeNull();
  });
  it("keeps checklist definitions independent of results", () => {
    const step = { order: 1, instruction: "Read tag", expectedResult: "AHU-03", requiresPhoto: false, status: "pending" };
    const ticket = { safetyNotes: "Observe only", sources: [], steps: [step] };
    const completedTicket = { ...ticket, steps: [{ ...step, status: "done" }] };
    expect(checklistDefinition(ticket)).toBe(checklistDefinition(completedTicket));
    expect(checklistDefinition(ticket)).not.toBe(checklistDefinition({ ...ticket, steps: [{ ...step, instruction: "Read display" }] }));
  });
  it("flushes the final queued frames when ending a recording", async () => {
    const queue = new AudioQueue();
    const collected: number[] = [];
    const consume = (async () => { for await (const frame of queue) collected.push(...frame); })();
    queue.push(new Uint8Array([1,2])); queue.push(new Uint8Array([3,4])); queue.end();
    await consume;
    expect(collected).toEqual([1,2,3,4]);
    expect(() => queue.push(new Uint8Array([1,2]))).toThrow();
  });
  it("rejects malformed PCM and bounds backpressure", () => {
    const queue = new AudioQueue();
    expect(() => queue.push(new Uint8Array(3))).toThrow();
    for (let i = 0; i < 80; i++) queue.push(new Uint8Array(3200));
    expect(() => queue.push(new Uint8Array(3200))).toThrow();
  });
  it("reads and navigates real checklist instructions without marking completion", async () => {
    const context = { sessionId: "test", activeStepOrder: 1, turns: [], ticket: { safetyNotes: "Observe only.", steps: [
      { order: 1, instruction: "Read equipment tag.", expectedResult: "AHU-03", status: "pending" },
      { order: 2, instruction: "Look for water.", expectedResult: "No water.", status: "pending" },
    ] } } as unknown as VoiceSnapshot;
    const result = await buildResolutionWorkflow().invoke({ context, text: "next" });
    expect(result.reply.stepOrder).toBe(2);
    expect(result.reply.proposedStatus).toBe("none");
    expect(result.reply.spokenText).toContain("Look for water.");
    expect(context.ticket.steps[0]!.status).toBe("pending");
  });
});
