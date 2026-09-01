import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GUEST_PRACTICE_STATE_KEY,
  accountPracticeStateKey,
  createBrowserPracticeStateStore,
  createEmptyPracticeStateEnvelope,
  type PracticeAuth,
  type PracticeSession,
  PracticeSessionMismatchError,
} from "@/lib/persistence"
import { PracticeApiError, type PracticeApi } from "@/lib/practice-api"
import type { PracticeStateEnvelope } from "@/types"

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  readonly removals: string[] = []
  failAccountRemovals = false

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    if (
      this.failAccountRemovals &&
      key.startsWith("agentic-ready-gh600-v2:user:")
    ) {
      throw new Error("account removal failed")
    }
    this.removals.push(key)
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  seed(key: string, value: PracticeStateEnvelope) {
    this.values.set(key, JSON.stringify(value))
  }
}

class FakeAuth implements PracticeAuth {
  readonly listeners = new Set<(session: PracticeSession | null) => void>()
  readonly invalidateIdentityToken = vi.fn((token: string) => {
    if (this.token === token) this.token = "fresh-token"
  })
  readonly signOut = vi.fn(async () => {})
  readonly deleteAccount = vi.fn(async () => {})
  token = "stale-token"

  constructor(public session: PracticeSession | null) {}

  async getSession() {
    return this.session
  }

  async getIdentityToken() {
    return this.token
  }

  subscribeSession(listener: (session: PracticeSession | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

const subject = "subject-1"
const timestamp = "2026-08-05T16:00:00.000Z"

function envelope(
  bookmarks: string[],
  receivedBookmarks: string[] = bookmarks,
): PracticeStateEnvelope {
  const empty = createEmptyPracticeStateEnvelope()
  return {
    ...empty,
    state: {
      ...empty.state,
      bookmarks,
    },
    receipts: {
      ...empty.receipts,
      bookmarks: Object.fromEntries(
        receivedBookmarks.map((questionId) => [
          questionId,
          { isBookmarked: bookmarks.includes(questionId), receivedAt: timestamp },
        ]),
      ),
    },
  }
}

function practiceApi(
  postPracticeState: PracticeApi["postPracticeState"],
  getPracticeState: PracticeApi["getPracticeState"] = async () => (
    createEmptyPracticeStateEnvelope()
  ),
): PracticeApi {
  return {
    getPracticeState,
    postPracticeState,
    deletePracticeState: async () => {},
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function storedAccount(storage: MemoryStorage, accountSubject = subject) {
  return JSON.parse(
    storage.getItem(accountPracticeStateKey(accountSubject))!,
  ) as {
    state: { bookmarks: string[] }
    sync: {
      journal: unknown[]
      acknowledgedRevision: number
    }
  }
}

async function settleMicrotasks(turns = 8) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("account recovery", () => {
  it("refreshes and retries a 401 exactly once for one exchange", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (token): Promise<PracticeStateEnvelope> => {
        if (token === "stale-token") throw new PracticeApiError(401)
        return envelope(["base", "local"])
      },
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }), { flush: "immediate" })
    await store.flush()

    expect(post.mock.calls.map(([token]) => token))
      .toEqual(["stale-token", "fresh-token"])
    expect(auth.invalidateIdentityToken).toHaveBeenCalledOnce()
    expect(storedAccount(storage).sync.journal).toEqual([])
  })

  it("retains the journal after the single retry also returns 401", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(async () => {
      throw new PracticeApiError(401)
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }), { flush: "immediate" })
    await store.flush()

    expect(post).toHaveBeenCalledTimes(2)
    expect(storedAccount(storage).sync.journal).toHaveLength(1)
    expect(store.getSnapshot().error).toEqual(new PracticeApiError(401))
  })

  it("quarantines instead of posting when the token subject changed", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    auth.getIdentityToken = vi.fn(async () => {
      throw new PracticeSessionMismatchError()
    })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>()
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }), { flush: "immediate" })
    await store.flush()

    expect(post).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "reauthenticating", subject },
      envelope: { state: { bookmarks: [] } },
      error: new PracticeSessionMismatchError(),
    })
    expect(storedAccount(storage).sync.journal).toHaveLength(1)
  })

  it("quarantines unsynced work and resumes it only for the same subject", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn(async () => envelope(["base", "local"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }))

    await store.resolveSession(null)

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "reauthenticating", subject },
      envelope: { state: { bookmarks: [] } },
    })
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()
    expect(storedAccount(storage).sync.journal).toHaveLength(1)
    expect(() => store.update((current) => current))
      .toThrow("Practice state is not initialized.")

    await store.resolveSession({ subject })
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: { state: { bookmarks: ["base", "local"] } },
    })
  })

  it("does not expose a quarantined account cache to another subject", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["first"]))
    storage.seed(accountPracticeStateKey("subject-2"), envelope(["second"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("Accepted account caches should not be submitted.")
      }),
    })
    await store.initialize()
    await store.resolveSession(null)

    await store.resolveSession({ subject: "subject-2" })

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second"] } },
    })
    expect(storedAccount(storage).state.bookmarks).toEqual(["first"])
  })

  it("keeps an interrupted first sync quarantined from another subject", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    const firstResponse = deferred<PracticeStateEnvelope>()
    const post = vi.fn<PracticeApi["postPracticeState"]>()
      .mockImplementationOnce(async () => await firstResponse.promise)
      .mockResolvedValueOnce(envelope(["guest"]))
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    const initialization = store.initialize()
    await settleMicrotasks()
    await store.resolveSession(null)
    firstResponse.resolve(envelope(["guest"]))
    await initialization

    await store.resolveSession({ subject: "subject-2" })
    expect(store.getSnapshot().mode).toEqual({
      kind: "reauthenticating",
      subject,
    })
    expect(post).toHaveBeenCalledOnce()
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject({ firstSync: { subject } })

    await store.resolveSession({ subject })
    await store.flush()
    expect(post).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })

  it("reconstructs first-sync quarantine after a browser restart", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const signedInAuth = new FakeAuth({ subject })
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"]))
    const interrupted = createBrowserPracticeStateStore({
      storage,
      auth: signedInAuth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(503)
      }),
    })
    await interrupted.initialize()
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject({ firstSync: { subject } })

    const signedOutAuth = new FakeAuth(null)
    const post = vi.fn<PracticeApi["postPracticeState"]>()
    const restarted = createBrowserPracticeStateStore({
      storage,
      auth: signedOutAuth,
      practiceApi: practiceApi(post),
    })
    await restarted.initialize()

    expect(restarted.getSnapshot()).toMatchObject({
      mode: { kind: "reauthenticating", subject },
      envelope: { state: { bookmarks: [] } },
    })
    await restarted.resolveSession({ subject: "subject-2" })
    expect(restarted.getSnapshot().mode).toEqual({
      kind: "reauthenticating",
      subject,
    })
    expect(post).not.toHaveBeenCalled()

    await expect(restarted.signOutSafely()).resolves.toEqual({
      status: "signed-out",
      error: null,
    })
    expect(signedOutAuth.signOut).toHaveBeenCalledOnce()
    expect(restarted.getSnapshot().mode).toEqual({
      kind: "reauthenticating",
      subject,
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject({ firstSync: { subject } })
  })

  it("retains working state and revisions after a retryable service failure", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(503)
      }),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }), { flush: "immediate" })
    await store.flush()

    expect(store.getSnapshot().envelope.state.bookmarks).toEqual(["base", "local"])
    expect(storedAccount(storage).sync.journal).toHaveLength(1)
  })

  it.each([
    [400, "invalid_practice_state"],
    [400, "unsupported_schema_version"],
    [413, "practice_state_too_large"],
    [415, "unsupported_media_type"],
  ] as const)(
    "rolls back %s %s and exposes a dismissible explanation",
    async (status, code) => {
      const storage = new MemoryStorage()
      const auth = new FakeAuth({ subject })
      storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
      const store = createBrowserPracticeStateStore({
        storage,
        auth,
        practiceApi: practiceApi(async () => {
          throw new PracticeApiError(status, code)
        }),
      })
      await store.initialize()

      store.update((current) => ({
        ...current,
        bookmarks: [...current.bookmarks, "rejected"],
      }), { flush: "immediate" })
      await store.flush()

      expect(store.getSnapshot()).toMatchObject({
        envelope: { state: { bookmarks: ["base"] } },
        notification: {
          kind: "sync-rejected",
          reason: code,
        },
      })
      expect(storedAccount(storage).sync.journal).toEqual([])

      store.dismissSyncNotification()
      expect(store.getSnapshot().notification).toBeNull()
    },
  )

  it("recovers the server canonical state before rolling back a legacy cache", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(
      accountPracticeStateKey(subject),
      envelope(["legacy-local"], []),
    )
    const get = vi.fn(async () => envelope(["server-canonical"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(400, "invalid_practice_state")
      }, get),
    })

    await store.initialize()
    await store.flush()

    expect(get).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      envelope: { state: { bookmarks: ["server-canonical"] } },
      notification: { kind: "sync-rejected" },
    })
    expect(storedAccount(storage).sync.journal).toEqual([])
  })

  it("flushes accepted work before signing out and erasing the subject cache", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    const response = deferred<PracticeStateEnvelope>()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async () => await response.promise,
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }))

    const signOut = store.signOutSafely()
    await settleMicrotasks()

    expect(post).toHaveBeenCalledOnce()
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(() => store.update((current) => current))
      .toThrow("safe sign-out is in progress")

    response.resolve(envelope(["base", "local"]))
    await expect(signOut).resolves.toEqual({
      status: "signed-out",
      error: null,
    })

    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(storage.getItem(accountPracticeStateKey(subject))).toBeNull()
    expect(storage.removals).toContain(accountPracticeStateKey(subject))
    expect(store.getSnapshot().mode).toEqual({ kind: "guest" })
  })

  it("blocks sign-out without discarding work after a retryable failure", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(503)
      }),
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }))

    const result = await store.signOutSafely()

    expect(result.status).toBe("blocked")
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base", "local"] },
      sync: { journal: [expect.any(Object)] },
    })
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })

  it("keeps the accepted cache when ending the authenticated session fails", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    auth.signOut.mockRejectedValueOnce(new Error("session service unavailable"))
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => envelope(["base"])),
    })
    await store.initialize()

    const result = await store.signOutSafely()

    expect(result).toEqual({
      status: "blocked",
      error: new Error("session service unavailable"),
    })
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })

  it("does not end the session when its accepted cache cannot be erased", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    storage.failAccountRemovals = true
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => envelope(["base"])),
    })
    await store.initialize()

    const result = await store.signOutSafely()

    expect(result).toEqual({
      status: "blocked",
      error: new Error("account removal failed"),
    })
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })

  it("keeps rejected first-sync work protected until sign-out succeeds", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    auth.signOut
      .mockRejectedValueOnce(new Error("session service unavailable"))
      .mockResolvedValueOnce(undefined)
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(async () => {
      throw new PracticeApiError(400, "invalid_practice_state")
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await store.initialize()

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "transitioning", subject },
      envelope: { state: { bookmarks: ["guest"] } },
      firstSyncRejected: true,
      notification: {
        kind: "sign-out-sync-rejected",
      },
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject({ firstSync: { subject } })

    const result = await store.signOutSafely()

    expect(result.status).toBe("signed-out")
    expect(post).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: { state: { bookmarks: ["guest"] } },
      notification: {
        kind: "first-sync-rejected",
      },
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .not.toHaveProperty("firstSync")
  })

  it("does not overwrite a concurrent subject change when sign-out completes", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    const signOutCompletion = deferred<void>()
    auth.signOut.mockImplementationOnce(async () => {
      await signOutCompletion.promise
      auth.listeners.forEach((listener) => listener(null))
    })
    storage.seed(accountPracticeStateKey(subject), envelope(["first"]))
    storage.seed(accountPracticeStateKey("subject-2"), envelope(["second"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("Accepted account caches should not be submitted.")
      }),
    })
    await store.initialize()

    const signOut = store.signOutSafely()
    await settleMicrotasks()
    await store.resolveSession({ subject: "subject-2" })
    signOutCompletion.resolve()

    await expect(signOut).resolves.toMatchObject({ status: "blocked" })
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "reauthenticating", subject: "subject-2" },
      envelope: { state: { bookmarks: [] } },
    })
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(storage.getItem(accountPracticeStateKey("subject-2"))).not.toBeNull()
  })

  it("ignores a duplicate same-subject event while safe sign-out is pending", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    const signOutCompletion = deferred<void>()
    auth.signOut.mockImplementationOnce(async () => await signOutCompletion.promise)
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("Accepted account caches should not be submitted.")
      }),
    })
    await store.initialize()

    const signOut = store.signOutSafely()
    await settleMicrotasks()
    await store.resolveSession({ subject })
    signOutCompletion.resolve()

    await expect(signOut).resolves.toEqual({
      status: "signed-out",
      error: null,
    })
    expect(storage.getItem(accountPracticeStateKey(subject))).toBeNull()
    expect(store.getSnapshot().mode).toEqual({ kind: "guest" })
  })

  it("restores the cache when the same subject reauthenticates during sign-out", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    const signOutCompletion = deferred<void>()
    auth.signOut.mockImplementationOnce(async () => await signOutCompletion.promise)
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>()
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    const signOut = store.signOutSafely()
    await settleMicrotasks()
    auth.listeners.forEach((listener) => listener(null))
    auth.listeners.forEach((listener) => listener({ subject }))
    signOutCompletion.resolve()

    await expect(signOut).resolves.toMatchObject({ status: "blocked" })
    expect(post).not.toHaveBeenCalled()
    expect(storage.getItem(accountPracticeStateKey(subject))).not.toBeNull()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: { state: { bookmarks: ["base"] } },
    })
  })

  it("does not expose another subject's first-sync quarantine after safe sign-out", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["first-guest"]))
    const firstAuth = new FakeAuth({ subject })
    const interrupted = createBrowserPracticeStateStore({
      storage,
      auth: firstAuth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(503)
      }),
    })
    await interrupted.initialize()
    storage.seed(accountPracticeStateKey("subject-2"), envelope(["second"]))

    const secondAuth = new FakeAuth({ subject: "subject-2" })
    const secondStore = createBrowserPracticeStateStore({
      storage,
      auth: secondAuth,
      practiceApi: practiceApi(async () => {
        throw new Error("Accepted account caches should not be submitted.")
      }),
    })
    await secondStore.initialize()
    expect(secondStore.getSnapshot().mode).toEqual({
      kind: "account",
      subject: "subject-2",
    })

    await expect(secondStore.signOutSafely())
      .resolves.toMatchObject({ status: "signed-out" })

    expect(secondStore.getSnapshot()).toMatchObject({
      mode: { kind: "reauthenticating", subject },
      envelope: { state: { bookmarks: [] } },
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject({ firstSync: { subject } })
  })

  it("ignores a stale stable snapshot after sign-out until null is observed", async () => {
    const storage = new MemoryStorage()
    const auth = new FakeAuth({ subject })
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn(async () => envelope(["server"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()
    await store.signOutSafely()

    await store.resolveSession({ subject })

    expect(store.getSnapshot().mode).toEqual({ kind: "guest" })
    expect(post).not.toHaveBeenCalled()

    await store.resolveSession(null)
    await store.resolveSession({ subject })
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })
})
