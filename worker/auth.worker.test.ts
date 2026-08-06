import { env } from "cloudflare:workers"
import { SELF } from "cloudflare:test"
import { getMigrations } from "better-auth/db/migration"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuth, createAuthOptions } from "./auth"

function decodeSegment<T>(segment: string): T {
  const padded = segment
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=")
  return JSON.parse(atob(padded)) as T
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("persists the GitHub recovery identifier through the OAuth callback", async () => {
    const productionUrl = "https://practice.example"
    const auth = createAuth({
      ...env,
      BETTER_AUTH_URL: productionUrl,
      AUTH_TOKEN_ISSUER: productionUrl,
    })
    const start = await auth.handler(
      new Request(`${productionUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: productionUrl,
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: `${productionUrl}/account`,
          errorCallbackURL: `${productionUrl}/account`,
        }),
      }),
    )
    const authorization = await start.json<{ url: string }>()
    const authorizationUrl = new URL(authorization.url)
    const stateCookie = start.headers.get("set-cookie")?.split(";", 1)[0]
    expect(stateCookie).toBeTruthy()

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.startsWith("https://github.com/login/oauth/access_token"))
        return Response.json({
          access_token: "github-token",
          token_type: "bearer",
          scope: "read:user,user:email",
        })
      if (url === "https://api.github.com/user")
        return Response.json({
          id: 123456,
          login: "candidate",
          name: "Candidate",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/123456",
        })
      if (url === "https://api.github.com/user/emails")
        return Response.json([{
          email: "candidate@example.test",
          primary: true,
          verified: true,
        }])
      throw new Error(`Unexpected GitHub request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const callback = await auth.handler(
      new Request(
        `${productionUrl}/api/auth/callback/github?code=github-code&state=${authorizationUrl.searchParams.get("state")}`,
        { headers: { cookie: stateCookie! } },
      ),
    )

    expect(callback.status).toBe(302)
    expect(callback.headers.get("location")).toBe(`${productionUrl}/account`)
    const sessionCookie = callback.headers.get("set-cookie")
      ?.split(",")
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ")
    const session = await auth.handler(
      new Request(`${productionUrl}/api/auth/get-session`, {
        headers: { cookie: sessionCookie ?? "" },
      }),
    )
    expect(await session.json()).toMatchObject({
      user: { githubAccountId: "123456" },
    })
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

describe("production authentication boundary", () => {
  it("does not expose test identity issuance", async () => {
    const response = await SELF.fetch(
      "http://localhost:5173/api/test-auth/identity",
      { method: "POST" },
    )

    expect(response.status).toBe(404)
  })
})
