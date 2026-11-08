import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowUpRight, Building2, Plus, Search } from "lucide-react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { WorkspaceNavbar } from "@/components/workspace-navbar";
import { CreateSpaceDialog } from "@/components/create-space-dialog";
import { Button } from "@/components/ui/button";
import { tables } from "@/module_bindings";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", year: "numeric",
});

export default function Spaces() {
  const { isActive, connectionError } = useSpacetimeDB();
  const [profiles, profileReady] = useTable(tables.myProfile);
  const profile = isActive && profileReady ? profiles[0] : undefined;
  const [spaces, spacesReady] = useTable(tables.mySpaces, { enabled: !!profile });
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);

  // "/" focuses search, as on Vercel, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Wait for the server's session view before treating an empty profile as logout.
  if (isActive && profileReady && !profile) return <Navigate to="/login" replace />;

  const ready = isActive && !!profile && spacesReady;
  const sortedSpaces = [...spaces].sort((a, b) => {
    if (a.archived !== b.archived) return Number(a.archived) - Number(b.archived);
    const aTime = a.updatedAt.microsSinceUnixEpoch;
    const bTime = b.updatedAt.microsSinceUnixEpoch;
    return aTime === bTime ? a.name.localeCompare(b.name) : aTime > bTime ? -1 : 1;
  });
  const needle = query.trim().toLowerCase();
  const visibleSpaces = needle ? sortedSpaces.filter(space => `${space.name} ${space.description}`.toLowerCase().includes(needle)) : sortedSpaces;
  const openCreate = () => setCreateOpen(true);

  return (
    <div className="login-grid-bg min-h-svh text-foreground">
      <WorkspaceNavbar displayName={profile?.displayName} />
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.04em]">Spaces</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Research workspaces that turn property documents into connected, cited insight.</p>
          </div>
          <Button type="button" onClick={openCreate} disabled={!profile} aria-haspopup="dialog" className="h-9 rounded-md px-3.5">
            <Plus aria-hidden="true" />New space
          </Button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-white px-3 transition-[border-color,box-shadow] hover:border-border-strong focus-within:border-subtle focus-within:ring-4 focus-within:ring-black/[0.06]">
            <Search aria-hidden="true" className="size-4 shrink-0 text-subtle" />
            <span className="sr-only">Search spaces</span>
            <input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search spaces..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
            <kbd className="kbd hidden sm:inline-flex">/</kbd>
          </label>
          {ready && <p className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">{visibleSpaces.length} {visibleSpaces.length === 1 ? "space" : "spaces"}</p>}
        </div>

        {!ready ? (
          connectionError ? (
            <div role="status" className="flex min-h-52 items-center justify-center rounded-xl bg-white p-5 text-sm text-muted-foreground shadow-geist-sm">Unable to connect. Refresh to try again.</div>
          ) : (
            <ul role="status" aria-label="Loading your spaces" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map(index => (
                <li key={index} className="flex min-h-44 flex-col rounded-xl bg-white p-5 shadow-geist-sm">
                  <div className="flex items-center gap-3"><div className="size-9 animate-pulse rounded-full bg-muted" /><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
                  <div className="mt-5 h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="mt-auto h-3 w-24 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          )
        ) : spaces.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-white/60 px-6 py-12 text-center">
            <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-white shadow-geist-sm"><Building2 aria-hidden="true" className="size-5 text-muted-foreground" /></div>
            <h2 className="text-base font-semibold tracking-[-0.02em]">Create your first research space</h2>
            <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">Upload a property's PDFs and get a cited flowchart of its systems, risks and maintenance tickets.</p>
            <Button type="button" onClick={openCreate} aria-haspopup="dialog" className="mt-5 h-9 rounded-md px-3.5"><Plus aria-hidden="true" />New space</Button>
          </div>
        ) : visibleSpaces.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl bg-white px-6 text-center shadow-geist-sm">
            <p className="text-sm font-medium">No spaces match "{query.trim()}"</p>
            <Button type="button" variant="link" onClick={() => setQuery("")} className="mt-1 text-sm text-muted-foreground">Clear search</Button>
          </div>
        ) : (
          <ul aria-label="Your spaces" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSpaces.map(space => (
              <li key={space.id.toString()}>
                <Link to={`/spaces/${space.id}`} aria-label={`Open ${space.name}`} className="group flex h-full min-h-44 flex-col rounded-xl bg-white p-5 shadow-geist-sm transition-shadow duration-200 hover:shadow-geist-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-[#faf9f6]">
                      <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm leading-5 font-semibold tracking-[-0.01em]">{space.name}</h2>
                      <p className="font-mono text-xs leading-5 text-subtle">
                        <time dateTime={space.updatedAt.toDate().toISOString()}>{dateFormat.format(space.updatedAt.toDate())}</time>
                      </p>
                    </div>
                    <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 break-words text-muted-foreground">{space.description || "No description added."}</p>
                  <div className="mt-auto flex items-center gap-2 pt-5">
                    {space.archived
                      ? <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Archived</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-ds-green-700" />Active</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {createOpen && profile && <CreateSpaceDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
