import { riskResultSchema } from "../../../../spacetimedb/src/validation/risk";
import { useAgentJob } from "./use-agent-job";

/**
 * Saved risk assessment for a space. The risk agent runs only when `analyze`
 * is called (the "Analyze risk" button). `flowchartRevision` reloads the result
 * when the flowchart is regenerated so its stale flag updates.
 */
export function useSpaceRisk(spaceId: bigint | undefined, flowchartRevision: string | null) {
  const job = useAgentJob({
    spaceId, revision: flowchartRevision, schema: riskResultSchema,
    start: (connection, id) => connection.procedures.analyzeSpaceRisk({ spaceId: id }),
    read: (connection, id) => connection.procedures.getSpaceRisk({ spaceId: id }),
  });
  return { result: job.result, assessment: job.result?.assessment ?? null, busy: job.busy, error: job.error, analyze: job.run };
}
export type SpaceRisk = ReturnType<typeof useSpaceRisk>;
