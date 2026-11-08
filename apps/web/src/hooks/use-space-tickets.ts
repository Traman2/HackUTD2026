import { ticketsResultSchema } from "../../../../spacetimedb/src/validation/tickets";
import { useAgentJob } from "./use-agent-job";

/**
 * Maintenance tickets for a space. The ticket agent runs only when `generate`
 * is called (the "Generate tickets" button in the Tickets view).
 */
export function useSpaceTickets(spaceId: bigint | undefined, flowchartRevision: string | null) {
  const job = useAgentJob({
    spaceId, revision: flowchartRevision, schema: ticketsResultSchema,
    start: (connection, id) => connection.procedures.generateSpaceTickets({ spaceId: id }),
    read: (connection, id) => connection.procedures.getSpaceTickets({ spaceId: id }),
  });
  return { result: job.result, tickets: job.result?.tickets ?? [], busy: job.busy, error: job.error, generate: job.run, reload: job.reload };
}
export type SpaceTickets = ReturnType<typeof useSpaceTickets>;
