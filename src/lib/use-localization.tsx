import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react"
import {
  createBrowserLocalizationEnvironment,
  createLocalizationStore,
  createMemoryLocalizationEnvironment,
  type LocalizationStore,
} from "@/lib/localization"

const LocalizationContext = createContext<LocalizationStore | null>(null)

let defaultStore: LocalizationStore | null = null

function getDefaultLocalizationStore() {
  if (!defaultStore) {
    defaultStore = createLocalizationStore(
      typeof window === "undefined"
        ? createMemoryLocalizationEnvironment()
        : createBrowserLocalizationEnvironment(),
    )
  }
  return defaultStore
}

export function LocalizationProvider({
  store,
  children,
}: {
  store?: LocalizationStore
  children: ReactNode
}) {
  const resolved = store ?? getDefaultLocalizationStore()
  return (
    <LocalizationContext.Provider value={resolved}>
      {children}
    </LocalizationContext.Provider>
  )
}

// The hook shares the provider's stable module-level localization store.
// eslint-disable-next-line react-refresh/only-export-components
export function useLocalization() {
  const store = useContext(LocalizationContext) ?? getDefaultLocalizationStore()
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  return {
    language: snapshot.language,
    source: snapshot.source,
    persistence: snapshot.persistence,
    setLanguage: store.setLanguage,
    text: store.text,
  }
}
