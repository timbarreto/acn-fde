import type { DomainId } from "@/types"
import { Blocks, BrainCircuit, GitPullRequest, ScanSearch, ShieldCheck, Waypoints } from "lucide-react"

export const domains = [
  {
    id: "architecture" as DomainId,
    number: "01",
    short: "Architecture & SDLC",
    title: "Prepare agent architecture and SDLC processes",
    weight: "15–20%",
    color: "#e46f51",
    soft: "#fbe8e1",
    icon: GitPullRequest,
  },
  {
    id: "tools" as DomainId,
    number: "02",
    short: "Tools & environments",
    title: "Implement tool use and environment interaction",
    weight: "20–25%",
    color: "#267a70",
    soft: "#dff1ed",
    icon: Blocks,
  },
  {
    id: "memory" as DomainId,
    number: "03",
    short: "Memory & state",
    title: "Manage memory, state, and execution",
    weight: "10–15%",
    color: "#6660a8",
    soft: "#eae8f8",
    icon: BrainCircuit,
  },
  {
    id: "evaluation" as DomainId,
    number: "04",
    short: "Evaluation & tuning",
    title: "Perform evaluation, error analysis, and tuning",
    weight: "15–20%",
    color: "#b7771d",
    soft: "#faedda",
    icon: ScanSearch,
  },
  {
    id: "orchestration" as DomainId,
    number: "05",
    short: "Multi-agent",
    title: "Orchestrate multi-agent coordination",
    weight: "15–20%",
    color: "#3b6f96",
    soft: "#e2edf5",
    icon: Waypoints,
  },
  {
    id: "guardrails" as DomainId,
    number: "06",
    short: "Guardrails",
    title: "Implement guardrails and accountability",
    weight: "10–15%",
    color: "#9a5266",
    soft: "#f5e6eb",
    icon: ShieldCheck,
  },
]

export const domainMap = Object.fromEntries(domains.map((domain) => [domain.id, domain])) as Record<DomainId, (typeof domains)[number]>
