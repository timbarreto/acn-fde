import { migrateStoredPracticeState, retainRecentFinishedAttempts } from "@/lib/practice-state"
import type { BookmarkReceipt, PracticeState, PracticeStateEnvelope, PracticeStateReceipts } from "@/types"

export const GUEST_PRACTICE_STATE_KEY = "agentic-ready-gh600-v2:guest"
export const LEGACY_PRACTICE_STATE_KEY = "agentic-ready-gh600-v1"

export interface PracticeStateStore {
  load: () => PracticeStateEnvelope
  save: (practiceState: PracticeState) => PracticeStateEnvelope
  reset: () => PracticeStateEnvelope
  subscribe: (listener: () => void) => () => void
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null
}

function readReceiptMap(value: unknown): Record<string, string> | null {
  const record = asRecord(value)
  if (!record || Object.values(record).some((receipt) => typeof receipt !== "string")) return null
  return record as Record<string, string>
}

function readBookmarkReceipts(value: unknown): Record<string, BookmarkReceipt> | null {
  const record = asRecord(value)
  if (!record) return null

  const receipts: Record<string, BookmarkReceipt> = {}
  for (const [questionId, value] of Object.entries(record)) {
    const receipt = asRecord(value)
    if (!receipt || typeof receipt.isBookmarked !== "boolean") return null
    if (receipt.receivedAt !== undefined && typeof receipt.receivedAt !== "string") return null
    receipts[questionId] = {
      isBookmarked: receipt.isBookmarked,
      ...(typeof receipt.receivedAt === "string" ? { receivedAt: receipt.receivedAt } : {}),
    }
  }
  return receipts
}

function readReceipts(value: unknown): PracticeStateReceipts | null {
  const record = asRecord(value)
  if (!record) return null

  const finishedAttempts = readReceiptMap(record.finishedAttempts)
  const bookmarks = readBookmarkReceipts(record.bookmarks)
  const latestAnswers = readReceiptMap(record.latestAnswers)
  if (!finishedAttempts || !bookmarks || !latestAnswers) return null
  if (record.activeAttemptReceivedAt !== undefined && typeof record.activeAttemptReceivedAt !== "string") return null

  return {
    ...(typeof record.activeAttemptReceivedAt === "string"
      ? { activeAttemptReceivedAt: record.activeAttemptReceivedAt }
      : {}),
    finishedAttempts,
    bookmarks,
    latestAnswers,
  }
}

function readEnvelope(raw: string | null): PracticeStateEnvelope | null {
  if (raw === null) return null

  try {
    const parsed = asRecord(JSON.parse(raw))
    if (!parsed || parsed.schemaVersion !== 2) return null
    const receipts = readReceipts(parsed.receipts)
    if (!receipts) return null
    return {
      schemaVersion: 2,
      state: migrateStoredPracticeState(JSON.stringify(parsed.state)),
      receipts,
    }
  } catch {
    return null
  }
}

function emptyEnvelope(): PracticeStateEnvelope {
  return {
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
  }
}

export function createGuestPracticeStateStore(storage: Storage): PracticeStateStore {
  let snapshot: PracticeStateEnvelope | null = null
  const listeners = new Set<() => void>()

  function removeLegacy() {
    try {
      storage.removeItem(LEGACY_PRACTICE_STATE_KEY)
    } catch {
      // A successful schema-v2 write remains authoritative; cleanup can retry later.
    }
  }

  function persist(next: PracticeStateEnvelope) {
    storage.setItem(GUEST_PRACTICE_STATE_KEY, JSON.stringify(next))
    removeLegacy()
    snapshot = next
    listeners.forEach((listener) => listener())
    return snapshot
  }

  return {
    load() {
      if (snapshot) return snapshot

      const storedRaw = storage.getItem(GUEST_PRACTICE_STATE_KEY)
      const stored = readEnvelope(storedRaw)
      const legacy = storage.getItem(LEGACY_PRACTICE_STATE_KEY)
      snapshot = stored ?? (storedRaw !== null || legacy === null
        ? emptyEnvelope()
        : { ...emptyEnvelope(), state: migrateStoredPracticeState(legacy) })
      if (stored) {
        if (legacy !== null) removeLegacy()
        return snapshot
      }
      try {
        storage.setItem(GUEST_PRACTICE_STATE_KEY, JSON.stringify(snapshot))
      } catch {
        return snapshot
      }
      if (legacy !== null) removeLegacy()
      return snapshot
    },
    save(practiceState: PracticeState) {
      const next = {
        ...emptyEnvelope(),
        state: {
          ...practiceState,
          attempts: retainRecentFinishedAttempts(practiceState.attempts),
        },
      }
      return persist(next)
    },
    reset() {
      return persist(emptyEnvelope())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
