import { createAuthClient } from "better-auth/client"
import type { PracticeAuth } from "@/lib/persistence"

const authClient = createAuthClient()

export const browserPracticeAuth: PracticeAuth = {
  async getSession() {
    const result = await authClient.getSession()
    if (result.error) throw authError("resolve the session", result.error)
    return result.data ? { subject: result.data.user.id } : null
  },
  async getIdentityToken() {
    const response = await fetch("/api/auth/token", {
      headers: { accept: "application/json" },
    })
    if (!response.ok) {
      throw new Error(
        `Could not acquire an identity token: ${response.statusText} (${response.status}).`,
      )
    }

    const body = await response.json() as { token?: unknown }
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new Error("Could not acquire an identity token: the response was invalid.")
    }
    return body.token
  },
  async signOut() {
    const result = await authClient.signOut()
    if (result.error) throw authError("end the session", result.error)
  },
  subscribeSession(listener) {
    return authClient.useSession.subscribe((session) => {
      if (session.isPending || session.error) return
      listener(session.data ? { subject: session.data.user.id } : null)
    })
  },
}

function authError(
  operation: string,
  error: { message?: string; status: number; statusText: string },
) {
  return new Error(
    `Could not ${operation}: ${error.message ?? error.statusText} (${error.status}).`,
  )
}
