import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";

/** Vercel-style input: hairline border, darker border on hover, soft halo on focus. */
export const authInputClass =
  "h-10 rounded-md border-input bg-white px-3 text-sm shadow-none transition-[border-color,box-shadow] placeholder:text-subtle hover:border-border-strong focus-visible:border-subtle focus-visible:ring-4 focus-visible:ring-black/[0.06]";

/** Centered single-column auth page on the grid background, with a footer strip. */
export function AuthLayout({ title, description, footer, children }: {
  title: string; description: string; footer: ReactNode; children: ReactNode;
}) {
  return (
    <div className="login-grid-bg relative flex min-h-svh flex-col text-foreground">
      <header className="flex h-16 shrink-0 items-center px-5 sm:px-6">
        <BrandMark to="/login" />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 text-center">
            <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.04em]">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-white/70 px-6 py-5 text-center text-sm text-muted-foreground backdrop-blur-sm">
        {footer}
      </footer>
    </div>
  );
}

export function AuthFooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </Link>
  );
}

/** Label, control and a reserved line for the validation message. */
export function AuthField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <Label htmlFor={id} className="mb-2 block text-[13px] font-medium text-muted-foreground">{label}</Label>
      {children}
      <p id={`${id}-error`} className="mt-1.5 min-h-4 text-xs leading-4 text-destructive" aria-live="polite">{error}</p>
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "status"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${tone === "error" ? "border-ds-red-300 bg-ds-red-100 text-ds-red-900" : "border-ds-green-300 bg-ds-green-100 text-ds-green-900"}`}>
      {children}
    </p>
  );
}
