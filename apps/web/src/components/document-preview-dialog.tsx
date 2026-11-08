import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLink, FileText, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useSpacetimeDB } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import type { DbConnection } from "@/module_bindings";

export function DocumentPreviewDialog({ document, onClose, initialPage = 1 }: {
  document: { id: bigint; filename: string; sizeBytes: number };
  onClose: () => void;
  initialPage?: number;
}) {
  const { getConnection, isActive } = useSpacetimeDB();
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let active = true;
    let localUrl = "";
    setLoading(true);
    setError("");
    setPreviewUrl("");

    async function loadPreview() {
      try {
        const connection = getConnection() as DbConnection | null;
        if (!connection || !isActive) throw new Error("Disconnected");
        // The procedure authorizes ownership and returns a fresh, short-lived URL.
        const signedUrl = await connection.procedures.requestDocumentDownload({ documentId: document.id });
        if (!active) return;
        const response = await fetch(signedUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("Download failed");
        const blob = await response.blob();
        if (!active) return;
        localUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setPreviewUrl(localUrl);
      } catch {
        if (active) setError("Unable to load this PDF. Check your connection and try again.");
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void loadPreview();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [document.id, getConnection, isActive, attempt]);

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px]" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[88svh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white text-foreground shadow-geist-menu outline-none">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold" title={document.filename}>{document.filename}</Dialog.Title>
              <Dialog.Description className="mt-1 text-[10px] text-subtle">PDF document · {(document.sizeBytes / 1024 / 1024).toFixed(2)} MiB</Dialog.Description>
            </div>
            {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" aria-label="Open PDF in a new tab" title="Open PDF in a new tab" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><ExternalLink aria-hidden="true" className="size-4" /></a>}
            <Dialog.Close render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close PDF preview" />}><X aria-hidden="true" /></Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 bg-muted">
            {loading ? (
              <div role="status" className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Loading PDF...</div>
            ) : error ? (
              <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-xs leading-5 text-muted-foreground">{error}</p>
                <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)} className="text-xs"><RefreshCw aria-hidden="true" />Try again</Button>
              </div>
            ) : previewUrl ? (
              <object data={`${previewUrl}#page=${Math.max(1, Math.floor(initialPage))}&view=FitH`} type="application/pdf" aria-label={`PDF preview: ${document.filename}`} className="h-full w-full">
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-muted-foreground">
                  <p>This browser cannot display an embedded PDF.</p>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">Open PDF in a new tab</a>
                </div>
              </object>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
