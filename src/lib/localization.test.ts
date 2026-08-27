import { afterEach, describe, expect, it, vi } from "vitest"
import {
  INTERFACE_LANGUAGE_STORAGE_KEY,
  QUESTION_BANK_LANG,
  createLocalizationStore,
  type InterfaceLanguage,
  type LocalizationEnvironment,
} from "@/lib/localization"

function createTestEnvironment(options?: {
  stored?: unknown
  languages?: readonly string[]
  failWrite?: boolean
  failRead?: boolean
}): LocalizationEnvironment & {
  documentLanguage: InterfaceLanguage | null
  storedValue: unknown
  emitPreference: (value: unknown) => void
} {
  let storedValue: unknown = options?.stored
  const preferenceListeners = new Set<(value: unknown) => void>()
  const environment = {
    documentLanguage: null as InterfaceLanguage | null,
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
    const store = createLocalizationStore(environment)
    const diagnose = vi.spyOn(console, "error").mockImplementation(() => {})

    const value = store.text("missing.message" as "account.language.label")

    expect(value).toBe("…")
    expect(value).not.toBe("missing.message")
    expect(diagnose).toHaveBeenCalled()
    expect(String(diagnose.mock.calls[0]?.[0])).toMatch(/missing\.message/)
  })

  it("keeps the question-bank language boundary in English", () => {
    expect(QUESTION_BANK_LANG).toBe("en")
    expect(INTERFACE_LANGUAGE_STORAGE_KEY).toBe(
      "agentic-ready-gh600-interface-language",
    )
  })
})
