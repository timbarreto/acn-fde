import { afterEach, describe, expect, it, vi } from "vitest"
import {
  accountPracticeStateKey,
  createBrowserPracticeStateStore,
  createEmptyPracticeStateEnvelope,
  syncStatusWithConnectivity,
  type PracticeAuth,
  type PracticeSession,
} from "@/lib/persistence"
import { PracticeApiError, type PracticeApi } from "@/lib/practice-api"
import type { PracticeStateEnvelope } from "@/types"

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

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
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class FakeAuth implements PracticeAuth {
  readonly invalidateIdentityToken = vi.fn()
  readonly listeners = new Set<(session: PracticeSession | null) => void>()
  readonly signOut = vi.fn(async () => {})

  constructor(readonly subject: string) {}

  async getSession() {
    return { subject: this.subject }
  }

  async getIdentityToken() {
    return "identity-token"
  }

  subscribeSession(listener: (session: PracticeSession | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

const subject = "subject-1"
const receivedAt = "2026-08-05T16:00:00.000Z"

function acceptedEnvelope(): PracticeStateEnvelope {
  const empty = createEmptyPracticeStateEnvelope()
  return {
    ...empty,
    state: { ...empty.state, bookmarks: ["bookmark-1"] },
    receipts: {
      ...empty.receipts,
      bookmarks: {
        "bookmark-1": { isBookmarked: true, receivedAt },
      },
    },
  }
}

function api(postPracticeState: PracticeApi["postPracticeState"]): PracticeApi {
  return {
    getPracticeState: async () => createEmptyPracticeStateEnvelope(),
    postPracticeState,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function settleMicrotasks(turns = 6) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("practice sync status", () => {
  it("keeps standalone guest practice out of the offline state", async () => {
    const store = createBrowserPracticeStateStore({ storage: new MemoryStorage() })

    await store.initialize()

    expect(store.getSnapshot().syncStatus).toEqual({ kind: "guest" })
    expect(syncStatusWithConnectivity(store.getSnapshot().syncStatus, false))
      .toEqual({ kind: "guest" })
  })

  it("reports offline for account states that depend on the network", () => {
    expect(syncStatusWithConnectivity({ kind: "synced", syncedAt: 10_000 }, false))
      .toEqual({ kind: "offline" })
    expect(syncStatusWithConnectivity({ kind: "syncing" }, false))
      .toEqual({ kind: "offline" })
    expect(syncStatusWithConnectivity({ kind: "attention" }, false))
      .toEqual({ kind: "offline" })
  })

  it("moves account work from synced through syncing to attention", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.setItem(
      accountPracticeStateKey(subject),
      JSON.stringify(acceptedEnvelope()),
    )
    const auth = new FakeAuth(subject)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(async () => {
        throw new TypeError("service unavailable")
      }),
    })
    await store.initialize()

    expect(store.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: Date.parse(receivedAt),
    })

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "bookmark-2"],
    }), { flush: "immediate" })
    expect(store.getSnapshot().syncStatus).toEqual({ kind: "syncing" })

    await store.flush()

    expect(store.getSnapshot().syncStatus).toEqual({ kind: "attention" })
  })

  it("stays synced after a rejection rollback whether or not the explanation is dismissed", async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.setItem(
      accountPracticeStateKey(subject),
      JSON.stringify(acceptedEnvelope()),
    )
    const auth = new FakeAuth(subject)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(async () => {
        throw new PracticeApiError(400)
      }),
    })
    await store.initialize()

    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "bookmark-2"],
    }), { flush: "immediate" })
    await store.flush()

    expect(store.getSnapshot().notification).not.toBeNull()
    expect(store.getSnapshot().error).not.toBeNull()
    expect(store.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: Date.parse(receivedAt),
    })

    store.dismissSyncNotification()

    expect(store.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: Date.parse(receivedAt),
    })
  })

  it("stays synced when a first sync succeeds but guest cleanup fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(50_000)
    const storage = new MemoryStorage()
    storage.removeItem = () => {
      throw new Error("Practice state storage is unavailable.")
    }
    const store = createBrowserPracticeStateStore({
      storage,
      auth: new FakeAuth(subject),
      practiceApi: api(async () => createEmptyPracticeStateEnvelope()),
    })

    await store.initialize()

    expect(store.getSnapshot().error).not.toBeNull()
    expect(store.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: 50_000,
    })
  })

  it("reports attention when the first sync cannot reach the service", async () => {
    vi.useFakeTimers()
    const store = createBrowserPracticeStateStore({
      storage: new MemoryStorage(),
      auth: new FakeAuth(subject),
      practiceApi: api(async () => {
        throw new TypeError("service unavailable")
      }),
    })

    await store.initialize()

    expect(store.getSnapshot().mode).toEqual({ kind: "transitioning", subject })
    expect(store.getSnapshot().syncStatus).toEqual({ kind: "attention" })
  })

  it("retains the most recent acceptance time across a browser restart", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const storage = new MemoryStorage()
    const auth = new FakeAuth(subject)
    const practiceApi = api(async () => createEmptyPracticeStateEnvelope())
    const first = createBrowserPracticeStateStore({ storage, auth, practiceApi })

    await first.initialize()

    expect(first.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: 10_000,
    })

    vi.setSystemTime(70_000)
    const restarted = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi,
    })
    await restarted.initialize()

    expect(restarted.getSnapshot().syncStatus).toEqual({
      kind: "synced",
      syncedAt: 10_000,
    })
  })

  it("keeps signing-out visible until safe sign-out finishes", async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      accountPracticeStateKey(subject),
      JSON.stringify(acceptedEnvelope()),
    )
    const auth = new FakeAuth(subject)
    const completion = deferred<void>()
    auth.signOut.mockImplementationOnce(async () => await completion.promise)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(async () => acceptedEnvelope()),
    })
    await store.initialize()

    const signOut = store.signOutSafely()
    await settleMicrotasks()

    expect(store.getSnapshot().syncStatus).toEqual({ kind: "signing-out" })
    expect(syncStatusWithConnectivity(store.getSnapshot().syncStatus, false))
      .toEqual({ kind: "signing-out" })

    completion.resolve()
    await expect(signOut).resolves.toMatchObject({ status: "signed-out" })
    expect(store.getSnapshot().syncStatus).toEqual({ kind: "guest" })
  })
})
