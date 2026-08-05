import { useCallback, useSyncExternalStore } from "react"
import { browserPracticeAuth } from "@/lib/auth-client"
import { createBrowserPracticeStateStore } from "@/lib/persistence"
import { createPracticeApi } from "@/lib/practice-api"
import type { PracticeState } from "@/types"

let practiceStateStore: ReturnType<typeof createBrowserPracticeStateStore> | null = null

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
  const updatePracticeState = useCallback((updater: (current: PracticeState) => PracticeState) => {
    store.update(updater)
  }, [store])

  return {
    practiceState: snapshot.envelope.state,
    updatePracticeState,
    isInitializing: snapshot.mode.kind === "initializing",
  }
}
