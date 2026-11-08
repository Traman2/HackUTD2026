import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/components/chat-panel";

const PLACEHOLDER_REPLY = "The assistant isn't connected yet. Once it is, answers about this space's documents will appear here, along with generated charts on the right.";

/** Local chat state. Replace the timed placeholder reply with the agent call when it exists. */
export function useSpaceChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const send = useCallback((text: string) => {
    setMessages(current => [...current, { id: nextId.current++, role: "user", text }]);
    setPending(true);
    timer.current = setTimeout(() => {
      setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: PLACEHOLDER_REPLY }]);
      setPending(false);
    }, 600);
  }, []);

  return { messages, pending, send };
}
