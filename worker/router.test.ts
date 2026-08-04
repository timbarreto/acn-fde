import { describe, expect, it, vi } from "vitest"
import { routeRequest, toCoreExRequest } from "./router"

function response(label: string): Response {
  return new Response(label)
}

describe("routeRequest", () => {
  it.each(["/api", "/api/practice-state", "/health/live", "/health/ready"])(
    "routes %s to CoreEx",
    async (path) => {
      const coreEx = vi.fn(async () => response("coreex"))
      const assets = vi.fn(async () => response("asset"))

      const result = await routeRequest(
        new Request(`http://localhost${path}`),
        { coreEx, assets },
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
        { coreEx, assets },
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
