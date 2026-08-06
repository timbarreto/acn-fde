import { useSyncExternalStore } from "react"
import { createAuthClient } from "better-auth/client"
import {
  PracticeSessionMismatchError,
  type PracticeAuth,
} from "@/lib/persistence"
import type { AccountIdentity } from "@/types"

const authClient = createAuthClient()

let accountIdentity: AccountIdentity | null = null
const accountIdentityListeners = new Set<() => void>()

const browserAccountIdentityStore = {
  getSnapshot: () => accountIdentity,
  subscribe(listener: () => void) {
    accountIdentityListeners.add(listener)
    return () => accountIdentityListeners.delete(listener)
  },
}

export function useBrowserAccountIdentity() {
  return useSyncExternalStore(
    browserAccountIdentityStore.subscribe,
    browserAccountIdentityStore.getSnapshot,
    browserAccountIdentityStore.getSnapshot,
  )
}

function publishAccountIdentity(nextIdentity: AccountIdentity | null) {
  if (
    accountIdentity?.githubUsername === nextIdentity?.githubUsername &&
    accountIdentity?.avatarUrl === nextIdentity?.avatarUrl
  ) return

  accountIdentity = nextIdentity
  for (const listener of accountIdentityListeners) listener()
}

function accountIdentityFromUser(user: {
  githubUsername?: unknown
  image?: unknown
}): AccountIdentity | null {
  if (
    typeof user.githubUsername !== "string" ||
    user.githubUsername.length === 0 ||
    typeof user.image !== "string" ||
    user.image.length === 0
  ) return null

  return {
    githubUsername: user.githubUsername,
    avatarUrl: user.image,
  }
}

export async function signInWithGitHub(callbackURL: string) {
  const result = await authClient.signIn.social({
    provider: "github",
    callbackURL,
    errorCallbackURL: callbackURL,
  })
  if (result.error) throw authError("start GitHub sign-in", result.error)
}

interface BetterAuthDeletionResult {
  error: {
    message?: string
    status: number
    statusText: string
  } | null
}

export async function deleteBetterAuthAccount(
  deleteUser: () => Promise<BetterAuthDeletionResult> = () => authClient.deleteUser({}),
) {
  const result = await deleteUser()
  if (result.error) throw authError("delete the account", result.error)
}

export interface IdentityTokenAdapter {
  getIdentityToken: () => Promise<string>
  invalidateIdentityToken: (token: string) => void
  clearIdentityToken: () => void
}

export function createIdentityTokenAdapter(
  fetcher: typeof fetch,
): IdentityTokenAdapter {
  let token: string | null = null
  let acquisition: Promise<string> | null = null
  let generation = 0

  async function acquireIdentityToken() {
    const acquisitionGeneration = generation
    const response = await fetcher("/api/auth/token", {
      headers: { accept: "application/json" },
    })
    if (!response.ok) {
      if (response.status === 401) throw new PracticeSessionMismatchError()
      throw new Error(
        `Could not acquire an identity token: ${response.statusText} (${response.status}).`,
      )
    }

    const body = await response.json() as { token?: unknown }
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new Error("Could not acquire an identity token: the response was invalid.")
    }
    if (generation === acquisitionGeneration) token = body.token
    return body.token
  }

  return {
    getIdentityToken() {
      if (token) return Promise.resolve(token)
      if (acquisition) return acquisition

      const pending = acquireIdentityToken().finally(() => {
        if (acquisition === pending) acquisition = null
      })
      acquisition = pending
      return pending
    },
    invalidateIdentityToken(rejectedToken) {
      if (token === rejectedToken) {
        token = null
        generation += 1
      }
    },
    clearIdentityToken() {
      token = null
      acquisition = null
      generation += 1
    },
  }
}

const identityTokens = createIdentityTokenAdapter((input, init) => fetch(input, init))

export const browserPracticeAuth: PracticeAuth = {
  async getSession() {
    const result = await authClient.getSession()
    if (result.error) throw authError("resolve the session", result.error)
    identityTokens.clearIdentityToken()
    publishAccountIdentity(result.data
      ? accountIdentityFromUser(result.data.user)
      : null)
    return result.data ? { subject: result.data.user.id } : null
  },
  async getIdentityToken(expectedSubject) {
    const token = await identityTokens.getIdentityToken()
    const tokenSubject = identityTokenSubject(token)
    if (tokenSubject !== expectedSubject) {
      if (!tokenSubject) identityTokens.invalidateIdentityToken(token)
      throw new PracticeSessionMismatchError()
    }
    return token
  },
  invalidateIdentityToken(token) {
    identityTokens.invalidateIdentityToken(token)
  },
  async signOut() {
    const result = await authClient.signOut()
    if (result.error) throw authError("end the session", result.error)
    identityTokens.clearIdentityToken()
    publishAccountIdentity(null)
  },
  async deleteAccount() {
    await deleteBetterAuthAccount()
    identityTokens.clearIdentityToken()
    publishAccountIdentity(null)
  },
  subscribeSession(listener) {
    return authClient.useSession.subscribe((session) => {
      const resolved = resolvedPracticeSession(session)
      if (resolved === undefined) return
      identityTokens.clearIdentityToken()
      publishAccountIdentity(session.data
        ? accountIdentityFromUser(session.data.user)
        : null)
      listener(resolved)
    })
  },
}

interface BrowserSessionSnapshot {
  data: {
    user: {
      id: string
      githubUsername?: unknown
      image?: unknown
    }
  } | null
  error: { status?: number } | null
  isPending: boolean
  isRefetching: boolean
}

export function resolvedPracticeSession(
  session: BrowserSessionSnapshot,
): { subject: string } | null | undefined {
  if (session.isPending || session.isRefetching) {
    return undefined
  }
  if (session.error) {
    return session.data === null && session.error.status === 401
      ? null
      : undefined
  }
  return session.data ? { subject: session.data.user.id } : null
}

export function identityTokenSubject(token: string) {
  const encodedPayload = token.split(".")[1]
  if (!encodedPayload) return null

  try {
    const base64 = encodedPayload
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=")
    const bytes = Uint8Array.from(atob(base64), (character) => (
      character.charCodeAt(0)
    ))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: unknown
    }
    return typeof payload.sub === "string" && payload.sub.length > 0
      ? payload.sub
      : null
  } catch {
    return null
  }
}

function authError(
  operation: string,
  error: { message?: string; status: number; statusText: string },
) {
  return new Error(
    `Could not ${operation}: ${error.message ?? error.statusText} (${error.status}).`,
  )
}
