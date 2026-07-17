import type { DomainId } from "@/types"
import { Blocks, BrainCircuit, GitPullRequest, ScanSearch, ShieldCheck, Waypoints } from "lucide-react"

export const domains = [
  {
    id: "architecture" as DomainId,
    number: "01",
    short: "Architecture & SDLC",
    title: "Prepare agent architecture and SDLC processes",
    weight: "15–20%",
    color: "#ff8a5c",
    soft: "rgba(255, 138, 92, 0.14)",
    icon: GitPullRequest,
  },
  {
    id: "tools" as DomainId,
    number: "02",
    short: "Tools & environments",
    title: "Implement tool use and environment interaction",
    weight: "20–25%",
    color: "#2dd4bf",
    soft: "rgba(45, 212, 191, 0.14)",
    icon: Blocks,
  },
  {
    id: "memory" as DomainId,
    number: "03",
    short: "Memory & state",
    title: "Manage memory, state, and execution",
    weight: "10–15%",
    color: "#a78bfa",
    soft: "rgba(167, 139, 250, 0.14)",
    icon: BrainCircuit,
  },
  {
    id: "evaluation" as DomainId,
    number: "04",
    short: "Evaluation & tuning",
    title: "Perform evaluation, error analysis, and tuning",
    weight: "15–20%",
    color: "#fbbf24",
    soft: "rgba(251, 191, 36, 0.14)",
    icon: ScanSearch,
  },
  {
    id: "orchestration" as DomainId,
    number: "05",
    short: "Multi-agent",
    title: "Orchestrate multi-agent coordination",
    weight: "15–20%",
    color: "#60a5fa",
    soft: "rgba(96, 165, 250, 0.14)",
    icon: Waypoints,
  },
  {
    id: "guardrails" as DomainId,
    number: "06",
    short: "Guardrails",
    title: "Implement guardrails and accountability",
    weight: "10–15%",
    color: "#f472b6",
    soft: "rgba(244, 114, 182, 0.14)",
    icon: ShieldCheck,
  },
]

export const domainMap = Object.fromEntries(domains.map((domain) => [domain.id, domain])) as Record<DomainId, (typeof domains)[number]>
