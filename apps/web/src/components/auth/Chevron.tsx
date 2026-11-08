export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`sx-chev ${className}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path className="sx-chev-stem" d="M0 5h7" />
      <path className="sx-chev-head" d="M3.5 1.5 7 5 3.5 8.5" />
    </svg>
  );
}
