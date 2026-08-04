import { describe, expect, it, vi } from "vitest"
import { routeRequest, toCoreExRequest } from "./router"

function response(label: string): Response {
  return new Response(label)
}

describe("routeRequest", () => {
  it.each([
    ["POST", "/api/auth/sign-in/social"],
    ["GET", "/api/auth/callback/github"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/token"],
    ["GET", "/api/auth/jwks"],
    ["POST", "/api/auth/delete-user"],
  ])("routes %s %s to Better Auth before CoreEx", async (method, path) => {
    const auth = vi.fn(async () => response("auth"))
    const coreEx = vi.fn(async () => response("coreex"))
    const assets = vi.fn(async () => response("asset"))

    const result = await routeRequest(
      new Request(`http://localhost${path}`, { method }),
      { auth, coreEx, assets },
    )

    expect(await result.text()).toBe("auth")
    expect(auth).toHaveBeenCalledOnce()
    expect(coreEx).not.toHaveBeenCalled()
    expect(assets).not.toHaveBeenCalled()
  })

  it.each([
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/sign-in/email"],
    ["GET", "/api/auth/callback/google"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/change-password"],
  ])("rejects disabled auth route %s %s before CoreEx", async (method, path) => {
    const auth = vi.fn(async () => response("auth"))
    const coreEx = vi.fn(async () => response("coreex"))
    const assets = vi.fn(async () => response("asset"))

    const result = await routeRequest(
      new Request(`http://localhost${path}`, { method }),
      { auth, coreEx, assets },
    )

    expect(result.status).toBe(404)
    expect(auth).not.toHaveBeenCalled()
    expect(coreEx).not.toHaveBeenCalled()
    expect(assets).not.toHaveBeenCalled()
  })

  it.each(["/api", "/api/practice-state", "/health/live", "/health/ready"])(
    "routes %s to CoreEx",
    async (path) => {
      const coreEx = vi.fn(async () => response("coreex"))
      const assets = vi.fn(async () => response("asset"))

      const result = await routeRequest(
        new Request(`http://localhost${path}`),
        { auth: vi.fn(async () => response("auth")), coreEx, assets },
      )

      expect(await result.text()).toBe("coreex")
      expect(coreEx).toHaveBeenCalledOnce()
      expect(assets).not.toHaveBeenCalled()
    },
  )

  it.each(["/", "/history", "/assets/app.js", "/apiary"])(
    "leaves %s with the client application",
    async (path) => {
      const coreEx = vi.fn(async () => response("coreex"))
      const assets = vi.fn(async () => response("asset"))

      const result = await routeRequest(
        new Request(`http://localhost${path}`),
        { auth: vi.fn(async () => response("auth")), coreEx, assets },
      )

      expect(await result.text()).toBe("asset")
      expect(assets).toHaveBeenCalledOnce()
      expect(coreEx).not.toHaveBeenCalled()
    },
  )

  it("rewrites only the origin when proxying", () => {
    const request = new Request(
      "http://localhost/api/practice-state?revision=4",
      {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      },
    )

    const proxied = toCoreExRequest(request, "http://127.0.0.1:5080")

    expect(proxied.url).toBe(
      "http://127.0.0.1:5080/api/practice-state?revision=4",
    )
    expect(proxied.method).toBe("POST")
    expect(proxied.headers.get("content-type")).toBe("application/json")
  })
})
