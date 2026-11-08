import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageSquare, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <MessageSquare aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Chat</h2>
      </header>

      <div role="log" aria-live="polite" aria-label="Chat messages" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-geist-sm"><Bot aria-hidden="true" className="size-5 text-muted-foreground" /></span>
            <h3 className="text-sm font-semibold">Ask about this space</h3>
            <p className="max-w-xs text-xs leading-5 text-muted-foreground">Ask questions to explore evidence and generate views in the panel on the left.</p>
            <div className="mt-2 flex max-w-sm flex-wrap justify-center gap-2">
              {suggestions.map(text => (
                <button key={text} type="button" onClick={() => send(text)} className="cursor-pointer rounded-full border border-border bg-white px-3 py-1 text-[11px] text-muted-foreground shadow-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{text}</button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map(message => (
              <li key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`min-w-0 max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 ${message.role === "user" ? "whitespace-pre-wrap break-words bg-primary text-white" : "border border-border bg-[#faf9f6] text-foreground"}`}>
                  <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
                  {message.role === "user" ? message.text : (
                    <div className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_h1]:my-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:font-semibold [&_h5]:my-2 [&_h5]:font-semibold [&_h6]:my-2 [&_h6]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[11px] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_hr]:my-3 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                        table: ({ node: _node, ...props }) => <div className="my-2 overflow-x-auto"><table {...props} className="w-full border-collapse text-[11px]" /></div>,
                      }}>{message.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-[#faf9f6] px-3 py-2 text-xs text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />Thinking...
                </p>
              </li>
            )}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-white px-2 py-1.5 shadow-none transition-[border-color,box-shadow] focus-within:border-subtle focus-within:ring-4 focus-within:ring-black/[0.06]">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); } }}
            rows={1}
            placeholder="Ask a question..."
            aria-label="Message"
            className="field-sizing-content max-h-40 min-h-7 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 outline-none placeholder:text-subtle"
          />
          <Button type="submit" size="icon-sm" disabled={!draft.trim() || pending} aria-label="Send message"><SendHorizontal aria-hidden="true" /></Button>
        </div>
        <p className="mt-1.5 px-1 font-mono text-[10px] text-subtle">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
