import { describe, expect, it } from "vitest"
import { getPathForView, resolveNavigation, type AppView } from "@/lib/navigation"

const allRoutes: Array<[AppView, string]> = [
  ["dashboard", "/"],
  ["setup", "/practice"],
  ["exam", "/exam"],
  ["results", "/results"],
  ["review", "/review"],
  ["resources", "/resources"],
]

const allRoutesAvailable = {
  hasActiveAttempt: true,
  hasCompletedAttempt: true,
}

describe("getPathForView", () => {
  it.each(allRoutes)("maps %s to %s", (view, pathname) => {
    expect(getPathForView(view)).toBe(pathname)
  })
})

describe("resolveNavigation", () => {
  it.each(allRoutes)("resolves %s from %s", (view, pathname) => {
    expect(resolveNavigation(pathname, allRoutesAvailable)).toEqual({ view, pathname })
  })

  it("normalizes trailing slashes", () => {
    expect(resolveNavigation("/review///", allRoutesAvailable)).toEqual({
      view: "review",
      pathname: "/review",
    })
  })

  it("falls back to the dashboard for unknown paths", () => {
    expect(resolveNavigation("/not-a-page", allRoutesAvailable)).toEqual({
      view: "dashboard",
      pathname: "/",
    })
  })

  it("requires an active attempt for the exam route", () => {
    expect(resolveNavigation("/exam", {
      hasActiveAttempt: false,
      hasCompletedAttempt: true,
    })).toEqual({
      view: "dashboard",
      pathname: "/",
    })
  })

  it("requires a completed attempt for the results route", () => {
    expect(resolveNavigation("/results", {
      hasActiveAttempt: true,
      hasCompletedAttempt: false,
    })).toEqual({
      view: "dashboard",
      pathname: "/",
    })
  })
})
