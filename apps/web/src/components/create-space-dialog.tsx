import { useEffect, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, FileText, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DbConnection } from "@/module_bindings";
import { retrySpacePdf, uploadSpacePdf } from "@/lib/documents";
import { spaceSchema, type SpaceValues } from "@/lib/validation/space";

type PdfEntry = {
  id: string;
  file: File;
  documentId?: bigint;
  status: "ready" | "uploading" | "uploaded" | "failed";
  error?: string;
};
const fieldClass = "border-[#e3e3e7] bg-white text-sm shadow-sm focus-visible:border-[#b9d8f3] focus-visible:ring-[3px] focus-visible:ring-[#b9d8f3]";

// Local browser preview only; no upload or AI processing is needed to view a PDF.
function PdfPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return <div role="status" className="flex min-h-64 items-center justify-center text-xs text-[#78766e]">Loading preview...</div>;
  return (
    <object data={`${url}#toolbar=0&navpanes=0&view=FitH`} type="application/pdf" aria-label={`Preview of ${file.name}`} className="h-full min-h-64 w-full">
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-xs text-[#78766e]">
        <FileText aria-hidden="true" className="size-8" />
        <p>This browser cannot display an embedded PDF.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#007bff] underline underline-offset-4">Open PDF preview</a>
      </div>
    </object>
  );
}

export function CreateSpaceDialog({ onClose }: { onClose: () => void }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const [files, setFiles] = useState<PdfEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<bigint | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState("");
  const submissionLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm<SpaceValues>({
    resolver: zodResolver(spaceSchema), defaultValues: { name: "", description: "" },
  });
  const locked = isSubmitting || spaceId !== null;
  const selected = files.find(entry => entry.id === selectedId) || files[0];

  function addFiles(incoming: File[]) {
    if (locked) return;
    const invalid = incoming.find(file => !/\.pdf$/i.test(file.name) || file.size < 5 || file.size > 20 * 1024 * 1024);
    if (invalid) {
      setFileError(`Files were not added. "${invalid.name}" must be a PDF between 5 bytes and 20 MiB.`);
      return;
    }
    setFileError("");
    const additions: PdfEntry[] = [];
    for (const file of incoming) {
      if (![...files, ...additions].some(entry => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) {
        additions.push({ id: crypto.randomUUID(), file, status: "ready" });
      }
    }
    setFiles(previous => [...previous, ...additions]);
    if (additions.length) setSelectedId(additions[0].id);
  }

  function updateFile(id: string, change: Partial<PdfEntry>) {
    setFiles(previous => previous.map(entry => entry.id === id ? { ...entry, ...change } : entry));
  }

  async function onSubmit(values: SpaceValues) {
    if (submissionLock.current) return;
    clearErrors("root");
    const connection = getConnection() as DbConnection | null;
    if (!isActive || !connection) {
      setError("root", { message: "Reconnect to your workspace before creating a space." });
      return;
    }
    setFileError("");
    submissionLock.current = true;
    try {
      let savedId = spaceId;
      if (savedId === null) {
        setPhase("Creating space...");
        savedId = await connection.procedures.createSpaceWithId(values);
        setSpaceId(savedId);
      }
      let failed = false;
      for (const entry of files) {
        if (entry.status === "uploaded") continue;
        setPhase(`Uploading ${entry.file.name}...`);
        updateFile(entry.id, { status: "uploading", error: undefined });
        try {
          if (entry.documentId !== undefined) {
            try { await connection.procedures.confirmDocumentUpload({ documentId: entry.documentId }); }
            catch { await retrySpacePdf(connection, entry.documentId, entry.file); }
          } else {
            await uploadSpacePdf(connection, savedId, entry.file, "general", {
              onDocumentCreated: documentId => updateFile(entry.id, { documentId }),
            });
          }
          updateFile(entry.id, { status: "uploaded", error: undefined });
        } catch {
          failed = true;
          updateFile(entry.id, { status: "failed", error: "Upload failed. Please retry." });
        }
      }
      if (failed) {
        setError("root", { message: "Your space was created, but some PDFs could not be uploaded. Retry to finish, or close to return to your spaces." });
      } else {
        onClose();
      }
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "Unable to create the space. Please try again." });
    } finally {
      setPhase("");
      submissionLock.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={open => {
      if (!open && !submissionLock.current) onClose();
    }}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={event => {
          event.preventDefault();
          document.getElementById("space-name")?.focus();
        }}
        onEscapeKeyDown={event => { if (submissionLock.current) event.preventDefault(); }}
        onInteractOutside={event => { if (submissionLock.current) event.preventDefault(); }}
        className="block max-h-[90svh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border-[#e3e3e7] bg-white p-0 text-[#37352f] shadow-2xl sm:max-w-5xl motion-reduce:animate-none"
      >
          <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="Close create space" disabled={isSubmitting} className="absolute top-4 right-4 z-10 bg-white/90"><X aria-hidden="true" /></Button></DialogClose>
          <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting} className="grid min-h-[38rem] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="flex min-w-0 flex-col p-6 sm:p-8">
              <DialogHeader className="gap-0 text-left">
              <DialogTitle className="text-[24px] leading-8 font-bold tracking-[-0.6px]">Create a new space</DialogTitle>
              <DialogDescription className="mt-2 text-xs leading-5 text-[#78766e]">Bring your property research and documents together.</DialogDescription>
              </DialogHeader>
              <fieldset disabled={locked} className="mt-8 space-y-6 disabled:opacity-70">
                <div>
                  <Label htmlFor="space-name" className="mb-2 block text-xs font-semibold">Space name <span aria-hidden="true">*</span></Label>
                  <Input id="space-name" {...register("name")} required maxLength={120} placeholder="e.g. Dallas Data Center" aria-invalid={!!errors.name} aria-describedby={errors.name ? "space-name-error" : undefined} className={`h-10 ${fieldClass}`} />
                  {errors.name && <p id="space-name-error" role="alert" className="mt-1.5 text-xs text-[#d92323]">{errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="space-description" className="mb-2 block text-xs font-semibold">Description <span className="font-normal text-[#939188]">(optional)</span></Label>
                  <Textarea id="space-description" {...register("description")} maxLength={2000} rows={6} placeholder="What are you researching about this property?" aria-invalid={!!errors.description} aria-describedby={errors.description ? "space-description-error" : undefined} className={`w-full resize-y rounded-lg border px-3 py-2.5 outline-none placeholder:text-[#a09e96] ${fieldClass}`} />
                  {errors.description && <p id="space-description-error" role="alert" className="mt-1.5 text-xs text-[#d92323]">{errors.description.message}</p>}
                </div>
              </fieldset>
              {errors.root && <p role="alert" className="mt-5 text-xs leading-5 text-[#d92323]">{errors.root.message}</p>}
              <div className="mt-auto pt-8">
                {phase && <p role="status" className="mb-3 break-words text-xs text-[#78766e]">{phase}</p>}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!isActive || isSubmitting} className="h-10 flex-1 rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-[#242424] focus-visible:ring-[#b9d8f3]">
                    {isSubmitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
                    {isSubmitting ? (spaceId === null ? "Creating space..." : "Uploading PDFs...") : spaceId === null ? "Create space" : "Retry uploads"}
                  </Button>
                  <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className="h-10 px-4 text-xs">{spaceId === null ? "Cancel" : "Close"}</Button></DialogClose>
                </div>
              </div>
            </div>

            <section aria-label="PDF documents" onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} className={`m-3 flex min-h-[28rem] min-w-0 flex-col rounded-xl border-2 border-dashed p-5 transition-colors md:ml-0 md:min-h-0 ${dragging ? "border-[#37352f] bg-[#f0efe9]" : "border-[#d5d4cf] bg-[#faf9f6]"}`}>
              <input ref={fileInput} id="space-pdfs" type="file" multiple accept=".pdf,application/pdf" disabled={locked} className="sr-only" aria-label="Add PDF documents" aria-describedby="pdf-help" onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
              {files.length === 0 ? (
                <label htmlFor="space-pdfs" className={`flex flex-1 flex-col items-center justify-center rounded-lg px-5 py-8 text-center ${locked ? "cursor-default" : "cursor-pointer"}`}>
                  <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-[#e3e3e7] bg-white shadow-sm"><Upload aria-hidden="true" className="size-6 text-[#78766e]" /></div>
                  <span className="text-base font-semibold tracking-[-0.3px]">Drop your PDFs here</span>
                  <span className="mt-2 text-xs text-[#78766e]">or click to choose files</span>
                  <span id="pdf-help" className="mt-4 text-[10px] text-[#939188]">PDF documents only · Up to 20 MiB per file</span>
                </label>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3 pr-8">
                    <h2 className="text-xs font-semibold">Documents <span className="ml-1 text-[#939188]">{files.length}</span></h2>
                    <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => fileInput.current?.click()} className="text-xs"><Plus aria-hidden="true" />Add PDFs</Button>
                  </div>
                  <div className="flex min-h-64 flex-1 flex-col overflow-hidden rounded-lg border border-[#e3e3e7] bg-white">
                    <p className="truncate border-b border-[#e3e3e7] px-3 py-2 text-[10px] text-[#78766e]" title={selected?.file.name}>{selected?.file.name}</p>
                    {selected && <div className="min-h-64 flex-1"><PdfPreview key={selected.id} file={selected.file} /></div>}
                  </div>
                  <ul aria-label="Selected PDFs" className="mt-4 grid max-h-44 shrink-0 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {files.map(entry => (
                      <li key={entry.id} className={`relative flex min-w-0 rounded-lg border bg-white ${selected?.id === entry.id ? "border-[#37352f] ring-1 ring-[#37352f]/10" : "border-[#e3e3e7]"}`}>
                        <button type="button" aria-pressed={selected?.id === entry.id} onClick={() => setSelectedId(entry.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg p-3 pr-7 text-left outline-none focus-visible:ring-3 focus-visible:ring-[#b9d8f3]">
                          <FileText aria-hidden="true" className="size-5 shrink-0 text-[#939188]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium" title={entry.file.name}>{entry.file.name}</span>
                            <span className={`mt-1 block text-[10px] ${entry.status === "failed" ? "text-[#d92323]" : "text-[#939188]"}`}>{entry.error || (entry.status === "ready" ? `${(entry.file.size / 1024 / 1024).toFixed(2)} MiB` : entry.status === "uploading" ? "Uploading..." : "Uploaded")}</span>
                          </span>
                          {entry.status === "uploading" && <LoaderCircle aria-label="Uploading" className="size-3 shrink-0 animate-spin" />}
                          {entry.status === "uploaded" && <Check aria-label="Uploaded" className="size-3 shrink-0 text-[#4c7252]" />}
                        </button>
                        {!locked && <Button type="button" variant="ghost" size="icon-xs" className="absolute top-1 right-1" aria-label={`Remove ${entry.file.name}`} onClick={() => setFiles(previous => previous.filter(item => item.id !== entry.id))}><X aria-hidden="true" /></Button>}
                      </li>
                    ))}
                  </ul>
                  <p id="pdf-help" className="mt-3 text-center text-[10px] text-[#939188]">Drop more PDFs here · Up to 20 MiB per file</p>
                </>
              )}
              {fileError && <p role="alert" className="mt-3 text-xs leading-5 text-[#d92323]">{fileError}</p>}
            </section>
          </form>
      </DialogContent>
    </Dialog>
  );
}
