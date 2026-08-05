import { describe, expect, it, vi } from "vitest"
import {
  createIdentityTokenAdapter,
  deleteBetterAuthAccount,
  identityTokenSubject,
  resolvedPracticeSession,
} from "@/lib/auth-client"
import { PracticeSessionMismatchError } from "@/lib/persistence"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("Better Auth account deletion", () => {
  it("accepts account deletion only after Better Auth confirms it", async () => {
    const deleteUser = vi.fn(async () => ({
      data: { success: true, message: "User deleted" },
      error: null,
    }))

    await deleteBetterAuthAccount(deleteUser)

    expect(deleteUser).toHaveBeenCalledOnce()
  })

  it("turns a Better Auth deletion failure into a retryable error", async () => {
    const deleteUser = vi.fn(async () => ({
      data: null,
      error: {
        message: "Session is not fresh",
        status: 400,
        statusText: "Bad Request",
      },
    }))

    await expect(deleteBetterAuthAccount(deleteUser))
      .rejects.toThrow("Could not delete the account: Session is not fresh (400).")
  })
})

describe("identity token adapter", () => {
  it("shares token acquisition and the refresh after invalidation", async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => await first.promise)
      .mockImplementationOnce(async () => await second.promise)
    const adapter = createIdentityTokenAdapter(fetcher)

    const firstCaller = adapter.getIdentityToken()
    const concurrentCaller = adapter.getIdentityToken()
    expect(fetcher).toHaveBeenCalledOnce()

    first.resolve(Response.json({ token: "token-1" }))
    await expect(Promise.all([firstCaller, concurrentCaller]))
      .resolves.toEqual(["token-1", "token-1"])
    await expect(adapter.getIdentityToken()).resolves.toBe("token-1")
    expect(fetcher).toHaveBeenCalledOnce()

    adapter.invalidateIdentityToken("token-1")
    const refreshCaller = adapter.getIdentityToken()
    const concurrentRefreshCaller = adapter.getIdentityToken()
    expect(fetcher).toHaveBeenCalledTimes(2)

    second.resolve(Response.json({ token: "token-2" }))
    await expect(Promise.all([refreshCaller, concurrentRefreshCaller]))
      .resolves.toEqual(["token-2", "token-2"])
  })

  it("does not cache a token acquired before the session was cleared", async () => {
    const stale = deferred<Response>()
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => await stale.promise)
      .mockResolvedValueOnce(Response.json({ token: "current-token" }))
    const adapter = createIdentityTokenAdapter(fetcher)

    const staleAcquisition = adapter.getIdentityToken()
    adapter.clearIdentityToken()
    stale.resolve(Response.json({ token: "stale-token" }))

    await expect(staleAcquisition).resolves.toBe("stale-token")
    await expect(adapter.getIdentityToken()).resolves.toBe("current-token")
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("reports token-endpoint 401 as a lost authenticated session", async () => {
    const adapter = createIdentityTokenAdapter(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, { status: 401 }),
      ),
    )

    await expect(adapter.getIdentityToken())
      .rejects.toEqual(new PracticeSessionMismatchError())
  })

  it("reads the subject claim without trusting any other token content", () => {
    const payload = btoa(JSON.stringify({
      sub: "subject-1",
      email: "must-not-be-used@example.com",
    }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")

    expect(identityTokenSubject(`header.${payload}.signature`)).toBe("subject-1")
    expect(identityTokenSubject("not-a-jwt")).toBeNull()
  })

  it("ignores stale session data while sign-out refetches", () => {
    expect(resolvedPracticeSession({
      data: { user: { id: "stale-subject" } },
      error: null,
      isPending: false,
      isRefetching: true,
    })).toBeUndefined()
    expect(resolvedPracticeSession({
      data: null,
      error: null,
      isPending: false,
      isRefetching: false,
    })).toBeNull()
  })

  it("treats an unauthorized null session snapshot as session loss", () => {
    expect(resolvedPracticeSession({
      data: null,
      error: { status: 401 },
      isPending: false,
      isRefetching: false,
    })).toBeNull()
    expect(resolvedPracticeSession({
      data: null,
      error: { status: 503 },
      isPending: false,
      isRefetching: false,
    })).toBeUndefined()
  })
})
