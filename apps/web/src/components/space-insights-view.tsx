import { GeneratedInsights } from "@/components/generated-insights";
import { ChatPanel } from "@/components/chat-panel";
import { ResizeHandle } from "@/components/resize-handle";
import { useElementWidth, useResizableWidth } from "@/hooks/use-resizable-width";
import { useSpaceChat } from "@/hooks/use-space-chat";

const MIN_CHAT_WIDTH = 300;
const MIN_CARDS_WIDTH = 280;
const DEFAULT_CHAT_RATIO = 1 / 3;

/** Agent-generated chart cards on the left, chat docked on the right, split by a draggable handle. */
export function SpaceInsightsView({ active, spaceId, onPreview }: { active: boolean; spaceId: bigint; onPreview: (id: bigint, page: number) => void }) {
  const chat = useSpaceChat(spaceId);
  const [container, containerWidth] = useElementWidth<HTMLDivElement>();
  const split = useResizableWidth({
    containerWidth,
    defaultRatio: DEFAULT_CHAT_RATIO,
    minWidth: MIN_CHAT_WIDTH,
    maxWidth: containerWidth - MIN_CARDS_WIDTH,
    side: "right",
    valueLabel: "workspace",
  });

  return (
    <div ref={container} className={`flex h-full min-w-0 ${split.resizing ? "cursor-col-resize select-none" : ""}`}>
      <section aria-label="Generated insights" className="flex min-w-0 flex-1 flex-col">
        <div className="login-grid-bg min-h-0 flex-1"><GeneratedInsights panel={chat.panel} onPreview={onPreview} /></div>
      </section>
      <section id="space-chat-panel" aria-label="Chat" style={{ width: containerWidth ? split.width : `${DEFAULT_CHAT_RATIO * 100}%` }} className="relative flex shrink-0 flex-col border-l border-border">
        <ResizeHandle label="Resize chat panel" controls="space-chat-panel" visible={active} handleProps={split.handleProps} />
        {chat.error && <p role="alert" className="border-b border-ds-red-300 bg-ds-red-100 p-3 text-xs text-ds-red-900">{chat.error}</p>}
        <ChatPanel messages={chat.messages} pending={chat.pending} onSend={chat.send} />
      </section>
    </div>
  );
}
