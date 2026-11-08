import { useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import type { ZodType } from "zod";
import type { DbConnection } from "@/module_bindings";

type JobResult = { status: "empty" | "processing" | "ready" | "failed"; error: string | null };
type State<T> = { id?: bigint; result?: T; starting: boolean; error: string };

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error) return error.message;
  return "Unable to reach the agent. Please retry.";
}

/**
 * State of an on-demand agent job for a space (risk analysis, ticket creation).
 * Loading only reads the database; the agent runs exclusively when `run` is
 * called. `start` returns a signed capability that is forwarded to the agent's
 * dispatch route. `revision` reloads the saved result when it changes.
 */
export function useAgentJob<T extends JobResult>({ spaceId, revision, schema, start, read }: {
  spaceId: bigint | undefined;
  revision: string | null;
  schema: ZodType<T>;
  start: (connection: DbConnection, spaceId: bigint) => Promise<string>;
  read: (connection: DbConnection, spaceId: bigint) => Promise<string>;
}) {
  const { getConnection, isActive } = useSpacetimeDB();
  const [state, setState] = useState<State<T>>({ starting: false, error: "" });
  // Orders overlapping requests so only the newest response is applied.
  const request = useRef(0);
  // Latest callbacks without re-subscribing effects on every render.
  const calls = useRef({ start, read, schema });
  useEffect(() => { calls.current = { start, read, schema }; });

  const fetchJob = useCallback(async (run: boolean) => {
    const connection = getConnection() as DbConnection | null;
    if (spaceId === undefined || !connection) return;
    const current = ++request.current;
    if (run) setState(previous => ({ ...previous, id: spaceId, starting: true, error: "" }));
    try {
      let body: unknown;
      if (run) {
        const ticket = await calls.current.start(connection, spaceId);
        const response = await fetch("/api/flowchart/dispatch", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: ticket, signal: AbortSignal.timeout(20000),
        });
        body = await response.json();
        if (!response.ok) throw new Error(typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "The agent is unavailable. Please retry.");
      } else {
        body = JSON.parse(await calls.current.read(connection, spaceId));
      }
      if (current !== request.current) return;
      const result = calls.current.schema.parse(body);
      setState({ id: spaceId, result, starting: false, error: result.status === "failed" ? result.error ?? "The agent failed." : "" });
    } catch (error) {
      if (current !== request.current) return;
      setState(previous => ({ ...previous, id: spaceId, starting: false, error: errorMessage(error) }));
    }
  }, [getConnection, spaceId]);

  useEffect(() => {
    if (spaceId === undefined || !isActive) return;
    void fetchJob(false);
  }, [spaceId, isActive, revision, fetchJob]);

  // Poll while the agent is working.
  const processing = state.id === spaceId && state.result?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setTimeout(() => void fetchJob(false), 2000);
    return () => clearTimeout(timer);
  }, [processing, state.result, fetchJob]);

  const run = useCallback(() => { void fetchJob(true); }, [fetchJob]);
  const reload = useCallback(() => { void fetchJob(false); }, [fetchJob]);
  const current: State<T> = state.id === spaceId ? state : { starting: false, error: "" };
  const busy = current.starting || current.result?.status === "processing";
  return { result: current.result, busy, error: current.error, run, reload };
}
