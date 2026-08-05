import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GUEST_PRACTICE_STATE_KEY,
  accountPracticeStateKey,
  createBrowserPracticeStateStore,
  createEmptyPracticeStateEnvelope,
  type PracticeAuth,
} from "@/lib/persistence"
import { PracticeApiError, type PracticeApi } from "@/lib/practice-api"
import type { Attempt, FinishedAttempt, PracticeStateEnvelope } from "@/types"

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  failAccountWrites = false
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
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    if (
      this.failAccountWrites &&
      key.startsWith("agentic-ready-gh600-v2:user:")
    ) {
      throw new Error("account write failed")
    }
    this.values.set(key, value)
  }

  seed(key: string, envelope: PracticeStateEnvelope) {
    this.values.set(key, JSON.stringify(envelope))
  }
}

interface StoredAccountCache {
  state: { bookmarks: string[] }
  receipts: {
    bookmarks: Record<string, { isBookmarked: boolean; receivedAt?: string }>
  }
  sync: {
    revision: number
    acknowledgedRevision: number
    journal: Array<{ kind: string; revision: number; questionId?: string; value: unknown }>
  }
}

interface StoredFirstSyncCache {
  state: { bookmarks: string[] }
  receipts: {
    bookmarks: Record<string, { isBookmarked: boolean; receivedAt?: string }>
  }
  firstSync: {
    revision: number
    acknowledgedRevision: number
    journal: Array<{ kind: string; revision: number; questionId?: string; value: unknown }>
  }
}

const subject = "subject-1"
const timestamp = "2026-08-05T15:00:00.000Z"

const auth: PracticeAuth = {
  getSession: async () => ({ subject }),
  getIdentityToken: async () => "identity-token",
  signOut: async () => {},
  subscribeSession: () => () => {},
}

function envelope(
  bookmarks: string[],
  receivedBookmarks: string[] = bookmarks,
): PracticeStateEnvelope {
  return {
    ...createEmptyPracticeStateEnvelope(),
    state: {
      ...createEmptyPracticeStateEnvelope().state,
      bookmarks,
    },
    receipts: {
      ...createEmptyPracticeStateEnvelope().receipts,
      bookmarks: Object.fromEntries(
        receivedBookmarks.map((questionId) => [
          questionId,
          { isBookmarked: bookmarks.includes(questionId), receivedAt: timestamp },
        ]),
      ),
    },
  }
}

function practiceApi(postPracticeState: PracticeApi["postPracticeState"]): PracticeApi {
  return {
    getPracticeState: async () => createEmptyPracticeStateEnvelope(),
    postPracticeState,
  }
}

function storedAccount(storage: MemoryStorage): StoredAccountCache {
  return JSON.parse(storage.getItem(accountPracticeStateKey(subject))!) as StoredAccountCache
}

function storedFirstSync(storage: MemoryStorage): StoredFirstSyncCache {
  return JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!) as StoredFirstSyncCache
}

function activeAttempt(currentIndex: number): Attempt {
  return {
    id: "attempt-1",
    mode: "quick",
    label: "Quick knowledge check",
    questionIds: ["tools-1"],
    answers: {},
    flagged: [],
    currentIndex,
    startedAt: 1_000,
    durationMinutes: 15,
  }
}

function finishedAttempt(): FinishedAttempt {
  return {
    id: "attempt-1",
    mode: "quick",
    label: "Quick knowledge check",
    questionIds: ["tools-1"],
    answers: { "tools-1": ["a"] },
    flagged: [],
    startedAt: 1_000,
    durationMinutes: 15,
    finishedAt: 2_000,
    score: 100,
    outcome: "submitted",
  }
}

function attemptEnvelope(
  active: Attempt | null,
  finished: FinishedAttempt[] = [],
): PracticeStateEnvelope {
  return {
    ...createEmptyPracticeStateEnvelope(),
    state: {
      ...createEmptyPracticeStateEnvelope().state,
      activeAttempt: active,
      attempts: finished,
    },
    receipts: {
      ...createEmptyPracticeStateEnvelope().receipts,
      ...(active ? { activeAttemptReceivedAt: timestamp } : {}),
      finishedAttempts: Object.fromEntries(
        finished.map((attempt) => [attempt.id, timestamp]),
      ),
    },
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

async function settleMicrotasks(turns = 6) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("account practice-state synchronization", () => {
  it("persists a revision before debouncing its network exchange", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn(async (_token: string, incoming: PracticeStateEnvelope) => (
      envelope(incoming.state.bookmarks)
    ))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }))

    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base", "local"] },
      receipts: {
        bookmarks: {
          base: { isBookmarked: true, receivedAt: timestamp },
          local: { isBookmarked: true },
        },
      },
      sync: {
        revision: 1,
        acknowledgedRevision: 0,
        journal: [{
          kind: "bookmark",
          revision: 1,
          questionId: "local",
          value: true,
        }],
      },
    })
    expect(post).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2_999)
    expect(post).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settleMicrotasks()

    expect(post).toHaveBeenCalledOnce()
    expect(storedAccount(storage).sync).toMatchObject({
      revision: 1,
      acknowledgedRevision: 1,
      journal: [],
    })

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "after-response"],
    }), { flush: "immediate" })
    await settleMicrotasks()

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1].state.bookmarks)
      .toEqual(["base", "local", "after-response"])
    expect(storedAccount(storage).sync).toMatchObject({
      revision: 2,
      acknowledgedRevision: 2,
      journal: [],
    })
  })

  it("honors an immediate milestone when its update is otherwise unchanged", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn(async () => envelope(["base", "pending"]))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "pending"],
    }))
    expect(post).not.toHaveBeenCalled()

    store.update((current) => current, { flush: "immediate" })
    await settleMicrotasks()

    expect(post).toHaveBeenCalledOnce()
    expect(storedAccount(storage).sync.journal).toEqual([])
  })

  it("rebases in-flight edits over remote changes and sends them next without overlap", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const firstResponse = deferred<PracticeStateEnvelope>()
    const secondResponse = deferred<PracticeStateEnvelope>()
    let activeRequests = 0
    let maximumActiveRequests = 0
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        activeRequests += 1
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
        const response: PracticeStateEnvelope = requestCount === 1
          ? await firstResponse.promise
          : await secondResponse.promise
        activeRequests -= 1
        return response
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
      bookmarks: [...current.bookmarks, "sent"],
    }), { flush: "immediate" })
    await settleMicrotasks()
    expect(post).toHaveBeenCalledOnce()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "during"],
    }))
    expect(post).toHaveBeenCalledOnce()
    expect(storedAccount(storage).sync).toMatchObject({
      revision: 2,
      acknowledgedRevision: 0,
    })

    firstResponse.resolve(envelope(["base", "sent", "remote"]))
    await settleMicrotasks(10)

    expect(post).toHaveBeenCalledTimes(2)
    expect(maximumActiveRequests).toBe(1)
    expect(post.mock.calls[1][1]).toMatchObject({
      state: { bookmarks: ["base", "sent", "remote", "during"] },
      receipts: {
        bookmarks: {
          base: { receivedAt: timestamp },
          sent: { receivedAt: timestamp },
          remote: { receivedAt: timestamp },
          during: { isBookmarked: true },
        },
      },
    })
    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base", "sent", "remote", "during"] },
      sync: {
        revision: 2,
        acknowledgedRevision: 1,
        journal: [{
          kind: "bookmark",
          revision: 2,
          questionId: "during",
          value: true,
        }],
      },
    })

    secondResponse.resolve(envelope(["base", "sent", "remote", "during"]))
    await store.flush()

    expect(storedAccount(storage).sync).toEqual({
      version: 1,
      canonicalEnvelope: envelope(["base", "sent", "remote", "during"]),
      revision: 2,
      acknowledgedRevision: 2,
      journal: [],
    })
  })

  it("keeps an in-flight revert as a newer revision", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["bookmark"]))
    const firstResponse = deferred<PracticeStateEnvelope>()
    const secondResponse = deferred<PracticeStateEnvelope>()
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        return requestCount === 1
          ? await firstResponse.promise
          : await secondResponse.promise
      },
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    store.update((current) => ({ ...current, bookmarks: [] }), {
      flush: "immediate",
    })
    await settleMicrotasks()
    store.update((current) => ({ ...current, bookmarks: ["bookmark"] }))

    firstResponse.resolve(envelope(["bookmark"]))
    await settleMicrotasks(10)

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1]).toMatchObject({
      state: { bookmarks: ["bookmark"] },
      receipts: {
        bookmarks: {
          bookmark: { isBookmarked: true },
        },
      },
    })

    secondResponse.resolve(envelope(["bookmark"]))
    await store.flush()
    expect(store.getSnapshot().envelope.state.bookmarks).toEqual(["bookmark"])
  })

  it("does not overlap exchanges when the same subject reauthenticates", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const firstResponse = deferred<PracticeStateEnvelope>()
    const secondResponse = deferred<PracticeStateEnvelope>()
    let requestCount = 0
    let activeRequests = 0
    let maximumActiveRequests = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        activeRequests += 1
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
        const response = requestCount === 1
          ? await firstResponse.promise
          : await secondResponse.promise
        activeRequests -= 1
        return response
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
    await settleMicrotasks()
    expect(post).toHaveBeenCalledOnce()

    await store.resolveSession(null)
    const reauthentication = store.resolveSession({ subject })
    await settleMicrotasks()
    expect(post).toHaveBeenCalledOnce()

    firstResponse.resolve(envelope(["base", "local"]))
    await reauthentication
    await settleMicrotasks(10)

    expect(post).toHaveBeenCalledTimes(2)
    expect(maximumActiveRequests).toBe(1)
    secondResponse.resolve(envelope(["base", "local"]))
    await store.flush()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: { state: { bookmarks: ["base", "local"] } },
    })
  })

  it("drops a replayed active attempt that another device already finished", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), attemptEnvelope(activeAttempt(0)))
    const response = deferred<PracticeStateEnvelope>()
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
      activeAttempt: activeAttempt(1),
    }), { flush: "immediate" })
    await settleMicrotasks()
    store.update((current) => ({
      ...current,
      activeAttempt: activeAttempt(2),
    }))
    response.resolve(attemptEnvelope(null, [finishedAttempt()]))
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot().envelope.state).toMatchObject({
      activeAttempt: null,
      attempts: [{ id: "attempt-1", outcome: "submitted" }],
    })
    expect(storedAccount(storage).sync.journal).toEqual([])
  })

  it("clears a canonical active attempt when replaying its local finish", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), attemptEnvelope(activeAttempt(0)))
    const firstResponse = deferred<PracticeStateEnvelope>()
    const secondResponse = deferred<PracticeStateEnvelope>()
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        return requestCount === 1
          ? await firstResponse.promise
          : await secondResponse.promise
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
      activeAttempt: activeAttempt(1),
    }), { flush: "immediate" })
    await settleMicrotasks()
    store.update((current) => ({
      ...current,
      attempts: [finishedAttempt()],
    }))

    firstResponse.resolve(attemptEnvelope(activeAttempt(1)))
    await settleMicrotasks(10)

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1].state).toMatchObject({
      activeAttempt: null,
      attempts: [{ id: "attempt-1", outcome: "submitted" }],
    })
    secondResponse.resolve(attemptEnvelope(null, [finishedAttempt()]))
    await store.flush()
    expect(store.getSnapshot().envelope.state.activeAttempt).toBeNull()
  })

  it("retains retryable work and retries without another candidate action", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        if (requestCount === 1) throw new TypeError("offline")
        return envelope(["base"], ["base", "local"])
      },
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }), { flush: "immediate" })
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      envelope: { state: { bookmarks: ["base", "local"] } },
      error: new TypeError("offline"),
    })
    expect(storedAccount(storage).sync.journal).toHaveLength(1)

    store.update((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((questionId) => questionId !== "local"),
    }))
    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base"] },
      sync: {
        revision: 2,
        acknowledgedRevision: 0,
        journal: [{
          kind: "bookmark",
          revision: 2,
          questionId: "local",
          value: false,
        }],
      },
    })

    await vi.advanceTimersByTimeAsync(2_999)
    expect(post).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await settleMicrotasks()

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1]).toMatchObject({
      state: { bookmarks: ["base"] },
      receipts: {
        bookmarks: {
          local: { isBookmarked: false },
        },
      },
    })
    expect(storedAccount(storage).sync).toMatchObject({
      acknowledgedRevision: 2,
      journal: [],
    })
  })

  it("restores the last canonical envelope after permanent rejection", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(async () => {
      throw new PracticeApiError(400, "invalid_practice_state")
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "rejected"],
    }), { flush: "immediate" })
    await store.flush()

    expect(store.getSnapshot()).toMatchObject({
      envelope: { state: { bookmarks: ["base"] } },
      error: new PracticeApiError(400, "invalid_practice_state"),
    })
    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base"] },
      sync: {
        revision: 1,
        acknowledgedRevision: 1,
        journal: [],
      },
    })
  })

  it("retries rollback persistence without resending rejected work", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn<PracticeApi["postPracticeState"]>(async () => {
      storage.failAccountWrites = true
      storage.failAccountRemovals = true
      throw new PracticeApiError(400, "invalid_practice_state")
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "rejected"],
    }), { flush: "immediate" })
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot().envelope.state.bookmarks).toEqual(["base"])
    expect(storedAccount(storage).state.bookmarks).toEqual(["base", "rejected"])

    storage.failAccountWrites = false
    storage.failAccountRemovals = false
    await vi.advanceTimersByTimeAsync(3_000)
    await settleMicrotasks()

    expect(post).toHaveBeenCalledOnce()
    expect(storedAccount(storage)).toMatchObject({
      state: { bookmarks: ["base"] },
      sync: {
        revision: 1,
        acknowledgedRevision: 1,
        journal: [],
      },
    })
  })

  it("resumes a persisted journal after a browser restart", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["base"]))
    const post = vi.fn(async () => envelope(["base", "local"]))
    const firstStore = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await firstStore.initialize()
    firstStore.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "local"],
    }))
    expect(storedAccount(storage).sync.journal).toHaveLength(1)
    vi.clearAllTimers()

    const restartedStore = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })
    await restartedStore.initialize()
    await settleMicrotasks()

    expect(post).toHaveBeenCalledOnce()
    expect(restartedStore.getSnapshot().envelope.state.bookmarks)
      .toEqual(["base", "local"])
    expect(storedAccount(storage).sync.journal).toEqual([])
  })

  it("flushes receipt-free edits from a legacy account cache", async () => {
    const storage = new MemoryStorage()
    storage.seed(accountPracticeStateKey(subject), envelope(["legacy-local"], []))
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async () => envelope(["legacy-local"]),
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await store.initialize()
    await store.flush()

    expect(post).toHaveBeenCalledOnce()
    expect(post.mock.calls[0][1].state.bookmarks).toEqual(["legacy-local"])
    expect(storedAccount(storage).sync).toMatchObject({
      revision: 1,
      acknowledgedRevision: 1,
      journal: [],
    })
  })

  it("persists first-sync removals and retries them after a lost response", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"], []))
    const firstResponse = deferred<PracticeStateEnvelope>()
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        if (requestCount === 1) return await firstResponse.promise
        return envelope([], ["guest"])
      },
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
      syncDebounceMs: 3_000,
    })

    const initialization = store.initialize()
    await settleMicrotasks()
    store.update((current) => ({ ...current, bookmarks: [] }))

    expect(storedFirstSync(storage)).toMatchObject({
      state: { bookmarks: [] },
      receipts: {
        bookmarks: {
          guest: { isBookmarked: false },
        },
      },
      firstSync: {
        revision: 1,
        acknowledgedRevision: 0,
        journal: [{
          kind: "bookmark",
          revision: 1,
          questionId: "guest",
          value: false,
        }],
      },
    })

    firstResponse.reject(new TypeError("response lost"))
    await initialization
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "transitioning", subject },
      envelope: { state: { bookmarks: [] } },
      error: new TypeError("response lost"),
    })

    await vi.advanceTimersByTimeAsync(3_000)
    await settleMicrotasks()

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1]).toMatchObject({
      state: { bookmarks: [] },
      receipts: {
        bookmarks: {
          guest: { isBookmarked: false },
        },
      },
    })
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()
    expect(store.getSnapshot().mode).toEqual({ kind: "account", subject })
  })

  it("does not let stale first-sync rejection override a newer subject", async () => {
    const storage = new MemoryStorage()
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"], []))
    const signOutCompletion = deferred<void>()
    const signOut = vi.fn(async () => await signOutCompletion.promise)
    const switchingAuth: PracticeAuth = {
      getSession: async () => ({ subject }),
      getIdentityToken: async () => "identity-token",
      signOut,
      subscribeSession: () => () => {},
    }
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(async () => {
      requestCount += 1
      if (requestCount === 1) {
        throw new PracticeApiError(400, "invalid_practice_state")
      }
      return envelope(["second-subject"])
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth: switchingAuth,
      practiceApi: practiceApi(post),
    })

    const initialization = store.initialize()
    await settleMicrotasks(10)
    expect(signOut).toHaveBeenCalledOnce()

    await store.resolveSession({ subject: "subject-2" })
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })

    signOutCompletion.resolve(undefined)
    await initialization
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })
  })

  it("rebases guest edits made during first sync before retiring guest state", async () => {
    const storage = new MemoryStorage()
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope(["guest"], []))
    const firstResponse = deferred<PracticeStateEnvelope>()
    const secondResponse = deferred<PracticeStateEnvelope>()
    let requestCount = 0
    const post = vi.fn<PracticeApi["postPracticeState"]>(
      async (): Promise<PracticeStateEnvelope> => {
        requestCount += 1
        return requestCount === 1
          ? await firstResponse.promise
          : await secondResponse.promise
      },
    )
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    const initialization = store.initialize()
    await settleMicrotasks()
    expect(post).toHaveBeenCalledOnce()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "during"],
    }))

    firstResponse.resolve(envelope(["guest", "remote"]))
    await initialization
    await settleMicrotasks(10)

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1]).toMatchObject({
      state: { bookmarks: ["guest", "remote", "during"] },
      receipts: {
        bookmarks: {
          guest: { receivedAt: timestamp },
          remote: { receivedAt: timestamp },
          during: { isBookmarked: true },
        },
      },
    })
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()

    secondResponse.resolve(envelope(["guest", "remote", "during"]))
    await store.flush()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: {
        state: { bookmarks: ["guest", "remote", "during"] },
      },
    })
  })
})
