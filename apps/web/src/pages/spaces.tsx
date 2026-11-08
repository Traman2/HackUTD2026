import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Building2, LoaderCircle, LogOut, Plus } from "lucide-react";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import { reducers, tables } from "@/module_bindings";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", year: "numeric",
});

export default function Spaces() {
  const { isActive, connectionError } = useSpacetimeDB();
  const [profiles, profileReady] = useTable(tables.myProfile);
  const profile = isActive && profileReady ? profiles[0] : undefined;
  const [spaces, spacesReady] = useTable(tables.mySpaces, { enabled: !!profile });
  const logout = useReducer(reducers.logout);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Unable to sign out. Please try again."); }
    finally { setSigningOut(false); }
  }

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
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-[#37352f]/10 bg-[#faf9f6]/90 px-5 py-3 sm:px-8">
        <Link to="/spaces" className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-[#b9d8f3]" aria-label="REALestate home">
          <img src="/logo.svg" alt="" width={32} height={32} className="size-8 object-contain" />
          <span className="text-[13px] font-bold">REALestate</span>
        </Link>
        {profile && (
          <div className="flex items-center gap-4">
            <span className="max-w-40 truncate text-xs text-[#78766e]">{profile.displayName}</span>
            <Button variant="ghost" disabled={signingOut} onClick={signOut} className="text-xs hover:bg-[#37352f]/5 focus-visible:ring-[#b9d8f3]">
              <LogOut aria-hidden="true" className="size-3.5" />
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <h1 className="mb-8 text-[28px] leading-9 font-bold tracking-[-0.8px] sm:text-[32px]">Your Spaces</h1>
        {logoutError && <p role="alert" className="mb-5 text-xs text-[#d92323]">{logoutError}</p>}
        <ul aria-label="Your spaces" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!ready ? (
            <li role="status" className="flex min-h-52 items-center justify-center gap-2 rounded-xl border border-[#e3e3e7] bg-white p-5 text-xs text-[#78766e] shadow-sm">
              {!connectionError && <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />}
              {connectionError ? "Unable to connect. Refresh to try again." : "Loading your spaces..."}
            </li>
          ) : sortedSpaces.length === 0 ? (
            <li>
              <article className="flex min-h-52 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#d5d4cf] bg-white p-5 text-center">
                <div className="mb-5 flex size-10 items-center justify-center rounded-lg border border-[#e3e3e7] bg-[#faf9f6]">
                  <Plus aria-hidden="true" className="size-4.5 text-[#78766e]" />
                </div>
                <h2 className="max-w-56 text-base leading-6 font-semibold tracking-[-0.3px]">Create your first real estate research space</h2>
              </article>
            </li>
          ) : sortedSpaces.map(space => (
              <li key={space.id.toString()}>
                <article className="flex h-full min-h-52 flex-col rounded-xl border border-[#e3e3e7] bg-white p-5 shadow-sm">
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
                </article>
              </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
