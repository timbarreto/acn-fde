import { afterEach, describe, expect, it, vi } from "vitest"
import {
  INTERFACE_LANGUAGE_STORAGE_KEY,
  MESSAGE_KEYS,
  QUESTION_BANK_LANG,
  attemptTitle,
  createLocalizationStore,
  englishCatalog,
  germanCatalog,
  spanishCatalog,
  type InterfaceLanguage,
  type LocalizationEnvironment,
} from "@/lib/localization"
import type { Formatters } from "@/lib/localization-messages"

function createTestEnvironment(options?: {
  stored?: unknown
  languages?: readonly string[]
  failWrite?: boolean
  failRead?: boolean
}): LocalizationEnvironment & {
  documentLanguage: InterfaceLanguage | null
  documentTitle: string | null
  documentDescription: string | null
  storedValue: unknown
  emitPreference: (value: unknown) => void
} {
  let storedValue: unknown = options?.stored
  const preferenceListeners = new Set<(value: unknown) => void>()
  const environment = {
    documentLanguage: null as InterfaceLanguage | null,
    documentTitle: null as string | null,
    documentDescription: null as string | null,
    get storedValue() {
      return storedValue
    },
    set storedValue(value: unknown) {
      storedValue = value
    },
    emitPreference(value: unknown) {
      storedValue = value
      for (const listener of preferenceListeners) listener(value)
    },
    readPreference() {
      if (options?.failRead) throw new Error("storage read failed")
      return storedValue
    },
    writePreference(language: InterfaceLanguage) {
      if (options?.failWrite) throw new Error("storage write failed")
      storedValue = language
    },
    requestedLanguages() {
      return options?.languages ?? []
    },
    applyDocumentLanguage(language: InterfaceLanguage) {
      environment.documentLanguage = language
    },
    applyDocumentMetadata(metadata: { title: string; description: string }) {
      environment.documentTitle = metadata.title
      environment.documentDescription = metadata.description
    },
    subscribeToPreference(listener: (value: unknown) => void) {
      preferenceListeners.add(listener)
      return () => preferenceListeners.delete(listener)
    },
  }
  return environment
}

describe("localization store", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses the first supported browser language on first use", () => {
    const environment = createTestEnvironment({
      languages: ["fr-FR", "es-MX", "de"],
    })
    const store = createLocalizationStore(environment)

    expect(store.getSnapshot()).toEqual({
      language: "es",
      source: "detected",
      persistence: "ready",
    })
    expect(environment.documentLanguage).toBe("es")
    expect(environment.storedValue).toBeUndefined()
    expect(store.text("account.language.label")).toBe("Idioma de la interfaz")
  })

  it("falls back to English when no browser language is supported", () => {
    const environment = createTestEnvironment({
      languages: ["fr-FR", "pt-BR"],
    })
    const store = createLocalizationStore(environment)

    expect(store.getSnapshot()).toEqual({
      language: "en",
      source: "fallback",
      persistence: "ready",
    })
    expect(environment.documentLanguage).toBe("en")
    expect(environment.storedValue).toBeUndefined()
    expect(store.text("account.language.label")).toBe("Interface language")
  })

  it("treats an absent or invalid stored value as no explicit preference", () => {
    for (const stored of [undefined, null, "", "fr", "EN", 2]) {
      const environment = createTestEnvironment({
        stored,
        languages: ["de-AT"],
      })
      const store = createLocalizationStore(environment)

      expect(store.getSnapshot()).toMatchObject({
        language: "de",
        source: "detected",
      })
      expect(environment.storedValue).toBe(stored)
    }
  })

  it("uses a valid stored choice ahead of browser languages", () => {
    const environment = createTestEnvironment({
      stored: "de",
      languages: ["es-ES"],
    })
    const store = createLocalizationStore(environment)

    expect(store.getSnapshot()).toEqual({
      language: "de",
      source: "stored",
      persistence: "ready",
    })
    expect(store.text("practice.setup.questionBankNotice")).toBe(
      "Übungsfragen und Erklärungen bleiben auf Englisch.",
    )
  })

  it("formats semantic application state with the active interface locale", () => {
    const store = createLocalizationStore(
      createTestEnvironment({ stored: "de" }),
    )
    const acceptedAt = Date.UTC(2025, 0, 2, 12)
    const now = acceptedAt + 120_000
    const date = new Intl.DateTimeFormat("de", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(acceptedAt)
    const dateTime = new Intl.DateTimeFormat("de", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(acceptedAt)
    const relative = new Intl.RelativeTimeFormat("de", {
      numeric: "auto",
    }).format(-2, "minute")
    const count = new Intl.NumberFormat("de", {
      maximumFractionDigits: 0,
    }).format(1_234)

    expect(store.text("sync.status.acceptedAt", { acceptedAt, now })).toBe(relative)
    expect(store.text("sync.status.title", { acceptedAt })).toContain(dateTime)
    expect(store.text("review.attempt.finishedAt", { finishedAt: acceptedAt })).toBe(date)
    expect(store.text("review.attempt.questionCount", { count: 1_234 })).toBe(
      `${count} Fragen`,
    )
  })

  it("formats singular and plural question counts in each catalog", () => {
    const expected = {
      en: ["1 question", "2 questions"],
      es: ["1 pregunta", "2 preguntas"],
      de: ["1 Frage", "2 Fragen"],
    } satisfies Record<InterfaceLanguage, [string, string]>

    for (const language of ["en", "es", "de"] as const) {
      const store = createLocalizationStore(
        createTestEnvironment({ stored: language }),
      )

      expect(store.text("review.attempt.questionCount", { count: 1 })).toBe(
        expected[language][0],
      )
      expect(store.text("review.attempt.questionCount", { count: 2 })).toBe(
        expected[language][1],
      )
    }
  })

  it("persists only an explicit language choice", () => {
    const environment = createTestEnvironment({
      languages: ["es"],
    })
    const store = createLocalizationStore(environment)

    expect(environment.storedValue).toBeUndefined()

    const result = store.setLanguage("de")

    expect(result).toEqual({ status: "persisted" })
    expect(environment.storedValue).toBe("de")
    expect(store.getSnapshot()).toEqual({
      language: "de",
      source: "explicit",
      persistence: "ready",
    })
    expect(environment.documentLanguage).toBe("de")
    expect(store.text("account.language.helper")).toBe(
      "Steuerelemente, Status und Hinweise ändern sich in diesem Browser. Übungsfragen und Erklärungen bleiben auf Englisch. Diese Einstellung wird nicht synchronisiert.",
    )
  })

  it("keeps the selected language when persistence fails", () => {
    const environment = createTestEnvironment({
      languages: ["en"],
      failWrite: true,
    })
    const store = createLocalizationStore(environment)

    const result = store.setLanguage("es")

    expect(result).toEqual({ status: "session-only" })
    expect(store.getSnapshot()).toEqual({
      language: "es",
      source: "explicit",
      persistence: "session-only",
    })
    expect(environment.documentLanguage).toBe("es")
    expect(store.text("account.language.persistenceFailed")).toBe(
      "El idioma seleccionado se aplica en esta visita, pero no se pudo guardar.",
    )
  })

  it("rejects an unsupported language before changing document language", () => {
    const environment = createTestEnvironment({ languages: ["en"] })
    const store = createLocalizationStore(environment)

    expect(() => store.setLanguage("fr" as InterfaceLanguage)).toThrow(
      /unsupported interface language/i,
    )
    expect(environment.documentLanguage).toBe("en")
    expect(environment.storedValue).toBeUndefined()
  })

  it("applies a valid preference from another tab immediately", () => {
    const environment = createTestEnvironment({ languages: ["en"] })
    const store = createLocalizationStore(environment)
    const listener = vi.fn()
    store.subscribe(listener)

    environment.emitPreference("es")

    expect(store.getSnapshot()).toEqual({
      language: "es",
      source: "stored",
      persistence: "ready",
    })
    expect(environment.documentLanguage).toBe("es")
    expect(listener).toHaveBeenCalledOnce()
    expect(store.text("account.language.label")).toBe("Idioma de la interfaz")
  })

  it("re-runs browser detection when another tab removes or corrupts the preference", () => {
    const environment = createTestEnvironment({
      stored: "es",
      languages: ["de-DE"],
    })
    const store = createLocalizationStore(environment)

    environment.emitPreference(null)

    expect(store.getSnapshot()).toEqual({
      language: "de",
      source: "detected",
      persistence: "ready",
    })
    expect(environment.documentLanguage).toBe("de")
    expect(environment.storedValue).toBeNull()

    environment.emitPreference("nope")

    expect(store.getSnapshot()).toEqual({
      language: "de",
      source: "detected",
      persistence: "ready",
    })
    expect(environment.storedValue).toBe("nope")
  })

  it("detects a language after a failed storage read without persisting it", () => {
    const environment = createTestEnvironment({
      languages: ["es-419"],
      failRead: true,
    })
    const store = createLocalizationStore(environment)

    expect(store.getSnapshot()).toMatchObject({
      language: "es",
      source: "detected",
    })
    expect(environment.storedValue).toBeUndefined()
  })

  it("falls back to the English message and emits a diagnostic when a translation is missing", () => {
    const environment = createTestEnvironment({ stored: "es" })
    const store = createLocalizationStore(environment, {
      es: {
        "account.language.label": null,
      },
    })
    const diagnose = vi.spyOn(console, "error").mockImplementation(() => {})

    const value = store.text("account.language.label")

    expect(value).toBe("Interface language")
    expect(diagnose).toHaveBeenCalledOnce()
    expect(String(diagnose.mock.calls[0]?.[0])).toMatch(
      /account\.language\.label.*"es".*English/,
    )
  })

  it("formats an English fallback with the active interface locale", () => {
    const acceptedAt = Date.UTC(2026, 7, 31, 17, 25)
    const environment = createTestEnvironment({ stored: "es" })
    const store = createLocalizationStore(environment, {
      es: {
        "sync.status.title": null,
      },
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const dateTime = new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(acceptedAt)

    expect(store.text("sync.status.title", { acceptedAt })).toBe(
      `Practice state synced ${dateTime}`,
    )
  })

  it("uses an ellipsis and emits diagnostics when the English message is also missing", () => {
    const environment = createTestEnvironment({ stored: "es" })
    const store = createLocalizationStore(environment)
    const diagnose = vi.spyOn(console, "error").mockImplementation(() => {})

    const value = store.text("missing.message" as "account.language.label")

    expect(value).toBe("…")
    expect(value).not.toBe("missing.message")
    expect(diagnose).toHaveBeenCalledTimes(2)
    expect(String(diagnose.mock.calls[0]?.[0])).toMatch(/missing\.message/)
    expect(String(diagnose.mock.calls[1]?.[0])).toMatch(
      /Missing English message.*missing\.message/,
    )
  })

  it("keeps the question-bank language boundary in English", () => {
    expect(QUESTION_BANK_LANG).toBe("en")
    expect(INTERFACE_LANGUAGE_STORAGE_KEY).toBe(
      "agentic-ready-gh600-interface-language",
    )
  })

  it("applies document title and description for the active language", () => {
    const environment = createTestEnvironment({ stored: "es" })
    createLocalizationStore(environment)

    expect(environment.documentTitle).toBe(spanishCatalog["document.title"]())
    expect(environment.documentDescription).toBe(
      spanishCatalog["document.description"](),
    )
  })

  it("renders every catalog message without falling back to the missing-message ellipsis", () => {
    const catalogs = {
      en: englishCatalog,
      es: spanishCatalog,
      de: germanCatalog,
    } as const

    for (const language of ["en", "es", "de"] as const) {
      const catalog = catalogs[language]
      expect(new Set(Object.keys(catalog))).toEqual(new Set(MESSAGE_KEYS))
      for (const key of MESSAGE_KEYS) {
        const message = (
          catalog[key] as (args: typeof catalogArgs, format: Formatters) => string
        )(catalogArgs, unusedFormatters)
        expect(message.length, `${language}:${key}`).toBeGreaterThan(0)
        expect(message, `${language}:${key}`).not.toBe("…")
      }
    }
  })

  it("derives attempt titles from the active catalog", () => {
    const store = createLocalizationStore(createTestEnvironment({ stored: "de" }))

    expect(attemptTitle(store.text, "full")).toBe("Vollständige Übungsprüfung")
    expect(attemptTitle(store.text, "quick")).toBe("Schneller Wissenscheck")
    expect(attemptTitle(store.text, "domain", ["architecture"])).toBe(
      "Architektur & SDLC-Übung",
    )
    expect(attemptTitle(store.text, "domain", ["architecture", "tools"])).toBe(
      "Fokussierte Übung · 2 Prüfungsbereiche",
    )
  })
})

const unusedFormatters: Formatters = {
  date: () => "d",
  dateTime: () => "dt",
  integer: (value) => String(value),
  percent: (value) => `${value}%`,
  relative: () => "r",
}

const catalogArgs = {
  acceptedAt: Date.UTC(2025, 0, 2),
  now: Date.UTC(2025, 0, 2, 0, 2),
  username: "octocat",
  score: 70,
  title: "title",
  number: "01",
  count: 2,
  current: 1,
  total: 2,
  remaining: "1:00",
  short: "short",
  answered: 1,
  correct: 1,
  minutes: 3,
  finishedAt: Date.UTC(2025, 0, 2),
}
