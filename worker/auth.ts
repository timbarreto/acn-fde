import { betterAuth, type BetterAuthOptions } from "better-auth"
import { jwt } from "better-auth/plugins"
import type {
  GithubOptions,
  GithubProfile,
} from "better-auth/social-providers"

export interface AuthConfiguration {
  AUTH_DB: D1Database
  BETTER_AUTH_URL: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  BETTER_AUTH_SECRET: string
  AUTH_TOKEN_ISSUER: string
  AUTH_TOKEN_AUDIENCE: string
}

interface IdentitySession {
  user: Record<string, unknown> & {
    id: string
    githubAccountId?: unknown
  }
}

export const disabledAuthPaths = [
  "/account-info",
  "/change-email",
  "/change-password",
  "/delete-user/callback",
  "/error",
  "/get-access-token",
  "/link-social",
  "/list-accounts",
  "/list-sessions",
  "/ok",
  "/refresh-token",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/revoke-other-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/send-verification-email",
  "/sign-in/email",
  "/sign-up/email",
  "/unlink-account",
  "/update-session",
  "/update-user",
  "/verify-email",
  "/verify-password",
]

export function createGithubOptions(
  configuration: AuthConfiguration,
): GithubOptions {
  return {
    clientId: configuration.GITHUB_CLIENT_ID,
    clientSecret: configuration.GITHUB_CLIENT_SECRET,
    mapProfileToUser: (profile: GithubProfile) => ({
      githubAccountId: String(profile.id),
    }),
  }
}

export function withoutProviderTokens<T extends Record<string, unknown>>(
  account: T,
): T & {
  accessToken: null
  refreshToken: null
  idToken: null
  accessTokenExpiresAt: null
  refreshTokenExpiresAt: null
} {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  }
}

export function identityTokenSubject(session: IdentitySession): string {
  return session.user.id
}

export function identityTokenPayload(
  session: IdentitySession,
): Record<string, string> {
  if (
    typeof session.user.githubAccountId !== "string" ||
    session.user.githubAccountId.length === 0
  ) {
    throw new Error("Identity record is incomplete")
  }

  return { github_account_id: session.user.githubAccountId }
}

export function createAuthOptions(
  configuration: AuthConfiguration,
): BetterAuthOptions {
  return {
    appName: "Agentic Ready — GH-600 Practice",
    baseURL: configuration.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: configuration.BETTER_AUTH_SECRET,
    database: configuration.AUTH_DB,
    trustedOrigins: [configuration.BETTER_AUTH_URL],
    socialProviders: {
      github: createGithubOptions(configuration),
    },
    user: {
      additionalFields: {
        githubAccountId: {
          type: "string",
          required: true,
          input: false,
        },
      },
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => ({
            data: withoutProviderTokens(account),
          }),
        },
        update: {
          before: async (account) => ({
            data: withoutProviderTokens(account),
          }),
        },
      },
    },
    disabledPaths: disabledAuthPaths,
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      useSecureCookies: new URL(configuration.BETTER_AUTH_URL).protocol === "https:",
    },
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: { alg: "ES256" },
        },
        jwt: {
          issuer: configuration.AUTH_TOKEN_ISSUER,
          audience: configuration.AUTH_TOKEN_AUDIENCE,
          expirationTime: "15m",
          definePayload: identityTokenPayload,
          getSubject: identityTokenSubject,
        },
        disableSettingJwtHeader: true,
      }),
    ],
  }
}

export function createAuth(configuration: AuthConfiguration) {
  return betterAuth(createAuthOptions(configuration))
}

export async function handleAuthRequest(
  request: Request,
  environment: Partial<AuthConfiguration>,
): Promise<Response> {
  try {
    const configuration = requireAuthConfiguration(environment)
    return await createAuth(configuration).handler(request)
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Authentication request failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    )

    return Response.json(
      { title: "Authentication is unavailable", status: 503 },
      { status: 503 },
    )
  }
}

function requireAuthConfiguration(
  environment: Partial<AuthConfiguration>,
): AuthConfiguration {
  if (
    !environment.AUTH_DB ||
    !environment.BETTER_AUTH_URL ||
    !environment.GITHUB_CLIENT_ID ||
    environment.GITHUB_CLIENT_ID.startsWith("replace-with-") ||
    !environment.GITHUB_CLIENT_SECRET ||
    environment.GITHUB_CLIENT_SECRET.startsWith("replace-with-") ||
    !environment.BETTER_AUTH_SECRET ||
    environment.BETTER_AUTH_SECRET.length < 32 ||
    environment.BETTER_AUTH_SECRET.startsWith("replace-with-") ||
    !environment.AUTH_TOKEN_ISSUER ||
    !environment.AUTH_TOKEN_AUDIENCE
  ) {
    throw new Error("Authentication is not configured")
  }

  return environment as AuthConfiguration
}
