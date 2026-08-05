import { describe, expect, it, vi } from "vitest"
import {
  GUEST_PRACTICE_STATE_KEY,
  accountPracticeStateKey,
  createBrowserPracticeStateStore,
  createEmptyPracticeStateEnvelope,
  type PracticeAuth,
  type PracticeSession,
} from "@/lib/persistence"
import { PracticeApiError, type PracticeApi } from "@/lib/practice-api"
import type { PracticeStateEnvelope } from "@/types"

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  readonly reads: string[] = []
  readonly failedReads = new Set<string>()
  failAccountWrites = false
  failGuestRemovals = false

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    this.reads.push(key)
    if (this.failedReads.has(key)) throw new Error(`read failed for ${key}`)
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    if (this.failGuestRemovals && key === GUEST_PRACTICE_STATE_KEY) {
      throw new Error("guest cleanup interrupted")
    }
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    if (this.failAccountWrites && key.startsWith("agentic-ready-gh600-v2:user:")) {
      throw new Error("account write interrupted")
    }
    this.values.set(key, value)
  }

  seed(key: string, envelope: PracticeStateEnvelope) {
    this.values.set(key, JSON.stringify(envelope))
  }
}

class FakeAuth implements PracticeAuth {
  readonly signOut = vi.fn(async () => {
    if (this.emitOnSignOut) this.emitSession(null)
  })
  readonly getIdentityToken = vi.fn(async () => "identity-token")
  readonly listeners = new Set<(session: PracticeSession | null) => void>()

  constructor(
    public session: PracticeSession | null,
    private readonly emitOnSignOut = false,
  ) {}

  async getSession() {
    return this.session
  }

  subscribeSession(listener: (session: PracticeSession | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emitSession(session: PracticeSession | null) {
    this.session = session
    this.listeners.forEach((listener) => listener(session))
  }
}

function envelope(bookmark: string | null, receivedAt?: string): PracticeStateEnvelope {
  return {
    ...createEmptyPracticeStateEnvelope(),
    state: {
      ...createEmptyPracticeStateEnvelope().state,
      bookmarks: bookmark ? [bookmark] : [],
    },
    receipts: {
      ...createEmptyPracticeStateEnvelope().receipts,
      bookmarks: bookmark
        ? {
            [bookmark]: {
              isBookmarked: true,
              ...(receivedAt ? { receivedAt } : {}),
            },
          }
        : {},
    },
  }
}

function practiceApi(
  post: PracticeApi["postPracticeState"],
): PracticeApi {
  return {
    getPracticeState: async () => createEmptyPracticeStateEnvelope(),
    postPracticeState: post,
  }
}

describe("subject-isolated browser practice-state store", () => {
  it("keeps standalone guest mode local and never inspects an account key", async () => {
    const storage = new MemoryStorage()
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope("guest-bookmark"))
    const store = createBrowserPracticeStateStore({ storage })

    await store.initialize()

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: { state: { bookmarks: ["guest-bookmark"] } },
    })
    expect(storage.reads.some((key) => key.includes(":user:"))).toBe(false)
  })

  it("reads no practice cache before authentication resolves a subject", async () => {
    const storage = new MemoryStorage()
    let resolveSession: ((session: PracticeSession | null) => void) | undefined
    const auth: PracticeAuth = {
      getSession: () => new Promise((resolve) => {
        resolveSession = resolve
      }),
      getIdentityToken: async () => "identity-token",
      signOut: async () => {},
      subscribeSession: () => () => {},
    }
    const api = practiceApi(async () => envelope("canonical", "2026-08-05T00:00:00.000Z"))
    const store = createBrowserPracticeStateStore({ storage, auth, practiceApi: api })

    const initialization = store.initialize()
    await Promise.resolve()

    expect(store.getSnapshot().mode).toEqual({ kind: "initializing" })
    expect(storage.reads).toEqual([])

    resolveSession?.({ subject: "resolved-subject" })
    await initialization

    expect(storage.reads[0]).toBe(accountPracticeStateKey("resolved-subject"))
  })

  it("writes the canonical account cache before retiring guest state", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const canonical = envelope("canonical-bookmark", "2026-08-05T00:00:00.000Z")
    const subject = "subject/a b"
    const auth = new FakeAuth({ subject })
    const post = vi.fn(async (_token: string, incoming: PracticeStateEnvelope) => {
      expect(incoming).toEqual(guest)
      expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).not.toBeNull()
      return canonical
    })
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await store.initialize()

    const key = "agentic-ready-gh600-v2:user:subject%2Fa%20b"
    expect(accountPracticeStateKey(subject)).toBe(key)
    expect(JSON.parse(storage.getItem(key)!)).toMatchObject(canonical)
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: canonical,
    })
  })

  it("retries safely after interruption before the canonical account write", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const canonical = envelope("canonical-bookmark", "2026-08-05T00:00:00.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    const post = vi.fn(async () => canonical)
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    storage.failAccountWrites = true
    const interrupted = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await interrupted.initialize()

    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).not.toBeNull()
    expect(storage.getItem(accountPracticeStateKey("subject-1"))).toBeNull()
    expect(interrupted.getSnapshot().mode).toEqual({
      kind: "transitioning",
      subject: "subject-1",
    })

    storage.failAccountWrites = false
    const restarted = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await restarted.initialize()

    expect(post).toHaveBeenCalledTimes(2)
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()
    expect(restarted.getSnapshot().mode).toEqual({
      kind: "account",
      subject: "subject-1",
    })
  })

  it("lets an existing account cache win after interruption before guest cleanup", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const canonical = envelope("canonical-bookmark", "2026-08-05T00:00:00.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    const post = vi.fn(async () => canonical)
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    storage.failGuestRemovals = true
    const interrupted = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await interrupted.initialize()

    expect(storage.getItem(accountPracticeStateKey("subject-1"))).not.toBeNull()
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).not.toBeNull()
    expect(interrupted.getSnapshot().mode).toEqual({
      kind: "account",
      subject: "subject-1",
    })

    storage.failGuestRemovals = false
    const restarted = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await restarted.initialize()

    expect(post).toHaveBeenCalledTimes(1)
    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).toBeNull()
    expect(restarted.getSnapshot().envelope).toEqual(canonical)
  })

  it("never revives consumed guest state when cleanup failed before a subject switch", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const first = envelope("first-subject", "2026-08-05T00:00:00.000Z")
    const second = envelope("second-subject", "2026-08-05T00:00:01.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    const post = vi.fn(async (_token: string, incoming: PracticeStateEnvelope) => {
      if (post.mock.calls.length === 1) return first
      expect(incoming.state.bookmarks).toEqual([])
      return second
    })
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    storage.failGuestRemovals = true
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })
    await store.initialize()

    expect(storage.getItem(GUEST_PRACTICE_STATE_KEY)).not.toBeNull()
    await store.resolveSession({ subject: "subject-2" })

    expect(post).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })
  })

  it("ends account mode and preserves guest state after permanent first-sync rejection", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const auth = new FakeAuth({ subject: "subject-1" }, true)
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new PracticeApiError(400, "invalid_practice_state")
      }),
    })

    await store.initialize()

    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(storage.getItem(accountPracticeStateKey("subject-1"))).toBeNull()
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!)).toEqual(guest)
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: guest,
      firstSyncRejected: true,
    })
  })

  it("hides account state after sign-out without reviving consumed guest state", async () => {
    const storage = new MemoryStorage()
    const guest = envelope("guest-bookmark")
    const canonical = envelope("account-bookmark", "2026-08-05T00:00:00.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    storage.seed(GUEST_PRACTICE_STATE_KEY, guest)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => canonical),
    })
    await store.initialize()

    await store.resolveSession(null)

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: { state: { bookmarks: [] } },
    })
    expect(storage.getItem(accountPracticeStateKey("subject-1"))).not.toBeNull()
  })

  it("never displays or submits one subject's cache for another subject", async () => {
    const storage = new MemoryStorage()
    const first = envelope("first-subject", "2026-08-05T00:00:00.000Z")
    const second = envelope("second-subject", "2026-08-05T00:00:01.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    const post = vi.fn(async (_token: string, incoming: PracticeStateEnvelope) => {
      expect(incoming.state.bookmarks).toEqual([])
      return second
    })
    storage.seed(accountPracticeStateKey("subject-1"), first)
    storage.seed(GUEST_PRACTICE_STATE_KEY, envelope("must-not-leak"))
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(post),
    })

    await store.initialize()
    expect(store.getSnapshot().envelope.state.bookmarks).toEqual(["first-subject"])

    await store.resolveSession(null)
    await store.resolveSession({ subject: "subject-2" })

    expect(post).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })
    expect(JSON.parse(storage.getItem(accountPracticeStateKey("subject-1"))!)).toEqual(first)
  })

  it("follows runtime authentication changes instead of writing to a stale subject", async () => {
    const storage = new MemoryStorage()
    const first = envelope("first-subject", "2026-08-05T00:00:00.000Z")
    const second = envelope("second-subject", "2026-08-05T00:00:01.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    storage.seed(accountPracticeStateKey("subject-1"), first)
    storage.seed(accountPracticeStateKey("subject-2"), second)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("Existing account caches must not be submitted again.")
      }),
    })
    await store.initialize()

    auth.emitSession({ subject: "subject-2" })

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "second-edit"],
    }))

    expect(JSON.parse(storage.getItem(accountPracticeStateKey("subject-1"))!)).toEqual(first)
    expect(JSON.parse(storage.getItem(accountPracticeStateKey("subject-2"))!).state.bookmarks)
      .toEqual(["second-subject", "second-edit"])
  })

  it("does not let a stale startup response override a newer session event", async () => {
    const storage = new MemoryStorage()
    const first = envelope("first-subject", "2026-08-05T00:00:00.000Z")
    const second = envelope("second-subject", "2026-08-05T00:00:01.000Z")
    let resolveInitialSession: ((session: PracticeSession | null) => void) | undefined
    let sessionListener: ((session: PracticeSession | null) => void) | undefined
    const auth: PracticeAuth = {
      getSession: () => new Promise((resolve) => {
        resolveInitialSession = resolve
      }),
      getIdentityToken: async () => "identity-token",
      signOut: async () => {},
      subscribeSession(listener) {
        sessionListener = listener
        return () => {}
      },
    }
    storage.seed(accountPracticeStateKey("subject-1"), first)
    storage.seed(accountPracticeStateKey("subject-2"), second)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("Existing account caches must not be submitted again.")
      }),
    })
    const initialization = store.initialize()
    await Promise.resolve()

    sessionListener?.({ subject: "subject-2" })
    resolveInitialSession?.({ subject: "subject-1" })
    await initialization

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: "subject-2" },
      envelope: { state: { bookmarks: ["second-subject"] } },
    })
  })

  it("hides the previous account before opening a different subject's cache", async () => {
    const storage = new MemoryStorage()
    const first = envelope("first-subject", "2026-08-05T00:00:00.000Z")
    const auth = new FakeAuth({ subject: "subject-1" })
    const secondKey = accountPracticeStateKey("subject-2")
    storage.seed(accountPracticeStateKey("subject-1"), first)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: practiceApi(async () => {
        throw new Error("The second subject cache could not be opened.")
      }),
    })
    await store.initialize()
    storage.failedReads.add(secondKey)

    await store.resolveSession({ subject: "subject-2" })

    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "initializing" },
      envelope: { state: { bookmarks: [] } },
      error: new Error(`read failed for ${secondKey}`),
    })
  })
})
