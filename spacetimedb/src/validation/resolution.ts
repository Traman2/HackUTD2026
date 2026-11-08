import { z } from "zod";

export const voiceGrantSchema = z.object({
  audience: z.literal("resolution-voice"), sessionId: z.string().uuid(), owner: z.string(),
  nonce: z.string().min(1).max(150), expiresAt: z.number().int(),
});
export const signedVoiceGrantSchema = z.object({ payload: z.string().max(2000), signature: z.string().regex(/^[a-f0-9]{64}$/) });
export const resolutionReplySchema = z.object({
  spokenText: z.string().trim().min(1).max(700),
  intent: z.enum(["explain", "repeat", "navigate", "observe", "clarify", "photo", "finish", "emergency"]),
  stepOrder: z.number().int().min(0).max(8),
  proposedStatus: z.enum(["none", "done", "failed", "skipped", "pending", "resolved"]),
  result: z.string().max(500),
});
export type ResolutionReply = z.infer<typeof resolutionReplySchema>;

const normalizeSpeech = (text: string) => text.toLowerCase().replace(/[.!?,]/g, "").replace(/[’]/g, "'").trim();
export function isEmergencyObservation(text: string) {
  const value = normalizeSpeech(text);
  if (/^(?:is|could|would|what|if|should|can|do|does|did)\b/.test(value)) return false;
  if (/\b(?:no|not|isn't|is not|without)\s+(?:a\s+)?(?:fire|flood|flooding|smoke)\b|\b(?:fire drill|fire extinguisher|fire alarm test|what if|if there|in case|was on fire|used to flood)\b/.test(value)) return false;
  return /\b(?:on fire|building is burning|room is burning|flames|flooding|flooded|rising water|heavy smoke|thick smoke|fire spreading)\b|\bthere(?:'s| is) (?:a )?fire\b/.test(value);
}
export function isPhotoRequest(text: string) {
  const value = normalizeSpeech(text);
  return /\b(?:take|capture|snap|save|attach|add|shoot)\b.{0,45}\b(?:photo|picture|image|snapshot)\b/.test(value) &&
    !/\b(?:don't|do not|never|no need to)\b/.test(value);
}
export function isCompleteObservation(text: string) {
  const value = normalizeSpeech(text);
  if (!value || /^(um|uh|hmm|erm|ah)(\s+(um|uh|hmm|erm|ah))*$/.test(value)) return false;
  if (isEmergencyObservation(text) || isPhotoRequest(text)) return true;
  if (/^(done|clear|normal|good|okay|ok|skip|resolved|finish|yes|no|confirm|yes confirm|cancel|reject|repeat|repeat that|next|previous|back|stop|nothing|nothing unusual|nothing wrong|no issues|no problems|looks good|all clear|i see nothing|i see nothing unusual|i don't see anything|i do not see anything)$/.test(value)) return true;
  return value.split(/\s+/).length >= 4 && !/\b(and|but|because|so|the|a|an|is|are|i|there|with|to|of)$/.test(value);
}

/** Explicit absence reports can finish visual absence checks, never readings or photos. */
export function canAutoCompleteObservation(text: string, step?: {
  instruction: string; expectedResult: string; requiresPhoto: boolean; kind?: string; status: string;
}) {
  if (!step || step.status !== "pending" || step.requiresPhoto || step.kind !== "observe" || text.includes("?")) return false;
  const value = normalizeSpeech(text);
  const absence = /^(?:i (?:see|notice) (?:nothing(?: unusual| wrong)?|no (?:issues|problems))|i (?:don't|do not) see (?:anything(?: wrong| unusual)?|any (?:issues|problems))|nothing(?: unusual| wrong| out of the ordinary)?|(?:there are )?no (?:issues|problems)|everything looks (?:good|normal)|it looks (?:good|normal)|all clear|looks good)(?: (?:here|there|at all))?$/.test(value);
  const expectedAbsence = /\b(no |without |free of |dry\b|clear\b|intact\b|normal\b)/i.test(step.expectedResult);
  const needsReading = /\b(read|measure|record|tag|serial|temperature|pressure|voltage|current|rpm|level|code|identifier)\b/i.test(step.instruction);
  return absence && expectedAbsence && !needsReading;
}

export function nextChecklistPrompt(steps: { order: number; instruction: string; status: string }[]) {
  const next = steps.find(s => s.status === "pending");
  return next ? `Step ${next.order}. ${next.instruction} What do you see?`
    : "All checklist steps have been reviewed. If the issue is resolved, say resolve this ticket.";
}

// Exact, standalone confirmations only. An observation containing “yes” is not consent.
export function confirmationIntent(text: string): "confirm" | "reject" | null {
  const value = text.toLowerCase().replace(/[.!?,]/g, "").trim();
  if (/^(yes|yes confirm|confirm|confirm that|correct|save it)$/.test(value)) return "confirm";
  if (/^(no|cancel|reject|do not save|don't save)$/.test(value)) return "reject";
  return null;
}

export function checklistDefinition(ticket: { safetyNotes: string; sources: unknown; steps: { order: number; instruction: string; expectedResult: string; requiresPhoto: boolean }[] }) {
  return JSON.stringify({ safetyNotes: ticket.safetyNotes, sources: ticket.sources,
    steps: ticket.steps.map(({ order, instruction, expectedResult, requiresPhoto }) => ({ order, instruction, expectedResult, requiresPhoto })) });
}
