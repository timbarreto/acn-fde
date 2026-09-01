import type { AttemptMode, DomainId } from "@/types"
import {
  englishCatalog,
  germanCatalog,
  spanishCatalog,
  type Catalog,
  type Formatters,
  type MessageArgs,
  type MessageKey,
} from "@/lib/localization-messages"

export type { MessageKey }
export {
  englishCatalog,
  germanCatalog,
  spanishCatalog,
} from "@/lib/localization-messages"

export const SUPPORTED_INTERFACE_LANGUAGES = ["en", "es", "de"] as const

export type InterfaceLanguage = (typeof SUPPORTED_INTERFACE_LANGUAGES)[number]

export const INTERFACE_LANGUAGE_STORAGE_KEY = "agentic-ready-gh600-interface-language"
export const QUESTION_BANK_LANG = "en"

export const INTERFACE_LANGUAGE_OPTIONS = [
  { language: "en", endonym: "English" },
  { language: "es", endonym: "Español" },
  { language: "de", endonym: "Deutsch" },
] as const

export type LanguageSource = "stored" | "detected" | "fallback" | "explicit"

export interface LocalizationSnapshot {
  language: InterfaceLanguage
  source: LanguageSource
  persistence: "ready" | "session-only"
}

export type LanguageSelectionResult =
  | { status: "persisted" }
  | { status: "session-only" }

export type Text = <Key extends MessageKey>(
  key: Key,
  ...args: MessageArgs[Key] extends undefined ? [] : [args: MessageArgs[Key]]
) => string

export const DOMAIN_SHORT_KEYS = {
  architecture: "domain.architecture.short",
  tools: "domain.tools.short",
  memory: "domain.memory.short",
  evaluation: "domain.evaluation.short",
  orchestration: "domain.orchestration.short",
  guardrails: "domain.guardrails.short",
} as const satisfies Record<DomainId, MessageKey>

export interface LocalizationStore {
  getSnapshot: () => LocalizationSnapshot
  subscribe: (listener: () => void) => () => void
  setLanguage: (language: InterfaceLanguage) => LanguageSelectionResult
  text: Text
}

export interface LocalizationEnvironment {
  readPreference: () => unknown
  writePreference: (language: InterfaceLanguage) => void
  requestedLanguages: () => readonly string[]
  applyDocumentLanguage: (language: InterfaceLanguage) => void
  applyDocumentMetadata?: (metadata: { title: string; description: string }) => void
  subscribeToPreference?: (listener: (value: unknown) => void) => () => void
}

type CatalogOverrides = {
  [Language in InterfaceLanguage]?: {
    [Key in MessageKey]?: Catalog[Key] | null
  }
}

const catalogs: Record<InterfaceLanguage, Catalog> = {
  en: englishCatalog,
  es: spanishCatalog,
  de: germanCatalog,
}

export const MESSAGE_KEYS = Object.keys(englishCatalog) as MessageKey[]

export function domainShortLabel(text: Text, domain: DomainId) {
  return text(DOMAIN_SHORT_KEYS[domain])
}

export function attemptTitle(
  text: Text,
  mode: AttemptMode,
  domainIds?: readonly DomainId[],
) {
  if (mode === "full") return text("attempt.full")
  if (mode === "quick") return text("attempt.quick")
  if (domainIds?.length === 1) {
    return text("attempt.domain", { short: domainShortLabel(text, domainIds[0]) })
  }
  return text("attempt.focused", { count: domainIds?.length ?? 0 })
}

const formatterCache = new Map<InterfaceLanguage, Formatters>()

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return value === "en" || value === "es" || value === "de"
}

export function questionBankContentProps() {
  return { lang: QUESTION_BANK_LANG } as const
}

export function createLocalizationStore(
  environment: LocalizationEnvironment,
  catalogOverrides?: CatalogOverrides,
): LocalizationStore {
  const listeners = new Set<() => void>()
  let snapshot = resolveSnapshot(environment)
  applyDocument(snapshot.language)

  environment.subscribeToPreference?.((value) => {
    snapshot = snapshotFromPreference(environment, value)
    applyDocument(snapshot.language)
    publish()
  })

  const text: Text = (key, ...args) =>
    readMessage(
      snapshot.language,
      key,
      args[0] as MessageArgs[typeof key],
      catalogOverrides,
    )

  function applyDocument(language: InterfaceLanguage) {
    environment.applyDocumentLanguage(language)
    environment.applyDocumentMetadata?.({
      title: readMessage(language, "document.title", undefined, catalogOverrides),
      description: readMessage(language, "document.description", undefined, catalogOverrides),
    })
  }

  function publish() {
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setLanguage(language) {
      if (!isInterfaceLanguage(language)) {
        throw new Error("Unsupported interface language")
      }

      applyDocument(language)

      let persistence: LocalizationSnapshot["persistence"] = "ready"
      try {
        environment.writePreference(language)
      } catch {
        persistence = "session-only"
      }

      snapshot = {
        language,
        source: "explicit",
        persistence,
      }
      publish()

      return persistence === "ready"
        ? { status: "persisted" }
        : { status: "session-only" }
    },
    text,
  }
}

export function createBrowserLocalizationEnvironment(): LocalizationEnvironment {
  return {
    readPreference() {
      return window.localStorage.getItem(INTERFACE_LANGUAGE_STORAGE_KEY)
    },
    writePreference(language) {
      window.localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, language)
    },
    requestedLanguages() {
      return window.navigator.languages ?? [window.navigator.language]
    },
    applyDocumentLanguage(language) {
      document.documentElement.lang = language
    },
    applyDocumentMetadata({ title, description }) {
      document.title = title
      const meta = document.querySelector('meta[name="description"]')
      meta?.setAttribute("content", description)
    },
    subscribeToPreference(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea && event.storageArea !== window.localStorage) return
        if (event.key !== INTERFACE_LANGUAGE_STORAGE_KEY && event.key !== null) return
        listener(event.newValue)
      }
      window.addEventListener("storage", onStorage)
      return () => window.removeEventListener("storage", onStorage)
    },
  }
}

export function createMemoryLocalizationEnvironment(options?: {
  stored?: unknown
  languages?: readonly string[]
}): LocalizationEnvironment & {
  emitPreference: (value: unknown) => void
} {
  let stored: unknown = options?.stored
  const preferenceListeners = new Set<(value: unknown) => void>()

  return {
    readPreference: () => stored,
    writePreference(language) {
      stored = language
    },
    requestedLanguages: () => options?.languages ?? [],
    applyDocumentLanguage() {},
    subscribeToPreference(listener) {
      preferenceListeners.add(listener)
      return () => {
        preferenceListeners.delete(listener)
      }
    },
    emitPreference(value) {
      stored = value
      for (const listener of preferenceListeners) listener(value)
    },
  }
}

function resolveSnapshot(
  environment: LocalizationEnvironment,
): LocalizationSnapshot {
  try {
    const stored = environment.readPreference()
    if (isInterfaceLanguage(stored)) {
      return {
        language: stored,
        source: "stored",
        persistence: "ready",
      }
    }
  } catch {
    // Browser language detection remains available when storage cannot be read.
  }

  return snapshotFromBrowser(environment)
}

function snapshotFromPreference(
  environment: LocalizationEnvironment,
  value: unknown,
): LocalizationSnapshot {
  if (isInterfaceLanguage(value)) {
    return {
      language: value,
      source: "stored",
      persistence: "ready",
    }
  }
  return snapshotFromBrowser(environment)
}

function snapshotFromBrowser(
  environment: LocalizationEnvironment,
): LocalizationSnapshot {
  const detected = detectInterfaceLanguage(environment.requestedLanguages())
  return {
    language: detected ?? "en",
    source: detected ? "detected" : "fallback",
    persistence: "ready",
  }
}

function detectInterfaceLanguage(
  requestedLanguages: readonly string[],
): InterfaceLanguage | null {
  for (const requestedLanguage of requestedLanguages) {
    const baseLanguage = requestedLanguage.trim().toLowerCase().split("-")[0]
    if (isInterfaceLanguage(baseLanguage)) return baseLanguage
  }
  return null
}

function readMessage<Key extends MessageKey>(
  language: InterfaceLanguage,
  key: Key,
  args: MessageArgs[Key],
  catalogOverrides?: CatalogOverrides,
): string {
  const localized = lookupCatalogEntry(
    catalogs[language],
    language,
    key,
    catalogOverrides,
  )
  if (localized) return localized(args, formattersFor(language))

  console.error(
    `[localization] Missing message "${String(key)}" for language "${language}"; using English.`,
  )
  const english = lookupCatalogEntry(
    catalogs.en,
    "en",
    key,
    catalogOverrides,
  )
  if (english) return english(args, formattersFor(language))

  console.error(`[localization] Missing English message "${String(key)}".`)
  return "…"
}

function lookupCatalogEntry<Key extends MessageKey>(
  catalog: Catalog,
  language: InterfaceLanguage,
  key: Key,
  catalogOverrides?: CatalogOverrides,
): Catalog[Key] | undefined {
  const override = catalogOverrides?.[language]?.[key]
  if (override === null) return undefined
  if (override) return override
  return catalog[key]
}

function formattersFor(language: InterfaceLanguage): Formatters {
  const cached = formatterCache.get(language)
  if (cached) return cached

  const date = new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const dateTime = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const integer = new Intl.NumberFormat(language, {
    maximumFractionDigits: 0,
  })
  const percent = new Intl.NumberFormat(language, {
    style: "percent",
    maximumFractionDigits: 0,
  })
  const relative = new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  })
  const formatters: Formatters = {
    date: (value) => date.format(value),
    dateTime: (value) => dateTime.format(value),
    integer: (value) => integer.format(value),
    percent: (value) => percent.format(value / 100),
    relative: (acceptedAt, now) => {
      const elapsed = Math.max(0, now - acceptedAt)
      if (elapsed < 60_000) return relative.format(0, "second")
      const minutes = Math.floor(elapsed / 60_000)
      if (minutes < 60) return relative.format(-minutes, "minute")
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return relative.format(-hours, "hour")
      return relative.format(-Math.floor(hours / 24), "day")
    },
  }
  formatterCache.set(language, formatters)
  return formatters
}
