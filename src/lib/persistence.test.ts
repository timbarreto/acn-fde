import { describe, expect, it, vi } from "vitest"
import {
  GUEST_PRACTICE_STATE_KEY,
  LEGACY_PRACTICE_STATE_KEY,
  createGuestPracticeStateStore,
} from "@/lib/persistence"
import type { FinishedAttempt } from "@/types"

function makeFinishedAttempt(id: string, finishedAt: number): FinishedAttempt {
  return {
    id,
    mode: "quick",
    label: `Attempt ${id}`,
    questionIds: ["tools-1"],
    answers: { "tools-1": ["a"] },
    flagged: [],
    startedAt: 1_000,
    durationMinutes: 15,
    finishedAt,
    score: 100,
    outcome: "submitted",
  }
}

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  failWrites = false

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
    if (this.failWrites) throw new Error("storage write failed")
    this.values.set(key, value)
  }
}

describe("guest practice-state store", () => {
  it("loads fresh guest state as a complete schema-v2 envelope without receipts", () => {
    const storage = new MemoryStorage()
    const store = createGuestPracticeStateStore(storage)

    const envelope = store.load()

    expect(envelope).toEqual({
      schemaVersion: 2,
      state: {
        activeAttempt: null,
        attempts: [],
        bookmarks: [],
        latestAnswers: {},
      },
      receipts: {
        finishedAttempts: {},
        bookmarks: {},
        latestAnswers: {},
      },
    })
    expect(JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!)).toEqual(envelope)
  })

  it("migrates version-1 guest state before removing the legacy key", () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_PRACTICE_STATE_KEY, JSON.stringify({
      activeAttempt: null,
      attempts: [{
        id: "finished-1",
        mode: "quick",
        label: "Quick knowledge check",
        questionIds: ["tools-1"],
        answers: { "tools-1": ["b"] },
        flagged: ["tools-1"],
        startedAt: 1_000,
        durationMinutes: 15,
        completedAt: 21_000,
        score: 0,
      }],
      bookmarks: ["tools-1"],
      progress: { "tools-1": ["b"] },
    }))
    const store = createGuestPracticeStateStore(storage)

    const envelope = store.load()

    expect({
      envelope,
      persisted: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!),
      legacy: storage.getItem(LEGACY_PRACTICE_STATE_KEY),
    }).toEqual({
      envelope: {
        schemaVersion: 2,
        state: {
          activeAttempt: null,
          attempts: [{
            id: "finished-1",
            mode: "quick",
            label: "Quick knowledge check",
            questionIds: ["tools-1"],
            answers: { "tools-1": ["b"] },
            flagged: ["tools-1"],
            startedAt: 1_000,
            durationMinutes: 15,
            finishedAt: 21_000,
            score: 0,
            outcome: "submitted",
          }],
          bookmarks: ["tools-1"],
          latestAnswers: { "tools-1": ["b"] },
        },
        receipts: {
          finishedAttempts: {},
          bookmarks: {},
          latestAnswers: {},
        },
      },
      persisted: envelope,
      legacy: null,
    })
  })

  it("keeps version-1 guest state when writing its replacement fails", () => {
    const storage = new MemoryStorage()
    const legacy = JSON.stringify({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["tools-1"],
      progress: {},
    })
    storage.setItem(LEGACY_PRACTICE_STATE_KEY, legacy)
    storage.failWrites = true
    const store = createGuestPracticeStateStore(storage)

    const envelope = store.load()

    expect({
      state: envelope.state,
      replacement: storage.getItem(GUEST_PRACTICE_STATE_KEY),
      legacy: storage.getItem(LEGACY_PRACTICE_STATE_KEY),
    }).toEqual({
      state: {
        activeAttempt: null,
        attempts: [],
        bookmarks: ["tools-1"],
        latestAnswers: {},
      },
      replacement: null,
      legacy,
    })
  })

  it("finishes legacy cleanup when a later save recovers from a migration write failure", () => {
    const storage = new MemoryStorage()
    const legacy = JSON.stringify({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["tools-1"],
      progress: {},
    })
    storage.setItem(LEGACY_PRACTICE_STATE_KEY, legacy)
    storage.failWrites = true
    const store = createGuestPracticeStateStore(storage)
    const migrated = store.load()
    storage.failWrites = false

    const envelope = store.save(migrated.state)

    expect({
      persisted: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!),
      legacy: storage.getItem(LEGACY_PRACTICE_STATE_KEY),
    }).toEqual({
      persisted: envelope,
      legacy: null,
    })
  })

  it("loads an existing version-2 envelope instead of stale legacy state", () => {
    const storage = new MemoryStorage()
    const persisted = {
      schemaVersion: 2,
      state: {
        activeAttempt: null,
        attempts: [],
        bookmarks: ["current-bookmark"],
        latestAnswers: { "tools-1": ["b"] },
      },
      receipts: {
        finishedAttempts: {},
        bookmarks: {},
        latestAnswers: {},
      },
    }
    storage.setItem(GUEST_PRACTICE_STATE_KEY, JSON.stringify(persisted))
    storage.setItem(LEGACY_PRACTICE_STATE_KEY, JSON.stringify({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["stale-bookmark"],
      progress: {},
    }))
    const store = createGuestPracticeStateStore(storage)

    const envelope = store.load()

    expect({ envelope, legacy: storage.getItem(LEGACY_PRACTICE_STATE_KEY) }).toEqual({
      envelope: persisted,
      legacy: null,
    })
  })

  it("recovers malformed version-2 data without reviving stale legacy state", () => {
    const storage = new MemoryStorage()
    storage.setItem(GUEST_PRACTICE_STATE_KEY, "{not-json")
    storage.setItem(LEGACY_PRACTICE_STATE_KEY, JSON.stringify({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["stale-bookmark"],
      progress: {},
    }))
    const store = createGuestPracticeStateStore(storage)

    const envelope = store.load()

    expect({
      envelope,
      persisted: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!),
      legacy: storage.getItem(LEGACY_PRACTICE_STATE_KEY),
    }).toEqual({
      envelope: {
        schemaVersion: 2,
        state: {
          activeAttempt: null,
          attempts: [],
          bookmarks: [],
          latestAnswers: {},
        },
        receipts: {
          finishedAttempts: {},
          bookmarks: {},
          latestAnswers: {},
        },
      },
      persisted: envelope,
      legacy: null,
    })
  })

  it("saves guest practice state in a receipt-free version-2 envelope", () => {
    const storage = new MemoryStorage()
    const store = createGuestPracticeStateStore(storage)
    store.load()

    const envelope = store.save({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["tools-1"],
      latestAnswers: { "tools-1": ["b"] },
    })

    expect({
      envelope,
      loaded: store.load(),
      persisted: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!),
    }).toEqual({
      envelope: {
        schemaVersion: 2,
        state: {
          activeAttempt: null,
          attempts: [],
          bookmarks: ["tools-1"],
          latestAnswers: { "tools-1": ["b"] },
        },
        receipts: {
          finishedAttempts: {},
          bookmarks: {},
          latestAnswers: {},
        },
      },
      loaded: envelope,
      persisted: envelope,
    })
  })

  it("retains only the 30 most recent finished attempts when saving", () => {
    const storage = new MemoryStorage()
    const store = createGuestPracticeStateStore(storage)
    const attempts = Array.from(
      { length: 35 },
      (_, index) => makeFinishedAttempt(`attempt-${index}`, index),
    )

    const envelope = store.save({
      activeAttempt: null,
      attempts,
      bookmarks: [],
      latestAnswers: {},
    })

    expect({
      ids: envelope.state.attempts.map(({ id }) => id),
      persistedCount: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!).state.attempts.length,
    }).toEqual({
      ids: Array.from({ length: 30 }, (_, index) => `attempt-${34 - index}`),
      persistedCount: 30,
    })
  })

  it("notifies subscribers after a successful save until they unsubscribe", () => {
    const storage = new MemoryStorage()
    const store = createGuestPracticeStateStore(storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.save({
      activeAttempt: null,
      attempts: [],
      bookmarks: ["tools-1"],
      latestAnswers: {},
    })
    unsubscribe()
    store.save({
      activeAttempt: null,
      attempts: [],
      bookmarks: [],
      latestAnswers: {},
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("resets guest practice state and notifies subscribers", () => {
    const storage = new MemoryStorage()
    const store = createGuestPracticeStateStore(storage)
    store.save({
      activeAttempt: null,
      attempts: [makeFinishedAttempt("finished-1", 2_000)],
      bookmarks: ["tools-1"],
      latestAnswers: { "tools-1": ["a"] },
    })
    const listener = vi.fn()
    store.subscribe(listener)

    const envelope = store.reset()

    expect({
      envelope,
      persisted: JSON.parse(storage.getItem(GUEST_PRACTICE_STATE_KEY)!),
      notifications: listener.mock.calls.length,
    }).toEqual({
      envelope: {
        schemaVersion: 2,
        state: {
          activeAttempt: null,
          attempts: [],
          bookmarks: [],
          latestAnswers: {},
        },
        receipts: {
          finishedAttempts: {},
          bookmarks: {},
          latestAnswers: {},
        },
      },
      persisted: envelope,
      notifications: 1,
    })
  })
})
