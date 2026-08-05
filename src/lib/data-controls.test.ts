import { describe, expect, it, vi } from "vitest"
import { createPracticeStateExport } from "@/lib/data-controls"
import {
  GUEST_PRACTICE_STATE_KEY,
  accountPracticeStateKey,
  createBrowserPracticeStateStore,
  createEmptyPracticeStateEnvelope,
  type PracticeAuth,
  type PracticeSession,
} from "@/lib/persistence"
import type { PracticeApi } from "@/lib/practice-api"
import type { PracticeState, PracticeStateEnvelope } from "@/types"

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  readonly removals: string[] = []

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
    this.removals.push(key)
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  seed(key: string, envelope: PracticeStateEnvelope) {
    this.values.set(key, JSON.stringify(envelope))
  }
}

class FakeAuth implements PracticeAuth {
  readonly getIdentityToken = vi.fn(async () => "identity-token")
  readonly invalidateIdentityToken = vi.fn()
  readonly signOut = vi.fn(async () => {})
  readonly deleteAccount = vi.fn(async () => {})

  constructor(public session: PracticeSession | null) {}

  async getSession() {
    return this.session
  }

  subscribeSession() {
    return () => {}
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const visiblePracticeState: PracticeState = {
  activeAttempt: null,
  attempts: [{
    id: "22222222-2222-4222-8222-222222222222",
    mode: "quick",
    label: "Quick practice",
    questionIds: ["arch-001"],
    answers: { "arch-001": ["b"] },
    flagged: [],
    startedAt: 1_767_139_200_000,
    durationMinutes: 15,
    finishedAt: 1_767_140_100_000,
    score: 100,
    outcome: "submitted",
  }],
  bookmarks: ["arch-001"],
  latestAnswers: { "arch-001": ["b"] },
}

const acceptedEnvelope: PracticeStateEnvelope = {
  schemaVersion: 2,
  state: visiblePracticeState,
  receipts: {
    finishedAttempts: {
      "22222222-2222-4222-8222-222222222222": "2026-08-06T12:00:00.000Z",
    },
    bookmarks: {
      "arch-001": {
        isBookmarked: true,
        receivedAt: "2026-08-06T12:00:00.000Z",
      },
    },
    latestAnswers: {
      "arch-001": "2026-08-06T12:00:00.000Z",
    },
  },
}

function api(deletePracticeState: PracticeApi["deletePracticeState"]): PracticeApi {
  return {
    getPracticeState: async () => createEmptyPracticeStateEnvelope(),
    postPracticeState: async () => {
      throw new Error("Accepted state must not be merged while deletion is running.")
    },
    deletePracticeState,
  }
}

async function settleMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("practice-state data controls", () => {
  it("creates a portable JSON export from exactly the visible practice state", () => {
    const result = createPracticeStateExport(
      visiblePracticeState,
      new Date("2026-08-06T12:34:56.000Z"),
    )

    expect(result.filename).toBe("agentic-ready-gh600-practice-state-2026-08-06.json")
    expect(result.mediaType).toBe("application/json")
    expect(JSON.parse(result.content)).toEqual({
      schemaVersion: 2,
      exportedAt: "2026-08-06T12:34:56.000Z",
      practiceState: visiblePracticeState,
    })
  })

  it("resets guest practice by removing only the guest key and starting empty", async () => {
    const storage = new MemoryStorage()
    const guestEnvelope = {
      ...createEmptyPracticeStateEnvelope(),
      state: visiblePracticeState,
    }
    const otherSubjectKey = accountPracticeStateKey("other-subject")
    storage.seed(GUEST_PRACTICE_STATE_KEY, guestEnvelope)
    storage.seed(otherSubjectKey, createEmptyPracticeStateEnvelope())
    storage.setItem("unrelated-setting", "keep")
    const store = createBrowserPracticeStateStore({ storage })
    await store.initialize()

    const result = await store.resetPracticeState()

    expect(result).toEqual({ status: "completed" })
    expect(storage.removals).toEqual([GUEST_PRACTICE_STATE_KEY])
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: createEmptyPracticeStateEnvelope(),
    })
    expect(storage.getItem(otherSubjectKey)).not.toBeNull()
    expect(storage.getItem("unrelated-setting")).toBe("keep")
  })

  it("waits for server acceptance before clearing only the current subject cache", async () => {
    const subject = "subject-a"
    const storage = new MemoryStorage()
    const deletion = deferred<void>()
    const deletePracticeState = vi.fn(async () => await deletion.promise)
    const currentKey = accountPracticeStateKey(subject)
    const otherKey = accountPracticeStateKey("subject-b")
    storage.seed(currentKey, acceptedEnvelope)
    storage.seed(otherKey, acceptedEnvelope)
    const auth = new FakeAuth({ subject })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(deletePracticeState),
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, "arch-002"],
    }))

    const reset = store.resetPracticeState()
    await settleMicrotasks()

    expect(deletePracticeState).toHaveBeenCalledWith("identity-token")
    expect(storage.getItem(currentKey)).not.toBeNull()
    expect(store.getSnapshot().envelope.state.bookmarks)
      .toEqual(["arch-001", "arch-002"])

    deletion.resolve()
    await expect(reset).resolves.toEqual({ status: "completed" })
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: createEmptyPracticeStateEnvelope(),
    })
    expect(storage.getItem(currentKey)).toBeNull()
    expect(storage.getItem(otherKey)).not.toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(auth.deleteAccount).not.toHaveBeenCalled()
  })

  it("deletes practice state before identity and returns to a new empty guest", async () => {
    const subject = "subject-delete"
    const storage = new MemoryStorage()
    const events: string[] = []
    const currentKey = accountPracticeStateKey(subject)
    const otherKey = accountPracticeStateKey("other-subject")
    storage.seed(currentKey, acceptedEnvelope)
    storage.seed(otherKey, acceptedEnvelope)
    const auth = new FakeAuth({ subject })
    auth.deleteAccount.mockImplementation(async () => {
      events.push("identity")
    })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(async () => {
        events.push("practice-state")
      }),
    })
    await store.initialize()
    store.update((current) => ({
      ...current,
      latestAnswers: { ...current.latestAnswers, "arch-002": ["b"] },
    }))

    const result = await store.deleteAccount()

    expect(result).toEqual({ status: "completed" })
    expect(events).toEqual(["practice-state", "identity"])
    expect(storage.getItem(currentKey)).toBeNull()
    expect(storage.getItem(otherKey)).not.toBeNull()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "guest" },
      envelope: createEmptyPracticeStateEnvelope(),
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!))
      .toMatchObject(createEmptyPracticeStateEnvelope())
  })

  it("does not delete a newly selected subject when account deletion changes subjects", async () => {
    const firstSubject = "subject-switch-a"
    const secondSubject = "subject-switch-b"
    const storage = new MemoryStorage()
    const firstKey = accountPracticeStateKey(firstSubject)
    const secondKey = accountPracticeStateKey(secondSubject)
    storage.seed(firstKey, acceptedEnvelope)
    storage.seed(secondKey, createEmptyPracticeStateEnvelope())
    const deletion = deferred<void>()
    const auth = new FakeAuth({ subject: firstSubject })
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(async () => await deletion.promise),
    })
    await store.initialize()

    const accountDeletion = store.deleteAccount()
    await settleMicrotasks()
    await store.resolveSession({ subject: secondSubject })
    deletion.resolve()

    await expect(accountDeletion).resolves.toMatchObject({
      status: "blocked",
      step: "practice-state",
    })
    expect(auth.deleteAccount).not.toHaveBeenCalled()
    expect(storage.getItem(secondKey)).not.toBeNull()
    expect(store.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject: secondSubject },
      envelope: createEmptyPracticeStateEnvelope(),
    })
  })

  it("retries account deletion from practice state when that first step fails", async () => {
    const subject = "subject-practice-retry"
    const storage = new MemoryStorage()
    const key = accountPracticeStateKey(subject)
    storage.seed(key, acceptedEnvelope)
    const auth = new FakeAuth({ subject })
    const deletePracticeState = vi.fn()
      .mockRejectedValueOnce(new Error("practice service unavailable"))
      .mockResolvedValueOnce(undefined)
    const store = createBrowserPracticeStateStore({
      storage,
      auth,
      practiceApi: api(deletePracticeState),
    })
    await store.initialize()

    await expect(store.deleteAccount()).resolves.toEqual({
      status: "blocked",
      step: "practice-state",
      error: new Error("practice service unavailable"),
    })
    expect(auth.deleteAccount).not.toHaveBeenCalled()
    expect(store.getSnapshot().envelope.state).toEqual(visiblePracticeState)
    expect(storage.getItem(key)).not.toBeNull()

    await expect(store.deleteAccount()).resolves.toEqual({ status: "completed" })
    expect(deletePracticeState).toHaveBeenCalledTimes(2)
    expect(auth.deleteAccount).toHaveBeenCalledOnce()
    expect(storage.getItem(key)).toBeNull()
  })

  it("resumes account deletion at identity after a partial failure and restart", async () => {
    const subject = "subject-retry"
    const storage = new MemoryStorage()
    const key = accountPracticeStateKey(subject)
    storage.seed(key, acceptedEnvelope)
    const firstAuth = new FakeAuth({ subject })
    firstAuth.deleteAccount.mockRejectedValueOnce(new Error("identity unavailable"))
    const deletePracticeState = vi.fn(async () => {})
    const interrupted = createBrowserPracticeStateStore({
      storage,
      auth: firstAuth,
      practiceApi: api(deletePracticeState),
    })
    await interrupted.initialize()

    await expect(interrupted.deleteAccount()).resolves.toEqual({
      status: "blocked",
      step: "identity",
      error: new Error("identity unavailable"),
    })
    expect(deletePracticeState).toHaveBeenCalledOnce()
    expect(interrupted.getSnapshot()).toMatchObject({
      mode: { kind: "account", subject },
      envelope: createEmptyPracticeStateEnvelope(),
      accountDeletionStage: "identity",
    })
    await expect(interrupted.signOutSafely()).resolves.toMatchObject({
      status: "blocked",
    })
    expect(firstAuth.signOut).not.toHaveBeenCalled()

    const retryAuth = new FakeAuth({ subject })
    const retryDeletePracticeState = vi.fn(async () => {
      throw new Error("The completed practice-state step must not repeat.")
    })
    const restarted = createBrowserPracticeStateStore({
      storage,
      auth: retryAuth,
      practiceApi: api(retryDeletePracticeState),
    })
    await restarted.initialize()

    await expect(restarted.deleteAccount()).resolves.toEqual({ status: "completed" })
    expect(retryDeletePracticeState).not.toHaveBeenCalled()
    expect(retryAuth.deleteAccount).toHaveBeenCalledOnce()
    expect(storage.getItem(key)).toBeNull()
    expect(restarted.getSnapshot().mode).toEqual({ kind: "guest" })
  })
})
