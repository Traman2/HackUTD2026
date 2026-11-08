import { useId } from "react";

/** REALestate mark: a tower pair with a live "network" node. */
export function LogoMark({ size = 38 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="sx-mark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8f84ff" />
          <stop offset="0.55" stopColor="#635bff" />
          <stop offset="1" stopColor="#3a35c9" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}g)`} />
      <rect width="40" height="40" rx="11" fill={`url(#${id}s)`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="#fff" strokeOpacity="0.28" />
      {/* towers */}
      <rect x="9" y="11" width="12" height="21" rx="2.4" fill="#fff" />
      <rect x="23" y="18" width="8" height="14" rx="2.2" fill="#fff" fillOpacity="0.82" />
      {/* windows */}
      <g fill="#635bff" fillOpacity="0.4">
        <rect x="12" y="15" width="3" height="2.6" rx="0.8" />
        <rect x="16" y="15" width="3" height="2.6" rx="0.8" />
        <rect x="12" y="20.5" width="3" height="2.6" rx="0.8" />
        <rect x="16" y="20.5" width="3" height="2.6" rx="0.8" />
        <rect x="12" y="26" width="3" height="2.6" rx="0.8" />
        <rect x="16" y="26" width="3" height="2.6" rx="0.8" />
        <rect x="25.5" y="22" width="3" height="2.6" rx="0.8" />
        <rect x="25.5" y="27" width="3" height="2.6" rx="0.8" />
      </g>
      {/* network link + node */}
      <path d="M21 13.5 27.5 9" stroke="#bff6ff" strokeWidth="1.5" strokeLinecap="round" />
      <circle className="sx-mark-ring" cx="29.5" cy="8" r="3.4" fill="#6ee7ff" />
      <circle cx="29.5" cy="8" r="3" fill="#6ee7ff" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="sx-logo-lockup">
      <LogoMark />
      <span className="sx-wordmark">
        <b>REAL</b>estate
      </span>
    </span>
  );
}
