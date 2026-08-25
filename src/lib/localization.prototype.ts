/**
 * PROTOTYPE — throw away after choosing the localization architecture.
 *
 * Question: can one typed text interface hide catalog selection, browser
 * language resolution, persistence failures, document language, and Intl
 * formatting while keeping practice state and the English question bank out
 * of the localization seam?
 */

export const SUPPORTED_INTERFACE_LANGUAGES = ["en", "es", "de"] as const

export type InterfaceLanguage =
  (typeof SUPPORTED_INTERFACE_LANGUAGES)[number]

export type LanguageSource =
  | "stored"
  | "detected"
  | "fallback"
  | "explicit"

export interface LocalizationSnapshot {
  language: InterfaceLanguage
  source: LanguageSource
  persistence: "ready" | "session-only"
}

export type LanguageSelectionResult =
  | { status: "persisted" }
  | { status: "session-only" }

export interface LocalizationPrototypeEnvironment {
  readPreference: () => unknown
  writePreference: (language: InterfaceLanguage) => void
  requestedLanguages: () => readonly string[]
  applyDocumentLanguage: (language: InterfaceLanguage) => void
}

type AttemptMode = "full" | "quick" | "domain"
type AccountNotice =
  | "sign-in-failed"
  | "signed-out"
  | "reset-completed"

interface MessageArgs {
  "nav.account": undefined
  "history.summary": {
    finishedAt: number
    questionCount: number
  }
  "sync.elapsed": {
    acceptedAt: number
    now: number
  }
  "account.notice": {
    notice: AccountNotice
  }
  "attempt.label": {
    mode: AttemptMode
    domainCount: number
  }
  "questionBank.notice": undefined
}

export type MessageKey = keyof MessageArgs

export type Text = <Key extends MessageKey>(
  key: Key,
  ...args: MessageArgs[Key] extends undefined
    ? []
    : [args: MessageArgs[Key]]
) => string

export interface LocalizationPrototype {
  getSnapshot: () => LocalizationSnapshot
  subscribe: (listener: () => void) => () => void
  setLanguage: (
    language: InterfaceLanguage,
  ) => LanguageSelectionResult
  text: Text
}

interface Formatters {
  date: (value: number) => string
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
  "nav.account": () => "Account",
  "history.summary": ({ finishedAt, questionCount }, format) =>
    `${format.date(finishedAt)} · ${format.integer(questionCount)} ${
      questionCount === 1 ? "question" : "questions"
    }`,
  "sync.elapsed": ({ acceptedAt, now }, format) =>
    `Synced ${format.relative(acceptedAt, now)}`,
  "account.notice": ({ notice }) => ({
    "sign-in-failed": "GitHub sign-in did not finish.",
    "signed-out": "You are signed out.",
    "reset-completed": "Practice state was deleted.",
  })[notice],
  "attempt.label": ({ mode, domainCount }) => {
    if (mode === "full") return "Full practice exam"
    if (mode === "quick") return "Quick knowledge check"
    return domainCount === 1
      ? "Focused domain drill"
      : `Focused drill · ${domainCount} domains`
  },
  "questionBank.notice": () =>
    "The interface changes language. The question bank remains in English.",
} satisfies Catalog

const spanishCatalog = {
  "nav.account": () => "Cuenta",
  "history.summary": ({ finishedAt, questionCount }, format) =>
    `${format.date(finishedAt)} · ${format.integer(questionCount)} ${
      questionCount === 1 ? "pregunta" : "preguntas"
    }`,
  "sync.elapsed": ({ acceptedAt, now }, format) =>
    `Sincronizado ${format.relative(acceptedAt, now)}`,
  "account.notice": ({ notice }) => ({
    "sign-in-failed": "No se completó el inicio de sesión con GitHub.",
    "signed-out": "Has cerrado sesión.",
    "reset-completed": "Se eliminó el estado de práctica.",
  })[notice],
  "attempt.label": ({ mode, domainCount }) => {
    if (mode === "full") return "Examen de práctica completo"
    if (mode === "quick") return "Comprobación rápida de conocimientos"
    return domainCount === 1
      ? "Práctica centrada en un dominio"
      : `Práctica centrada · ${domainCount} dominios`
  },
  "questionBank.notice": () =>
    "La interfaz cambia de idioma. El banco de preguntas permanece en inglés.",
} satisfies Catalog

const germanCatalog = {
  "nav.account": () => "Konto",
  "history.summary": ({ finishedAt, questionCount }, format) =>
    `${format.date(finishedAt)} · ${format.integer(questionCount)} ${
      questionCount === 1 ? "Frage" : "Fragen"
    }`,
  "sync.elapsed": ({ acceptedAt, now }, format) =>
    `Synchronisiert ${format.relative(acceptedAt, now)}`,
  "account.notice": ({ notice }) => ({
    "sign-in-failed": "Die GitHub-Anmeldung wurde nicht abgeschlossen.",
    "signed-out": "Du bist abgemeldet.",
    "reset-completed": "Der Übungsstand wurde gelöscht.",
  })[notice],
  "attempt.label": ({ mode, domainCount }) => {
    if (mode === "full") return "Vollständige Übungsprüfung"
    if (mode === "quick") return "Kurzer Wissenstest"
    return domainCount === 1
      ? "Übung für einen Themenbereich"
      : `Gezielte Übung · ${domainCount} Themenbereiche`
  },
  "questionBank.notice": () =>
    "Die Sprache der Oberfläche ändert sich. Die Fragenbank bleibt auf Englisch.",
} satisfies Catalog

const catalogs: Record<InterfaceLanguage, Catalog> = {
  en: englishCatalog,
  es: spanishCatalog,
  de: germanCatalog,
}

export function createLocalizationPrototype(
  environment: LocalizationPrototypeEnvironment,
): LocalizationPrototype {
  const listeners = new Set<() => void>()
  let snapshot = initializeSnapshot(environment)
  environment.applyDocumentLanguage(snapshot.language)

  const text: Text = (key, ...args) => {
    const message = catalogs[snapshot.language][key] as (
      value: MessageArgs[typeof key],
      format: Formatters,
    ) => string
    const messageArgs = args[0] as MessageArgs[typeof key]
    return message(messageArgs, createFormatters(snapshot.language))
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setLanguage(language) {
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
      for (const listener of listeners) listener()

      return persistence === "ready"
        ? { status: "persisted" }
        : { status: "session-only" }
    },
    text,
  }
}

function initializeSnapshot(
  environment: LocalizationPrototypeEnvironment,
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

  const detected = detectInterfaceLanguage(
    environment.requestedLanguages(),
  )
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
    const baseLanguage = requestedLanguage
      .trim()
      .toLowerCase()
      .split("-")[0]
    if (isInterfaceLanguage(baseLanguage)) return baseLanguage
  }
  return null
}

function isInterfaceLanguage(
  value: unknown,
): value is InterfaceLanguage {
  return typeof value === "string" &&
    SUPPORTED_INTERFACE_LANGUAGES.includes(
      value as InterfaceLanguage,
    )
}

function createFormatters(
  language: InterfaceLanguage,
): Formatters {
  const date = new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const integer = new Intl.NumberFormat(language, {
    maximumFractionDigits: 0,
  })
  const relative = new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  })

  return {
    date: (value) => date.format(value),
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
}
