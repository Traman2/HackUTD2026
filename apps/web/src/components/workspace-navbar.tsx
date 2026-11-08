import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import { reducers } from "@/module_bindings";

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
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-[#37352f]/10 bg-[#faf9f6]/90 px-5 py-3 sm:px-8">
      <Link to="/spaces" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }} className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-[#b9d8f3]" aria-label="REALestate home">
        <img src="/logo.svg" alt="" width={32} height={32} className="size-8 object-contain" />
        <span className="text-[13px] font-bold">REALestate</span>
      </Link>
      {displayName && (
        <div className="flex flex-wrap items-center gap-4">
          {error && <p role="alert" className="text-xs text-[#d92323]">{error}</p>}
          <span className="max-w-40 truncate text-xs text-[#78766e]">{displayName}</span>
          <Button variant="ghost" disabled={disabled || signingOut} onClick={signOut} className="text-xs hover:bg-[#37352f]/5 focus-visible:ring-[#b9d8f3]">
            <LogOut aria-hidden="true" className="size-3.5" />
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      )}
    </header>
  );
}
