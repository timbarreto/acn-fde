import { useCallback, useSyncExternalStore } from "react"
import { createGuestPracticeStateStore } from "@/lib/persistence"
import type { PracticeState } from "@/types"

let guestPracticeStateStore: ReturnType<typeof createGuestPracticeStateStore> | null = null

function getGuestPracticeStateStore() {
  guestPracticeStateStore ??= createGuestPracticeStateStore(window.localStorage)
  return guestPracticeStateStore
}

export function usePracticeState() {
  const store = getGuestPracticeStateStore()
  const envelope = useSyncExternalStore(store.subscribe, store.load, store.load)
  const updatePracticeState = useCallback((updater: (current: PracticeState) => PracticeState) => {
    store.save(updater(store.load().state))
  }, [store])

  return { practiceState: envelope.state, updatePracticeState }
}
