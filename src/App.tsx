import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Flag,
  Github,
  History,
  Home,
  Layers3,
  Menu,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { domains, domainMap } from "@/data/domains"
import questionData from "@/data/questions.json"
import { answersMatch, calculateScore, domainScore, formatDuration, PASS_SCORE, selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
import { cn } from "@/lib/utils"
import type { ActiveAttempt, CompletedAttempt, DomainId, ExamMode, PersistedState, Question } from "@/types"

type View = "dashboard" | "setup" | "exam" | "results" | "review" | "resources"

const questions = questionData as Question[]
const questionMap = new Map(questions.map((question) => [question.id, question]))
const STORAGE_KEY = "agentic-ready-gh600-v1"
const defaultState: PersistedState = { activeAttempt: null, attempts: [], bookmarks: [] }

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState
  } catch {
    return defaultState
  }
}

function App() {
  const [saved, setSaved] = useState<PersistedState>(loadState)
  const [view, setView] = useState<View>(saved.activeAttempt ? "dashboard" : "dashboard")
  const [result, setResult] = useState<CompletedAttempt | null>(saved.attempts[0] ?? null)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }, [saved])

  const navigate = (next: View) => {
    setView(next)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const startAttempt = (mode: ExamMode, domains?: DomainId[]) => {
    const selected = selectQuestions(questions, mode, domains, saved.attempts)
    if (!selected.length) return
    const durationMinutes = mode === "full" ? 45 : mode === "quick" ? 15 : Math.max(10, selected.length * 2)
    const label = mode === "full" ? "Full practice exam" : mode === "quick" ? "Quick knowledge check" : domains!.length === 1 ? `${domainMap[domains![0]].short} drill` : `Focused drill · ${domains!.length} domains`
    const attempt: ActiveAttempt = {
      id: crypto.randomUUID(),
      mode,
      label,
      questionIds: selected.map((question) => question.id),
      answers: {},
      flagged: [],
      currentIndex: 0,
      startedAt: Date.now(),
      durationMinutes,
      domains,
    }
    setSaved((current) => ({ ...current, activeAttempt: attempt }))
    setView("exam")
  }

  const updateAttempt = (attempt: ActiveAttempt) => {
    setSaved((current) => ({ ...current, activeAttempt: attempt }))
  }

  const completeAttempt = useCallback((attempt: ActiveAttempt) => {
    const completed: CompletedAttempt = {
      ...attempt,
      completedAt: Date.now(),
      score: calculateScore(attempt, questionMap),
    }
    setSaved((current) => ({
      ...current,
      activeAttempt: null,
      attempts: [completed, ...current.attempts].slice(0, 30),
    }))
    setResult(completed)
    setView("results")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const toggleBookmark = (id: string) => {
    setSaved((current) => ({
      ...current,
      bookmarks: current.bookmarks.includes(id)
        ? current.bookmarks.filter((questionId) => questionId !== id)
        : [...current.bookmarks, id],
    }))
  }

  if (view === "exam" && saved.activeAttempt) {
    return (
      <ExamRunner
        attempt={saved.activeAttempt}
        bookmarks={saved.bookmarks}
        onUpdate={updateAttempt}
        onComplete={completeAttempt}
        onBookmark={toggleBookmark}
        onExit={() => navigate("dashboard")}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav view={view} onNavigate={navigate} mobileOpen={mobileNav} onMobileOpen={setMobileNav} />
      <main>
        {view === "dashboard" && (
          <Dashboard
            saved={saved}
            onStart={() => navigate("setup")}
            onResume={() => navigate("exam")}
            onDomain={(domain) => startAttempt("domain", [domain])}
            onReview={() => navigate("review")}
            onResources={() => navigate("resources")}
          />
        )}
        {view === "setup" && <ExamSetup onStart={startAttempt} />}
        {view === "results" && result && (
          <Results
            attempt={result}
            bookmarks={saved.bookmarks}
            onBookmark={toggleBookmark}
            onDashboard={() => navigate("dashboard")}
            onRetry={() => startAttempt(result.mode, result.domains)}
            onReview={() => navigate("review")}
          />
        )}
        {view === "review" && <Review saved={saved} onBookmark={toggleBookmark} onPractice={() => navigate("setup")} />}
        {view === "resources" && <Resources onPractice={() => navigate("setup")} />}
      </main>
      <Footer />
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Waymark />
      </div>
      <div>
        <div className="font-display text-[15px] font-extrabold leading-tight tracking-tight">Agentic Ready</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">GH-600 practice</div>
      </div>
    </div>
  )
}

function Waymark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M5 18V8m0 0 4-3m-4 3 4 3M12 18V6m0 12 4-3m-4 3-4-3M19 18V8m0 0-4-3m4 3-4 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TopNav({
  view,
  onNavigate,
  mobileOpen,
  onMobileOpen,
}: {
  view: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onMobileOpen: (open: boolean) => void
}) {
  const items: { view: View; label: string; icon: typeof Home }[] = [
    { view: "dashboard", label: "Dashboard", icon: Home },
    { view: "setup", label: "Practice", icon: CircleHelp },
    { view: "review", label: "Review", icon: History },
    { view: "resources", label: "Study path", icon: BookOpen },
  ]
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="container flex h-[72px] items-center justify-between">
        <button onClick={() => onNavigate("dashboard")} className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Brand />
        </button>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {items.map((item) => (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                view === item.view ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block">
          <Button size="sm" onClick={() => onNavigate("setup")}><Play className="h-4 w-4 fill-current" /> Start practice</Button>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => onMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      {mobileOpen && (
        <nav className="container grid gap-1 border-t py-3 md:hidden" aria-label="Mobile navigation">
          {items.map((item) => (
            <button key={item.view} onClick={() => onNavigate(item.view)} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold", view === item.view ? "bg-muted" : "text-muted-foreground")}>
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}

function Dashboard({
  saved,
  onStart,
  onResume,
  onDomain,
  onReview,
  onResources,
}: {
  saved: PersistedState
  onStart: () => void
  onResume: () => void
  onDomain: (domain: DomainId) => void
  onReview: () => void
  onResources: () => void
}) {
  const attempts = saved.attempts
  const readiness = attempts.length ? Math.round(domains.reduce((total, domain) => total + domainScore(attempts, questions, domain.id), 0) / domains.length) : 0
  const answered = attempts.reduce((total, attempt) => total + attempt.questionIds.length, 0)
  const best = attempts.length ? Math.max(...attempts.map((attempt) => attempt.score)) : 0

  return (
    <>
      <section className="hero-grid border-b border-border/80 bg-[#f7f3eb]">
        <div className="container grid gap-10 py-14 lg:grid-cols-[1.35fr_0.65fr] lg:items-center lg:py-20">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-5 border-primary/20 bg-white/70 text-primary">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Built for the current GH-600 blueprint
            </Badge>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Practice the judgment behind <span className="text-[#df684c]">agentic systems.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Scenario-based drills for operating, supervising, evaluating, and governing AI agents with GitHub as the control plane.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {saved.activeAttempt ? (
                <Button size="lg" onClick={onResume}><Play className="h-4 w-4 fill-current" /> Resume {saved.activeAttempt.label}</Button>
              ) : (
                <Button size="lg" onClick={onStart}><Play className="h-4 w-4 fill-current" /> Start a practice exam</Button>
              )}
              <Button size="lg" variant="outline" className="bg-white/60" onClick={onResources}>View study path <ArrowRight className="h-4 w-4" /></Button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-[#267a70]" /> Unofficial practice tool · progress stays in this browser
            </p>
          </div>
          <ReadinessCard score={readiness} answered={answered} best={best} />
        </div>
      </section>

      <section className="container py-14 lg:py-20">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Eyebrow>Exam blueprint</Eyebrow>
            <h2 className="section-title">Know where you stand in every domain.</h2>
          </div>
          <Button variant="ghost" onClick={onReview}>Review past answers <ArrowRight className="h-4 w-4" /></Button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {domains.map((domain) => {
            const score = domainScore(attempts, questions, domain.id)
            const tested = attempts.some((attempt) => attempt.questionIds.some((id) => questionMap.get(id)?.domain === domain.id))
            return (
              <button key={domain.id} onClick={() => onDomain(domain.id)} className="group rounded-2xl border bg-card p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: domain.soft, color: domain.color }}>
                    <domain.icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-muted-foreground">{domain.weight}</div>
                    <div className="mt-1 text-xs text-muted-foreground">exam weight</div>
                  </div>
                </div>
                <div className="mt-5 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: domain.color }}>Domain {domain.number}</div>
                <h3 className="mt-2 font-display text-lg font-bold leading-snug">{domain.short}</h3>
                <div className="mt-5 flex items-center gap-3">
                  <Progress value={score} className="h-1.5" style={{ "--primary": hexToHsl(domain.color) } as CSSProperties} />
                  <span className="w-10 text-right text-sm font-bold">{tested ? `${score}%` : "—"}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm font-semibold text-muted-foreground">
                  <span>{questions.filter((question) => question.domain === domain.id).length} questions</span>
                  <span className="flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">Practice <ChevronRight className="h-4 w-4" /></span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

    </>
  )
}

function ReadinessCard({ score, answered, best }: { score: number; answered: number; best: number }) {
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference
  return (
    <Card className="relative overflow-hidden border-white/70 bg-white/85 shadow-soft">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[70px] bg-[#dff1ed]" />
      <CardContent className="relative p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Readiness signal</div>
            <div className="mt-1 text-sm text-muted-foreground">Across all six domains</div>
          </div>
          <BarChart3 className="h-5 w-5 text-[#267a70]" />
        </div>
        <div className="my-7 flex justify-center">
          <div className="relative h-36 w-36">
            <svg className="h-36 w-36 -rotate-90" viewBox="0 0 128 128" aria-label={`${score}% readiness`}>
              <circle cx="64" cy="64" r="54" fill="none" stroke="#e9e7e1" strokeWidth="10" />
              <circle cx="64" cy="64" r="54" fill="none" stroke="#267a70" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div><span className="font-display text-4xl font-extrabold">{score}</span><span className="text-sm font-bold text-muted-foreground">%</span><div className="text-[11px] font-semibold text-muted-foreground">overall</div></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x border-t pt-5 text-center">
          <div><div className="font-display text-2xl font-bold">{answered}</div><div className="text-xs text-muted-foreground">questions answered</div></div>
          <div><div className="font-display text-2xl font-bold">{best}%</div><div className="text-xs text-muted-foreground">best exam</div></div>
        </div>
      </CardContent>
    </Card>
  )
}

function ExamSetup({ onStart }: { onStart: (mode: ExamMode, domains?: DomainId[]) => void }) {
  const [selectedDomains, setSelectedDomains] = useState<DomainId[]>([])
  const selectedCount = questions.filter((question) => selectedDomains.includes(question.domain)).length
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <div className="max-w-2xl">
        <Eyebrow>Practice modes</Eyebrow>
        <h1 className="section-title text-4xl">Choose the kind of pressure you need.</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">Every mode uses the same local question bank. Answers are saved automatically, so you can leave and resume.</p>
      </div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <ModeCard icon={Trophy} eyebrow="Best simulation" title="Full practice exam" description="30 weighted questions across all six domains. Timed and scored after submission." meta="45 min · 30 questions" onClick={() => onStart("full")} accent />
        <ModeCard icon={Zap} eyebrow="Build momentum" title="Quick knowledge check" description="A random set for a fast confidence check between study sessions. Limited to your selected domains when any are chosen." meta={selectedDomains.length ? "15 min · up to 10 questions from selected domains" : "15 min · 10 questions"} onClick={() => onStart("quick", selectedDomains)} />
        <ModeCard icon={Target} eyebrow="Close a gap" title="Focused domain drill" description="Practice every question available in the blueprint domains you select." meta={selectedDomains.length ? `${selectedCount} questions · adaptive time` : "Select at least one domain below"} onClick={() => onStart("domain", selectedDomains)} disabled={!selectedDomains.length} />
      </div>
      <Card className="mt-6 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Domains for focused practice</CardTitle>
          <CardDescription>Click to select one or more areas. Double-click to unselect.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => {
            const selected = selectedDomains.includes(domain.id)
            return (
              <button
                key={domain.id}
                onClick={() => setSelectedDomains((current) => selectDomain(current, domain.id))}
                onDoubleClick={() => setSelectedDomains((current) => unselectDomain(current, domain.id))}
                aria-pressed={selected}
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:bg-muted")}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ color: domain.color, background: domain.soft }}><domain.icon className="h-4 w-4" /></div>
                <div className="min-w-0"><div className="truncate text-sm font-bold">{domain.short}</div><div className="text-xs text-muted-foreground">{domain.weight}</div></div>
                {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </button>
            )
          })}
        </CardContent>
      </Card>
      <div className="mt-6 rounded-xl border border-[#e8d39d] bg-[#fff8e7] p-4 text-sm leading-6 text-[#6f5721]">
        <strong>Exam note:</strong> This is an original, unofficial question bank based on the published skills outline and linked documentation—not Microsoft exam content or a prediction of exact questions.
      </div>
    </div>
  )
}

function ModeCard({ icon: Icon, eyebrow, title, description, meta, onClick, accent = false, disabled = false }: { icon: typeof Trophy; eyebrow: string; title: string; description: string; meta: string; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <Card className={cn("flex flex-col overflow-hidden shadow-none transition hover:-translate-y-0.5 hover:shadow-soft", accent && "border-primary bg-primary text-primary-foreground")}>
      <CardHeader className="flex-1">
        <div className={cn("mb-4 grid h-12 w-12 place-items-center rounded-xl bg-muted text-primary", accent && "bg-white/10 text-white")}><Icon className="h-5 w-5" /></div>
        <div className={cn("text-xs font-bold uppercase tracking-[0.17em] text-[#df684c]", accent && "text-[#ffb199]")}>{eyebrow}</div>
        <CardTitle className={cn("pt-2", accent && "text-white")}>{title}</CardTitle>
        <CardDescription className={cn(accent && "text-white/70")}>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground", accent && "text-white/65")}><Clock3 className="h-4 w-4" />{meta}</div>
        <Button variant={accent ? "secondary" : "default"} className="w-full" onClick={onClick} disabled={disabled}>Begin <ArrowRight className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  )
}

function ExamRunner({ attempt, bookmarks, onUpdate, onComplete, onBookmark, onExit }: { attempt: ActiveAttempt; bookmarks: string[]; onUpdate: (attempt: ActiveAttempt) => void; onComplete: (attempt: ActiveAttempt) => void; onBookmark: (id: string) => void; onExit: () => void }) {
  const [now, setNow] = useState(Date.now())
  const [mapOpen, setMapOpen] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const currentId = attempt.questionIds[attempt.currentIndex]
  const question = questionMap.get(currentId)!
  const answer = attempt.answers[currentId] ?? []
  const remaining = Math.max(0, Math.ceil((attempt.startedAt + attempt.durationMinutes * 60_000 - now) / 1000))
  const answeredCount = Object.values(attempt.answers).filter((values) => values.length).length
  const domain = domainMap[question.domain]
  const isRevealed = Boolean(revealed[currentId])
  const isCurrentCorrect = answersMatch(answer, question.correctAnswers)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (remaining === 0) onComplete(attempt)
  }, [remaining, onComplete, attempt])

  const choose = (optionId: string) => {
    if (isRevealed) return
    const next = question.type === "single"
      ? [optionId]
      : answer.includes(optionId) ? answer.filter((id) => id !== optionId) : [...answer, optionId]
    onUpdate({ ...attempt, answers: { ...attempt.answers, [currentId]: next } })
  }

  const setIndex = (index: number) => onUpdate({ ...attempt, currentIndex: index })
  const toggleFlag = () => onUpdate({ ...attempt, flagged: attempt.flagged.includes(currentId) ? attempt.flagged.filter((id) => id !== currentId) : [...attempt.flagged, currentId] })

  return (
    <div className="min-h-screen bg-[#f6f5f1] text-foreground">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="container flex h-[72px] items-center justify-between gap-4">
          <button onClick={onExit} className="hidden rounded-xl text-left focus-visible:ring-2 sm:block"><Brand /></button>
          <div className="min-w-0 flex-1 sm:flex-none">
            <div className="truncate text-sm font-bold">{attempt.label}</div>
            <div className="text-xs text-muted-foreground">Question {attempt.currentIndex + 1} of {attempt.questionIds.length}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("flex h-10 items-center gap-2 rounded-lg border bg-background px-3 font-mono text-sm font-bold", remaining < 300 && "border-destructive/40 bg-red-50 text-destructive")}><Clock3 className="h-4 w-4" />{formatDuration(remaining)}</div>
            <Button variant="outline" className="hidden sm:flex" onClick={onExit}>Save & exit</Button>
            <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMapOpen(!mapOpen)} aria-label="Toggle question map"><Layers3 className="h-4 w-4" /></Button>
          </div>
        </div>
        <Progress value={((attempt.currentIndex + 1) / attempt.questionIds.length) * 100} className="h-1 rounded-none" />
      </header>

      <div className="container grid max-w-6xl gap-7 py-8 lg:grid-cols-[1fr_280px] lg:py-12">
        <main>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={{ color: domain.color, background: domain.soft, borderColor: "transparent" }}>Domain {domain.number}</Badge>
              <Badge variant="outline" className="capitalize">{question.difficulty}</Badge>
              <span className="text-xs font-medium text-muted-foreground">{question.objective}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={toggleFlag} className={cn(attempt.flagged.includes(currentId) && "text-[#d06448]")}>
              <Flag className={cn("h-4 w-4", attempt.flagged.includes(currentId) && "fill-current")} /> <span className="hidden sm:inline">Flag</span>
            </Button>
          </div>
          <Card className="shadow-none">
            <CardContent className="p-6 sm:p-9">
              <div className="flex gap-4">
                <span className="font-display text-sm font-extrabold text-muted-foreground">{String(attempt.currentIndex + 1).padStart(2, "0")}</span>
                <div className="flex-1">
                  <h1 className="font-display text-xl font-bold leading-relaxed tracking-tight sm:text-2xl">{question.prompt}</h1>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{question.type === "multiple" ? "Select all that apply." : "Select the best answer."}</p>
                </div>
              </div>
              <div className="mt-8 grid gap-3">
                {question.options.map((option, index) => {
                  const selected = answer.includes(option.id)
                  const correctOption = question.correctAnswers.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      onClick={() => choose(option.id)}
                      disabled={isRevealed}
                      className={cn(
                        "group flex w-full items-start gap-4 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isRevealed
                          ? correctOption
                            ? "border-[#267a70] bg-[#dff1ed]/50 ring-1 ring-[#267a70]"
                            : selected
                              ? "border-[#d66046] bg-[#fbe8e1]/50 ring-1 ring-[#d66046]"
                              : "opacity-70"
                          : selected
                            ? "border-primary bg-primary/[0.045] ring-1 ring-primary"
                            : "hover:border-primary/30 hover:bg-muted/50",
                      )}
                    >
                      <span className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold transition",
                        isRevealed
                          ? correctOption
                            ? "border-[#267a70] bg-[#267a70] text-white"
                            : selected
                              ? "border-[#d66046] bg-[#d66046] text-white"
                              : "bg-background text-muted-foreground"
                          : selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground group-hover:border-primary/30",
                      )}>
                        {isRevealed ? (correctOption ? <Check className="h-4 w-4" /> : selected ? <X className="h-4 w-4" /> : String.fromCharCode(65 + index)) : selected ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + index)}
                      </span>
                      <span className="pt-1 text-[15px] font-medium leading-6">{option.text}</span>
                    </button>
                  )
                })}
              </div>
              {isRevealed && (
                <div className="mt-6 rounded-xl border bg-muted/60 p-5">
                  <div className={cn("flex items-center gap-2 text-sm font-bold", isCurrentCorrect ? "text-[#267a70]" : "text-[#d66046]")}>
                    {isCurrentCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {isCurrentCorrect ? "Correct" : "Not quite"}
                  </div>
                  <p className="mt-2 text-sm leading-6">{question.explanation}</p>
                  <a href={question.source.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">{question.source.label} <ExternalLink className="h-3 w-3" /></a>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={attempt.currentIndex === 0} onClick={() => setIndex(attempt.currentIndex - 1)}><ArrowLeft className="h-4 w-4" /> Previous</Button>
            {!isRevealed && (
              <Button variant="secondary" disabled={!answer.length} onClick={() => setRevealed((current) => ({ ...current, [currentId]: true }))}>Check answer <CheckCircle2 className="h-4 w-4" /></Button>
            )}
            {attempt.currentIndex === attempt.questionIds.length - 1 ? (
              <Button onClick={() => onComplete(attempt)}>Submit exam <CheckCircle2 className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={() => setIndex(attempt.currentIndex + 1)}>Next question <ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </main>
        <aside className={cn("h-fit rounded-2xl border bg-white p-5 shadow-soft lg:sticky lg:top-28 lg:block", mapOpen ? "block" : "hidden")}>
          <div className="flex items-center justify-between">
            <div><h2 className="font-display text-sm font-bold">Question map</h2><p className="mt-1 text-xs text-muted-foreground">{answeredCount} of {attempt.questionIds.length} answered</p></div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMapOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <Progress value={(answeredCount / attempt.questionIds.length) * 100} className="mt-4" />
          <div className="mt-5 grid grid-cols-5 gap-2">
            {attempt.questionIds.map((id, index) => {
              const isAnswered = Boolean(attempt.answers[id]?.length)
              const isCurrent = index === attempt.currentIndex
              return (
                <button key={id} onClick={() => { setIndex(index); setMapOpen(false) }} className={cn("relative grid aspect-square place-items-center rounded-lg border text-xs font-bold transition", isCurrent ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted", isAnswered && !isCurrent && "border-primary/20 bg-primary text-primary-foreground")}>
                  {index + 1}
                  {attempt.flagged.includes(id) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#e46f51]" />}
                </button>
              )
            })}
          </div>
          <Separator className="my-5" />
          <button onClick={() => onBookmark(currentId)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm font-semibold hover:bg-muted">
            <Bookmark className={cn("h-4 w-4", bookmarks.includes(currentId) && "fill-primary text-primary")} />
            {bookmarks.includes(currentId) ? "Bookmarked" : "Bookmark this question"}
          </button>
          <div className="mt-4 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">Select an answer, then check it to see the correct answer and explanation.</div>
        </aside>
      </div>
    </div>
  )
}

function Results({ attempt, bookmarks, onBookmark, onDashboard, onRetry, onReview }: { attempt: CompletedAttempt; bookmarks: string[]; onBookmark: (id: string) => void; onDashboard: () => void; onRetry: () => void; onReview: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const passed = attempt.score >= PASS_SCORE
  const correctCount = attempt.questionIds.filter((id) => answersMatch(attempt.answers[id], questionMap.get(id)!.correctAnswers)).length
  const duration = Math.max(1, Math.round((attempt.completedAt - attempt.startedAt) / 60_000))
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <Card className={cn("overflow-hidden text-center shadow-none", passed ? "border-[#a7d7cd]" : "border-[#efb7a8]")}>
          <div className={cn("h-2", passed ? "bg-[#267a70]" : "bg-[#e46f51]")} />
          <CardContent className="p-8">
            <div className={cn("mx-auto grid h-16 w-16 place-items-center rounded-2xl", passed ? "bg-[#dff1ed] text-[#267a70]" : "bg-[#fbe8e1] text-[#d66046]")}>
              {passed ? <Trophy className="h-8 w-8" /> : <Target className="h-8 w-8" />}
            </div>
            <div className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">{passed ? "Passing signal" : "Keep building"}</div>
            <div className="mt-2 font-display text-6xl font-extrabold tracking-tight">{attempt.score}<span className="text-2xl text-muted-foreground">%</span></div>
            <p className="mt-3 text-sm text-muted-foreground">{correctCount} of {attempt.questionIds.length} correct · {duration} min</p>
          </CardContent>
        </Card>
        <div>
          <Eyebrow>Attempt complete</Eyebrow>
          <h1 className="section-title text-4xl">{passed ? "Strong work. Your controls held." : "You found the edges. Now tune them."}</h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{passed ? "You cleared the 70% practice threshold. Review domain signals before the next full simulation." : "Use the explanations below to separate guidance, evidence, and enforceable controls—the distinction behind many scenarios."}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button onClick={onRetry}><RotateCcw className="h-4 w-4" /> Try another set</Button>
            <Button variant="outline" onClick={onDashboard}>Back to dashboard</Button>
          </div>
        </div>
      </div>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-3">
          <div><Eyebrow>Performance</Eyebrow><h2 className="section-title text-3xl">Domain breakdown</h2></div>
          <Button variant="ghost" onClick={onReview}>Open review queue <ArrowRight className="h-4 w-4" /></Button>
        </div>
        <Card className="mt-6 shadow-none"><CardContent className="grid gap-5 p-6 sm:grid-cols-2">
          {domains.map((domain) => {
            const ids = attempt.questionIds.filter((id) => questionMap.get(id)?.domain === domain.id)
            if (!ids.length) return null
            const correct = ids.filter((id) => answersMatch(attempt.answers[id], questionMap.get(id)!.correctAnswers)).length
            const score = Math.round((correct / ids.length) * 100)
            return <div key={domain.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: domain.soft, color: domain.color }}><domain.icon className="h-4 w-4" /></div><div><div className="text-sm font-bold">{domain.short}</div><div className="text-xs text-muted-foreground">{correct}/{ids.length} correct</div></div></div><div className="font-display text-xl font-bold">{score}%</div></div><Progress className="mt-4 h-1.5" value={score} /></div>
          })}
        </CardContent></Card>
      </section>

      <section className="mt-14">
        <Eyebrow>Answer review</Eyebrow>
        <h2 className="section-title text-3xl">Learn from every decision.</h2>
        <div className="mt-6 space-y-3">
          {attempt.questionIds.map((id, index) => {
            const question = questionMap.get(id)!
            const correct = answersMatch(attempt.answers[id], question.correctAnswers)
            const open = expanded === id
            return (
              <Card key={id} className="shadow-none">
                <button onClick={() => setExpanded(open ? null : id)} className="flex w-full items-start gap-4 p-5 text-left">
                  {correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#267a70]" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#d66046]" />}
                  <div className="flex-1"><div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Question {index + 1} · {domainMap[question.domain].short}</div><div className="font-semibold leading-6">{question.prompt}</div></div>
                  <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t px-5 pb-5 pt-4 sm:pl-14">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AnswerSummary label="Your answer" ids={attempt.answers[id] ?? []} question={question} correct={correct} />
                      <AnswerSummary label="Correct answer" ids={question.correctAnswers} question={question} correct />
                    </div>
                    <div className="mt-4 rounded-xl bg-muted p-4"><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Why</div><p className="mt-2 text-sm leading-6">{question.explanation}</p></div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <a href={question.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">{question.source.label} <ExternalLink className="h-3 w-3" /></a>
                      <Button variant="ghost" size="sm" onClick={() => onBookmark(id)}><Bookmark className={cn("h-4 w-4", bookmarks.includes(id) && "fill-current")} />{bookmarks.includes(id) ? "Saved" : "Save for later"}</Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function AnswerSummary({ label, ids, question, correct }: { label: string; ids: string[]; question: Question; correct: boolean }) {
  return <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className={cn("mt-2 rounded-lg border p-3 text-sm font-medium", correct ? "border-[#b8ded6] bg-[#edf8f5]" : "border-[#efc3b8] bg-[#fff2ee]")}>{ids.length ? ids.map((id) => question.options.find((option) => option.id === id)?.text).join("; ") : "No answer"}</div></div>
}

function Review({ saved, onBookmark, onPractice }: { saved: PersistedState; onBookmark: (id: string) => void; onPractice: () => void }) {
  const [filter, setFilter] = useState<"missed" | "saved" | "history">("missed")
  const missedIds = useMemo(() => {
    const found: string[] = []
    saved.attempts.forEach((attempt) => attempt.questionIds.forEach((id) => {
      const question = questionMap.get(id)
      if (question && !answersMatch(attempt.answers[id], question.correctAnswers) && !found.includes(id)) found.push(id)
    }))
    return found
  }, [saved.attempts])
  const visible = filter === "saved" ? saved.bookmarks : missedIds
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <Eyebrow>Review center</Eyebrow>
      <h1 className="section-title text-4xl">Turn misses into durable knowledge.</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Revisit incorrect and bookmarked scenarios, or inspect your recent attempts. The queue is assembled from this browser's saved history.</p>
      <div className="mt-8 flex flex-wrap gap-2 rounded-xl border bg-card p-1.5 sm:w-fit">
        {([[
          "missed", `Missed (${missedIds.length})`, XCircle,
        ], ["saved", `Saved (${saved.bookmarks.length})`, Bookmark], ["history", `History (${saved.attempts.length})`, History]] as const).map(([value, label, Icon]) => (
          <button key={value} onClick={() => setFilter(value)} className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition", filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {filter === "history" ? (
        <div className="mt-7 space-y-3">
          {saved.attempts.length ? saved.attempts.map((attempt) => (
            <Card key={attempt.id} className="shadow-none"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className={cn("grid h-12 w-12 place-items-center rounded-xl font-display text-sm font-bold", attempt.score >= PASS_SCORE ? "bg-[#dff1ed] text-[#267a70]" : "bg-[#fbe8e1] text-[#d66046]")}>{attempt.score}%</div><div><div className="font-bold">{attempt.label}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(attempt.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {attempt.questionIds.length} questions</div></div></div><Badge variant="outline">{attempt.score >= PASS_SCORE ? "Passing" : "Review"}</Badge></CardContent></Card>
          )) : <EmptyState title="No attempts yet" description="Complete a practice set and your scores will appear here." onAction={onPractice} />}
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          {visible.length ? visible.map((id) => {
            const question = questionMap.get(id)
            if (!question) return null
            const domain = domainMap[question.domain]
            return <Card key={id} className="shadow-none"><CardContent className="p-5"><div className="flex items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: domain.soft, color: domain.color }}><domain.icon className="h-4 w-4" /></div><div className="flex-1"><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{domain.short} · {question.difficulty}</div><h2 className="mt-2 font-display text-lg font-bold leading-7">{question.prompt}</h2><div className="mt-4 rounded-xl bg-muted p-4 text-sm leading-6"><strong>Correct:</strong> {question.correctAnswers.map((answer) => question.options.find((option) => option.id === answer)?.text).join("; ")}<p className="mt-2 text-muted-foreground">{question.explanation}</p></div></div><Button variant="ghost" size="icon" onClick={() => onBookmark(id)} aria-label="Toggle bookmark"><Bookmark className={cn("h-4 w-4", saved.bookmarks.includes(id) && "fill-primary text-primary")} /></Button></div></CardContent></Card>
          }) : <EmptyState title={filter === "saved" ? "Nothing saved yet" : "No missed questions yet"} description={filter === "saved" ? "Bookmark questions during an exam or from your results." : "Start a practice set to build your review queue."} onAction={onPractice} />}
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, description, onAction }: { title: string; description: string; onAction: () => void }) {
  return <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground"><BookOpen className="h-5 w-5" /></div><h2 className="mt-4 font-display text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p><Button className="mt-5" onClick={onAction}>Start practice</Button></div>
}

function Resources({ onPractice }: { onPractice: () => void }) {
  const steps = [
    { number: "01", title: "Establish the agentic foundation", description: "Learn the plan–act–evaluate lifecycle, GitHub-native accountability, task boundaries, and the difference between guidance and policy.", resource: "Foundations of Agentic AI in GitHub", url: "https://learn.microsoft.com/en-us/training/modules/foundations-agentic-ai/", domains: "Domains 1 & 6" },
    { number: "02", title: "Design the architecture and SDLC", description: "Practice structured plans, autonomy levels, PR governance, observability, Actions handoffs, and recovery paths.", resource: "Designing Agent Architecture and SDLC Integration", url: "https://learn.microsoft.com/en-us/training/modules/design-agent-architecture-integration/", domains: "Domains 1, 4 & 5" },
    { number: "03", title: "Configure tools, MCP, and execution", description: "Work through custom agents, tool scope, MCP servers, allowlists, cloud setup, CLI automation, credentials, and firewalls.", resource: "Tooling, MCP, and Agent Execution Environments", url: "https://learn.microsoft.com/en-us/training/modules/agent-tooling-mcp-execution-environments/", domains: "Domain 2" },
    { number: "04", title: "Evaluate, govern, and recover", description: "Use tests, scans, logs, artifacts, session state, rulesets, hooks, approvals, and audit events as evidence and controls.", resource: "Official GH-600 study guide", url: "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600", domains: "Domains 3–6" },
  ]
  return (
    <div>
      <section className="border-b bg-[#f7f3eb]">
        <div className="container grid gap-8 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:py-18">
          <div><Eyebrow>GH-600 study path</Eyebrow><h1 className="section-title text-4xl lg:text-5xl">Learn the blueprint. Practice the decisions.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Follow a focused route through the official learning material, then use practice modes and answer review to strengthen each exam domain.</p></div>
          <div className="rounded-2xl border border-[#e7dcca] bg-white/70 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-[#267a70]" /><p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Published exam profile:</strong> expertise operating, integrating, supervising, and governing agents in production-grade SDLC workflows, with GitHub as the system of record and control plane.</p></div></div>
        </div>
      </section>
      <section className="container max-w-5xl py-14 lg:py-18">
        <div><Eyebrow>Recommended sequence</Eyebrow><h2 className="section-title">A focused route through the material.</h2></div>
        <div className="mt-8 space-y-4">
          {steps.map((step) => (
            <Card key={step.number} className="shadow-none"><CardContent className="grid gap-5 p-6 sm:grid-cols-[56px_1fr_auto] sm:items-center"><div className="font-display text-2xl font-extrabold text-[#d66046]">{step.number}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-bold">{step.title}</h3><Badge variant="secondary">{step.domains}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p><a href={step.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{step.resource} <ExternalLink className="h-3.5 w-3.5" /></a></div><FileText className="hidden h-5 w-5 text-muted-foreground sm:block" /></CardContent></Card>
          ))}
        </div>
      </section>
      <section className="container border-t py-14 text-center lg:py-16"><h2 className="font-display text-3xl font-extrabold tracking-tight">Ready to test the first pass?</h2><p className="mx-auto mt-3 max-w-xl text-muted-foreground">Use a full exam to establish your baseline, then alternate focused drills with answer review.</p><Button size="lg" className="mt-6" onClick={onPractice}>Choose a practice mode <ArrowRight className="h-4 w-4" /></Button></section>
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#d66046]">{children}</div>
}

function Footer() {
  return (
    <footer className="border-t bg-[#f7f5f0]">
      <div className="container flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Brand />
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">Unofficial study aid. Not affiliated with or endorsed by Microsoft or GitHub. GH-600, GitHub, and Copilot are trademarks of their respective owners.</p>
        <a href="https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-primary hover:underline"><Github className="h-4 w-4" /> Official credential</a>
      </div>
    </footer>
  )
}

function hexToHsl(hex: string) {
  const value = hex.replace("#", "")
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export default App
