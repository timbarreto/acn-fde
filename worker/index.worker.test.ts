import { describe, expect, it, vi } from "vitest"
import worker from "./index"

function productionEnvironment(containerFetch: (request: Request) => Promise<Response>): Env {
  return {
    COREEX: {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ fetch: containerFetch })),
    },
  } as unknown as Env
}

describe("production CoreEx routing", () => {
  it("sends health and practice requests to the singleton container", async () => {
    const containerFetch = vi.fn(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname }))
    const env = productionEnvironment(containerFetch)

    const health = await worker.fetch!(
      new Request("https://practice.example/health/live"),
      env,
    )
    const practice = await worker.fetch!(
      new Request("https://practice.example/api/practice-state"),
      env,
    )

    expect(await health.json()).toEqual({ path: "/health/live" })
    expect(await practice.json()).toEqual({ path: "/api/practice-state" })
    expect(env.COREEX.idFromName).toHaveBeenCalledTimes(2)
    expect(env.COREEX.idFromName).toHaveBeenCalledWith("api")
    expect(env.COREEX.get).toHaveBeenCalledTimes(2)
    expect(containerFetch).toHaveBeenCalledTimes(2)
  })
})
