import { useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import type { DbConnection } from "@/module_bindings";
import type { ChatMessage } from "@/components/chat-panel";
import { chatResponseSchema, type InsightsPanel } from "@/lib/insights-contract";

export function useSpaceChat(spaceId: bigint) {
  const { getConnection } = useSpacetimeDB();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [panel, setPanel] = useState<InsightsPanel>({ components: [] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const send = useCallback(async (text: string) => {
    if (controller.current || !text.trim() || text.length > 16000) return;
    const abort = new AbortController();
    controller.current = abort;
    const updated: ChatMessage[] = [...messages, { id: nextId.current++, role: "user", text }];
    setMessages(updated); setPending(true); setError("");
    try {
      const connection = getConnection() as DbConnection | null;
      if (!connection) throw new Error("Reconnect before sending a message.");
      const ticket = JSON.parse(await connection.procedures.authorizeSpaceChat({ spaceId }));
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, messages: updated.slice(-20).map(({ role, text }) => ({ role, text })) }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(130000)]),
      });
      const body = await response.json().catch(() => {
        throw new Error(response.ok
          ? "The assistant returned an invalid response. Please retry."
          : "The web app could not reach the chat agent. Check that the agent is running on port 3001.");
      });
      if (!response.ok) throw new Error(body.error || "Assistant unavailable. Please retry.");
      const result = chatResponseSchema.parse(body);
      if (abort.signal.aborted) return;
      setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: result.text }]);
      if (result.panel.components.length) setPanel(result.panel);
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof TypeError
        ? "The web app could not connect to the chat service. Check your connection and that the agent is running."
        : error instanceof Error ? error.message : "Assistant unavailable. Please retry.");
    } finally { if (!abort.signal.aborted) { controller.current = null; setPending(false); } }
  }, [getConnection, messages, spaceId]);
  return { messages, panel, pending, error, send };
}
