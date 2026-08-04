import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"

describe("practice state Worker boundary", () => {
  it("rejects an unsupported media type before proxying", async () => {
    const response = await SELF.fetch("http://localhost:5173/api/practice-state", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      code: "unsupported_media_type",
      status: 415,
    })
  })

  it("enforces the actual body limit even when Content-Length is false", async () => {
    const response = await SELF.fetch("http://localhost:5173/api/practice-state", {
      method: "POST",
      headers: {
        "content-length": "1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ value: "x".repeat(513 * 1024) }),
    })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: "practice_state_too_large",
      status: 413,
    })
  })
})
