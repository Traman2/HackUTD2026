import type { Ref } from "react";
import { ChartLine, FolderOpen, Plus, Workflow, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SpaceView = "flowchart" | "insights";

const views: { view: SpaceView; label: string; icon: LucideIcon }[] = [
  { view: "flowchart", label: "Flowchart", icon: Workflow },
  { view: "insights", label: "Chat and insights", icon: ChartLine },
];

const baseClass = "size-8 rounded-md focus-visible:ring-[#b9d8f3]";
const idleClass = "text-[#78766e] hover:bg-[#f3f2ee] hover:text-[#37352f]";
const activeClass = "bg-[#f3f2ee] text-[#37352f]";

export function SpaceSidebar({ disabled, view, onViewChange, filesOpen, onToggleFiles, filesButtonRef }: {
  disabled: boolean; view: SpaceView; onViewChange: (view: SpaceView) => void;
  filesOpen: boolean; onToggleFiles: () => void; filesButtonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <aside aria-label="Space actions" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#e3e3e7] bg-white py-2">
      {views.map(({ view: target, label, icon: Icon }) => {
        const active = !disabled && view === target;
        return (
          <Button key={target} type="button" variant="ghost" size="icon-lg" disabled={disabled} aria-pressed={active} aria-label={label} title={label} onClick={() => onViewChange(target)} className={`${baseClass} ${active ? activeClass : idleClass}`}>
            <Icon aria-hidden="true" className="size-4" />
          </Button>
        );
      })}
      <Button type="button" variant="ghost" size="icon-lg" disabled={disabled} aria-label="Add documents" title="Add documents" className={`${baseClass} ${idleClass}`}>
        <Plus aria-hidden="true" className="size-4" />
      </Button>
      <Button ref={filesButtonRef} type="button" variant="ghost" size="icon-lg" disabled={disabled} aria-label="View files" title="View files" aria-expanded={filesOpen && !disabled} aria-controls="space-files-panel" onClick={onToggleFiles} className={`${baseClass} ${filesOpen && !disabled ? activeClass : idleClass}`}>
        <FolderOpen aria-hidden="true" className="size-4" />
      </Button>
    </aside>
  );
}
