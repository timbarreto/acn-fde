export type AppView = "dashboard" | "setup" | "exam" | "results" | "review" | "resources"

export interface RouteAvailability {
  hasActiveAttempt: boolean
  hasCompletedAttempt: boolean
}

export interface ResolvedNavigation {
  view: AppView
  pathname: string
}

const paths: Record<AppView, string> = {
  dashboard: "/",
  setup: "/practice",
  exam: "/exam",
  results: "/results",
  review: "/review",
  resources: "/resources",
}

const viewsByPath = new Map(Object.entries(paths).map(([view, pathname]) => [pathname, view as AppView]))

export function getPathForView(view: AppView): string {
  return paths[view]
}

export function resolveNavigation(pathname: string, availability: RouteAvailability): ResolvedNavigation {
  const normalizedPath = pathname === "/" ? pathname : pathname.replace(/\/+$/, "") || "/"
  const requestedView = viewsByPath.get(normalizedPath)
  const view = requestedView === "exam" && !availability.hasActiveAttempt
    ? "dashboard"
    : requestedView === "results" && !availability.hasCompletedAttempt
      ? "dashboard"
      : requestedView ?? "dashboard"

  return {
    view,
    pathname: getPathForView(view),
  }
}
