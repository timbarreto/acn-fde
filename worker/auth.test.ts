import { github } from "better-auth/social-providers"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createAuthOptions,
  createGithubOptions,
  disabledAuthPaths,
  handleAuthRequest,
  identityTokenPayload,
  identityTokenSubject,
  withoutProviderTokens,
} from "./auth"

const configuration = {
  AUTH_DB: {} as D1Database,
  BETTER_AUTH_URL: "http://localhost:5173",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  BETTER_AUTH_SECRET: "a-test-secret-that-is-at-least-thirty-two-characters",
  AUTH_TOKEN_ISSUER: "http://localhost:5173",
  AUTH_TOKEN_AUDIENCE: "acn-fde-practice-api",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("GitHub identity", () => {
  it("uses the primary private email returned by GitHub", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()

      if (url.endsWith("/user")) {
        return Response.json({
          id: "123456",
          login: "candidate",
          name: "Candidate",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/123456",
        })
      }

      if (url.endsWith("/user/emails")) {
        return Response.json([
          {
            email: "private@example.com",
            primary: true,
            verified: true,
          },
        ])
      }

      throw new Error(`Unexpected GitHub request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const provider = github(createGithubOptions(configuration))
    const result = await provider.getUserInfo({ accessToken: "github-token" })

    expect(result?.user.email).toBe("private@example.com")
    expect(result?.user.emailVerified).toBe(true)
    expect(result?.user.githubAccountId).toBe("123456")
  })

  it("removes provider credentials before an account is persisted", () => {
    const result = withoutProviderTokens({
      id: "account-row",
      accessToken: "github-token",
      refreshToken: "github-refresh-token",
      idToken: "github-id-token",
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    })

    expect(result).toMatchObject({
      id: "account-row",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    })
  })
})

describe("Better Auth boundary", () => {
  it("enables only GitHub and keeps unused account routes disabled", () => {
    const options = createAuthOptions(configuration)

    expect(options.socialProviders).toEqual({
      github: expect.objectContaining({ clientId: "github-client-id" }),
    })
    expect(options.emailAndPassword).toBeUndefined()
    expect(options.disabledPaths).toEqual(disabledAuthPaths)
    expect(disabledAuthPaths).toContain("/sign-up/email")
    expect(disabledAuthPaths).toContain("/list-sessions")
    expect(options.rateLimit).toMatchObject({ enabled: true, storage: "database" })
    expect(options.user?.deleteUser?.enabled).toBe(true)
  })

  it("keeps origin and CSRF protection on and secures production cookies", () => {
    const options = createAuthOptions({
      ...configuration,
      BETTER_AUTH_URL: "https://practice.example",
      AUTH_TOKEN_ISSUER: "https://practice.example",
    })

    expect(options.advanced?.disableCSRFCheck).toBe(false)
    expect(options.advanced?.disableOriginCheck).toBe(false)
    expect(options.advanced?.useSecureCookies).toBe(true)
    expect(options.trustedOrigins).toEqual(["https://practice.example"])
  })

  it("issues a minimal recovery-capable identity payload", () => {
    const session = {
      user: {
        id: "opaque-subject",
        githubAccountId: "123456",
        email: "private@example.com",
        name: "Candidate",
      },
    }

    expect(identityTokenSubject(session)).toBe("opaque-subject")
    expect(identityTokenPayload(session)).toEqual({
      github_account_id: "123456",
    })
  })

  it("returns a secret-safe failure when auth is not configured", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await handleAuthRequest(
      new Request("http://localhost:5173/api/auth/get-session"),
      {
        AUTH_DB: {} as D1Database,
        GITHUB_CLIENT_SECRET: "must-never-appear",
      },
    )
    const responseText = await response.text()
    const logText = errorLog.mock.calls.flat().join(" ")

    expect(response.status).toBe(503)
    expect(responseText).not.toContain("GITHUB_CLIENT_SECRET")
    expect(responseText).not.toContain("must-never-appear")
    expect(logText).not.toContain("GITHUB_CLIENT_SECRET")
    expect(logText).not.toContain("must-never-appear")
  })
})
