import type { Severity } from "../../../../spacetimedb/src/validation/risk";

export const severityStyles: Record<Exclude<Severity, "none">, { label: string; badge: string; dot: string }> = {
  critical: { label: "Critical", badge: "border-[#f1c4c0] bg-[#fdf1f0] text-[#b4372c]", dot: "#d9473b" },
  high: { label: "High", badge: "border-[#f3d2b3] bg-[#fdf4ec] text-[#a65314]", dot: "#e07a2f" },
  elevated: { label: "Elevated", badge: "border-[#f0dfa8] bg-[#fdf9ea] text-[#8a6a10]", dot: "#d9a92b" },
};

export const reasonLabels: Record<string, string> = {
  condition: "Condition", issue: "Review issue", propagated: "Upstream dependency", redundancy: "Lost redundancy",
  backup: "Backup at risk", oversight: "Monitoring or protection at risk", contract: "Contract exposure",
};
