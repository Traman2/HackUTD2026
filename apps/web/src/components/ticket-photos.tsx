import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Camera, ExternalLink, Glasses, ImageOff, LoaderCircle, X } from "lucide-react";
import { useSpacetimeDB } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import type { DbConnection } from "@/module_bindings";

export type TicketPhotoRow = {
  id: bigint; ticketId: bigint; stepOrder: number; caption: string; source: string;
  contentType: string; status: string; createdAt: { toDate(): Date };
};

// Displayable sources by photo id. Signed S3 URLs last 5 minutes, so reuse one for 4.
// HEIC (older glasses uploads) is converted to a JPEG object URL, kept for the session.
const URL_LIFETIME_MS = 4 * 60 * 1000;
const srcCache = new Map<string, { src: Promise<string>; expires: number }>();

function isHeic(contentType: string) {
  return contentType === "image/heic" || contentType === "image/heif";
}

function loadPhotoSrc(photo: Pick<TicketPhotoRow, "id" | "contentType">, connection: DbConnection): Promise<string> {
  const key = photo.id.toString();
  const cached = srcCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.src;
  const heic = isHeic(photo.contentType);
  const src = connection.procedures.requestTicketPhotoDownload({ photoId: photo.id }).then(async url => {
    if (!heic) return url;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed");
    // Browsers can't decode HEIC; convert it here. The converter is loaded only when needed.
    const heicBlob = await response.blob();
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: heicBlob, toType: "image/jpeg", quality: 0.85 });
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    // The converter drops EXIF, so apply the camera's rotation ourselves.
    const orientation = exifOrientation(new Uint8Array(await heicBlob.slice(0, 64 * 1024).arrayBuffer()));
    return URL.createObjectURL(await rotateJpeg(jpeg, orientation));
  });
  srcCache.set(key, { src, expires: heic ? Infinity : Date.now() + URL_LIFETIME_MS });
  src.catch(() => srcCache.delete(key));
  return src;
}

/** EXIF orientation (1-8) from the first bytes of an image, or 1 if absent. */
function exifOrientation(bytes: Uint8Array): number {
  for (let i = 0; i + 14 < bytes.length; i++) {
    // "Exif" plus two zero bytes, then a TIFF header.
    if (bytes[i] !== 0x45 || bytes[i + 1] !== 0x78 || bytes[i + 2] !== 0x69 || bytes[i + 3] !== 0x66 || bytes[i + 4] !== 0 || bytes[i + 5] !== 0) continue;
    const tiff = i + 6;
    const little = bytes[tiff] === 0x49;
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const u16 = (at: number) => view.getUint16(at, little);
    const ifd = tiff + view.getUint32(tiff + 4, little);
    if (ifd + 2 > bytes.length) return 1;
    for (let entry = 0, count = u16(ifd); entry < count; entry++) {
      const at = ifd + 2 + entry * 12;
      if (at + 12 > bytes.length) return 1;
      if (u16(at) === 0x0112) return u16(at + 8);
    }
    return 1;
  }
  return 1;
}

/** Re-encodes a JPEG upright for orientations 3 (180°), 6 (90° CW) and 8 (90° CCW). */
async function rotateJpeg(jpeg: Blob, orientation: number): Promise<Blob> {
  const turns = orientation === 6 ? 1 : orientation === 3 ? 2 : orientation === 8 ? 3 : 0;
  if (!turns) return jpeg;
  const bitmap = await createImageBitmap(jpeg, { imageOrientation: "none" });
  const sideways = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? bitmap.height : bitmap.width;
  canvas.height = sideways ? bitmap.width : bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) return jpeg;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ?? jpeg), "image/jpeg", 0.85));
}

/** Resolves a photo to something an <img> can show. Bump `attempt` to retry after a failure. */
function usePhotoSrc(photo: TicketPhotoRow, attempt: number) {
  const { getConnection, isActive } = useSpacetimeDB();
  const [result, setResult] = useState<{ id: bigint; attempt: number; src: string | null; error: boolean } | null>(null);

  const { id, contentType } = photo;
  useEffect(() => {
    const connection = getConnection() as DbConnection | null;
    if (!connection || !isActive) return;
    let active = true;
    loadPhotoSrc({ id, contentType }, connection)
      .then(src => { if (active) setResult({ id, attempt, src, error: false }); })
      .catch(() => { if (active) setResult({ id, attempt, src: null, error: true }); });
    return () => { active = false; };
  }, [id, contentType, attempt, getConnection, isActive]);

  return result && result.id === photo.id && result.attempt === attempt ? result : { src: null, error: false };
}

/** The photo, or a loading/error placeholder. `retry` adds a retry button; leave it off inside another button. */
function PhotoImage({ photo, className, fit = "cover", retry = false, onSrc }: {
  photo: TicketPhotoRow; className?: string; fit?: "cover" | "contain"; retry?: boolean; onSrc?: (src: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState<string | null>(null);
  const { src, error } = usePhotoSrc(photo, attempt);
  useEffect(() => { if (src) onSrc?.(src); }, [src, onSrc]);

  if (error || (src && broken === src)) {
    const placeholder = `flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground ${className}`;
    const label = <><ImageOff aria-hidden="true" className="size-4" /><span>{retry ? "Couldn't load photo. Retry" : "Unavailable"}</span></>;
    return retry
      ? <button type="button" onClick={() => { srcCache.delete(photo.id.toString()); setAttempt(value => value + 1); }} className={`${placeholder} cursor-pointer hover:text-foreground`}>{label}</button>
      : <span className={placeholder}>{label}</span>;
  }
  if (!src) return <span role="status" aria-label="Loading photo" className={`flex items-center justify-center ${className}`}><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-subtle motion-reduce:animate-none" /></span>;
  return <img src={src} alt={photo.caption || "Ticket photo"} loading="lazy"
    onError={() => { srcCache.delete(photo.id.toString()); setBroken(src); }}
    className={`${fit === "cover" ? "object-cover" : "object-contain"} ${className}`} />;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const sourceLabel = (source: string) => source === "glasses" ? "Meta glasses" : source === "phone" ? "Phone" : source;

function PhotoMeta({ photo, className = "" }: { photo: TicketPhotoRow; className?: string }) {
  const SourceIcon = photo.source === "glasses" ? Glasses : Camera;
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground ${className}`}>
      <SourceIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{[photo.caption, sourceLabel(photo.source), timeFormat.format(photo.createdAt.toDate())].filter(Boolean).join(" · ")}</span>
    </p>
  );
}

/** Row of square thumbnails, shown under a checklist step. */
export function PhotoStrip({ photos, onOpen }: { photos: TicketPhotoRow[]; onOpen: (photo: TicketPhotoRow) => void }) {
  return (
    <ul aria-label="Step photos" className="mt-2.5 flex flex-wrap gap-2">
      {photos.map(photo => (
        <li key={photo.id.toString()}>
          <button type="button" onClick={() => onOpen(photo)} title={photo.caption || "Open photo"}
            className="group block size-20 cursor-zoom-in overflow-hidden rounded-lg bg-muted shadow-geist-sm transition-shadow hover:shadow-geist-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <PhotoImage photo={photo} className="size-full transition-transform duration-200 group-hover:scale-[1.03]" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Photos attached to the ticket as a whole, as captioned cards. */
export function PhotoGrid({ photos, onOpen }: { photos: TicketPhotoRow[]; onOpen: (photo: TicketPhotoRow) => void }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map(photo => (
        <li key={photo.id.toString()} className="min-w-0 overflow-hidden rounded-lg bg-white shadow-geist-sm">
          <button type="button" onClick={() => onOpen(photo)} className="group block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <PhotoImage photo={photo} className="size-full transition-transform duration-200 group-hover:scale-[1.03]" />
          </button>
          <PhotoMeta photo={photo} className="px-2.5 py-2" />
        </li>
      ))}
    </ul>
  );
}

/** Full-size photo viewer. */
export function PhotoLightbox({ photo, title, onClose }: { photo: TicketPhotoRow; title: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px]" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90svh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white text-foreground shadow-geist-menu outline-none">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">{title}</Dialog.Title>
              <Dialog.Description render={<div />}><PhotoMeta photo={photo} className="mt-0.5" /></Dialog.Description>
            </div>
            {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open photo in a new tab" title="Open photo in a new tab" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ExternalLink aria-hidden="true" className="size-4" /></a>}
            <Dialog.Close render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close photo" />}><X aria-hidden="true" /></Dialog.Close>
          </header>
          <div className="flex min-h-64 flex-1 items-center justify-center bg-[#0a0a0a]">
            <PhotoImage photo={photo} fit="contain" retry onSrc={setUrl} className="max-h-[calc(90svh-4rem)] w-full text-white/70" />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

