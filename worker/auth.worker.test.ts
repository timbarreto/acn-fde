import { env } from "cloudflare:workers"
import { getMigrations } from "better-auth/db/migration"
import { describe, expect, it } from "vitest"
import { createAuth, createAuthOptions } from "./auth"

function decodeSegment<T>(segment: string): T {
  const padded = segment
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=")
  return JSON.parse(atob(padded)) as T
}

interface ServerJwtApi {
  signJWT(input: {
    body: { payload: Record<string, unknown> }
  }): Promise<{ token: string }>
}

describe("Better Auth on D1", () => {
  it("has no schema drift from the committed migrations", async () => {
    const migrations = await getMigrations(createAuthOptions(env))

    expect(migrations.toBeCreated).toEqual([])
    expect(migrations.toBeAdded).toEqual([])
  })

  it("creates an ES256 public key without exposing private key material", async () => {
    const response = await createAuth(env).handler(
      new Request("http://localhost:5173/api/auth/jwks"),
    )
    const body = await response.json<{
      keys: Array<Record<string, unknown>>
    }>()

    expect(response.status).toBe(200)
    expect(body.keys).toHaveLength(1)
    expect(body.keys[0]).toMatchObject({ alg: "ES256", crv: "P-256" })
    expect(body.keys[0]).not.toHaveProperty("d")
  })

  it("sets secure same-site HTTP-only OAuth cookies in production", async () => {
    const productionUrl = "https://practice.example"
    const productionAuth = createAuth({
      ...env,
      BETTER_AUTH_URL: productionUrl,
      AUTH_TOKEN_ISSUER: productionUrl,
    })
    const response = await productionAuth.handler(
      new Request(`${productionUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: productionUrl,
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: productionUrl,
        }),
      }),
    )
    const cookie = response.headers.get("set-cookie")

    expect(response.status).toBe(200)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Secure")
  })

  it("rejects an untrusted request origin", async () => {
    const response = await createAuth(env).handler(
      new Request("http://localhost:5173/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=not-a-real-session",
          origin: "https://untrusted.example",
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: "http://localhost:5173",
        }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it("signs a short-lived token with only the identity contract claims", async () => {
    const auth = createAuth(env)
    const issuedAt = Math.floor(Date.now() / 1_000)
    const serverApi = auth.api as typeof auth.api & ServerJwtApi
    const result = await serverApi.signJWT({
      body: {
        payload: {
          iat: issuedAt,
          sub: "opaque-subject",
          github_account_id: "123456",
        },
      },
    })
    const [encodedHeader, encodedPayload] = result.token.split(".")
    const header = decodeSegment<Record<string, unknown>>(encodedHeader)
    const payload = decodeSegment<Record<string, unknown>>(encodedPayload)

    expect(header).toMatchObject({ alg: "ES256" })
    expect(header.kid).toEqual(expect.any(String))
    expect(payload).toMatchObject({
      iss: "http://localhost:5173",
      aud: "acn-fde-practice-api",
      sub: "opaque-subject",
      github_account_id: "123456",
    })
    expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(900)
    expect(payload).not.toHaveProperty("email")
    expect(payload).not.toHaveProperty("name")
  })

  it("keeps disabled Better Auth features inaccessible", async () => {
    const response = await createAuth(env).handler(
      new Request("http://localhost:5173/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Candidate",
          email: "candidate@example.com",
          password: "not-a-real-password",
        }),
      }),
    )

    expect(response.status).toBe(404)
  })
})
