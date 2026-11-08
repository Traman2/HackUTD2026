import { Building2, Cable, CircleDot, Cpu, Fan, FileText, Landmark, ListChecks, Network, ShieldCheck, SlidersHorizontal, Users, Zap } from "lucide-react";
import type { SpaceGraph } from "../../../../spacetimedb/src/validation/flowchart";

export const categories: Record<SpaceGraph["nodes"][number]["category"], { icon: typeof Zap; color: string }> = {
  property: { icon: Building2, color: "#7c83db" }, utility: { icon: Cable, color: "#53a986" },
  contract: { icon: FileText, color: "#699ad1" }, party: { icon: Users, color: "#ad83c5" },
  financial: { icon: Landmark, color: "#c5a24e" }, obligation: { icon: ListChecks, color: "#cf8b70" },
  equipment: { icon: Cpu, color: "#7e91b0" }, cooling: { icon: Fan, color: "#55a8ad" },
  power: { icon: Zap, color: "#c5a24e" }, network: { icon: Network, color: "#8d83c5" },
  controls: { icon: SlidersHorizontal, color: "#699ad1" }, safety: { icon: ShieldCheck, color: "#b58b79" },
  other: { icon: CircleDot, color: "#8b929b" },
};
