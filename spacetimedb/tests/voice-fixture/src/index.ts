// Test-only entry point. Never publish this module to the application database.
export * from "../../../src/index";
export { default } from "../../../src/index";
import db from "../../../src/schema";
import { t } from "spacetimedb/server";
import { requireUser } from "../../../src/validation/ownership";

export const seed_voice_test = db.reducer({ seed: t.string() }, (ctx, { seed }) => {
  const ownerUsername = requireUser(ctx);
  const space = ctx.db.spaces.insert({ id: 0n, ownerUsername, name: "Voice test", description: seed,
    archived: false, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  ctx.db.tickets.insert({ id: 0n, spaceId: space.id, ownerUsername, problemKey: "a".repeat(32),
    title: "Inspect test unit", kind: "resolve", priority: "low", status: "open", assetLabel: "AHU-03", equipmentCode: "AHU-03",
    overviewNodeId: undefined, networkNodeId: "ahu03", summary: "Fixture", safetyNotes: "Observe only.",
    steps: [
      { order: 1, instruction: "Read the equipment tag.", kind: "record", expectedResult: "AHU-03", requiresPhoto: false, status: "pending", result: undefined, completedAt: undefined },
      { order: 2, instruction: "Look for water.", kind: "observe", expectedResult: "No water.", requiresPhoto: false, status: "pending", result: undefined, completedAt: undefined },
    ], sources: [], draftedBy: "rules", jobId: seed, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
});
