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

interface MessageArgs {
  "account.language.label": undefined
  "account.language.helper": undefined
  "account.language.persistenceFailed": undefined
  "practice.setup.questionBankNotice": undefined
  "sync.status.acceptedAt": { acceptedAt: number; now: number }
  "sync.status.title": { acceptedAt: number }
  "review.attempt.finishedAt": { finishedAt: number }
  "review.attempt.questionCount": { count: number }
}

export type MessageKey = keyof MessageArgs

export type Text = <Key extends MessageKey>(
  key: Key,
  ...args: MessageArgs[Key] extends undefined ? [] : [args: MessageArgs[Key]]
) => string

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
  subscribeToPreference?: (listener: (value: unknown) => void) => () => void
}

interface Formatters {
  date: (value: number) => string
  dateTime: (value: number) => string
  integer: (value: number) => string
  relative: (acceptedAt: number, now: number) => string
}

type Catalog = {
  [Key in MessageKey]: (
    args: MessageArgs[Key],
    format: Formatters,
  ) => string
}

const englishCatalog = {
  "account.language.label": () => "Interface language",
  "account.language.helper": () =>
    "Changes controls, status, and guidance in this browser. Practice question content and explanations remain in English. This preference is not synced.",
  "account.language.persistenceFailed": () =>
    "The selected language applies for this visit but could not be saved.",
  "practice.setup.questionBankNotice": () =>
    "Practice questions and explanations remain in English.",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Practice state synced ${format.dateTime(acceptedAt)}`,
  "review.attempt.finishedAt": ({ finishedAt }, format) =>
    format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "question" : "questions"}`,
} satisfies Catalog

const spanishCatalog = {
  "account.language.label": () => "Idioma de la interfaz",
  "account.language.helper": () =>
    "Cambia los controles, el estado y la orientación en este navegador. El contenido y las explicaciones de las preguntas de práctica permanecen en inglés. Esta preferencia no se sincroniza.",
  "account.language.persistenceFailed": () =>
    "El idioma seleccionado se aplica en esta visita, pero no se pudo guardar.",
  "practice.setup.questionBankNotice": () =>
    "Las preguntas de práctica y las explicaciones permanecen en inglés.",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Estado de práctica sincronizado el ${format.dateTime(acceptedAt)}`,
  "review.attempt.finishedAt": ({ finishedAt }, format) =>
    format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "pregunta" : "preguntas"}`,
} satisfies Catalog

const germanCatalog = {
  "account.language.label": () => "Sprache der Oberfläche",
  "account.language.helper": () =>
    "Steuerelemente, Status und Hinweise ändern sich in diesem Browser. Übungsfragen und Erklärungen bleiben auf Englisch. Diese Einstellung wird nicht synchronisiert.",
  "account.language.persistenceFailed": () =>
    "Die ausgewählte Sprache gilt für diesen Besuch, konnte aber nicht gespeichert werden.",
  "practice.setup.questionBankNotice": () =>
    "Übungsfragen und Erklärungen bleiben auf Englisch.",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Übungsstand synchronisiert am ${format.dateTime(acceptedAt)}`,
  "review.attempt.finishedAt": ({ finishedAt }, format) =>
    format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "Frage" : "Fragen"}`,
} satisfies Catalog

const catalogs: Record<InterfaceLanguage, Catalog> = {
  en: englishCatalog,
  es: spanishCatalog,
  de: germanCatalog,
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
): LocalizationStore {
  const listeners = new Set<() => void>()
  let snapshot = resolveSnapshot(environment)
  environment.applyDocumentLanguage(snapshot.language)
  environment.subscribeToPreference?.((value) => {
    snapshot = snapshotFromPreference(environment, value)
    environment.applyDocumentLanguage(snapshot.language)
    publish()
  })

  const text: Text = (key, ...args) =>
    readMessage(snapshot.language, key, args[0] as MessageArgs[typeof key])

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

      environment.applyDocumentLanguage(language)

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
): string {
  const localized = lookupCatalogEntry(catalogs[language], key)
  if (localized) return localized(args, formattersFor(language))

  console.error(
    `[localization] Missing message "${String(key)}" for language "${language}"; using English.`,
  )
  const english = lookupCatalogEntry(catalogs.en, key)
  if (english) return english(args, formattersFor("en"))

  console.error(`[localization] Missing English message "${String(key)}".`)
  return "…"
}

function lookupCatalogEntry<Key extends MessageKey>(
  catalog: Catalog,
  key: Key,
): Catalog[Key] | undefined {
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
  const relative = new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  })
  const formatters: Formatters = {
    date: (value) => date.format(value),
    dateTime: (value) => dateTime.format(value),
    integer: (value) => integer.format(value),
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
