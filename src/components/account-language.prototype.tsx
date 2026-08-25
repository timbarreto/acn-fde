/**
 * PROTOTYPE — three Account language-control variants on
 * `/account?variant=A|B|C`, with a development-only switcher.
 */

import { useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Globe2,
  Languages,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

const variants = [
  { id: "A", name: "Dedicated preference card" },
  { id: "B", name: "Compact settings row" },
  { id: "C", name: "Content-boundary first" },
] as const

const languages = [
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
  { id: "de", name: "Deutsch" },
] as const

type PrototypeVariant = (typeof variants)[number]["id"]
type PrototypeLanguage = (typeof languages)[number]["id"]

const prototypeCopy = {
  en: {
    title: "Interface language",
    description: "Choose the language used for controls, status, and guidance.",
    browserOnly: "This preference belongs to this browser and is not synced.",
    questionBank: "Questions, options, and explanations remain in English.",
    setupNotice: "Practice questions remain in English.",
    current: "The interface is now in English.",
  },
  es: {
    title: "Idioma de la interfaz",
    description: "Elige el idioma de los controles, el estado y la orientación.",
    browserOnly: "Esta preferencia pertenece a este navegador y no se sincroniza.",
    questionBank: "Las preguntas, opciones y explicaciones permanecen en inglés.",
    setupNotice: "Las preguntas de práctica permanecen en inglés.",
    current: "La interfaz ahora está en español.",
  },
  de: {
    title: "Sprache der Oberfläche",
    description: "Wähle die Sprache für Bedienelemente, Status und Hinweise.",
    browserOnly: "Diese Einstellung gilt für diesen Browser und wird nicht synchronisiert.",
    questionBank: "Fragen, Optionen und Erklärungen bleiben auf Englisch.",
    setupNotice: "Die Übungsfragen bleiben auf Englisch.",
    current: "Die Oberfläche ist jetzt auf Deutsch.",
  },
} satisfies Record<PrototypeLanguage, {
  title: string
  description: string
  browserOnly: string
  questionBank: string
  setupNotice: string
  current: string
}>

export function AccountLanguagePrototype() {
  const [variant, setVariant] = useState<PrototypeVariant | null>(
    readVariant,
  )
  const [language, setLanguage] = useState<PrototypeLanguage>("en")

  useEffect(() => {
    const syncVariant = () => setVariant(readVariant())
    window.addEventListener("popstate", syncVariant)
    return () => window.removeEventListener("popstate", syncVariant)
  }, [])

  useEffect(() => {
    if (!variant) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        selectVariant(previousVariant(variant), setVariant)
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        selectVariant(nextVariant(variant), setVariant)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [variant])

  if (!import.meta.env.DEV || !variant) return null

  const copy = prototypeCopy[language]

  return (
    <>
      {variant === "A" && (
        <VariantA
          language={language}
          copy={copy}
          onLanguage={setLanguage}
        />
      )}
      {variant === "B" && (
        <VariantB
          language={language}
          copy={copy}
          onLanguage={setLanguage}
        />
      )}
      {variant === "C" && (
        <VariantC
          language={language}
          copy={copy}
          onLanguage={setLanguage}
        />
      )}
      <PrototypeSwitcher
        variant={variant}
        language={language}
        onVariant={(next) => selectVariant(next, setVariant)}
      />
    </>
  )
}

function VariantA({
  language,
  copy,
  onLanguage,
}: VariantProps) {
  return (
    <Card
      className="mt-8 border-primary/30 shadow-none"
      data-prototype-variant="A"
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-brand-bright">
              <Languages className="h-5 w-5" />
            </div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription className="mt-2">
              {copy.description}
            </CardDescription>
          </div>
          <Badge variant="outline">Account only</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="grid gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label={copy.title}
        >
          {languages.map((option) => {
            const selected = option.id === language
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  "flex min-w-0 items-center justify-between gap-3 rounded-xl border p-4 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "hover:bg-muted",
                )}
                onClick={() => onLanguage(option.id)}
              >
                <span>{option.name}</span>
                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-5 grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
          <p>{copy.browserOnly}</p>
          <p className="sm:text-right">{copy.questionBank}</p>
        </div>
        <p className="mt-4 text-xs font-semibold text-success" role="status">
          {copy.current}
        </p>
      </CardContent>
    </Card>
  )
}

function VariantB({
  language,
  copy,
  onLanguage,
}: VariantProps) {
  return (
    <div className="mt-8 space-y-3" data-prototype-variant="B">
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Globe2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold">{copy.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {copy.browserOnly}
          </p>
        </div>
        <label className="sr-only" htmlFor="prototype-language-select">
          {copy.title}
        </label>
        <select
          id="prototype-language-select"
          value={language}
          className="h-10 min-w-40 rounded-full border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            onLanguage(event.currentTarget.value as PrototypeLanguage)
          }
        >
          {languages.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Practice setup preview
            </span>
            <Badge variant="outline">English content</Badge>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {copy.setupNotice}
          </p>
        </div>
      </div>
    </div>
  )
}

function VariantC({
  language,
  copy,
  onLanguage,
}: VariantProps) {
  return (
    <div
      className="mt-8 overflow-hidden rounded-xl border border-primary/40 bg-card"
      data-prototype-variant="C"
    >
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
        <div className="min-w-0 bg-primary/5 p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-bright">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Badge className="mb-3">English question content</Badge>
              <h2 className="font-display text-xl font-bold">
                {copy.questionBank}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {copy.description} {copy.browserOnly}
              </p>
              <div className="mt-5 rounded-xl border bg-background/70 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Practice setup preview
                </div>
                <p className="mt-2 text-sm font-semibold">
                  {copy.setupNotice}
                </p>
              </div>
            </div>
          </div>
        </div>
        <fieldset className="min-w-0 border-t p-6 lg:border-l lg:border-t-0">
          <legend className="font-display text-base font-bold">
            {copy.title}
          </legend>
          <div className="mt-4 space-y-2">
            {languages.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition",
                  option.id === language
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="prototype-language"
                  value={option.id}
                  checked={option.id === language}
                  className="h-4 w-4 accent-primary"
                  onChange={() => onLanguage(option.id)}
                />
                <span>{option.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold text-success" role="status">
            {copy.current}
          </p>
        </fieldset>
      </div>
    </div>
  )
}

interface VariantProps {
  language: PrototypeLanguage
  copy: (typeof prototypeCopy)[PrototypeLanguage]
  onLanguage: (language: PrototypeLanguage) => void
}

function PrototypeSwitcher({
  variant,
  language,
  onVariant,
}: {
  variant: PrototypeVariant
  language: PrototypeLanguage
  onVariant: (variant: PrototypeVariant) => void
}) {
  const current = variants.find((option) => option.id === variant)!

  return (
    <div className="fixed inset-x-3 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] min-w-0 items-center gap-2 rounded-full border border-white/20 bg-foreground px-2 py-2 text-background shadow-2xl">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0 text-background hover:bg-background/10 hover:text-background"
        aria-label="Previous prototype variant"
        onClick={() => onVariant(previousVariant(variant))}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 px-2 text-center">
        <div className="truncate text-xs font-bold">
          {current.id} — {current.name}
        </div>
        <div className="truncate text-[10px] text-background/65">
          language={language} · preference=memory · questions=en
        </div>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0 text-background hover:bg-background/10 hover:text-background"
        aria-label="Next prototype variant"
        onClick={() => onVariant(nextVariant(variant))}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

function readVariant(): PrototypeVariant | null {
  if (!import.meta.env.DEV) return null
  const value = new URLSearchParams(window.location.search).get("variant")
  return variants.some((variant) => variant.id === value)
    ? value as PrototypeVariant
    : null
}

function selectVariant(
  variant: PrototypeVariant,
  publish: (variant: PrototypeVariant) => void,
) {
  const url = new URL(window.location.href)
  url.searchParams.set("variant", variant)
  window.history.replaceState(null, "", url)
  publish(variant)
}

function previousVariant(
  current: PrototypeVariant,
): PrototypeVariant {
  const index = variants.findIndex((variant) => variant.id === current)
  return variants[(index - 1 + variants.length) % variants.length].id
}

function nextVariant(
  current: PrototypeVariant,
): PrototypeVariant {
  const index = variants.findIndex((variant) => variant.id === current)
  return variants[(index + 1) % variants.length].id
}
