import { table, t } from "spacetimedb/server";

// Latest risk assessment per space plus job state. assessmentJson is validated
// against riskAssessmentSchema on every write.
export const riskAssessments = table({ public: false }, {
  spaceId: t.u64().primaryKey(), ownerUsername: t.string(),
  status: t.string(), stage: t.string(), error: t.option(t.string()),
  jobId: t.string(), leaseUntil: t.timestamp(),
  // The flowchart generation this assessment was computed from (stale detection).
  flowchartGeneratedAt: t.option(t.timestamp()),
  assessmentJson: t.string(), generatedAt: t.option(t.timestamp()), updatedAt: t.timestamp(),
});

// Auditable history: which overview nodes changed severity on each run.
export const riskEvents = table({ public: false }, {
  id: t.u64().primaryKey().autoInc(), spaceId: t.u64().index("btree"),
  jobId: t.string(), changesJson: t.string(), createdAt: t.timestamp(),
});
