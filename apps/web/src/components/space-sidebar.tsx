import type { Ref } from "react";
import { ChartLine, FolderOpen, Ticket, Workflow, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SpaceView = "flowchart" | "insights" | "tickets";

export const viewLabels: Record<SpaceView, string> = {
  flowchart: "Flowchart",
  insights: "Chat and insights",
  tickets: "Tickets",
};

const views: { view: SpaceView; icon: LucideIcon }[] = [
  { view: "flowchart", icon: Workflow },
  { view: "insights", icon: ChartLine },
  { view: "tickets", icon: Ticket },
];

// The active item gets a black bar on the rail's left edge, like Vercel's nav.
const baseClass = "relative size-9 rounded-md before:absolute before:top-1/2 before:-left-[7px] before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-transparent before:transition-colors";
const idleClass = "text-subtle hover:bg-muted hover:text-foreground";
const activeClass = "bg-muted text-foreground before:bg-foreground";

export function SpaceSidebar({ disabled, view, onViewChange, filesOpen, onToggleFiles, filesButtonRef }: {
  disabled: boolean; view: SpaceView; onViewChange: (view: SpaceView) => void;
  filesOpen: boolean; onToggleFiles: () => void; filesButtonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <aside aria-label="Space actions" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-white py-2">
      {views.map(({ view: target, icon: Icon }) => {
        const active = !disabled && view === target;
        const label = viewLabels[target];
        return (
          <Button key={target} type="button" variant="ghost" size="icon-lg" disabled={disabled} aria-pressed={active} aria-label={label} title={label} onClick={() => onViewChange(target)} className={`${baseClass} ${active ? activeClass : idleClass}`}>
            <Icon aria-hidden="true" className="size-4" />
          </Button>
        );
      })}
      <span aria-hidden="true" className="my-1 h-px w-6 bg-border" />
      <Button ref={filesButtonRef} type="button" variant="ghost" size="icon-lg" disabled={disabled} aria-label="View files" title="View files" aria-expanded={filesOpen && !disabled} aria-controls="space-files-panel" onClick={onToggleFiles} className={`${baseClass} ${filesOpen && !disabled ? "bg-muted text-foreground" : idleClass}`}>
        <FolderOpen aria-hidden="true" className="size-4" />
      </Button>
    </aside>
  );
}
