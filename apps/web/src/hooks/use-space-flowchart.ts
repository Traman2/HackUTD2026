import { useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { graphResultSchema, type GraphResult } from "../../../../spacetimedb/src/validation/flowchart";
import type { DbConnection } from "@/module_bindings";

type Phase = "idle" | "loading" | "starting" | "processing" | "empty" | "ready" | "error";
type State = { id?: bigint; result?: GraphResult; phase: Phase; error: string; action: "load" | "generate" };
type Scope = {
  id: bigint; disposed: boolean; request: number; starting: boolean;
  timer?: ReturnType<typeof setTimeout>;
  fetch: (generate?: boolean) => Promise<void>;
};

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; value?: unknown };
    if (typeof value.message === "string") return value.message;
    if (typeof value.value === "string") return value.value;
  }
  return "Unable to reach the flowchart service. You can retry or start generation again.";
}

export function useSpaceFlowchart(spaceId: bigint | undefined, corpusRevision = "") {
  const { getConnection, isActive } = useSpacetimeDB();
  const scope = useRef<Scope | null>(null);
  const revision = useRef(corpusRevision);
  const [state, setState] = useState<State>({ phase: "idle", error: "", action: "load" });

  useEffect(() => {
    if (spaceId === undefined || !isActive) return;
    const connection = getConnection() as DbConnection | null;
    if (!connection) return;
    const current: Scope = { id: spaceId, disposed: false, request: 0, starting: false, fetch: async () => {} };
    scope.current = current;
    current.fetch = async (generate = false) => {
      if (current.disposed || current.starting) return;
      const request = ++current.request;
      clearTimeout(current.timer);
      current.timer = undefined;
      current.starting = generate;
      setState(previous => ({ id: spaceId, result: previous.id === spaceId ? previous.result : undefined,
        phase: generate ? "starting" : previous.id === spaceId && previous.phase === "processing" ? "processing" : "loading",
        error: "", action: generate ? "generate" : previous.id === spaceId ? previous.action : "load" }));
      try {
        const raw = generate
          ? await connection.procedures.generateSpaceFlowchart({ spaceId })
          : await connection.procedures.getSpaceFlowchart({ spaceId });
        if (current.disposed || request !== current.request) return;
        let body: unknown;
        if (generate) {
        const response = await fetch("/api/flowchart/dispatch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: raw, signal: AbortSignal.timeout(20000),
        });
        if (current.disposed || request !== current.request) return;
        const responseBody = await response.json();
        if (!response.ok) throw new Error(typeof responseBody.error === "string" ? responseBody.error : "The flowchart service is unavailable. Please retry.");
        body = responseBody;
        } else {
          body = JSON.parse(raw);
        }
        const result = graphResultSchema.parse(body);
        setState(previous => ({ id: spaceId, result, phase: result.status === "failed" ? "error" : result.status,
          error: result.error || "", action: generate ? "generate" : previous.action }));
        if (result.status === "processing") current.timer = setTimeout(() => void current.fetch(), 2500);
      } catch (error) {
        if (current.disposed || request !== current.request) return;
        setState(previous => ({ ...previous, id: spaceId, phase: "error", error: errorMessage(error), action: generate ? "generate" : previous.action }));
      } finally {
        if (request === current.request) current.starting = false;
      }
    };
    void current.fetch();
    return () => {
      current.disposed = true;
      clearTimeout(current.timer);
      if (scope.current === current) scope.current = null;
    };
  }, [spaceId, getConnection, isActive]);

  // Refresh idle saved results without cancelling a start or ongoing job.
  useEffect(() => {
    if (revision.current === corpusRevision) return;
    revision.current = corpusRevision;
    const current = scope.current;
    if (current && !current.starting && !current.timer) void current.fetch();
  }, [corpusRevision]);

  const generate = useCallback(() => { void scope.current?.fetch(true); }, []);
  const reload = useCallback(() => { void scope.current?.fetch(); }, []);
  const current = state.id === spaceId ? state : { phase: "idle" as const, error: "", result: undefined, action: "load" as const };
  const busy = ["starting", "processing"].includes(current.phase);
  return { ...current, busy, loading: current.phase === "loading", generate, reload, retry: current.action === "generate" ? generate : reload };
}
