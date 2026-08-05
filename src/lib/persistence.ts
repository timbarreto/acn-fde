import { PracticeApiError } from "@/lib/practice-api"
import { migrateStoredPracticeState, retainRecentFinishedAttempts } from "@/lib/practice-state"
import type { PracticeApi } from "@/lib/practice-api"
import type {
  Attempt,
  BookmarkReceipt,
  FinishedAttempt,
  PracticeState,
  PracticeStateEnvelope,
  PracticeStateReceipts,
} from "@/types"

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
  getIdentityToken: (expectedSubject: string) => Promise<string>
  invalidateIdentityToken: (token: string) => void
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  subscribeSession: (
    listener: (session: PracticeSession | null) => void,
  ) => () => void
}

export type PracticeStateMode =
  | { kind: "initializing" }
  | { kind: "guest" }
  | { kind: "transitioning"; subject: string }
  | { kind: "reauthenticating"; subject: string }
  | { kind: "account"; subject: string }

export type PracticeSyncStatus =
  | { kind: "guest" }
  | { kind: "syncing" }
  | { kind: "synced"; syncedAt: number | null }
  | { kind: "offline" }
  | { kind: "attention" }
  | { kind: "signing-out" }

export interface PracticeSyncNotification {
  kind: "sync-rejected"
  message: string
}

export interface BrowserPracticeStateSnapshot {
  envelope: PracticeStateEnvelope
  mode: PracticeStateMode
  syncStatus: PracticeSyncStatus
  accountDeletionStage: "identity" | null
  error: Error | null
  firstSyncRejected: boolean
  notification: PracticeSyncNotification | null
}

export type SafeSignOutResult =
  | { status: "signed-out"; error: Error | null }
  | { status: "blocked"; error: Error }

export type PracticeDataControlResult =
  | { status: "completed" }
  | { status: "blocked"; error: Error }

export type AccountDeletionResult =
  | { status: "completed" }
  | { status: "blocked"; step: "practice-state" | "identity"; error: Error }

export class PracticeSessionMismatchError extends Error {
  constructor() {
    super("The authenticated session changed before practice state could sync.")
    this.name = "PracticeSessionMismatchError"
  }
}

export interface BrowserPracticeStateStore {
  getSnapshot: () => BrowserPracticeStateSnapshot
  initialize: () => Promise<void>
  resolveSession: (session: PracticeSession | null) => Promise<void>
  update: (
    updater: (current: PracticeState) => PracticeState,
    options?: { flush?: PracticeStateFlush },
  ) => PracticeStateEnvelope
  flush: () => Promise<void>
  resetPracticeState: () => Promise<PracticeDataControlResult>
  deleteAccount: () => Promise<AccountDeletionResult>
  signOutSafely: () => Promise<SafeSignOutResult>
  dismissSyncNotification: () => void
  subscribe: (listener: () => void) => () => void
}

interface SessionEndIntent {
  kind: "safe-sign-out" | "first-sync-rejection" | "account-deletion"
  subject: string
  resolution: number
  nullObserved: boolean
}

interface BrowserPracticeStateStoreOptions {
  storage: Storage
  auth?: PracticeAuth
  practiceApi?: PracticeApi
  syncDebounceMs?: number
}

export type PracticeStateFlush = "debounced" | "immediate"

type PracticeStateMutation =
  | { kind: "activeAttempt"; revision: number; value: Attempt | null }
  | { kind: "finishedAttempt"; revision: number; attemptId: string; value: FinishedAttempt | null }
  | { kind: "latestAnswer"; revision: number; questionId: string; value: string[] | null }
  | { kind: "bookmark"; revision: number; questionId: string; value: boolean }

interface AccountPracticeStateCache {
  envelope: PracticeStateEnvelope
  canonicalEnvelope: PracticeStateEnvelope
  revision: number
  acknowledgedRevision: number
  journal: PracticeStateMutation[]
  lastSyncedAt: number | null
  accountDeletionStage: "identity" | null
}

interface AccountSyncCoordinator {
  subject: string
  key: string
  cache: AccountPracticeStateCache
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  retryRequested: boolean
  rollbackPending: boolean
  rollbackError: Error | null
  syncFailed: boolean
  lastSyncedAt: number | null
}

interface FirstSyncCoordinator {
  subject: string
  accountKey: string
  cache: AccountPracticeStateCache
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  retryRequested: boolean
  syncFailed: boolean
}

const ACCOUNT_SYNC_CACHE_VERSION = 1
const FIRST_SYNC_CACHE_VERSION = 1
const DEFAULT_SYNC_DEBOUNCE_MS = 3_000

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
      const next = createEmptyPracticeStateEnvelope()
      storage.removeItem(GUEST_PRACTICE_STATE_KEY)
      storage.setItem(GUEST_PRACTICE_STATE_KEY, JSON.stringify(next))
      snapshot = next
      listeners.forEach((listener) => listener())
      return snapshot
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
  syncDebounceMs = DEFAULT_SYNC_DEBOUNCE_MS,
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
  let activeAccount: AccountSyncCoordinator | null = null
  let firstSync: FirstSyncCoordinator | null = null
  const subjectFlights = new Map<string, Promise<void>>()
  let observedSessionVersion = 0
  let authenticatedSubject: string | null = null
  let completedSignOutSubject: string | null = null
  let sessionEndIntent: SessionEndIntent | null = null
  let safeSignOutPending = false
  let dataControlPending: "reset" | "delete-account" | null = null
  let resetFlight: Promise<PracticeDataControlResult> | null = null
  let deleteAccountFlight: Promise<AccountDeletionResult> | null = null
  let signOutFlight: Promise<SafeSignOutResult> | null = null
  let snapshot: BrowserPracticeStateSnapshot = {
    envelope: createEmptyPracticeStateEnvelope(),
    mode: { kind: "initializing" },
    syncStatus: { kind: "syncing" },
    accountDeletionStage: null,
    error: null,
    firstSyncRejected: false,
    notification: null,
  }

  function publish(
    next: Omit<BrowserPracticeStateSnapshot, "syncStatus" | "accountDeletionStage"> & {
      syncStatus?: PracticeSyncStatus
      accountDeletionStage?: "identity" | null
    },
  ) {
    snapshot = {
      ...next,
      syncStatus: deriveSyncStatus(next),
      accountDeletionStage: activeAccount?.cache.accountDeletionStage ?? null,
    }
    listeners.forEach((listener) => listener())
  }

  function deriveSyncStatus(
    next: Pick<BrowserPracticeStateSnapshot, "mode">,
  ): PracticeSyncStatus {
    if (safeSignOutPending) return { kind: "signing-out" }
    if (dataControlPending) return { kind: "syncing" }

    switch (next.mode.kind) {
      case "initializing":
        return { kind: "syncing" }
      case "guest":
        return { kind: "guest" }
      case "transitioning":
        return firstSync && !firstSync.inFlight && firstSync.syncFailed
          ? { kind: "attention" }
          : { kind: "syncing" }
      case "reauthenticating":
        return { kind: "attention" }
      case "account": {
        const coordinator = activeAccount
        if (!coordinator || coordinator.subject !== next.mode.subject) {
          return { kind: "attention" }
        }
        if (coordinator.inFlight) return { kind: "syncing" }
        if (coordinator.cache.accountDeletionStage === "identity") {
          return { kind: "attention" }
        }
        if (hasCoordinatorWork(coordinator)) {
          return coordinator.syncFailed ? { kind: "attention" } : { kind: "syncing" }
        }
        return { kind: "synced", syncedAt: coordinator.lastSyncedAt }
      }
    }
  }

  function currentMode() {
    return snapshot.mode
  }

  function setSafeSignOutPending(pending: boolean) {
    if (safeSignOutPending === pending) return
    safeSignOutPending = pending
    publish({ ...snapshot })
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

  function activateGuest(
    error: Error | null = null,
    firstSyncRejected = false,
    notification: PracticeSyncNotification | null = null,
  ) {
    const persistedFirstSyncSubject = auth
      ? readFirstSyncSubject(storage.getItem(GUEST_PRACTICE_STATE_KEY))
      : null
    if (persistedFirstSyncSubject) {
      quarantineAccountState(persistedFirstSyncSubject)
      if (error || notification) {
        publish({
          ...snapshot,
          error: error ?? snapshot.error,
          notification,
        })
      }
      return
    }

    const envelope = getActiveGuestStore().load()
    publish({
      envelope,
      mode: { kind: "guest" },
      error,
      firstSyncRejected,
      notification,
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

  function writeAccountCache(key: string, cache: AccountPracticeStateCache) {
    storage.setItem(key, serializeAccountCache(cache))
  }

  function activateAccount(
    subject: string,
    cache: AccountPracticeStateCache,
    consumeGuestState = true,
  ) {
    const coordinator: AccountSyncCoordinator = {
      subject,
      key: accountPracticeStateKey(subject),
      cache,
      timer: null,
      inFlight: null,
      retryRequested: false,
      rollbackPending: false,
      rollbackError: null,
      syncFailed: false,
      lastSyncedAt: cache.lastSyncedAt,
    }
    activeAccount = coordinator
    if (consumeGuestState) guestPracticeStateConsumed = true
    const cleanupError = consumeGuestState ? cleanupGuestPracticeState() : null
    publish({
      envelope: cache.envelope,
      mode: { kind: "account", subject },
      error: cleanupError,
      firstSyncRejected: false,
      notification: snapshot.notification,
    })
    if (hasPendingMutations(cache)) scheduleSync(coordinator, "immediate")
  }

  function clearSyncTimer(coordinator: AccountSyncCoordinator) {
    if (coordinator.timer === null) return
    clearTimeout(coordinator.timer)
    coordinator.timer = null
  }

  function scheduleSync(
    coordinator: AccountSyncCoordinator,
    flush: PracticeStateFlush,
  ) {
    if (
      activeAccount !== coordinator ||
      dataControlPending !== null ||
      coordinator.inFlight ||
      !hasCoordinatorWork(coordinator)
    ) {
      return
    }

    clearSyncTimer(coordinator)
    if (flush === "immediate") {
      void startAccountSync(coordinator)
      return
    }

    coordinator.timer = setTimeout(() => {
      coordinator.timer = null
      void startAccountSync(coordinator)
    }, syncDebounceMs)
  }

  function startAccountSync(coordinator: AccountSyncCoordinator) {
    if (coordinator.inFlight) return coordinator.inFlight
    clearSyncTimer(coordinator)
    coordinator.syncFailed = false
    const run = syncAccount(coordinator)
    const tracked = run.finally(() => {
      if (coordinator.inFlight === tracked) coordinator.inFlight = null
      if (subjectFlights.get(coordinator.subject) === tracked) {
        subjectFlights.delete(coordinator.subject)
      }
      if (coordinator.retryRequested && activeAccount === coordinator) {
        coordinator.retryRequested = false
        scheduleSync(coordinator, "debounced")
      }
      if (activeAccount === coordinator) publish({ ...snapshot })
    })
    coordinator.inFlight = tracked
    subjectFlights.set(coordinator.subject, tracked)
    publish({ ...snapshot })
    return tracked
  }

  async function syncAccount(coordinator: AccountSyncCoordinator) {
    while (
      activeAccount === coordinator &&
      hasCoordinatorWork(coordinator)
    ) {
      if (coordinator.rollbackPending) {
        try {
          writeAccountCache(coordinator.key, coordinator.cache)
        } catch (error) {
          coordinator.syncFailed = true
          publish({
            ...snapshot,
            envelope: coordinator.cache.envelope,
            error: toError(error),
          })
          coordinator.retryRequested = true
          return
        }

        coordinator.rollbackPending = false
        coordinator.syncFailed = false
        const rollbackError = coordinator.rollbackError
        coordinator.rollbackError = null
        publish({
          ...snapshot,
          envelope: coordinator.cache.envelope,
          error: rollbackError,
        })
        continue
      }

      const sentEnvelope = coordinator.cache.envelope
      const sentRevision = coordinator.cache.revision

      let canonical: PracticeStateEnvelope
      try {
        const response = await postPracticeStateWithAuthentication(
          coordinator.subject,
          sentEnvelope,
          () => activeAccount === coordinator,
        )
        if (!response) return
        canonical = response
      } catch (error) {
        if (activeAccount !== coordinator) return
        coordinator.syncFailed = true
        if (error instanceof PracticeSessionMismatchError) {
          quarantineAccountState(coordinator.subject)
          publish({ ...snapshot, error })
        } else if (isPermanentSyncRejection(error)) {
          let canonicalEnvelope = coordinator.cache.canonicalEnvelope
          if (!hasCompleteReceipts(canonicalEnvelope)) {
            try {
              const recovered = await authenticatedPracticeRequest(
                coordinator.subject,
                () => activeAccount === coordinator,
                (identityToken) => practiceApi!.getPracticeState(identityToken),
              )
              if (!recovered) return
              canonicalEnvelope = recovered
            } catch (recoveryError) {
              if (activeAccount !== coordinator) return
              if (recoveryError instanceof PracticeSessionMismatchError) {
                quarantineAccountState(coordinator.subject)
              } else {
                coordinator.retryRequested = true
              }
              publish({ ...snapshot, error: toError(recoveryError) })
              return
            }
          }
          const rollback = rollbackAccountCache(
            coordinator.cache,
            canonicalEnvelope,
          )
          try {
            writeAccountCache(coordinator.key, rollback)
          } catch (storageError) {
            coordinator.cache = rollback
            coordinator.rollbackError = toError(error)
            coordinator.rollbackPending = true
            coordinator.retryRequested = true
            publish({
              ...snapshot,
              envelope: rollback.envelope,
              error: toError(storageError),
              notification: syncRejectionNotification(error),
            })
            return
          }
          coordinator.cache = rollback
          coordinator.syncFailed = false
          publish({
            ...snapshot,
            envelope: rollback.envelope,
            error: toError(error),
            notification: syncRejectionNotification(error),
          })
        } else {
          publish({ ...snapshot, error: toError(error) })
          coordinator.retryRequested = true
        }
        return
      }

      if (activeAccount !== coordinator) return
      const rebased = rebaseAccountCache(
        coordinator.cache,
        canonical,
        sentRevision,
        Date.now(),
      )
      try {
        writeAccountCache(coordinator.key, rebased)
      } catch (error) {
        coordinator.syncFailed = true
        publish({ ...snapshot, error: toError(error) })
        coordinator.retryRequested = true
        return
      }

      coordinator.cache = rebased
      coordinator.retryRequested = false
      coordinator.syncFailed = false
      coordinator.lastSyncedAt = rebased.lastSyncedAt
      publish({ ...snapshot, envelope: rebased.envelope, error: null })
    }
  }

  async function transitionGuestToAccount(subject: string, currentResolution: number) {
    const existingFlight = subjectFlights.get(subject)
    if (existingFlight) await existingFlight
    if (currentResolution !== resolution) return

    const guestRaw = storage.getItem(GUEST_PRACTICE_STATE_KEY)
    const pendingFirstSyncSubject = readFirstSyncSubject(guestRaw)
    const key = accountPracticeStateKey(subject)
    const existing = readAccountCache(storage.getItem(key))
    if (
      pendingFirstSyncSubject &&
      pendingFirstSyncSubject !== subject &&
      !guestPracticeStateConsumed
    ) {
      if (existing) {
        activateAccount(subject, existing, false)
        return
      }
      quarantineAccountState(pendingFirstSyncSubject)
      return
    }

    if (existing) {
      if (currentResolution === resolution) activateAccount(subject, existing)
      return
    }

    guestStore = null
    const guest = getActiveGuestStore().load()
    const resumed = readFirstSyncCache(
      guestRaw,
      subject,
    )
    const coordinator: FirstSyncCoordinator = {
      subject,
      accountKey: key,
      cache: resumed ?? createPendingFirstSyncCache(guest),
      timer: null,
      inFlight: null,
      retryRequested: false,
      syncFailed: false,
    }
    firstSync = coordinator
    publish({
      envelope: coordinator.cache.envelope,
      mode: { kind: "transitioning", subject },
      error: null,
      firstSyncRejected: false,
      notification: snapshot.notification,
    })

    if (!resumed) {
      try {
        writeFirstSyncCache(coordinator)
      } catch (error) {
        coordinator.syncFailed = true
        publish({ ...snapshot, error: toError(error) })
        return
      }
    }

    await startFirstSync(coordinator)
  }

  function writeFirstSyncCache(coordinator: FirstSyncCoordinator) {
    storage.setItem(
      GUEST_PRACTICE_STATE_KEY,
      serializeFirstSyncCache(coordinator.subject, coordinator.cache),
    )
  }

  function clearFirstSyncTimer(coordinator: FirstSyncCoordinator) {
    if (coordinator.timer === null) return
    clearTimeout(coordinator.timer)
    coordinator.timer = null
  }

  function scheduleFirstSync(
    coordinator: FirstSyncCoordinator,
    flush: PracticeStateFlush,
  ) {
    if (firstSync !== coordinator || coordinator.inFlight) return
    clearFirstSyncTimer(coordinator)
    if (flush === "immediate") {
      void startFirstSync(coordinator)
      return
    }

    coordinator.timer = setTimeout(() => {
      coordinator.timer = null
      void startFirstSync(coordinator)
    }, syncDebounceMs)
  }

  function startFirstSync(coordinator: FirstSyncCoordinator) {
    if (coordinator.inFlight) return coordinator.inFlight
    clearFirstSyncTimer(coordinator)
    coordinator.syncFailed = false

    const run = syncFirstPracticeState(coordinator)
    const tracked = run.finally(() => {
      if (coordinator.inFlight === tracked) coordinator.inFlight = null
      if (subjectFlights.get(coordinator.subject) === tracked) {
        subjectFlights.delete(coordinator.subject)
      }
      if (coordinator.retryRequested && firstSync === coordinator) {
        coordinator.retryRequested = false
        scheduleFirstSync(coordinator, "debounced")
      }
      if (firstSync === coordinator) publish({ ...snapshot })
    })
    coordinator.inFlight = tracked
    subjectFlights.set(coordinator.subject, tracked)
    publish({ ...snapshot })
    return tracked
  }

  async function syncFirstPracticeState(coordinator: FirstSyncCoordinator) {
    const sentEnvelope = coordinator.cache.envelope
    const sentRevision = coordinator.cache.revision
    let canonical: PracticeStateEnvelope

    try {
      const response = await postPracticeStateWithAuthentication(
        coordinator.subject,
        sentEnvelope,
        () => firstSync === coordinator,
      )
      if (!response) return
      canonical = response
    } catch (error) {
      if (firstSync !== coordinator) return
      coordinator.syncFailed = true
      if (error instanceof PracticeSessionMismatchError) {
        quarantineAccountState(coordinator.subject)
        publish({ ...snapshot, error })
      } else if (isPermanentSyncRejection(error)) {
        await rejectFirstSync(coordinator, error)
      } else {
        publish({
          envelope: coordinator.cache.envelope,
          mode: { kind: "transitioning", subject: coordinator.subject },
          error: toError(error),
          firstSyncRejected: false,
          notification: snapshot.notification,
        })
        coordinator.retryRequested = true
      }
      return
    }

    if (firstSync !== coordinator) return
    const rebased = rebaseAccountCache(
      coordinator.cache,
      canonical,
      sentRevision,
      Date.now(),
    )
    try {
      writeAccountCache(coordinator.accountKey, rebased)
    } catch (error) {
      coordinator.syncFailed = true
      publish({
        envelope: coordinator.cache.envelope,
        mode: { kind: "transitioning", subject: coordinator.subject },
        error: toError(error),
        firstSyncRejected: false,
        notification: snapshot.notification,
      })
      coordinator.retryRequested = true
      return
    }

    firstSync = null
    activateAccount(coordinator.subject, rebased)
  }

  async function rejectFirstSync(
    coordinator: FirstSyncCoordinator,
    rejection: unknown,
  ) {
    const rejectionResolution = resolution
    const notification = firstSyncRejectionNotification()
    let surfacedError = toError(rejection)
    clearFirstSyncTimer(coordinator)
    const intent: SessionEndIntent = {
      kind: "first-sync-rejection",
      subject: coordinator.subject,
      resolution: rejectionResolution,
      nullObserved: false,
    }
    sessionEndIntent = intent

    let signOutSucceeded = false
    try {
      await auth!.signOut()
      signOutSucceeded = true
    } catch (signOutError) {
      surfacedError = toError(signOutError)
    }
    if (sessionEndIntent === intent) sessionEndIntent = null
    if (
      (signOutSucceeded || intent.nullObserved) &&
      resolution === rejectionResolution
    ) {
      authenticatedSubject = null
      completedSignOutSubject = intent.nullObserved
        ? null
        : coordinator.subject
    }

    if (!signOutSucceeded && !intent.nullObserved) {
      if (firstSync === coordinator && resolution === rejectionResolution) {
        publish({
          envelope: coordinator.cache.envelope,
          mode: { kind: "transitioning", subject: coordinator.subject },
          error: surfacedError,
          firstSyncRejected: true,
          notification: {
            kind: "sync-rejected",
            message: "Your practice state could not be synced to the account. It remains protected on this device, but sign-out could not finish.",
          },
        })
      }
      return
    }

    if (firstSync === coordinator && resolution === rejectionResolution) {
      firstSync = null
      const restoreError = restoreGuestPracticeState(coordinator.cache.envelope)
      if (restoreError) surfacedError = restoreError
      activateGuest(surfacedError, true, notification)
    } else if (snapshot.mode.kind === "guest") {
      publish({
        ...snapshot,
        error: surfacedError,
        firstSyncRejected: true,
        notification,
      })
    }
  }

  function restoreGuestPracticeState(envelope: PracticeStateEnvelope) {
    guestStore = null
    guestPracticeStateConsumed = false
    try {
      storage.setItem(GUEST_PRACTICE_STATE_KEY, JSON.stringify(envelope))
      return null
    } catch (error) {
      return toError(error)
    }
  }

  function deactivateFirstSync() {
    if (!firstSync) return
    clearFirstSyncTimer(firstSync)
    firstSync = null
  }

  function deactivateAccount() {
    if (!activeAccount) return
    clearSyncTimer(activeAccount)
    activeAccount = null
  }

  function deactivateCoordinators() {
    deactivateFirstSync()
    deactivateAccount()
  }

  function quarantineAccountState(subject: string) {
    deactivateCoordinators()
    publish({
      envelope: createEmptyPracticeStateEnvelope(),
      mode: { kind: "reauthenticating", subject },
      error: new Error(
        "Your session ended before syncing finished. Sign in to the same account to resume safely.",
      ),
      firstSyncRejected: false,
      notification: snapshot.notification,
    })
  }

  async function applySession(session: PracticeSession | null) {
    const intent = sessionEndIntent
    if (
      !session &&
      intent &&
      intent.resolution === resolution &&
      intent.subject === authenticatedSubject
    ) {
      intent.nullObserved = true
      authenticatedSubject = null
      completedSignOutSubject = null
      return
    }
    if (session?.subject && session.subject === completedSignOutSubject) {
      return
    }
    if (!session || session.subject !== completedSignOutSubject) {
      completedSignOutSubject = null
    }
    if (
      session?.subject &&
      intent?.nullObserved &&
      session.subject === intent.subject
    ) {
      authenticatedSubject = session.subject
      resolution += 1
      return
    }
    if (
      session?.subject &&
      authenticatedSubject === session.subject &&
      snapshot.mode.kind === "account" &&
      snapshot.mode.subject === session.subject &&
      activeAccount?.subject === session.subject
    ) {
      return
    }

    authenticatedSubject = session?.subject ?? null
    const currentResolution = ++resolution
    pendingSubject = null
    if (!session) {
      const interruptedSubject = activeAccount?.subject ?? firstSync?.subject ??
        (snapshot.mode.kind === "reauthenticating" ? snapshot.mode.subject : null)
      if (interruptedSubject) {
        quarantineAccountState(interruptedSubject)
        return
      }
      const persistedFirstSyncSubject = auth
        ? readFirstSyncSubject(storage.getItem(GUEST_PRACTICE_STATE_KEY))
        : null
      if (persistedFirstSyncSubject) {
        quarantineAccountState(persistedFirstSyncSubject)
        return
      }

      const firstSyncRejected = snapshot.firstSyncRejected
      const rejectionError = firstSyncRejected ? snapshot.error : null
      try {
        activateGuest(
          rejectionError,
          firstSyncRejected,
          firstSyncRejected ? snapshot.notification : null,
        )
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
    deactivateCoordinators()
    publish({
      envelope: createEmptyPracticeStateEnvelope(),
      mode: { kind: "initializing" },
      error: null,
      firstSyncRejected: false,
      notification: snapshot.notification,
    })
  }

  async function postPracticeStateWithAuthentication(
    expectedSubject: string,
    envelope: PracticeStateEnvelope,
    isCurrent: () => boolean,
  ) {
    return await authenticatedPracticeRequest(
      expectedSubject,
      isCurrent,
      (identityToken) => practiceApi!.postPracticeState(identityToken, envelope),
    )
  }

  async function authenticatedPracticeRequest<T>(
    expectedSubject: string,
    isCurrent: () => boolean,
    request: (identityToken: string) => Promise<T>,
  ): Promise<T | null> {
    const identityToken = await auth!.getIdentityToken(expectedSubject)
    if (!isCurrent()) return null

    try {
      return await request(identityToken)
    } catch (error) {
      if (!(error instanceof PracticeApiError) || error.status !== 401) throw error
      if (!isCurrent()) return null
      auth!.invalidateIdentityToken(identityToken)
      const refreshedToken = await auth!.getIdentityToken(expectedSubject)
      if (!isCurrent()) return null
      return await request(refreshedToken)
    }
  }

  async function performPracticeStateReset(): Promise<PracticeDataControlResult> {
    if (dataControlPending || safeSignOutPending) {
      const error = new Error("Another account data action is already in progress.")
      return { status: "blocked", error }
    }
    if (snapshot.mode.kind === "guest") {
      try {
        const envelope = getActiveGuestStore().reset()
        publish({
          envelope,
          mode: { kind: "guest" },
          error: null,
          firstSyncRejected: false,
          notification: snapshot.notification,
        })
        return { status: "completed" }
      } catch (error) {
        const resetError = toError(error)
        publish({ ...snapshot, error: resetError })
        return { status: "blocked", error: resetError }
      }
    }

    if (
      snapshot.mode.kind !== "account" ||
      !activeAccount ||
      activeAccount.subject !== snapshot.mode.subject
    ) {
      const error = new Error("Practice state can only be reset after account state is available.")
      publish({ ...snapshot, error })
      return { status: "blocked", error }
    }

    const coordinator = activeAccount
    if (coordinator.cache.accountDeletionStage === "identity") {
      const error = new Error("Finish deleting the account before using another data control.")
      publish({ ...snapshot, error })
      return { status: "blocked", error }
    }
    const subject = coordinator.subject
    dataControlPending = "reset"
    clearSyncTimer(coordinator)
    publish({ ...snapshot })
    try {
      if (coordinator.inFlight) await coordinator.inFlight
      if (activeAccount !== coordinator || currentMode().kind !== "account") {
        throw new Error("Practice state reset stopped because the authenticated account changed.")
      }

      const deleted = await authenticatedPracticeRequest(
        subject,
        () => activeAccount === coordinator && dataControlPending === "reset",
        (identityToken) => practiceApi!.deletePracticeState(identityToken),
      )
      if (
        deleted === null ||
        activeAccount !== coordinator ||
        currentMode().kind !== "account"
      ) {
        throw new Error("Practice state reset stopped because the authenticated account changed.")
      }

      const emptyCache = createEmptyAccountCache(Date.now())
      coordinator.cache = emptyCache
      coordinator.retryRequested = false
      coordinator.rollbackPending = false
      coordinator.rollbackError = null
      coordinator.syncFailed = false
      coordinator.lastSyncedAt = emptyCache.lastSyncedAt
      publish({
        envelope: emptyCache.envelope,
        mode: { kind: "account", subject },
        error: null,
        firstSyncRejected: false,
        notification: snapshot.notification,
      })
      try {
        storage.removeItem(coordinator.key)
      } catch (removalError) {
        try {
          writeAccountCache(coordinator.key, emptyCache)
        } catch {
          // The in-memory empty state still prevents this process from restoring deleted data.
        }
        throw removalError
      }
      return { status: "completed" }
    } catch (error) {
      const resetError = toError(error)
      publish({ ...snapshot, error: resetError })
      return { status: "blocked", error: resetError }
    } finally {
      dataControlPending = null
      if (activeAccount === coordinator && hasCoordinatorWork(coordinator)) {
        scheduleSync(coordinator, "debounced")
      }
      publish({ ...snapshot })
    }
  }

  async function performAccountDeletion(): Promise<AccountDeletionResult> {
    if (dataControlPending || safeSignOutPending) {
      const error = new Error("Another account data action is already in progress.")
      return { status: "blocked", step: "practice-state", error }
    }
    if (
      !auth ||
      snapshot.mode.kind !== "account" ||
      !activeAccount ||
      activeAccount.subject !== snapshot.mode.subject
    ) {
      const error = new Error("Account deletion can only continue after account state is available.")
      publish({ ...snapshot, error })
      return { status: "blocked", step: "practice-state", error }
    }

    const coordinator = activeAccount
    const subject = coordinator.subject
    dataControlPending = "delete-account"
    clearSyncTimer(coordinator)
    publish({ ...snapshot })
    let step: "practice-state" | "identity" =
      coordinator.cache.accountDeletionStage ?? "practice-state"
    let identityCache = step === "identity" ? coordinator.cache : null
    let intent: SessionEndIntent | null = null
    const deletionResolution = resolution
    try {
      if (coordinator.inFlight) await coordinator.inFlight
      if (activeAccount !== coordinator || currentMode().kind !== "account") {
        throw new Error("Account deletion stopped because the authenticated account changed.")
      }

      if (step === "practice-state") {
        const deleted = await authenticatedPracticeRequest(
          subject,
          () => activeAccount === coordinator && dataControlPending === "delete-account",
          (identityToken) => practiceApi!.deletePracticeState(identityToken),
        )
        if (
          deleted === null ||
          activeAccount !== coordinator ||
          currentMode().kind !== "account"
        ) {
          throw new Error("Account deletion stopped because the authenticated account changed.")
        }

        step = "identity"
        identityCache = createEmptyAccountCache(Date.now(), "identity")
        storage.removeItem(coordinator.key)
        storage.setItem(coordinator.key, serializeAccountCache(identityCache))
        coordinator.cache = identityCache
        coordinator.retryRequested = false
        coordinator.rollbackPending = false
        coordinator.rollbackError = null
        coordinator.syncFailed = false
        coordinator.lastSyncedAt = identityCache.lastSyncedAt
        publish({
          envelope: identityCache.envelope,
          mode: { kind: "account", subject },
          error: null,
          firstSyncRejected: false,
          notification: snapshot.notification,
        })
      }

      const retainedIdentityCache = serializeAccountCache(identityCache!)
      storage.removeItem(coordinator.key)
      intent = {
        kind: "account-deletion",
        subject,
        resolution: deletionResolution,
        nullObserved: false,
      }
      sessionEndIntent = intent
      try {
        await auth.deleteAccount()
      } catch (error) {
        storage.setItem(coordinator.key, retainedIdentityCache)
        throw error
      } finally {
        if (sessionEndIntent === intent) sessionEndIntent = null
      }

      if (resolution !== deletionResolution) {
        return { status: "completed" }
      }
      authenticatedSubject = null
      completedSignOutSubject = intent.nullObserved ? null : subject
      deactivateCoordinators()
      activateGuest(null, false, snapshot.notification)
      return { status: "completed" }
    } catch (error) {
      const deletionError = toError(error)
      if (activeAccount === coordinator && identityCache) {
        coordinator.cache = identityCache
        coordinator.retryRequested = false
        coordinator.rollbackPending = false
        coordinator.rollbackError = null
        coordinator.syncFailed = false
        coordinator.lastSyncedAt = identityCache.lastSyncedAt
        publish({
          envelope: identityCache.envelope,
          mode: { kind: "account", subject },
          error: deletionError,
          firstSyncRejected: false,
          notification: snapshot.notification,
        })
      } else {
        publish({ ...snapshot, error: deletionError })
      }
      return { status: "blocked", step, error: deletionError }
    } finally {
      dataControlPending = null
      if (activeAccount === coordinator && hasCoordinatorWork(coordinator)) {
        scheduleSync(coordinator, "debounced")
      }
      publish({ ...snapshot })
    }
  }

  async function performSafeSignOut(): Promise<SafeSignOutResult> {
    if (dataControlPending) {
      const error = new Error("Sign-out is blocked while an account data action is in progress.")
      return { status: "blocked", error }
    }
    if (!auth) {
      return { status: "signed-out", error: null }
    }
    if (snapshot.mode.kind === "guest") {
      return { status: "signed-out", error: null }
    }
    if (
      snapshot.mode.kind === "account" &&
      activeAccount?.cache.accountDeletionStage === "identity"
    ) {
      const error = new Error("Sign-out is blocked until account deletion finishes.")
      publish({ ...snapshot, error })
      return { status: "blocked", error }
    }
    if (snapshot.mode.kind === "reauthenticating") {
      const recoverySubject = snapshot.mode.subject
      const unrelatedSubject = authenticatedSubject
      if (unrelatedSubject && unrelatedSubject !== recoverySubject) {
        const unrelatedCache = readAccountCache(
          storage.getItem(accountPracticeStateKey(unrelatedSubject)),
        )
        if (unrelatedCache) {
          activateAccount(unrelatedSubject, unrelatedCache, false)
          return await performSafeSignOut()
        }
        setSafeSignOutPending(true)
        try {
          const intent: SessionEndIntent = {
            kind: "safe-sign-out",
            subject: unrelatedSubject,
            resolution,
            nullObserved: false,
          }
          const signOutResolution = resolution
          sessionEndIntent = intent
          try {
            await auth.signOut()
          } catch (error) {
            const signOutError = toError(error)
            if (sessionEndIntent === intent) sessionEndIntent = null
            publish({ ...snapshot, error: signOutError })
            return { status: "blocked", error: signOutError }
          }
          if (sessionEndIntent === intent) sessionEndIntent = null
          if (resolution !== signOutResolution) {
            const error = new Error(
              "Sign-out did not finish because the authenticated account changed.",
            )
            return { status: "blocked", error }
          }
          authenticatedSubject = null
          completedSignOutSubject = intent.nullObserved
            ? null
            : unrelatedSubject
          publish({
            ...snapshot,
            error: new Error(
              "Sign in to the same account to resume the interrupted first sync.",
            ),
          })
          return { status: "signed-out", error: null }
        } finally {
          setSafeSignOutPending(false)
        }
      }
      const error = snapshot.error ?? new Error(
        "Sign in to the same account before signing out safely.",
      )
      return { status: "blocked", error }
    }

    const subject = activeAccount?.subject ?? firstSync?.subject
    if (!subject) {
      const error = new Error("Sign-out is blocked until account state is available.")
      publish({ ...snapshot, error })
      return { status: "blocked", error }
    }

    setSafeSignOutPending(true)
    try {
      await (firstSync
        ? startFirstSync(firstSync)
        : activeAccount
          ? startAccountSync(activeAccount)
          : Promise.resolve())

      const modeAfterFlush = currentMode()
      if (modeAfterFlush.kind === "guest") {
        return { status: "signed-out", error: snapshot.error }
      }
      if (
        modeAfterFlush.kind === "reauthenticating" ||
        !activeAccount ||
        activeAccount?.subject !== subject ||
        hasCoordinatorWork(activeAccount)
      ) {
        const error = snapshot.error ?? new Error(
          "Sign-out is blocked until pending practice state is synced.",
        )
        publish({ ...snapshot, error })
        return { status: "blocked", error }
      }

      const accountKey = accountPracticeStateKey(subject)
      const retainedCache = serializeAccountCache(activeAccount.cache)
      try {
        storage.removeItem(accountKey)
      } catch (error) {
        const removalError = toError(error)
        publish({ ...snapshot, error: removalError })
        return { status: "blocked", error: removalError }
      }

      const intent: SessionEndIntent = {
        kind: "safe-sign-out",
        subject,
        resolution,
        nullObserved: false,
      }
      const signOutResolution = resolution
      sessionEndIntent = intent
      try {
        await auth.signOut()
      } catch (error) {
        let signOutError = toError(error)
        try {
          storage.setItem(accountKey, retainedCache)
        } catch (restoreError) {
          signOutError = toError(restoreError)
        }
        if (sessionEndIntent === intent) sessionEndIntent = null
        if (resolution !== signOutResolution) {
          return { status: "blocked", error: signOutError }
        }
        if (intent.nullObserved) {
          quarantineAccountState(subject)
          publish({ ...snapshot, error: signOutError })
        } else {
          publish({ ...snapshot, error: signOutError })
        }
        return { status: "blocked", error: signOutError }
      }
      if (sessionEndIntent === intent) sessionEndIntent = null
      if (resolution !== signOutResolution) {
        let error = new Error(
          "Sign-out did not finish because the authenticated account changed.",
        )
        try {
          storage.setItem(accountKey, retainedCache)
        } catch (restoreError) {
          error = toError(restoreError)
        }
        return { status: "blocked", error }
      }
      authenticatedSubject = null
      completedSignOutSubject = intent.nullObserved ? null : subject

      deactivateCoordinators()
      activateGuest(null, false, snapshot.notification)
      return { status: "signed-out", error: null }
    } finally {
      setSafeSignOutPending(false)
    }
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
          auth.subscribeSession((session) => {
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
    update(updater, options) {
      if (
        snapshot.mode.kind === "initializing" ||
        snapshot.mode.kind === "reauthenticating"
      ) {
        throw new Error("Practice state is not initialized.")
      }
      if (safeSignOutPending) {
        throw new Error("Practice state cannot change while safe sign-out is in progress.")
      }
      if (dataControlPending) {
        throw new Error("Practice state cannot change while an account data action is in progress.")
      }

      if (snapshot.mode.kind === "transitioning" && firstSync) {
        const nextCache = accountCacheAfterUpdate(
          firstSync.cache,
          updater(firstSync.cache.envelope.state),
        )
        if (nextCache === firstSync.cache) {
          if (options?.flush === "immediate") {
            scheduleFirstSync(firstSync, "immediate")
          }
          return firstSync.cache.envelope
        }

        const nextCoordinator = { ...firstSync, cache: nextCache }
        writeFirstSyncCache(nextCoordinator)
        guestStore = null
        firstSync.cache = nextCache
        publish({ ...snapshot, envelope: nextCache.envelope, error: null })
        scheduleFirstSync(firstSync, options?.flush ?? "debounced")
        return nextCache.envelope
      }

      if (snapshot.mode.kind === "account") {
        const coordinator = activeAccount
        if (!coordinator || coordinator.subject !== snapshot.mode.subject) {
          throw new Error("The active account cache is unavailable.")
        }
        if (coordinator.cache.accountDeletionStage === "identity") {
          throw new Error("Practice state cannot change while account deletion is unfinished.")
        }

        const nextCache = accountCacheAfterUpdate(
          coordinator.cache,
          updater(coordinator.cache.envelope.state),
        )
        if (nextCache === coordinator.cache) {
          if (options?.flush === "immediate") {
            scheduleSync(coordinator, "immediate")
          }
          return coordinator.cache.envelope
        }

        writeAccountCache(coordinator.key, nextCache)
        coordinator.cache = nextCache
        coordinator.rollbackPending = false
        coordinator.rollbackError = null
        publish({ ...snapshot, envelope: nextCache.envelope, error: null })
        scheduleSync(coordinator, options?.flush ?? "debounced")
        return nextCache.envelope
      }

      const next = getActiveGuestStore().save(
        updater(getActiveGuestStore().load().state),
      )
      publish({ ...snapshot, envelope: next, error: null })
      return next
    },
    flush() {
      if (firstSync) return startFirstSync(firstSync)
      if (!activeAccount || !hasCoordinatorWork(activeAccount)) {
        return Promise.resolve()
      }
      return startAccountSync(activeAccount)
    },
    resetPracticeState() {
      if (resetFlight) return resetFlight
      const pending = performPracticeStateReset().finally(() => {
        if (resetFlight === pending) resetFlight = null
      })
      resetFlight = pending
      return pending
    },
    deleteAccount() {
      if (deleteAccountFlight) return deleteAccountFlight
      const pending = performAccountDeletion().finally(() => {
        if (deleteAccountFlight === pending) deleteAccountFlight = null
      })
      deleteAccountFlight = pending
      return pending
    },
    signOutSafely() {
      if (signOutFlight) return signOutFlight
      const pending = performSafeSignOut().finally(() => {
        if (signOutFlight === pending) signOutFlight = null
      })
      signOutFlight = pending
      return pending
    },
    dismissSyncNotification() {
      if (!snapshot.notification) return
      publish({ ...snapshot, notification: null })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function accountCacheAfterUpdate(
  current: AccountPracticeStateCache,
  nextPracticeState: PracticeState,
): AccountPracticeStateCache {
  const nextState: PracticeState = {
    ...nextPracticeState,
    attempts: retainRecentFinishedAttempts(nextPracticeState.attempts),
  }
  const revision = current.revision + 1
  const mutations = mutationsBetween(
    current.envelope.state,
    nextState,
    revision,
  )
  if (!mutations.length) return current

  const journal = coalesceMutations(current.journal, mutations)
  const replayed = replayRetainedMutations(current.canonicalEnvelope, journal)
  const acknowledgedRevision = replayed.journal.length
    ? current.acknowledgedRevision
    : revision

  return {
    envelope: replayed.envelope,
    canonicalEnvelope: current.canonicalEnvelope,
    revision,
    acknowledgedRevision,
    journal: replayed.journal,
    lastSyncedAt: current.lastSyncedAt,
    accountDeletionStage: current.accountDeletionStage,
  }
}

function createPendingFirstSyncCache(
  envelope: PracticeStateEnvelope,
): AccountPracticeStateCache {
  return {
    envelope,
    canonicalEnvelope: envelope,
    revision: 0,
    acknowledgedRevision: 0,
    journal: [],
    lastSyncedAt: null,
    accountDeletionStage: null,
  }
}

function createEmptyAccountCache(
  lastSyncedAt: number,
  accountDeletionStage: "identity" | null = null,
): AccountPracticeStateCache {
  const envelope = createEmptyPracticeStateEnvelope()
  return {
    envelope,
    canonicalEnvelope: envelope,
    revision: 0,
    acknowledgedRevision: 0,
    journal: [],
    lastSyncedAt,
    accountDeletionStage,
  }
}

function rollbackAccountCache(
  current: AccountPracticeStateCache,
  canonicalEnvelope = current.canonicalEnvelope,
): AccountPracticeStateCache {
  return {
    envelope: canonicalEnvelope,
    canonicalEnvelope,
    revision: current.revision,
    acknowledgedRevision: current.revision,
    journal: [],
    lastSyncedAt: current.lastSyncedAt,
    accountDeletionStage: current.accountDeletionStage,
  }
}

function rebaseAccountCache(
  current: AccountPracticeStateCache,
  canonicalEnvelope: PracticeStateEnvelope,
  sentRevision: number,
  acceptedAt: number,
): AccountPracticeStateCache {
  const journal = current.journal
    .filter((mutation) => mutation.revision > sentRevision)
  const replayed = replayRetainedMutations(canonicalEnvelope, journal)
  return {
    envelope: replayed.envelope,
    canonicalEnvelope,
    revision: current.revision,
    acknowledgedRevision: replayed.journal.length ? sentRevision : current.revision,
    journal: replayed.journal,
    lastSyncedAt: acceptedAt,
    accountDeletionStage: current.accountDeletionStage,
  }
}

function mutationsBetween(
  current: PracticeState,
  next: PracticeState,
  revision: number,
): PracticeStateMutation[] {
  const mutations: PracticeStateMutation[] = []
  if (!sameValue(current.activeAttempt, next.activeAttempt)) {
    mutations.push({
      kind: "activeAttempt",
      revision,
      value: next.activeAttempt,
    })
  }

  const currentAttempts = new Map(current.attempts.map((attempt) => [attempt.id, attempt]))
  const nextAttempts = new Map(next.attempts.map((attempt) => [attempt.id, attempt]))
  for (const attemptId of new Set([...currentAttempts.keys(), ...nextAttempts.keys()])) {
    const currentAttempt = currentAttempts.get(attemptId) ?? null
    const nextAttempt = nextAttempts.get(attemptId) ?? null
    if (!sameValue(currentAttempt, nextAttempt)) {
      mutations.push({
        kind: "finishedAttempt",
        revision,
        attemptId,
        value: nextAttempt,
      })
    }
  }

  for (const questionId of new Set([
    ...Object.keys(current.latestAnswers),
    ...Object.keys(next.latestAnswers),
  ])) {
    const currentAnswer = current.latestAnswers[questionId] ?? null
    const nextAnswer = next.latestAnswers[questionId] ?? null
    if (!sameValue(currentAnswer, nextAnswer)) {
      mutations.push({
        kind: "latestAnswer",
        revision,
        questionId,
        value: nextAnswer,
      })
    }
  }

  const currentBookmarks = new Set(current.bookmarks)
  const nextBookmarks = new Set(next.bookmarks)
  for (const questionId of new Set([...currentBookmarks, ...nextBookmarks])) {
    if (currentBookmarks.has(questionId) !== nextBookmarks.has(questionId)) {
      mutations.push({
        kind: "bookmark",
        revision,
        questionId,
        value: nextBookmarks.has(questionId),
      })
    }
  }

  return mutations
}

function coalesceMutations(
  current: PracticeStateMutation[],
  next: PracticeStateMutation[],
) {
  const replacements = new Map(next.map((mutation) => [mutationPath(mutation), mutation]))
  return [
    ...current.filter((mutation) => !replacements.has(mutationPath(mutation))),
    ...next,
  ]
}

function replayMutations(
  canonical: PracticeStateEnvelope,
  journal: PracticeStateMutation[],
): PracticeStateEnvelope {
  let activeAttempt = canonical.state.activeAttempt
  let activeAttemptReceivedAt = canonical.receipts.activeAttemptReceivedAt
  const attempts = new Map(canonical.state.attempts.map((attempt) => [attempt.id, attempt]))
  const finishedAttempts = { ...canonical.receipts.finishedAttempts }
  const latestAnswers = { ...canonical.state.latestAnswers }
  const latestAnswerReceipts = { ...canonical.receipts.latestAnswers }
  const bookmarkSet = new Set(canonical.state.bookmarks)
  const bookmarks = { ...canonical.receipts.bookmarks }

  for (const mutation of [...journal].sort((left, right) => left.revision - right.revision)) {
    switch (mutation.kind) {
      case "activeAttempt":
        activeAttempt = mutation.value
        activeAttemptReceivedAt = undefined
        break
      case "finishedAttempt":
        if (mutation.value) {
          attempts.set(mutation.attemptId, mutation.value)
        } else {
          attempts.delete(mutation.attemptId)
        }
        delete finishedAttempts[mutation.attemptId]
        break
      case "latestAnswer":
        if (mutation.value) {
          latestAnswers[mutation.questionId] = mutation.value
        } else {
          delete latestAnswers[mutation.questionId]
        }
        delete latestAnswerReceipts[mutation.questionId]
        break
      case "bookmark":
        if (mutation.value) {
          bookmarkSet.add(mutation.questionId)
        } else {
          bookmarkSet.delete(mutation.questionId)
        }
        bookmarks[mutation.questionId] = { isBookmarked: mutation.value }
        break
    }
  }

  const retainedAttempts = retainRecentFinishedAttempts([...attempts.values()])
  const retainedAttemptIds = new Set(retainedAttempts.map((attempt) => attempt.id))
  const retainedFinishedAttemptReceipts = Object.fromEntries(
    Object.entries(finishedAttempts)
      .filter(([attemptId]) => retainedAttemptIds.has(attemptId)),
  )

  return {
    schemaVersion: 2,
    state: {
      activeAttempt,
      attempts: retainedAttempts,
      bookmarks: [...bookmarkSet],
      latestAnswers,
    },
    receipts: {
      ...(activeAttemptReceivedAt ? { activeAttemptReceivedAt } : {}),
      finishedAttempts: retainedFinishedAttemptReceipts,
      bookmarks,
      latestAnswers: latestAnswerReceipts,
    },
  }
}

function replayRetainedMutations(
  canonical: PracticeStateEnvelope,
  journal: PracticeStateMutation[],
) {
  const canonicalFinishedAttemptIds = new Set(
    canonical.state.attempts.map((attempt) => attempt.id),
  )
  let conflictFreeJournal = journal.filter((mutation) => (
    mutation.kind !== "activeAttempt" ||
    !mutation.value ||
    !canonicalFinishedAttemptIds.has(mutation.value.id)
  ))
  const canonicalActiveAttempt = canonical.state.activeAttempt
  if (canonicalActiveAttempt) {
    const matchingFinish = conflictFreeJournal.find((mutation) => (
      mutation.kind === "finishedAttempt" &&
      mutation.value?.id === canonicalActiveAttempt.id
    ))
    const activeMutation = conflictFreeJournal.find((mutation) => (
      mutation.kind === "activeAttempt"
    ))
    if (
      matchingFinish &&
      (
        !activeMutation ||
        activeMutation.value?.id === canonicalActiveAttempt.id
      )
    ) {
      conflictFreeJournal = [
        ...conflictFreeJournal.filter((mutation) => mutation.kind !== "activeAttempt"),
        {
          kind: "activeAttempt",
          revision: Math.max(matchingFinish.revision, activeMutation?.revision ?? 0),
          value: null,
        },
      ]
    }
  }
  let envelope = replayMutations(canonical, conflictFreeJournal)
  const retainedJournal = conflictFreeJournal.filter((mutation) => (
    mutation.kind !== "finishedAttempt" ||
    mutationMatchesEnvelope(mutation, envelope)
  ))
  if (retainedJournal.length !== conflictFreeJournal.length) {
    envelope = replayMutations(canonical, retainedJournal)
  }
  return { envelope, journal: retainedJournal }
}

function mutationPath(mutation: PracticeStateMutation) {
  switch (mutation.kind) {
    case "activeAttempt":
      return "activeAttempt"
    case "finishedAttempt":
      return `finishedAttempt:${mutation.attemptId}`
    case "latestAnswer":
      return `latestAnswer:${mutation.questionId}`
    case "bookmark":
      return `bookmark:${mutation.questionId}`
  }
}

function mutationMatchesEnvelope(
  mutation: PracticeStateMutation,
  envelope: PracticeStateEnvelope,
) {
  switch (mutation.kind) {
    case "activeAttempt":
      return sameValue(mutation.value, envelope.state.activeAttempt)
    case "finishedAttempt":
      return sameValue(
        mutation.value,
        envelope.state.attempts.find((attempt) => attempt.id === mutation.attemptId) ?? null,
      )
    case "latestAnswer":
      return sameValue(
        mutation.value,
        envelope.state.latestAnswers[mutation.questionId] ?? null,
      )
    case "bookmark":
      return mutation.value === envelope.state.bookmarks.includes(mutation.questionId)
  }
}

function hasPendingMutations(cache: AccountPracticeStateCache) {
  return cache.journal.length > 0
}

function hasCompleteReceipts(envelope: PracticeStateEnvelope) {
  if (
    envelope.state.activeAttempt &&
    !envelope.receipts.activeAttemptReceivedAt
  ) {
    return false
  }
  if (
    envelope.state.attempts.some(
      (attempt) => !envelope.receipts.finishedAttempts[attempt.id],
    )
  ) {
    return false
  }
  if (
    Object.keys(envelope.state.latestAnswers).some(
      (questionId) => !envelope.receipts.latestAnswers[questionId],
    )
  ) {
    return false
  }
  const bookmarkIds = new Set([
    ...envelope.state.bookmarks,
    ...Object.keys(envelope.receipts.bookmarks),
  ])
  return [...bookmarkIds].every(
    (questionId) => Boolean(envelope.receipts.bookmarks[questionId]?.receivedAt),
  )
}

function hasCoordinatorWork(coordinator: AccountSyncCoordinator) {
  return coordinator.rollbackPending || hasPendingMutations(coordinator.cache)
}

function serializeAccountCache(cache: AccountPracticeStateCache) {
  return JSON.stringify({
    ...cache.envelope,
    sync: {
      version: ACCOUNT_SYNC_CACHE_VERSION,
      canonicalEnvelope: cache.canonicalEnvelope,
      revision: cache.revision,
      acknowledgedRevision: cache.acknowledgedRevision,
      journal: cache.journal,
      lastSyncedAt: cache.lastSyncedAt,
      ...(cache.accountDeletionStage
        ? { accountDeletionStage: cache.accountDeletionStage }
        : {}),
    },
  })
}

function serializeFirstSyncCache(
  subject: string,
  cache: AccountPracticeStateCache,
) {
  return JSON.stringify({
    ...cache.envelope,
    firstSync: {
      version: FIRST_SYNC_CACHE_VERSION,
      subject,
      canonicalEnvelope: cache.canonicalEnvelope,
      revision: cache.revision,
      acknowledgedRevision: cache.acknowledgedRevision,
      journal: cache.journal,
      lastSyncedAt: cache.lastSyncedAt,
    },
  })
}

function readAccountCache(raw: string | null): AccountPracticeStateCache | null {
  const envelope = readEnvelope(raw)
  if (!envelope || raw === null) return null

  let parsed: JsonRecord | null
  try {
    parsed = asRecord(JSON.parse(raw))
  } catch {
    return null
  }
  const sync = asRecord(parsed?.sync)
  if (!sync) return migrateLegacyAccountCache(envelope)
  if (sync.version !== ACCOUNT_SYNC_CACHE_VERSION) return null
  return readCacheMetadata(sync, envelope)
}

function readFirstSyncCache(
  raw: string | null,
  subject: string,
): AccountPracticeStateCache | null {
  const envelope = readEnvelope(raw)
  if (!envelope || raw === null) return null

  let parsed: JsonRecord | null
  try {
    parsed = asRecord(JSON.parse(raw))
  } catch {
    return null
  }
  const firstSync = asRecord(parsed?.firstSync)
  if (
    !firstSync ||
    firstSync.version !== FIRST_SYNC_CACHE_VERSION ||
    firstSync.subject !== subject
  ) {
    return null
  }
  return readCacheMetadata(firstSync, envelope)
}

function readFirstSyncSubject(raw: string | null) {
  const envelope = readEnvelope(raw)
  if (!envelope || raw === null) return null

  let parsed: JsonRecord | null
  try {
    parsed = asRecord(JSON.parse(raw))
  } catch {
    return null
  }
  const firstSync = asRecord(parsed?.firstSync)
  if (
    !firstSync ||
    firstSync.version !== FIRST_SYNC_CACHE_VERSION ||
    typeof firstSync.subject !== "string" ||
    !readCacheMetadata(firstSync, envelope)
  ) {
    return null
  }
  return firstSync.subject
}

function readCacheMetadata(
  metadata: JsonRecord,
  envelope: PracticeStateEnvelope,
): AccountPracticeStateCache | null {
  const canonicalEnvelope = readEnvelopeValue(metadata.canonicalEnvelope)
  const revision = readNonNegativeInteger(metadata.revision)
  const acknowledgedRevision = readNonNegativeInteger(metadata.acknowledgedRevision)
  const storedLastSyncedAt = metadata.lastSyncedAt === null
    ? null
    : readNonNegativeInteger(metadata.lastSyncedAt)
  if (
    !canonicalEnvelope ||
    revision === null ||
    acknowledgedRevision === null ||
    acknowledgedRevision > revision ||
    (metadata.lastSyncedAt !== undefined &&
      metadata.lastSyncedAt !== null &&
      storedLastSyncedAt === null)
  ) {
    return null
  }
  const lastSyncedAt = metadata.lastSyncedAt === undefined
    ? mostRecentReceiptTime(canonicalEnvelope)
    : storedLastSyncedAt
  const accountDeletionStage = metadata.accountDeletionStage === undefined
    ? null
    : metadata.accountDeletionStage === "identity"
      ? "identity"
      : undefined
  if (accountDeletionStage === undefined) return null

  const journal = readMutationJournal(
    metadata.journal,
    envelope,
    acknowledgedRevision,
    revision,
  )
  if (!journal) return null
  const replayed = replayMutations(canonicalEnvelope, journal)
  if (!sameValue(replayed, envelope)) return null
  if (
    accountDeletionStage === "identity" &&
    (
      journal.length > 0 ||
      !sameValue(envelope, createEmptyPracticeStateEnvelope()) ||
      !sameValue(canonicalEnvelope, createEmptyPracticeStateEnvelope())
    )
  ) {
    return null
  }

  return {
    envelope,
    canonicalEnvelope,
    revision,
    acknowledgedRevision,
    journal,
    lastSyncedAt,
    accountDeletionStage,
  }
}

function migrateLegacyAccountCache(
  envelope: PracticeStateEnvelope,
): AccountPracticeStateCache {
  const journal = mutationsMissingReceipts(envelope)
  return {
    envelope,
    canonicalEnvelope: envelope,
    revision: journal.length ? 1 : 0,
    acknowledgedRevision: 0,
    journal,
    lastSyncedAt: mostRecentReceiptTime(envelope),
    accountDeletionStage: null,
  }
}

function mutationsMissingReceipts(
  envelope: PracticeStateEnvelope,
): PracticeStateMutation[] {
  const mutations: PracticeStateMutation[] = []
  if (envelope.state.activeAttempt && !envelope.receipts.activeAttemptReceivedAt) {
    mutations.push({
      kind: "activeAttempt",
      revision: 1,
      value: envelope.state.activeAttempt,
    })
  }
  for (const attempt of envelope.state.attempts) {
    if (!envelope.receipts.finishedAttempts[attempt.id]) {
      mutations.push({
        kind: "finishedAttempt",
        revision: 1,
        attemptId: attempt.id,
        value: attempt,
      })
    }
  }
  for (const [questionId, value] of Object.entries(envelope.state.latestAnswers)) {
    if (!envelope.receipts.latestAnswers[questionId]) {
      mutations.push({
        kind: "latestAnswer",
        revision: 1,
        questionId,
        value,
      })
    }
  }
  const visibleBookmarks = new Set(envelope.state.bookmarks)
  for (const questionId of new Set([
    ...visibleBookmarks,
    ...Object.keys(envelope.receipts.bookmarks),
  ])) {
    if (!envelope.receipts.bookmarks[questionId]?.receivedAt) {
      mutations.push({
        kind: "bookmark",
        revision: 1,
        questionId,
        value: visibleBookmarks.has(questionId),
      })
    }
  }
  return mutations
}

function readMutationJournal(
  value: unknown,
  envelope: PracticeStateEnvelope,
  acknowledgedRevision: number,
  revision: number,
): PracticeStateMutation[] | null {
  if (!Array.isArray(value)) return null

  const journal: PracticeStateMutation[] = []
  const paths = new Set<string>()
  for (const entry of value) {
    const record = asRecord(entry)
    const mutationRevision = readNonNegativeInteger(record?.revision)
    if (
      !record ||
      mutationRevision === null ||
      mutationRevision <= acknowledgedRevision ||
      mutationRevision > revision
    ) {
      return null
    }

    let mutation: PracticeStateMutation
    if (record.kind === "activeAttempt") {
      const expected = envelope.state.activeAttempt
      if (!sameValue(record.value, expected)) return null
      mutation = { kind: "activeAttempt", revision: mutationRevision, value: expected }
    } else if (record.kind === "finishedAttempt" && typeof record.attemptId === "string") {
      const expected = envelope.state.attempts
        .find((attempt) => attempt.id === record.attemptId) ?? null
      if (!sameValue(record.value, expected)) return null
      mutation = {
        kind: "finishedAttempt",
        revision: mutationRevision,
        attemptId: record.attemptId,
        value: expected,
      }
    } else if (record.kind === "latestAnswer" && typeof record.questionId === "string") {
      const expected = envelope.state.latestAnswers[record.questionId] ?? null
      if (!sameValue(record.value, expected)) return null
      mutation = {
        kind: "latestAnswer",
        revision: mutationRevision,
        questionId: record.questionId,
        value: expected,
      }
    } else if (record.kind === "bookmark" && typeof record.questionId === "string") {
      const expected = envelope.state.bookmarks.includes(record.questionId)
      if (record.value !== expected) return null
      mutation = {
        kind: "bookmark",
        revision: mutationRevision,
        questionId: record.questionId,
        value: expected,
      }
    } else {
      return null
    }

    const path = mutationPath(mutation)
    if (paths.has(path)) return null
    paths.add(path)
    journal.push(mutation)
  }

  if (!journal.length && acknowledgedRevision !== revision) return null
  return journal
}

function readEnvelopeValue(value: unknown) {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? null : readEnvelope(serialized)
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null
}

function isPermanentSyncRejection(error: unknown) {
  return error instanceof PracticeApiError && [400, 413, 415].includes(error.status)
}

function syncRejectionNotification(error: unknown): PracticeSyncNotification {
  const practiceError = error instanceof PracticeApiError ? error : null
  const detail = (() => {
    switch (practiceError?.code) {
      case "unsupported_schema_version":
        return "This app version could not sync the latest changes."
      case "practice_state_too_large":
        return "The latest changes were too large to sync."
      case "unsupported_media_type":
        return "The sync service did not accept the practice-state format."
      case "malformed_json":
        return "The sync service could not read the latest changes."
      case "invalid_practice_state":
        return "The latest changes were not valid."
      default:
        return practiceError?.status === 413
          ? "The latest changes were too large to sync."
          : practiceError?.status === 415
            ? "The sync service did not accept the practice-state format."
            : "The latest changes could not be synced."
    }
  })()
  return {
    kind: "sync-rejected",
    message: `${detail} The last synced practice state has been restored.`,
  }
}

function firstSyncRejectionNotification(): PracticeSyncNotification {
  return {
    kind: "sync-rejected",
    message: "Your practice state could not be synced to the account, so sign-in was ended. Your guest practice remains saved on this device.",
  }
}

export function syncStatusWithConnectivity(
  status: PracticeSyncStatus,
  online: boolean,
): PracticeSyncStatus {
  if (online || status.kind === "guest" || status.kind === "signing-out") {
    return status
  }
  return { kind: "offline" }
}

function mostRecentReceiptTime(envelope: PracticeStateEnvelope) {
  const receipts = [
    envelope.receipts.activeAttemptReceivedAt,
    ...Object.values(envelope.receipts.finishedAttempts),
    ...Object.values(envelope.receipts.latestAnswers),
    ...Object.values(envelope.receipts.bookmarks)
      .map((receipt) => receipt.receivedAt),
  ]
  const times = receipts
    .filter((receipt): receipt is string => typeof receipt === "string")
    .map((receipt) => Date.parse(receipt))
    .filter(Number.isFinite)
  return times.length ? Math.max(...times) : null
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
