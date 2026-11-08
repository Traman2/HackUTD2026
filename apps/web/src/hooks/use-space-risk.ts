import { useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { riskResultSchema, type RiskResult } from "../../../../spacetimedb/src/validation/risk";
import type { DbConnection } from "@/module_bindings";

type State = { id?: bigint; result?: RiskResult; starting: boolean; error: string };

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error) return error.message;
  return "Unable to reach the risk agent. Please retry.";
}

/**
 * Saved risk assessment for a space. Loading only reads the database; the risk
 * agent runs exclusively when `analyze` is called (the "Analyze risk" button).
 * `flowchartRevision` reloads the result when the flowchart is regenerated so
 * its stale flag updates.
 */
export function useSpaceRisk(spaceId: bigint | undefined, flowchartRevision: string | null) {
  const { getConnection, isActive } = useSpacetimeDB();
  const [state, setState] = useState<State>({ starting: false, error: "" });
  // Orders overlapping requests so only the newest response is applied.
  const request = useRef(0);

  const fetchRisk = useCallback(async (analyze: boolean) => {
    const connection = getConnection() as DbConnection | null;
    if (spaceId === undefined || !connection) return;
    const current = ++request.current;
    if (analyze) setState(previous => ({ ...previous, id: spaceId, starting: true, error: "" }));
    try {
      let body: unknown;
      if (analyze) {
        const ticket = await connection.procedures.analyzeSpaceRisk({ spaceId });
        const response = await fetch("/api/flowchart/dispatch", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: ticket, signal: AbortSignal.timeout(20000),
        });
        body = await response.json();
        if (!response.ok) throw new Error(typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "The risk agent is unavailable. Please retry.");
      } else {
        body = JSON.parse(await connection.procedures.getSpaceRisk({ spaceId }));
      }
      if (current !== request.current) return;
      const result = riskResultSchema.parse(body);
      setState({ id: spaceId, result, starting: false, error: result.status === "failed" ? result.error ?? "Risk analysis failed." : "" });
    } catch (error) {
      if (current !== request.current) return;
      setState(previous => ({ ...previous, id: spaceId, starting: false, error: errorMessage(error) }));
    }
  }, [getConnection, spaceId]);

  useEffect(() => {
    if (spaceId === undefined || !isActive) return;
    void fetchRisk(false);
  }, [spaceId, isActive, flowchartRevision, fetchRisk]);

  // Poll while the agent is working.
  const processing = state.id === spaceId && state.result?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setTimeout(() => void fetchRisk(false), 2000);
    return () => clearTimeout(timer);
  }, [processing, state.result, fetchRisk]);

  const analyze = useCallback(() => { void fetchRisk(true); }, [fetchRisk]);
  const current = state.id === spaceId ? state : { starting: false, error: "", result: undefined };
  const busy = current.starting || current.result?.status === "processing";
  return { result: current.result, assessment: current.result?.assessment ?? null, busy, error: current.error, analyze };
}
export type SpaceRisk = ReturnType<typeof useSpaceRisk>;
