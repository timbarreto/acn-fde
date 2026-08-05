import { PracticeApiError } from "@/lib/practice-api"
import { migrateStoredPracticeState, retainRecentFinishedAttempts } from "@/lib/practice-state"
import type { PracticeApi } from "@/lib/practice-api"
import type { BookmarkReceipt, PracticeState, PracticeStateEnvelope, PracticeStateReceipts } from "@/types"

export const GUEST_PRACTICE_STATE_KEY = "agentic-ready-gh600-v2:guest"
export const LEGACY_PRACTICE_STATE_KEY = "agentic-ready-gh600-v1"
export const ACCOUNT_PRACTICE_STATE_KEY_PREFIX = "agentic-ready-gh600-v2:user:"

export interface PracticeStateStore {
  load: () => PracticeStateEnvelope
  save: (practiceState: PracticeState) => PracticeStateEnvelope
  reset: () => PracticeStateEnvelope
  subscribe: (listener: () => void) => () => void
}

type JsonRecord = Record<string, unknown>

export interface PracticeSession {
  subject: string
}

export interface PracticeAuth {
  getSession: () => Promise<PracticeSession | null>
  getIdentityToken: () => Promise<string>
  signOut: () => Promise<void>
  subscribeSession: (
    listener: (session: PracticeSession | null) => void,
  ) => () => void
}

export type PracticeStateMode =
  | { kind: "initializing" }
  | { kind: "guest" }
  | { kind: "transitioning"; subject: string }
  | { kind: "account"; subject: string }

export interface BrowserPracticeStateSnapshot {
  envelope: PracticeStateEnvelope
  mode: PracticeStateMode
  error: Error | null
  firstSyncRejected: boolean
}

export interface BrowserPracticeStateStore {
  getSnapshot: () => BrowserPracticeStateSnapshot
  initialize: () => Promise<void>
  resolveSession: (session: PracticeSession | null) => Promise<void>
  update: (updater: (current: PracticeState) => PracticeState) => PracticeStateEnvelope
  subscribe: (listener: () => void) => () => void
}

interface BrowserPracticeStateStoreOptions {
  storage: Storage
  auth?: PracticeAuth
  practiceApi?: PracticeApi
}

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

export function createEmptyPracticeStateEnvelope(): PracticeStateEnvelope {
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
        ? createEmptyPracticeStateEnvelope()
        : { ...createEmptyPracticeStateEnvelope(), state: migrateStoredPracticeState(legacy) })
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
        ...createEmptyPracticeStateEnvelope(),
        state: {
          ...practiceState,
          attempts: retainRecentFinishedAttempts(practiceState.attempts),
        },
      }
      return persist(next)
    },
    reset() {
      return persist(createEmptyPracticeStateEnvelope())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function accountPracticeStateKey(subject: string) {
  return `${ACCOUNT_PRACTICE_STATE_KEY_PREFIX}${encodeURIComponent(subject)}`
}

export function createBrowserPracticeStateStore({
  storage,
  auth,
  practiceApi,
}: BrowserPracticeStateStoreOptions): BrowserPracticeStateStore {
  if ((auth && !practiceApi) || (!auth && practiceApi)) {
    throw new Error("Account mode requires both authentication and the practice API.")
  }

  const listeners = new Set<() => void>()
  let guestStore: PracticeStateStore | null = null
  let guestPracticeStateConsumed = false
  let resolution = 0
  let initialization: Promise<void> | null = null
  let pendingSubject: { subject: string; promise: Promise<void> } | null = null
  let sessionSubscription: (() => void) | null = null
  let observedSessionVersion = 0
  let snapshot: BrowserPracticeStateSnapshot = {
    envelope: createEmptyPracticeStateEnvelope(),
    mode: { kind: "initializing" },
    error: null,
    firstSyncRejected: false,
  }

  function publish(next: BrowserPracticeStateSnapshot) {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  function getGuestStore() {
    guestStore ??= createGuestPracticeStateStore(storage)
    return guestStore
  }

  function getActiveGuestStore() {
    if (!guestPracticeStateConsumed) return getGuestStore()

    const nextGuestStore = createGuestPracticeStateStore(storage)
    nextGuestStore.save(createEmptyPracticeStateEnvelope().state)
    guestStore = nextGuestStore
    guestPracticeStateConsumed = false
    return guestStore
  }

  function activateGuest(error: Error | null = null, firstSyncRejected = false) {
    const envelope = getActiveGuestStore().load()
    publish({
      envelope,
      mode: { kind: "guest" },
      error,
      firstSyncRejected,
    })
  }

  function cleanupGuestPracticeState() {
    guestStore = null
    try {
      storage.removeItem(GUEST_PRACTICE_STATE_KEY)
      return null
    } catch (error) {
      return toError(error)
    }
  }

  function activateAccount(subject: string, envelope: PracticeStateEnvelope) {
    guestPracticeStateConsumed = true
    const cleanupError = cleanupGuestPracticeState()
    publish({
      envelope,
      mode: { kind: "account", subject },
      error: cleanupError,
      firstSyncRejected: false,
    })
  }

  async function transitionGuestToAccount(subject: string, currentResolution: number) {
    const key = accountPracticeStateKey(subject)
    const existing = readEnvelope(storage.getItem(key))
    if (existing) {
      if (currentResolution === resolution) activateAccount(subject, existing)
      return
    }

    const guest = getActiveGuestStore().load()
    publish({
      envelope: guest,
      mode: { kind: "transitioning", subject },
      error: null,
      firstSyncRejected: false,
    })

    while (currentResolution === resolution) {
      const sentEnvelope = getActiveGuestStore().load()
      let canonical: PracticeStateEnvelope

      try {
        const identityToken = await auth!.getIdentityToken()
        canonical = await practiceApi!.postPracticeState(identityToken, sentEnvelope)
      } catch (error) {
        if (currentResolution !== resolution) return
        if (isPermanentFirstSyncRejection(error)) {
          let surfacedError = toError(error)
          try {
            await auth!.signOut()
          } catch (signOutError) {
            surfacedError = toError(signOutError)
          }
          if (currentResolution === resolution) {
            activateGuest(surfacedError, true)
          } else if (snapshot.mode.kind === "guest") {
            publish({
              ...snapshot,
              error: surfacedError,
              firstSyncRejected: true,
            })
          }
          return
        }

        publish({
          envelope: getActiveGuestStore().load(),
          mode: { kind: "transitioning", subject },
          error: toError(error),
          firstSyncRejected: false,
        })
        return
      }

      if (currentResolution !== resolution) return
      if (getActiveGuestStore().load() !== sentEnvelope) continue

      try {
        storage.setItem(key, JSON.stringify(canonical))
      } catch (error) {
        publish({
          envelope: getActiveGuestStore().load(),
          mode: { kind: "transitioning", subject },
          error: toError(error),
          firstSyncRejected: false,
        })
        return
      }

      activateAccount(subject, canonical)
      return
    }
  }

  async function applySession(session: PracticeSession | null) {
    const currentResolution = ++resolution
    pendingSubject = null

    if (!session) {
      const firstSyncRejected = snapshot.firstSyncRejected
      const rejectionError = firstSyncRejected ? snapshot.error : null
      hideAccountState()
      try {
        activateGuest(rejectionError, firstSyncRejected)
      } catch (error) {
        publish({ ...snapshot, error: toError(error) })
      }
      return
    }

    if (!session.subject) {
      hideAccountState()
      publish({ ...snapshot, error: new Error("The authenticated session has no subject.") })
      return
    }

    if (snapshot.mode.kind === "account" && snapshot.mode.subject === session.subject) return
    hideAccountState()

    const promise = transitionGuestToAccount(session.subject, currentResolution)
      .catch((error: unknown) => {
        if (currentResolution === resolution) {
          publish({ ...snapshot, error: toError(error) })
        }
      })
      .finally(() => {
        if (pendingSubject?.promise === promise) pendingSubject = null
      })
    pendingSubject = { subject: session.subject, promise }
    await promise
  }

  function hideAccountState() {
    if (snapshot.mode.kind !== "account") return
    publish({
      envelope: createEmptyPracticeStateEnvelope(),
      mode: { kind: "initializing" },
      error: null,
      firstSyncRejected: false,
    })
  }

  function resolveSession(session: PracticeSession | null) {
    if (
      session &&
      pendingSubject?.subject === session.subject
    ) {
      return pendingSubject.promise
    }
    return applySession(session)
  }

  return {
    getSnapshot() {
      return snapshot
    },
    initialize() {
      initialization ??= (async () => {
        if (!auth) {
          await resolveSession(null)
          return
        }

        try {
          const startingSessionVersion = observedSessionVersion
          sessionSubscription ??= auth.subscribeSession((session) => {
            observedSessionVersion += 1
            void resolveSession(session)
          })
          const initialSession = await auth.getSession()
          if (observedSessionVersion === startingSessionVersion) {
            await resolveSession(initialSession)
          }
        } catch (error) {
          publish({ ...snapshot, error: toError(error) })
        }
      })()
      return initialization
    },
    resolveSession,
    update(updater) {
      if (snapshot.mode.kind === "initializing") {
        throw new Error("Practice state is not initialized.")
      }

      if (snapshot.mode.kind === "account") {
        const next = envelopeForAccountUpdate(snapshot.envelope, updater(snapshot.envelope.state))
        storage.setItem(accountPracticeStateKey(snapshot.mode.subject), JSON.stringify(next))
        publish({ ...snapshot, envelope: next, error: null })
        return next
      }

      const next = getActiveGuestStore().save(
        updater(getActiveGuestStore().load().state),
      )
      publish({ ...snapshot, envelope: next, error: null })
      return next
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function envelopeForAccountUpdate(
  current: PracticeStateEnvelope,
  nextPracticeState: PracticeState,
): PracticeStateEnvelope {
  const nextState = {
    ...nextPracticeState,
    attempts: retainRecentFinishedAttempts(nextPracticeState.attempts),
  }
  const activeAttemptReceivedAt = sameValue(
    current.state.activeAttempt,
    nextState.activeAttempt,
  )
    ? current.receipts.activeAttemptReceivedAt
    : undefined
  const currentAttempts = new Map(
    current.state.attempts.map((attempt) => [attempt.id, attempt]),
  )
  const finishedAttempts = Object.fromEntries(
    nextState.attempts.flatMap((attempt) => {
      const receivedAt = current.receipts.finishedAttempts[attempt.id]
      return receivedAt && sameValue(currentAttempts.get(attempt.id), attempt)
        ? [[attempt.id, receivedAt]]
        : []
    }),
  )
  const latestAnswers = Object.fromEntries(
    Object.entries(nextState.latestAnswers).flatMap(([questionId, answer]) => {
      const receivedAt = current.receipts.latestAnswers[questionId]
      return receivedAt && sameValue(current.state.latestAnswers[questionId], answer)
        ? [[questionId, receivedAt]]
        : []
    }),
  )
  const currentBookmarks = new Set(current.state.bookmarks)
  const nextBookmarks = new Set(nextState.bookmarks)
  const bookmarkQuestionIds = new Set([
    ...Object.keys(current.receipts.bookmarks),
    ...currentBookmarks,
    ...nextBookmarks,
  ])
  const bookmarks = Object.fromEntries(
    [...bookmarkQuestionIds].map((questionId) => {
      const isBookmarked = nextBookmarks.has(questionId)
      const existing = current.receipts.bookmarks[questionId]
      return [
        questionId,
        existing &&
        currentBookmarks.has(questionId) === isBookmarked &&
        existing.isBookmarked === isBookmarked
          ? existing
          : { isBookmarked },
      ]
    }),
  )

  return {
    schemaVersion: 2,
    state: nextState,
    receipts: {
      ...(activeAttemptReceivedAt ? { activeAttemptReceivedAt } : {}),
      finishedAttempts,
      bookmarks,
      latestAnswers,
    },
  }
}

function isPermanentFirstSyncRejection(error: unknown) {
  return error instanceof PracticeApiError && [400, 413, 415].includes(error.status)
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
