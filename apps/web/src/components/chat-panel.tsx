import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageSquare, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ChatMessage = { id: number; role: "user" | "assistant"; text: string };

const suggestions = ["Summarize the documents in this space", "What are the key components?", "Show me trends over time"];

/** Presentational chat UI; message state lives in `useSpaceChat`. */
export function ChatPanel({ messages, pending, onSend }: {
  messages: ChatMessage[]; pending: boolean; onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages, pending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSend(trimmed);
    setDraft("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#e3e3e7] px-4">
        <MessageSquare aria-hidden="true" className="size-4 text-[#78766e]" />
        <h2 className="text-sm font-semibold">Chat</h2>
      </header>

      <div role="log" aria-live="polite" aria-label="Chat messages" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Bot aria-hidden="true" className="size-7 text-[#939188]" />
            <h3 className="text-sm font-semibold">Ask about this space</h3>
            <p className="max-w-xs text-xs leading-5 text-[#78766e]">Questions you ask here will drive the charts generated on the right.</p>
            <div className="mt-2 flex max-w-sm flex-wrap justify-center gap-2">
              {suggestions.map(text => (
                <button key={text} type="button" onClick={() => send(text)} className="cursor-pointer rounded-full border border-[#e3e3e7] bg-white px-3 py-1 text-[11px] text-[#5f5d56] transition-colors hover:border-[#b7b5ae] hover:bg-[#faf9f6] focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">{text}</button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map(message => (
              <li key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-5 ${message.role === "user" ? "bg-[#37352f] text-white" : "border border-[#e3e3e7] bg-[#faf9f6] text-[#37352f]"}`}>
                  <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>{message.text}
                </p>
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <p role="status" className="flex items-center gap-2 rounded-lg border border-[#e3e3e7] bg-[#faf9f6] px-3 py-2 text-xs text-[#78766e]">
                  <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />Thinking...
                </p>
              </li>
            )}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-[#e3e3e7] p-3">
        <div className="flex items-end gap-2 rounded-lg border border-[#e3e3e7] bg-white px-2 py-1.5 focus-within:border-[#b9d8f3] focus-within:ring-2 focus-within:ring-[#b9d8f3]/40">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); } }}
            rows={1}
            placeholder="Ask a question..."
            aria-label="Message"
            className="field-sizing-content max-h-40 min-h-7 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 outline-none placeholder:text-[#939188]"
          />
          <Button type="submit" size="icon-sm" disabled={!draft.trim() || pending} aria-label="Send message"><SendHorizontal aria-hidden="true" /></Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-[#939188]">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
