import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Building2, LoaderCircle, Plus } from "lucide-react";
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

  // Wait for the server's session view before treating an empty profile as logout.
  if (isActive && profileReady && !profile) return <Navigate to="/login" replace />;

  const ready = isActive && !!profile && spacesReady;
  const sortedSpaces = [...spaces].sort((a, b) => {
    if (a.archived !== b.archived) return Number(a.archived) - Number(b.archived);
    const aTime = a.updatedAt.microsSinceUnixEpoch;
    const bTime = b.updatedAt.microsSinceUnixEpoch;
    return aTime === bTime ? a.name.localeCompare(b.name) : aTime > bTime ? -1 : 1;
  });

  return (
    <div className="login-grid-bg min-h-svh text-[#37352f]">
      <WorkspaceNavbar displayName={profile?.displayName} />
      <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <h1 className="mb-8 text-[28px] leading-9 font-bold tracking-[-0.8px] sm:text-[32px]">Your Spaces</h1>
        <ul aria-label="Your spaces" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!ready ? (
            <li role="status" className="flex min-h-52 items-center justify-center gap-2 rounded-xl border border-[#e3e3e7] bg-white p-5 text-xs text-[#78766e] shadow-sm">
              {!connectionError && <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />}
              {connectionError ? "Unable to connect. Refresh to try again." : "Loading your spaces..."}
            </li>
          ) : (<>
            {sortedSpaces.map(space => (
              <li key={space.id.toString()}>
                <Link to={`/spaces/${space.id}`} aria-label={`Open ${space.name}`} className="flex h-full min-h-52 flex-col rounded-xl border border-[#e3e3e7] bg-white p-5 shadow-sm transition-colors hover:border-[#b7b5ae] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b9d8f3]">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-[#e3e3e7] bg-[#faf9f6]">
                      <Building2 aria-hidden="true" className="size-4.5 text-[#78766e]" />
                    </div>
                    {space.archived && <span className="rounded border border-[#e3e3e7] px-2 py-0.5 text-[10px] text-[#78766e]">Archived</span>}
                  </div>
                  <h2 className="text-base leading-6 font-semibold tracking-[-0.3px] break-words">{space.name}</h2>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-5 break-words text-[#78766e]">{space.description || "No description added."}</p>
                  <p className="mt-auto pt-6 text-[10px] text-[#939188]">
                    Updated <time dateTime={space.updatedAt.toDate().toISOString()}>{dateFormat.format(space.updatedAt.toDate())}</time>
                  </p>
                </Link>
              </li>
            ))}
            <li>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(true)} aria-haspopup="dialog" className="flex h-full min-h-52 w-full cursor-pointer flex-col gap-0 rounded-xl border-2 border-dashed border-[#d5d4cf] bg-white p-5 text-center whitespace-normal shadow-none transition-colors hover:border-[#939188] hover:bg-[#faf9f6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b9d8f3]">
                <div className="mb-5 flex size-10 items-center justify-center rounded-lg border border-[#e3e3e7] bg-[#faf9f6]">
                  <Plus aria-hidden="true" className="size-4.5 text-[#78766e]" />
                </div>
                <h2 className="max-w-56 text-base leading-6 font-semibold tracking-[-0.3px]">{spaces.length === 0 ? "Create your first real estate research space" : "Create a new space"}</h2>
              </Button>
            </li>
          </>)}
        </ul>
      </main>
      {createOpen && profile && <CreateSpaceDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
