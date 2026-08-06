import { describe, expect, it, vi } from "vitest"
import worker from "./index"

function productionEnvironment(
  containerFetch: (request: Request) => Promise<Response>,
): Env {
  return {
    COREEX: {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ fetch: containerFetch })),
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response("shell")),
    },
  } as unknown as Env
}

describe("production CoreEx routing", () => {
  it("sends practice requests to the singleton container", async () => {
    const containerFetch = vi.fn(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname }))
    const env = productionEnvironment(containerFetch)

    const practice = await worker.fetch!(
      new Request("https://practice.example/api/practice-state"),
      env,
    )

    expect(await practice.json()).toEqual({ path: "/api/practice-state" })
    expect(env.COREEX.idFromName).toHaveBeenCalledOnce()
    expect(env.COREEX.idFromName).toHaveBeenCalledWith("api")
    expect(containerFetch).toHaveBeenCalledOnce()
  })

  it("keeps the sleeping container off the public health surface", async () => {
    const containerFetch = vi.fn(async () => Response.json({}))
    const env = productionEnvironment(containerFetch)

    const live = await worker.fetch!(
      new Request("https://practice.example/health/live"),
      env,
    )
    const ready = await worker.fetch!(
      new Request("https://practice.example/health/ready"),
      env,
    )

    expect(await live.text()).toBe("shell")
    expect(await ready.text()).toBe("shell")
    expect(containerFetch).not.toHaveBeenCalled()
    expect(env.COREEX.idFromName).not.toHaveBeenCalled()
  })
})
