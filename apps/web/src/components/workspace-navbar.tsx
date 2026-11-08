import { useState } from "react";
import { LogOut } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { reducers } from "@/module_bindings";

/** Initials on a gradient chosen from the name, like Vercel's account avatars. */
export function Avatar({ name, className = "size-7" }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-1 ring-black/5 ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${(hue + 50) % 360} 80% 48%))` }}>
      {initials}
    </span>
  );
}

/** Slash divider used between breadcrumb items. */
export function Slash() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-border-strong" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M16.88 3.549L7.12 20.451" /></svg>;
}

export function WorkspaceNavbar({ displayName, disabled = false }: { displayName?: string; disabled?: boolean }) {
  const logout = useReducer(reducers.logout);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setError("");
    try { await logout(); }
    catch { setError("Unable to sign out. Please try again."); }
    finally { setSigningOut(false); }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-[#faf9f6]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
          <BrandMark to="/spaces" disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }} />
          <Slash />
          <span aria-current="page" className="truncate text-sm font-medium">Spaces</span>
        </nav>
        {displayName && (
          <div className="flex min-w-0 items-center gap-3">
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <Avatar name={displayName} />
              <span className="max-w-40 truncate text-sm text-muted-foreground">{displayName}</span>
            </div>
            <Button variant="outline" size="sm" disabled={disabled || signingOut} onClick={signOut} className="bg-white">
              <LogOut aria-hidden="true" />
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
