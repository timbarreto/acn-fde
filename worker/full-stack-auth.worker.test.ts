import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import fullStackTestWorker from "./full-stack-test-entry"

interface TestIdentity {
  subject: string
  token: string
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split(".")[1]
  const padded = encoded
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=")
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

async function issueIdentity(name: string): Promise<TestIdentity> {
  const response = await fullStackTestWorker.fetch(
    new Request("http://localhost:5173/api/test-auth/identity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    env,
  )

  expect(response.status).toBe(201)
  return response.json<TestIdentity>()
}

describe("full-stack test authentication", () => {
  it("issues real short-lived identity tokens for independent subjects", async () => {
    const first = await issueIdentity("First candidate")
    const second = await issueIdentity("Second candidate")
    const firstPayload = decodeJwtPayload(first.token)
    const secondPayload = decodeJwtPayload(second.token)

    expect(first.subject).not.toBe(second.subject)
    expect(firstPayload).toMatchObject({
      iss: "http://localhost:5173",
      aud: "acn-fde-practice-api",
      sub: first.subject,
    })
    expect(secondPayload).toMatchObject({
      iss: "http://localhost:5173",
      aud: "acn-fde-practice-api",
      sub: second.subject,
    })
    expect(Number(firstPayload.exp) - Number(firstPayload.iat)).toBeLessThanOrEqual(
      900,
    )
  })
})
