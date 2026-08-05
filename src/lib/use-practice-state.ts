import { useCallback, useEffect, useSyncExternalStore } from "react"
import { browserPracticeAuth } from "@/lib/auth-client"
import {
  createBrowserPracticeStateStore,
  syncStatusWithConnectivity,
} from "@/lib/persistence"
import { createPracticeApi } from "@/lib/practice-api"
import type { PracticeStateFlush } from "@/lib/persistence"
import type { PracticeState } from "@/types"

let practiceStateStore: ReturnType<typeof createBrowserPracticeStateStore> | null = null

function subscribeConnectivity(listener: () => void) {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

function readConnectivity() {
  return navigator.onLine
}

function getPracticeStateStore() {
  if (!practiceStateStore) {
    practiceStateStore = createBrowserPracticeStateStore(
      import.meta.env.ACN_FDE_FULL_STACK
        ? {
            storage: window.localStorage,
            auth: browserPracticeAuth,
            practiceApi: createPracticeApi(),
          }
        : { storage: window.localStorage },
    )
    void practiceStateStore.initialize()
  }
  return practiceStateStore
}

export function usePracticeState() {
  const store = getPracticeStateStore()
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  const online = useSyncExternalStore(
    subscribeConnectivity,
    readConnectivity,
    () => true,
  )
  const updatePracticeState = useCallback((
    updater: (current: PracticeState) => PracticeState,
    options?: { flush?: PracticeStateFlush },
  ) => {
    store.update(updater, options)
  }, [store])
  const flush = useCallback(() => store.flush(), [store])
  const resetPracticeState = useCallback(() => store.resetPracticeState(), [store])
  const deleteAccount = useCallback(() => store.deleteAccount(), [store])
  const signOutSafely = useCallback(() => store.signOutSafely(), [store])
  const dismissSyncNotification = useCallback(
    () => store.dismissSyncNotification(),
    [store],
  )

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void store.flush()
    }
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => document.removeEventListener("visibilitychange", flushWhenHidden)
  }, [store])

  return {
    practiceState: snapshot.envelope.state,
    practiceMode: snapshot.mode,
    syncStatus: syncStatusWithConnectivity(snapshot.syncStatus, online),
    accountDeletionStage: snapshot.accountDeletionStage,
    accountAvailable: import.meta.env.ACN_FDE_FULL_STACK,
    updatePracticeState,
    flush,
    resetPracticeState,
    deleteAccount,
    signOutSafely,
    syncNotification: snapshot.notification,
    dismissSyncNotification,
    isInitializing: snapshot.mode.kind === "initializing",
  }
}
