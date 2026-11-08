import { FileText, FolderOpen, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Documents } from "@/module_bindings/types";

type FileRow = Pick<Documents, "id" | "filename" | "sizeBytes" | "status" | "createdAt" | "verifiedAt">;

export function SpaceFilesList({ documents, ready, onPreview, onClose }: {
  documents: readonly FileRow[]; ready: boolean; onPreview: (documentId: bigint) => void; onClose: () => void;
}) {
  const sorted = [...documents].sort((a, b) => {
    const aTime = a.createdAt.microsSinceUnixEpoch;
    const bTime = b.createdAt.microsSinceUnixEpoch;
    return aTime === bTime ? a.filename.localeCompare(b.filename) : aTime > bTime ? -1 : 1;
  });

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[#e3e3e7] px-3">
        <h2 className="text-sm font-semibold">Files <span className="ml-1 text-xs font-normal text-[#939188]">{ready ? documents.length : ""}</span></h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close files panel" onClick={onClose}><X aria-hidden="true" /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!ready ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-xs text-[#78766e]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Loading files...</p>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-12 text-center text-[#939188]"><FolderOpen aria-hidden="true" className="size-7" /><p className="text-xs">No documents in this space yet.</p></div>
        ) : (
          <ul aria-label="Space documents" className="space-y-2">
            {sorted.map(document => (
              <li key={document.id.toString()}>
                <button type="button" disabled={!document.verifiedAt} onClick={() => onPreview(document.id)} aria-haspopup="dialog" title={document.verifiedAt ? `Preview ${document.filename}` : "Preview is available after upload verification"} className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-[#e3e3e7] bg-white p-3 text-left transition-colors hover:border-[#b7b5ae] hover:bg-[#faf9f6] focus-visible:outline-2 focus-visible:outline-[#b9d8f3] disabled:cursor-default disabled:opacity-60">
                  <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#939188]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={document.filename}>{document.filename}</span>
                    <span className="mt-1 block text-[10px] text-[#939188]">PDF · {(document.sizeBytes / 1024 / 1024).toFixed(2)} MiB</span>
                    {!document.verifiedAt && <span className={`mt-1.5 block text-[10px] ${document.status === "failed" ? "text-[#d92323]" : "text-[#78766e]"}`}>{document.status === "failed" ? "Upload failed" : "Awaiting verification"}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
