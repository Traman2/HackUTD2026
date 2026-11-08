import type { Severity } from "../../../../spacetimedb/src/validation/risk";

// Geist status colors: red for critical, orange for high, amber for elevated.
export const severityStyles: Record<Exclude<Severity, "none">, { label: string; badge: string; dot: string }> = {
  critical: { label: "Critical", badge: "border-ds-red-300 bg-ds-red-100 text-ds-red-900", dot: "hsl(358 75% 59%)" },
  high: { label: "High", badge: "border-ds-orange-300 bg-ds-orange-100 text-ds-orange-900", dot: "hsl(24 94% 53%)" },
  elevated: { label: "Elevated", badge: "border-ds-amber-300 bg-ds-amber-100 text-ds-amber-900", dot: "hsl(39 100% 57%)" },
};

export const reasonLabels: Record<string, string> = {
  condition: "Condition", issue: "Review issue", propagated: "Upstream dependency", redundancy: "Lost redundancy",
  backup: "Backup at risk", oversight: "Monitoring or protection at risk", contract: "Contract exposure",
};
