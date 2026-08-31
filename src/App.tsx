import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Github,
  Globe2,
  HardDrive,
  History,
  Home,
  Layers3,
  LoaderCircle,
  LogOut,
  Menu,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  WifiOff,
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
import { signInWithGitHub } from "@/lib/auth-client"
import { downloadPracticeStateExport } from "@/lib/data-controls"
import {
  INTERFACE_LANGUAGE_OPTIONS,
  isInterfaceLanguage,
  questionBankContentProps,
  type MessageKey,
  type Text,
} from "@/lib/localization"
import { useLocalization } from "@/lib/use-localization"
import { answersMatch, calculateScore, countAnswered, domainProgress, formatDuration, getAttemptRemainingSeconds, isAttemptPaused, PASS_SCORE, pauseAttemptTimer, readinessScore, resumeAttemptTimer, selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
import { getPathForView, resolveNavigation, type AppView } from "@/lib/navigation"
import type {
  PracticeStateMode,
  PracticeSyncNotification,
  PracticeSyncStatus,
} from "@/lib/persistence"
import { usePracticeState } from "@/lib/use-practice-state"
import { cn } from "@/lib/utils"
import type { AccountIdentity, Attempt, AttemptMode, AttemptOutcome, DomainId, FinishedAttempt, PracticeState, Question } from "@/types"

const questions = questionData as Question[]
const questionMap = new Map(questions.map((question) => [question.id, question]))

// Exported as a focused test seam alongside the application component.
// eslint-disable-next-line react-refresh/only-export-components
export function readSignInFailureNotice(search: string) {
  const failure = new URLSearchParams(search).get("error")
  if (!failure) return null
  return {
    kind: "error" as const,
    message: "GitHub sign-in did not finish, so you are still practicing as a guest. Your practice state on this device is unchanged.",
  }
}

function App() {
  const {
    practiceState,
    practiceMode,
    syncStatus,
    accountDeletionStage,
    accountAvailable,
    accountIdentity,
    updatePracticeState: setPracticeState,
    resetPracticeState,
    deleteAccount,
    signOutSafely,
    isInitializing,
    syncNotification,
    dismissSyncNotification,
  } = usePracticeState()
  const [view, setView] = useState<AppView>(() => resolveNavigation(window.location.pathname, {
    hasActiveAttempt: Boolean(practiceState.activeAttempt),
    hasFinishedAttempt: practiceState.attempts.length > 0,
  }).view)
  const [mobileNav, setMobileNav] = useState(false)
  const [accountAction, setAccountAction] = useState<"sign-in" | "sign-out" | "reset" | "delete-account" | null>(null)
  const [accountConfirmation, setAccountConfirmation] = useState<"reset" | "delete-account" | null>(null)
  const [accountNotice, setAccountNotice] = useState<{ kind: "success" | "error"; message: string } | null>(
    () => readSignInFailureNotice(window.location.search),
  )
  const hasActiveAttempt = Boolean(practiceState.activeAttempt)
  const hasFinishedAttempt = practiceState.attempts.length > 0
  const latestFinishedAttempt = practiceState.attempts[0] ?? null
  const pinnedToAccount = practiceMode.kind === "reauthenticating" || accountDeletionStage === "identity"
  const navigationLockMessage = accountDeletionStage === "identity"
    ? ACCOUNT_DELETION_NAVIGATION_HINT
    : RECOVERY_NAVIGATION_HINT
  const displayedView = pinnedToAccount ? "account" : view
  const hasAccount = practiceMode.kind === "account" || practiceMode.kind === "transitioning"

  const navigate = useCallback((next: AppView) => {
    if (pinnedToAccount && next !== "account") return
    const pathname = getPathForView(next)
    if (window.location.pathname !== pathname || window.location.search || window.location.hash) {
      window.history.pushState(null, "", pathname)
    }
    setView(next)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [pinnedToAccount])

  useEffect(() => {
    if (isInitializing) return

    const syncLocation = () => {
      const resolved = resolveNavigation(window.location.pathname, {
        hasActiveAttempt,
        hasFinishedAttempt,
      })
      if (window.location.pathname !== resolved.pathname || window.location.search || window.location.hash) {
        window.history.replaceState(null, "", resolved.pathname)
      }
      setView(resolved.view)
      setMobileNav(false)
      window.scrollTo({ top: 0 })
    }

    syncLocation()
    window.addEventListener("popstate", syncLocation)
    return () => window.removeEventListener("popstate", syncLocation)
  }, [hasActiveAttempt, hasFinishedAttempt, isInitializing])

  useEffect(() => {
    if (!pinnedToAccount || view === "account") return
    window.history.replaceState(null, "", getPathForView("account"))
    setView("account")
    setMobileNav(false)
    window.scrollTo({ top: 0 })
  }, [pinnedToAccount, view])

  const beginSignIn = async () => {
    if (!accountAvailable || accountAction) return
    setAccountAction("sign-in")
    setAccountNotice(null)
    try {
      await signInWithGitHub(new URL(getPathForView("account"), window.location.origin).toString())
    } catch {
      setAccountNotice({
        kind: "error",
        message: "GitHub sign-in could not start. Your guest practice is unchanged. Try again when the service is available.",
      })
    } finally {
      setAccountAction(null)
    }
  }

  const safelySignOut = async () => {
    if (accountAction) return
    setAccountAction("sign-out")
    setAccountNotice(null)
    try {
      const result = await signOutSafely()
      setAccountNotice(result.status === "signed-out"
        ? {
            kind: "success",
            message: "You are signed out. This device now has a new empty guest practice state.",
          }
        : {
            kind: "error",
            message: "Sign-out is blocked until your practice state can be secured. You remain signed in and no work was discarded.",
          })
    } catch {
      setAccountNotice({
        kind: "error",
        message: "Sign-out could not finish safely. You remain signed in and no work was discarded.",
      })
    } finally {
      setAccountAction(null)
    }
  }

  const resetVisiblePracticeState = async () => {
    if (accountAction) return
    const resettingGuest = practiceMode.kind === "guest"
    setAccountAction("reset")
    setAccountNotice(null)
    try {
      const result = await resetPracticeState()
      setAccountNotice(result.status === "completed"
        ? {
            kind: "success",
            message: resettingGuest
              ? "Practice state was deleted from this browser. You now have a new empty guest practice state."
              : "Practice state was deleted from the server and this device. Your account remains signed in with a new empty practice state.",
          }
        : {
            kind: "error",
            message: "Practice state could not be deleted. Try again; no other subject’s state was changed.",
          })
    } catch {
      setAccountNotice({
        kind: "error",
        message: "Practice state could not be deleted. Try again; no other subject’s state was changed.",
      })
    } finally {
      setAccountAction(null)
      setAccountConfirmation(null)
    }
  }

  const deleteCurrentAccount = async () => {
    if (accountAction) return
    setAccountAction("delete-account")
    setAccountNotice(null)
    try {
      const result = await deleteAccount()
      if (result.status === "completed") {
        setAccountNotice({
          kind: "success",
          message: "Your practice data and account were deleted. This device now has a new empty guest practice state.",
        })
      } else if (result.step === "identity") {
        setAccountNotice({
          kind: "error",
          message: "Your practice data is deleted, but the account identity step did not finish. Retry account deletion to continue from that step.",
        })
      } else {
        setAccountNotice({
          kind: "error",
          message: "Account deletion stopped before your identity was changed. Your practice state remains available so you can retry safely.",
        })
      }
    } catch {
      setAccountNotice({
        kind: "error",
        message: "Account deletion could not finish. Retry from Account; completed steps will not restore deleted practice data.",
      })
    } finally {
      setAccountAction(null)
      setAccountConfirmation(null)
    }
  }

  const startAttempt = (mode: AttemptMode, domains?: DomainId[]) => {
    const selected = selectQuestions(questions, mode, domains, practiceState.latestAnswers, practiceState.attempts)
    if (!selected.length) return
    const durationMinutes = mode === "full" ? 45 : mode === "quick" ? 15 : Math.max(10, selected.length * 2)
    const label = mode === "full" ? "Full practice exam" : mode === "quick" ? "Quick knowledge check" : domains!.length === 1 ? `${domainMap[domains![0]].short} drill` : `Focused drill · ${domains!.length} domains`
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      mode,
      label,
      questionIds: selected.map((question) => question.id),
      answers: {},
      flagged: [],
      currentIndex: 0,
      startedAt: Date.now(),
      durationMinutes,
      pausedDurationMs: 0,
      domains,
    }
    setPracticeState((current) => ({ ...current, activeAttempt: attempt }))
    navigate("exam")
  }

  const updateAttempt = (attempt: Attempt) => {
    setPracticeState((current) => {
      const latestAnswers = { ...current.latestAnswers }
      Object.entries(attempt.answers).forEach(([id, answer]) => {
        if (answer.length) latestAnswers[id] = answer
      })
      return { ...current, activeAttempt: attempt, latestAnswers }
    })
  }

  const finishAttempt = useCallback((attempt: Attempt, outcome: AttemptOutcome) => {
    const finishedAt = Date.now()
    const finalized = resumeAttemptTimer(attempt, finishedAt)
    const finishedAttempt: FinishedAttempt = {
      id: finalized.id,
      mode: finalized.mode,
      label: finalized.label,
      questionIds: finalized.questionIds,
      answers: finalized.answers,
      flagged: finalized.flagged,
      startedAt: finalized.startedAt,
      durationMinutes: finalized.durationMinutes,
      domains: finalized.domains,
      finishedAt,
      score: calculateScore(finalized, questionMap),
      outcome,
    }
    setPracticeState((current) => ({
      ...current,
      activeAttempt: null,
      attempts: [finishedAttempt, ...current.attempts],
    }), { flush: "immediate" })
    navigate("results")
  }, [navigate, setPracticeState])

  const resumeActiveAttempt = () => {
    const resumedAt = Date.now()
    setPracticeState((current) => ({
      ...current,
      activeAttempt: current.activeAttempt ? resumeAttemptTimer(current.activeAttempt, resumedAt) : null,
    }))
    navigate("exam")
  }

  const exitAttempt = (attempt: Attempt) => {
    setPracticeState(
      (current) => ({ ...current, activeAttempt: attempt }),
      { flush: "immediate" },
    )
    navigate("dashboard")
  }

  const toggleBookmark = (id: string) => {
    setPracticeState((current) => ({
      ...current,
      bookmarks: current.bookmarks.includes(id)
        ? current.bookmarks.filter((questionId) => questionId !== id)
        : [...current.bookmarks, id],
    }), { flush: "immediate" })
  }

  if (isInitializing) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <div className="text-center" role="status">
          <Sparkles className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 font-display text-lg font-bold">Starting practice…</p>
        </div>
      </main>
    )
  }

  if (displayedView === "exam" && practiceState.activeAttempt) {
    return (
      <>
        <SyncNotificationBanner
          notification={syncNotification}
          onDismiss={dismissSyncNotification}
        />
        <ExamRunner
          attempt={practiceState.activeAttempt}
          bookmarks={practiceState.bookmarks}
          onUpdate={updateAttempt}
          onFinish={finishAttempt}
          onBookmark={toggleBookmark}
          onExit={exitAttempt}
        />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SyncNotificationBanner
        notification={syncNotification}
        onDismiss={dismissSyncNotification}
      />
      <TopNav
        view={displayedView}
        syncStatus={syncStatus}
        pinnedToAccount={pinnedToAccount}
        navigationLockMessage={navigationLockMessage}
        onNavigate={navigate}
        mobileOpen={mobileNav}
        onMobileOpen={setMobileNav}
      />
      <main>
        {displayedView === "dashboard" && (
          <Dashboard
            practiceState={practiceState}
            hasAccount={hasAccount}
            onStart={() => navigate("setup")}
            onResume={resumeActiveAttempt}
            onDomain={(domain) => startAttempt("domain", [domain])}
            onReview={() => navigate("review")}
            onResources={() => navigate("resources")}
          />
        )}
        {displayedView === "setup" && <ExamSetup onStart={startAttempt} />}
        {displayedView === "results" && latestFinishedAttempt && (
          <Results
            attempt={latestFinishedAttempt}
            bookmarks={practiceState.bookmarks}
            onBookmark={toggleBookmark}
            onDashboard={() => navigate("dashboard")}
            onRetry={() => startAttempt(latestFinishedAttempt.mode, latestFinishedAttempt.domains)}
            onReview={() => navigate("review")}
          />
        )}
        {displayedView === "review" && <Review practiceState={practiceState} onBookmark={toggleBookmark} onPractice={() => navigate("setup")} />}
        {displayedView === "resources" && <Resources onPractice={() => navigate("setup")} />}
        {displayedView === "account" && (
          <AccountView
            mode={practiceMode}
            syncStatus={syncStatus}
            accountIdentity={accountIdentity}
            accountAvailable={accountAvailable}
            signingIn={accountAction === "sign-in"}
            notice={accountNotice}
            practiceState={practiceState}
            dataAction={accountAction === "reset" || accountAction === "delete-account" ? accountAction : null}
            confirmation={accountConfirmation}
            accountDeletionStage={accountDeletionStage}
            onSignIn={beginSignIn}
            onSignOut={safelySignOut}
            onExport={downloadPracticeStateExport}
            onRequestReset={() => setAccountConfirmation("reset")}
            onRequestAccountDeletion={() => setAccountConfirmation("delete-account")}
            onCancelConfirmation={() => setAccountConfirmation(null)}
            onConfirmReset={() => void resetVisiblePracticeState()}
            onConfirmAccountDeletion={() => void deleteCurrentAccount()}
          />
        )}
      </main>
      <Footer />
    </div>
  )
}

export function SyncNotificationBanner({
  notification,
  onDismiss,
}: {
  notification: PracticeSyncNotification | null
  onDismiss: () => void
}) {
  if (!notification) return null

  return (
    <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-destructive/30 bg-card p-4 text-card-foreground shadow-lg" role="alert">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-6">{notification.message}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-mr-2 -mt-2 h-9 w-9 shrink-0"
        onClick={onDismiss}
        aria-label="Dismiss sync explanation"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white">
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

export const RECOVERY_NAVIGATION_HINT = "Sign in again from Account to unlock the rest of the practice tool. Your practice state is protected on this device."
export const ACCOUNT_DELETION_NAVIGATION_HINT = "Finish account deletion from Account to unlock the rest of the practice tool. Deleted practice data will not be restored."

export function TopNav({
  view,
  syncStatus,
  pinnedToAccount = false,
  navigationLockMessage = RECOVERY_NAVIGATION_HINT,
  onNavigate,
  mobileOpen,
  onMobileOpen,
}: {
  view: AppView
  syncStatus: PracticeSyncStatus
  pinnedToAccount?: boolean
  navigationLockMessage?: string
  onNavigate: (view: AppView) => void
  mobileOpen: boolean
  onMobileOpen: (open: boolean) => void
}) {
  const items: { view: AppView; label: string; icon: typeof Home }[] = [
    { view: "dashboard", label: "Dashboard", icon: Home },
    { view: "setup", label: "Practice", icon: CircleHelp },
    { view: "review", label: "Review", icon: History },
    { view: "resources", label: "Study path", icon: BookOpen },
    { view: "account", label: "Account", icon: UserRound },
  ]
  const isLocked = (destination: AppView) => pinnedToAccount && destination !== "account"
  const lockProps = (destination: AppView): {
    disabled?: boolean
    title?: string
    "aria-describedby"?: string
  } => isLocked(destination)
    ? {
        disabled: true,
        title: navigationLockMessage,
        "aria-describedby": "recovery-navigation-hint",
      }
    : {}
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="container flex min-h-[72px] flex-wrap items-center">
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          aria-label="Agentic Ready dashboard"
          {...lockProps("dashboard")}
          className="my-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Brand />
        </button>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {items.map((item) => (
            <button
              type="button"
              key={item.view}
              onClick={() => onNavigate(item.view)}
              aria-current={view === item.view ? "page" : undefined}
              {...lockProps(item.view)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                view === item.view ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          onClick={() => onMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-primary-navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="order-last flex w-full items-center justify-between gap-3 border-t border-border/70 py-2.5 lg:order-none lg:ml-4 lg:w-auto lg:border-0 lg:py-0">
          <SyncStatusIndicator status={syncStatus} />
          <Button
            size="sm"
            className="hidden md:flex"
            onClick={() => onNavigate("setup")}
            {...lockProps("setup")}
          >
            <Play className="h-4 w-4 fill-current" /> Start practice
          </Button>
        </div>
        {pinnedToAccount && (
          <p id="recovery-navigation-hint" className="sr-only">{navigationLockMessage}</p>
        )}
      </div>
      {mobileOpen && (
        <nav id="mobile-primary-navigation" className="container grid gap-1 border-t py-3 md:hidden" aria-label="Mobile navigation">
          {items.map((item) => (
            <button
              type="button"
              key={item.view}
              onClick={() => onNavigate(item.view)}
              aria-current={view === item.view ? "page" : undefined}
              {...lockProps(item.view)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                view === item.view ? "bg-muted" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}

export function SyncStatusIndicator({
  status,
  now,
  announce = true,
  className,
}: {
  status: PracticeSyncStatus
  now?: number
  announce?: boolean
  className?: string
}) {
  const { text } = useLocalization()
  const [clock, setClock] = useState(() => now ?? Date.now())
  const syncedAt = status.kind === "synced" ? status.syncedAt : null

  useEffect(() => {
    if (now !== undefined || syncedAt === null) return
    const timer = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [now, syncedAt])

  const currentTime = now ?? clock
  const state = syncStatusCopy(status, text)
  const elapsed = status.kind === "synced" && status.syncedAt !== null
    ? text("sync.status.acceptedAt", {
        acceptedAt: status.syncedAt,
        now: currentTime,
      })
    : ""
  const iconAndColor: Record<PracticeSyncStatus["kind"], { icon: typeof Cloud; color: string }> = {
    guest: { icon: HardDrive, color: "text-muted-foreground" },
    syncing: { icon: LoaderCircle, color: "text-brand-bright" },
    synced: { icon: Cloud, color: "text-success" },
    offline: { icon: WifiOff, color: "text-warning" },
    attention: { icon: CloudOff, color: "text-warning" },
    "signing-out": { icon: LoaderCircle, color: "text-brand-bright" },
  }
  const { icon: Icon, color } = iconAndColor[status.kind]
  const title = status.kind === "synced" && status.syncedAt !== null
    ? text("sync.status.title", { acceptedAt: status.syncedAt })
    : undefined

  return (
    <div
      className={cn("inline-flex min-w-0 items-center gap-2 text-xs font-semibold", color, className)}
      title={title}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          (status.kind === "syncing" || status.kind === "signing-out") && "animate-spin motion-reduce:animate-none",
        )}
        aria-hidden="true"
      />
      <span
        role={announce ? "status" : undefined}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {state}
      </span>
      {elapsed && <span> {elapsed}</span>}
    </div>
  )
}

// Exported as a focused test seam alongside the status component.
// eslint-disable-next-line react-refresh/only-export-components
export function syncStatusCopy(status: PracticeSyncStatus, text: Text) {
  const messageKeys = {
    guest: "sync.status.guest",
    syncing: "sync.status.syncing",
    synced: "sync.status.synced",
    offline: "sync.status.offline",
    attention: "sync.status.attention",
    "signing-out": "sync.status.signingOut",
  } as const satisfies Record<PracticeSyncStatus["kind"], MessageKey>

  return text(messageKeys[status.kind])
}

function InterfaceLanguageControl() {
  const { language, persistence, setLanguage, text } = useLocalization()
  const helperId = "interface-language-helper"
  const statusId = "interface-language-persistence"
  const describedBy = persistence === "session-only" ? `${helperId} ${statusId}` : helperId

  return (
    <div className="mt-8">
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Globe2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="interface-language" className="font-display text-base font-bold">
            {text("account.language.label")}
          </label>
          <p id={helperId} className="mt-1 text-xs leading-5 text-muted-foreground">
            {text("account.language.helper")}
          </p>
        </div>
        <select
          id="interface-language"
          value={language}
          aria-describedby={describedBy}
          className="h-10 min-w-40 rounded-full border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isInterfaceLanguage(next)) setLanguage(next)
          }}
        >
          {INTERFACE_LANGUAGE_OPTIONS.map((option) => (
            <option
              key={option.language}
              value={option.language}
              lang={option.language}
            >
              {option.endonym}
            </option>
          ))}
        </select>
      </div>
      {persistence === "session-only" && (
        <p id={statusId} className="mt-2 text-xs leading-5 text-muted-foreground" role="status" aria-live="polite">
          {text("account.language.persistenceFailed")}
        </p>
      )}
    </div>
  )
}

function PracticeQuestionBankNotice() {
  const { text } = useLocalization()
  return (
    <div className="mt-8 flex max-w-2xl min-w-0 items-start gap-3 text-sm leading-6 text-muted-foreground">
      <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{text("practice.setup.questionBankNotice")}</p>
    </div>
  )
}

export function AccountView({
  mode,
  syncStatus,
  accountIdentity,
  accountAvailable,
  signingIn,
  notice,
  practiceState,
  dataAction,
  confirmation,
  accountDeletionStage,
  onSignIn,
  onSignOut,
  onExport,
  onRequestReset,
  onRequestAccountDeletion,
  onCancelConfirmation,
  onConfirmReset,
  onConfirmAccountDeletion,
}: {
  mode: PracticeStateMode
  syncStatus: PracticeSyncStatus
  accountIdentity?: AccountIdentity | null
  accountAvailable: boolean
  signingIn: boolean
  notice: { kind: "success" | "error"; message: string } | null
  practiceState?: PracticeState
  dataAction?: "reset" | "delete-account" | null
  confirmation?: "reset" | "delete-account" | null
  accountDeletionStage?: "identity" | null
  onSignIn: () => void
  onSignOut: () => void
  onExport?: (practiceState: PracticeState) => void
  onRequestReset?: () => void
  onRequestAccountDeletion?: () => void
  onCancelConfirmation?: () => void
  onConfirmReset?: () => void
  onConfirmAccountDeletion?: () => void
}) {
  const isGuest = mode.kind === "guest"
  const needsReauthentication = mode.kind === "reauthenticating"
  const dataControlsReady = isGuest || mode.kind === "account"
  const isSigningOut = syncStatus.kind === "signing-out"
  const visibleAccountIdentity = mode.kind === "account" || mode.kind === "transitioning"
    ? accountIdentity
    : null

  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <Eyebrow>Account</Eyebrow>
      <h1 className="section-title text-4xl">
        {isGuest ? "Practice your way." : needsReauthentication ? "Reconnect safely." : "Practice across devices."}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
        {isGuest
          ? "Guest practice is permanent and complete. A GitHub account is optional and adds only cross-device sync and recovery after browser data is cleared."
          : needsReauthentication
            ? "Your account practice state is protected on this device. Sign in to the same GitHub account to make it available again."
            : "Your account keeps the practice state on this device and synchronizes it when the service is available."}
      </p>

      {notice && (
        <div
          className={cn(
            "mt-7 rounded-xl border p-4 text-sm leading-6",
            notice.kind === "error"
              ? "border-warning-border bg-warning-soft text-warning"
              : "border-success-border bg-success-soft text-success",
          )}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {notice.message}
        </div>
      )}

      <InterfaceLanguageControl />

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
              {isGuest ? <HardDrive className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            </div>
            <CardTitle>{isGuest ? "Guest practice" : "Sync status"}</CardTitle>
            <CardDescription>
              {isGuest
                ? "Your practice state is saved only in this browser and remains fully usable offline."
                : "Edits are saved locally first, then synchronized without blocking practice."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="rounded-xl border bg-muted/40 p-4"
              role={visibleAccountIdentity ? "group" : undefined}
              aria-label={visibleAccountIdentity
                ? `Sync status for @${visibleAccountIdentity.githubUsername}`
                : undefined}
            >
              {visibleAccountIdentity && (
                <div className="mb-3 flex min-w-0 items-center gap-3 border-b pb-3">
                  <img
                    src={visibleAccountIdentity.avatarUrl}
                    alt={`@${visibleAccountIdentity.githubUsername} GitHub avatar`}
                    className="h-10 w-10 shrink-0 rounded-full border bg-background object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <span className="truncate text-sm font-semibold text-foreground">
                    @{visibleAccountIdentity.githubUsername}
                  </span>
                </div>
              )}
              <SyncStatusIndicator status={syncStatus} announce={false} />
            </div>
          </CardContent>
        </Card>

        {(isGuest || needsReauthentication) ? (
          <Card className="shadow-none">
            <CardHeader>
              <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-brand-bright">
                <Github className="h-5 w-5" />
              </div>
              <CardTitle>{needsReauthentication ? "Sign in again with GitHub" : "Optional GitHub sign-in"}</CardTitle>
              <CardDescription>
                {needsReauthentication
                  ? "Use the same GitHub account so no other subject can see the protected cache."
                  : "Use GitHub to continue on another device and recover practice after clearing this browser."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={onSignIn}
                disabled={!accountAvailable || signingIn}
              >
                {signingIn ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Github className="h-4 w-4" />}
                {signingIn ? "Opening GitHub…" : needsReauthentication ? "Sign in again with GitHub" : "Sign in with GitHub"}
              </Button>
              {!accountAvailable && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  GitHub sign-in is available when the optional full-stack application is running. Guest practice remains available here.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-none">
            <CardHeader>
              <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
                <LogOut className="h-5 w-5" />
              </div>
              <CardTitle>Sign out safely</CardTitle>
              <CardDescription>
                Pending practice state must be accepted before sign-out can finish. If syncing is unavailable, sign-out stays blocked and never offers a discard shortcut.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm leading-6 text-muted-foreground">
                After sign-out, this account’s cache is removed from this device and a new empty guest practice state begins.
              </p>
              <Button type="button" variant="outline" onClick={onSignOut} disabled={isSigningOut || Boolean(dataAction) || accountDeletionStage === "identity"}>
                {isSigningOut && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                {isSigningOut ? "Signing out…" : "Sign out"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle>Export practice state</CardTitle>
            <CardDescription>
              Download a client-generated JSON copy of the practice state currently visible here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => practiceState && onExport?.(practiceState)}
              disabled={!practiceState || !onExport || Boolean(dataAction)}
            >
              <Download className="h-4 w-4" />
              Download JSON
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-warning-soft text-warning">
              <RotateCcw className="h-5 w-5" />
            </div>
            <CardTitle>Reset practice state</CardTitle>
            <CardDescription>
              Start fresh without changing your sign-in choice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-5 text-sm leading-6 text-muted-foreground">
              Deletes finished attempts, bookmarks, and latest answers. This cannot be undone.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onRequestReset}
              disabled={!dataControlsReady || Boolean(dataAction) || accountDeletionStage === "identity"}
            >
              <RotateCcw className="h-4 w-4" />
              Reset practice state
            </Button>
          </CardContent>
        </Card>
      </div>

      {mode.kind === "account" && (
        <Card className="mt-5 border-destructive/30 shadow-none">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <XCircle className="h-5 w-5" />
            </div>
            <CardTitle>
              {accountDeletionStage === "identity" ? "Finish deleting account" : "Delete account"}
            </CardTitle>
            <CardDescription>
              {accountDeletionStage === "identity"
                ? "Practice data is deleted. The unfinished identity step can be retried safely without restoring it."
                : "Permanently remove both your practice state and signed-in identity."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accountDeletionStage !== "identity" && (
              <p className="mb-5 text-sm leading-6 text-muted-foreground">
                Practice state is deleted first. Your account for this practice app is deleted only after that succeeds. Your GitHub account itself is not changed.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="destructive"
                onClick={onRequestAccountDeletion}
                disabled={Boolean(dataAction) || signingIn}
              >
                {dataAction === "delete-account" && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                {dataAction === "delete-account"
                  ? "Deleting…"
                  : accountDeletionStage === "identity"
                    ? "Retry account deletion"
                    : "Delete account"}
              </Button>
              {accountDeletionStage === "identity" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onSignIn}
                  disabled={!accountAvailable || signingIn || Boolean(dataAction)}
                >
                  {signingIn ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Github className="h-4 w-4" />}
                  {signingIn ? "Opening GitHub…" : "Sign in again with GitHub"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {confirmation === "reset" && (
        <AccountConfirmationDialog
          title="Delete practice state and start fresh?"
          description={isGuest
            ? "This permanently deletes your finished attempts, bookmarks, and latest answers only from this browser."
            : "This permanently deletes your finished attempts, bookmarks, and latest answers from the server and this device. It keeps your sign-in and your account for this practice app."}
          confirmLabel="Delete practice data"
          pending={dataAction === "reset"}
          onCancel={onCancelConfirmation ?? (() => {})}
          onConfirm={onConfirmReset ?? (() => {})}
        />
      )}
      {confirmation === "delete-account" && (
        <AccountConfirmationDialog
          title={accountDeletionStage === "identity" ? "Finish deleting your account?" : "Permanently delete your account?"}
          description={accountDeletionStage === "identity"
            ? "Your finished attempts, bookmarks, and latest answers are already deleted. Retrying now deletes only the unfinished account identity for this practice app. Your GitHub account itself is not changed."
            : "This permanently deletes your finished attempts, bookmarks, and latest answers. Practice state is deleted first. Your account for this practice app is deleted only after that succeeds. Your GitHub account itself is not changed."}
          confirmLabel={accountDeletionStage === "identity" ? "Finish deleting account" : "Delete practice data and account"}
          pending={dataAction === "delete-account"}
          onCancel={onCancelConfirmation ?? (() => {})}
          onConfirm={onConfirmAccountDeletion ?? (() => {})}
        />
      )}
    </div>
  )
}

function AccountConfirmationDialog({
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === "function") {
      element.showModal()
    } else {
      element.setAttribute("open", "")
    }
    return () => {
      if (!element.open) return
      if (typeof element.close === "function") element.close()
      else element.removeAttribute("open")
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className="fixed inset-0 z-50 m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-background/80"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="account-confirmation-title"
      aria-describedby="account-confirmation-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
    >
      <div className="p-6">
        <h2 id="account-confirmation-title" className="font-display text-xl font-bold">
          {title}
        </h2>
        <p id="account-confirmation-description" className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

function Dashboard({
  practiceState,
  hasAccount,
  onStart,
  onResume,
  onDomain,
  onReview,
  onResources,
}: {
  practiceState: PracticeState
  hasAccount: boolean
  onStart: () => void
  onResume: () => void
  onDomain: (domain: DomainId) => void
  onReview: () => void
  onResources: () => void
}) {
  const finishedAttempts = practiceState.attempts
  const readiness = readinessScore(practiceState.latestAnswers, questions)
  const answered = countAnswered(practiceState.latestAnswers, questions)
  const best = finishedAttempts.length ? Math.max(...finishedAttempts.map((attempt) => attempt.score)) : 0

  return (
    <>
      <section className="hero-grid border-b border-border/80 bg-surface">
        <div className="container grid gap-10 py-14 lg:grid-cols-[1.35fr_0.65fr] lg:items-center lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-5 flex flex-wrap gap-2">
              <a href="https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600" target="_blank" rel="noreferrer" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-brand-bright transition hover:border-primary hover:bg-primary/20">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Built for the current GH-600 blueprint
                </Badge>
              </a>
              <a href="https://github.com/timbarreto/acn-fde" target="_blank" rel="noreferrer" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Badge variant="outline" className="transition hover:border-primary/60 hover:bg-primary/10">
                  View on GitHub <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Badge>
              </a>
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Practice the judgment behind <span className="text-brand-gradient">agentic systems.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Scenario-based drills for operating, supervising, evaluating, and governing AI agents with GitHub as the control plane.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {practiceState.activeAttempt ? (
                <Button size="lg" onClick={onResume}><Play className="h-4 w-4 fill-current" /> Resume {practiceState.activeAttempt.label}</Button>
              ) : (
                <Button size="lg" onClick={onStart}><Play className="h-4 w-4 fill-current" /> Start a practice exam</Button>
              )}
              <Button size="lg" variant="outline" onClick={onResources}>View study path <ArrowRight className="h-4 w-4" /></Button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> Unofficial practice tool · {hasAccount ? "saved locally first and synced when connected" : "your practice state stays in this browser"}
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
            const { score, answered: domainAnswered } = domainProgress(practiceState.latestAnswers, questions, domain.id)
            const tested = domainAnswered > 0
            return (
              <button key={domain.id} onClick={() => onDomain(domain.id)} className="group rounded-xl border bg-card p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                  <span className="flex items-center gap-1 text-brand-bright opacity-0 transition group-hover:opacity-100">Practice <ChevronRight className="h-4 w-4" /></span>
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
    <Card className="relative overflow-hidden border-border bg-card shadow-soft">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[70px] bg-primary/10" />
      <CardContent className="relative p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Readiness signal</div>
            <div className="mt-1 text-sm text-muted-foreground">Across the full question bank</div>
          </div>
          <BarChart3 className="h-5 w-5 text-success" />
        </div>
        <div className="my-7 flex justify-center">
          <div className="relative h-36 w-36">
            <svg className="h-36 w-36 -rotate-90" viewBox="0 0 128 128" aria-label={`${score}% readiness`}>
              <circle cx="64" cy="64" r="54" fill="none" stroke="#232a37" strokeWidth="10" />
              <circle cx="64" cy="64" r="54" fill="none" stroke="#ec008c" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
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

export function ExamSetup({ onStart }: { onStart: (mode: AttemptMode, domains?: DomainId[]) => void }) {
  const [selectedDomains, setSelectedDomains] = useState<DomainId[]>([])
  const selectedCount = questions.filter((question) => selectedDomains.includes(question.domain)).length
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <div className="max-w-2xl">
        <Eyebrow>Practice modes</Eyebrow>
        <h1 className="section-title text-4xl">Choose the kind of pressure you need.</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">Every mode uses the same local question bank. Answers are recorded automatically, so you can leave and resume.</p>
      </div>
      <PracticeQuestionBankNotice />
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
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted")}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ color: domain.color, background: domain.soft }}><domain.icon className="h-4 w-4" /></div>
                <div className="min-w-0"><div className="truncate text-sm font-bold">{domain.number} · {domain.short}</div><div className="text-xs text-muted-foreground">{domain.weight}</div></div>
                {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </button>
            )
          })}
        </CardContent>
      </Card>
      <div className="mt-6 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm leading-6 text-warning">
        <strong>Exam note:</strong> This is an original, unofficial question bank based on the published skills outline and linked documentation—not Microsoft exam content or a prediction of exact questions.
      </div>
    </div>
  )
}

function ModeCard({ icon: Icon, eyebrow, title, description, meta, onClick, accent = false, disabled = false }: { icon: typeof Trophy; eyebrow: string; title: string; description: string; meta: string; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <Card className={cn("flex flex-col overflow-hidden shadow-none transition hover:-translate-y-0.5 hover:shadow-soft", accent && "border-transparent bg-brand-gradient text-white")}>
      <CardHeader className="flex-1">
        <div className={cn("mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-brand-bright", accent && "bg-white/10 text-white")}><Icon className="h-5 w-5" /></div>
        <div className={cn("text-xs font-bold uppercase tracking-[0.17em] text-brand-bright", accent && "text-white/75")}>{eyebrow}</div>
        <CardTitle className={cn("pt-2", accent && "text-white")}>{title}</CardTitle>
        <CardDescription className={cn(accent && "text-white/70")}>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground", accent && "text-white/65")}><Clock3 className="h-4 w-4" />{meta}</div>
        <Button variant="secondary" className={cn("w-full", accent && "bg-white font-bold text-[#b3007a] hover:bg-white/90")} onClick={onClick} disabled={disabled}>Begin <ArrowRight className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  )
}

export function ExamRunner({ attempt, bookmarks, onUpdate, onFinish, onBookmark, onExit }: { attempt: Attempt; bookmarks: string[]; onUpdate: (attempt: Attempt) => void; onFinish: (attempt: Attempt, outcome: AttemptOutcome) => void; onBookmark: (id: string) => void; onExit: (attempt: Attempt) => void }) {
  const [now, setNow] = useState(Date.now())
  const [mapOpen, setMapOpen] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const currentId = attempt.questionIds[attempt.currentIndex]
  const question = questionMap.get(currentId)!
  const answer = attempt.answers[currentId] ?? []
  const timerPaused = isAttemptPaused(attempt)
  const remaining = getAttemptRemainingSeconds(attempt, now)
  const answeredCount = Object.values(attempt.answers).filter((values) => values.length).length
  const domain = domainMap[question.domain]
  const isRevealed = Boolean(revealed[currentId])
  const isCurrentCorrect = answersMatch(answer, question.correctAnswers)

  useEffect(() => {
    if (timerPaused) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [timerPaused])

  useEffect(() => {
    if (!timerPaused && remaining === 0) onFinish(attempt, "expired")
  }, [remaining, onFinish, attempt, timerPaused])

  const choose = (optionId: string) => {
    if (isRevealed) return
    const next = question.type === "single"
      ? [optionId]
      : answer.includes(optionId) ? answer.filter((id) => id !== optionId) : [...answer, optionId]
    onUpdate({ ...attempt, answers: { ...attempt.answers, [currentId]: next } })
  }

  const setIndex = (index: number) => onUpdate({ ...attempt, currentIndex: index })
  const toggleFlag = () => onUpdate({ ...attempt, flagged: attempt.flagged.includes(currentId) ? attempt.flagged.filter((id) => id !== currentId) : [...attempt.flagged, currentId] })
  const toggleTimer = () => {
    const changedAt = Date.now()
    setNow(changedAt)
    onUpdate(timerPaused ? resumeAttemptTimer(attempt, changedAt) : pauseAttemptTimer(attempt, changedAt))
  }
  const pauseAndExit = () => onExit(pauseAttemptTimer(attempt))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="container flex h-[72px] items-center justify-between gap-4">
          <button onClick={pauseAndExit} className="hidden rounded-xl text-left focus-visible:ring-2 sm:block"><Brand /></button>
          <div className="min-w-0 flex-1 sm:flex-none">
            <div className="truncate text-sm font-bold">{attempt.label}</div>
            <div className="text-xs text-muted-foreground">Question {attempt.currentIndex + 1} of {attempt.questionIds.length}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTimer}
              disabled={remaining === 0}
              aria-label={`${timerPaused ? "Resume" : "Pause"} timer, ${formatDuration(remaining)} remaining`}
              aria-pressed={timerPaused}
              title={timerPaused ? "Resume timer" : "Pause timer"}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                timerPaused ? "border-primary/40 bg-primary/10 text-primary" : remaining < 300 && "border-danger-border bg-danger-soft text-danger",
              )}
            >
              {timerPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
              <span className="font-mono">{formatDuration(remaining)}</span>
              {timerPaused && <span className="hidden text-xs sm:inline">Paused</span>}
            </button>
            <Button variant="outline" className="hidden sm:flex" onClick={pauseAndExit}>Pause & exit</Button>
            <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMapOpen(!mapOpen)} aria-label="Toggle question map"><Layers3 className="h-4 w-4" /></Button>
          </div>
        </div>
        <Progress value={((attempt.currentIndex + 1) / attempt.questionIds.length) * 100} className="h-1 rounded-none" />
      </header>

      <div className="container grid max-w-6xl gap-7 py-8 lg:grid-cols-[1fr_280px] lg:py-12">
        <main>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={{ color: domain.color, background: domain.soft, borderColor: "transparent" }}>Domain {domain.number} · {domain.short}</Badge>
              <Badge variant="outline" className="capitalize">{question.difficulty}</Badge>
              <span className="text-xs font-medium text-muted-foreground" {...questionBankContentProps()}>{question.objective}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={toggleFlag} className={cn(attempt.flagged.includes(currentId) && "text-danger")}>
              <Flag className={cn("h-4 w-4", attempt.flagged.includes(currentId) && "fill-current")} /> <span className="hidden sm:inline">Flag</span>
            </Button>
          </div>
          <Card className="shadow-none">
            <CardContent className="p-6 sm:p-9">
              <div className="flex gap-4">
                <span className="font-display text-sm font-extrabold text-muted-foreground">{String(attempt.currentIndex + 1).padStart(2, "0")}</span>
                <div className="flex-1">
                  <h1 className="font-display text-xl font-bold leading-relaxed tracking-tight sm:text-2xl" {...questionBankContentProps()}>{question.prompt}</h1>
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
                            ? "border-success bg-success-soft ring-1 ring-success"
                            : selected
                              ? "border-danger bg-danger-soft ring-1 ring-danger"
                              : "opacity-70"
                            : selected
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "hover:border-primary/30 hover:bg-muted/50",
                      )}
                    >
                      <span className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold transition",
                        isRevealed
                          ? correctOption
                            ? "border-success bg-success text-background"
                            : selected
                              ? "border-danger bg-danger text-background"
                              : "bg-background text-muted-foreground"
                          : selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground group-hover:border-primary/30",
                      )}>
                        {isRevealed ? (correctOption ? <Check className="h-4 w-4" /> : selected ? <X className="h-4 w-4" /> : String.fromCharCode(65 + index)) : selected ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + index)}
                      </span>
                      <span className="pt-1 text-[15px] font-medium leading-6" {...questionBankContentProps()}>{option.text}</span>
                    </button>
                  )
                })}
              </div>
              {isRevealed && (
                <div className="mt-6 rounded-xl border bg-muted/60 p-5">
                  <div className={cn("flex items-center gap-2 text-sm font-bold", isCurrentCorrect ? "text-success" : "text-danger")}>
                    {isCurrentCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {isCurrentCorrect ? "Correct" : "Not quite"}
                  </div>
                  <p className="mt-2 text-sm leading-6" {...questionBankContentProps()}>{question.explanation}</p>
                  <a href={question.source.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-bright hover:underline" {...questionBankContentProps()}>{question.source.label} <ExternalLink className="h-3 w-3" /></a>
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
              <Button onClick={() => onFinish(attempt, "submitted")}>Submit attempt <CheckCircle2 className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={() => setIndex(attempt.currentIndex + 1)}>Next question <ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </main>
        <aside className={cn("h-fit rounded-xl border bg-card p-5 shadow-soft lg:sticky lg:top-28 lg:block", mapOpen ? "block" : "hidden")}>
          <div className="flex items-center justify-between">
            <div><h2 className="font-display text-sm font-bold">Question map</h2><p className="mt-1 text-xs text-muted-foreground">{answeredCount} of {attempt.questionIds.length} answered</p></div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMapOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <Progress value={(answeredCount / attempt.questionIds.length) * 100} className="mt-4" />
          <div className="mt-5 grid grid-cols-5 gap-2">
            {attempt.questionIds.map((id, index) => {
              const mapQuestion = questionMap.get(id)
              const isAnswered = Boolean(attempt.answers[id]?.length)
              const isCurrent = index === attempt.currentIndex
              return (
                <button
                  key={id}
                  onClick={() => { setIndex(index); setMapOpen(false) }}
                  title={mapQuestion?.prompt}
                  aria-labelledby={mapQuestion
                    ? `question-map-label-${id} question-map-prompt-${id}`
                    : `question-map-label-${id}`}
                  className={cn("relative grid aspect-square place-items-center rounded-lg border text-xs font-bold transition", isCurrent ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted", isAnswered && !isCurrent && "border-primary/20 bg-primary text-primary-foreground")}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <span id={`question-map-label-${id}`} className="sr-only">
                    Question {index + 1}:
                  </span>
                  {mapQuestion && (
                    <span
                      id={`question-map-prompt-${id}`}
                      className="sr-only"
                      {...questionBankContentProps()}
                    >
                      {mapQuestion.prompt}
                    </span>
                  )}
                  {attempt.flagged.includes(id) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-danger" />}
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

export function Results({ attempt, bookmarks, onBookmark, onDashboard, onRetry, onReview }: { attempt: FinishedAttempt; bookmarks: string[]; onBookmark: (id: string) => void; onDashboard: () => void; onRetry: () => void; onReview: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const passed = attempt.score >= PASS_SCORE
  const correctCount = attempt.questionIds.filter((id) => answersMatch(attempt.answers[id], questionMap.get(id)!.correctAnswers)).length
  const duration = Math.min(attempt.durationMinutes, Math.max(1, Math.round((attempt.finishedAt - attempt.startedAt) / 60_000)))
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <Card className={cn("overflow-hidden text-center shadow-none", passed ? "border-success-border" : "border-danger-border")}>
          <div className={cn("h-2", passed ? "bg-success" : "bg-danger")} />
          <CardContent className="p-8">
            <div className={cn("mx-auto grid h-16 w-16 place-items-center rounded-xl", passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
              {passed ? <Trophy className="h-8 w-8" /> : <Target className="h-8 w-8" />}
            </div>
            <div className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">{passed ? "Passing signal" : "Keep building"}</div>
            <div className="mt-2 font-display text-6xl font-extrabold tracking-tight">{attempt.score}<span className="text-2xl text-muted-foreground">%</span></div>
            <p className="mt-3 text-sm text-muted-foreground">{correctCount} of {attempt.questionIds.length} correct · {duration} min</p>
          </CardContent>
        </Card>
        <div>
          <div className="mb-3 flex items-center gap-3"><Eyebrow>Attempt finished</Eyebrow><FinishedAttemptOutcome outcome={attempt.outcome} /></div>
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
                  {correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
                  <div className="flex-1"><div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Question {index + 1} · {domainMap[question.domain].short}</div><div className="font-semibold leading-6" {...questionBankContentProps()}>{question.prompt}</div></div>
                  <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t px-5 pb-5 pt-4 sm:pl-14">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AnswerSummary label="Your answer" ids={attempt.answers[id] ?? []} question={question} correct={correct} />
                      <AnswerSummary label="Correct answer" ids={question.correctAnswers} question={question} correct />
                    </div>
                    <div className="mt-4 rounded-xl bg-muted p-4"><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Why</div><p className="mt-2 text-sm leading-6" {...questionBankContentProps()}>{question.explanation}</p></div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <a href={question.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-bright hover:underline"><span {...questionBankContentProps()}>{question.source.label}</span> <ExternalLink className="h-3 w-3" /></a>
                      <Button variant="ghost" size="sm" onClick={() => onBookmark(id)}><Bookmark className={cn("h-4 w-4", bookmarks.includes(id) && "fill-current")} />{bookmarks.includes(id) ? "Bookmarked" : "Bookmark"}</Button>
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

export function AnswerSummary({ label, ids, question, correct }: { label: string; ids: string[]; question: Question; correct: boolean }) {
  return <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className={cn("mt-2 rounded-lg border p-3 text-sm font-medium", correct ? "border-success-border bg-success-soft" : "border-danger-border bg-danger-soft")}>{ids.length ? ids.map((id, index) => <span key={`${id}-${index}`}>{index > 0 ? "; " : null}<span {...questionBankContentProps()}>{question.options.find((option) => option.id === id)?.text}</span></span>) : "No answer"}</div></div>
}

export function FinishedAttemptOutcome({ outcome }: { outcome: AttemptOutcome }) {
  const labels: Record<AttemptOutcome, string> = {
    submitted: "Submitted",
    expired: "Expired",
    abandoned: "Abandoned",
  }
  return <Badge variant="outline" className="capitalize">{labels[outcome]}</Badge>
}

export function Review({ practiceState, onBookmark, onPractice }: { practiceState: PracticeState; onBookmark: (id: string) => void; onPractice: () => void }) {
  const { text } = useLocalization()
  const [filter, setFilter] = useState<"missed" | "bookmarks" | "history">("missed")
  const missedIds = useMemo(() => {
    const found: string[] = []
    practiceState.attempts.forEach((attempt) => attempt.questionIds.forEach((id) => {
      const question = questionMap.get(id)
      if (question && !answersMatch(attempt.answers[id], question.correctAnswers) && !found.includes(id)) found.push(id)
    }))
    return found
  }, [practiceState.attempts])
  const visible = filter === "bookmarks" ? practiceState.bookmarks : missedIds
  return (
    <div className="container max-w-5xl py-12 lg:py-16">
      <Eyebrow>Review center</Eyebrow>
      <h1 className="section-title text-4xl">Turn misses into durable knowledge.</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Revisit incorrect and bookmarked scenarios, or inspect your recent finished attempts. The queue is assembled from this browser's practice history.</p>
      <div className="mt-8 flex flex-wrap gap-2 rounded-xl border bg-card p-1.5 sm:w-fit">
        {([[
          "missed", `Missed (${missedIds.length})`, XCircle,
        ], ["bookmarks", `Bookmarks (${practiceState.bookmarks.length})`, Bookmark], ["history", `History (${practiceState.attempts.length})`, History]] as const).map(([value, label, Icon]) => (
          <button key={value} onClick={() => setFilter(value)} className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition", filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {filter === "history" ? (
        <div className="mt-7 space-y-3">
          {practiceState.attempts.length ? practiceState.attempts.map((attempt) => (
            <Card key={attempt.id} className="shadow-none"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className={cn("grid h-12 w-12 place-items-center rounded-xl font-display text-sm font-bold", attempt.score >= PASS_SCORE ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{attempt.score}%</div><div><div className="font-bold">{attempt.label}</div><div className="mt-1 text-xs text-muted-foreground">{text("review.attempt.finishedAt", { finishedAt: attempt.finishedAt })} · {text("review.attempt.questionCount", { count: attempt.questionIds.length })}</div></div></div><div className="flex flex-wrap gap-2"><FinishedAttemptOutcome outcome={attempt.outcome} /><Badge variant="outline">{attempt.score >= PASS_SCORE ? "Passing" : "Review"}</Badge></div></CardContent></Card>
          )) : <EmptyState title="No finished attempts yet" description="Finish a practice attempt and your scores will appear here." onAction={onPractice} />}
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          {visible.length ? visible.map((id) => {
            const question = questionMap.get(id)
            if (!question) return null
            const domain = domainMap[question.domain]
            return <Card key={id} className="shadow-none"><CardContent className="p-5"><div className="flex items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: domain.soft, color: domain.color }}><domain.icon className="h-4 w-4" /></div><div className="flex-1"><div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{domain.short} · {question.difficulty}</div><h2 className="mt-2 font-display text-lg font-bold leading-7" {...questionBankContentProps()}>{question.prompt}</h2><div className="mt-4 rounded-xl bg-muted p-4 text-sm leading-6"><strong>Correct:</strong> <span {...questionBankContentProps()}>{question.correctAnswers.map((answer) => question.options.find((option) => option.id === answer)?.text).join("; ")}</span><p className="mt-2 text-muted-foreground" {...questionBankContentProps()}>{question.explanation}</p></div></div><Button variant="ghost" size="icon" onClick={() => onBookmark(id)} aria-label="Toggle bookmark"><Bookmark className={cn("h-4 w-4", practiceState.bookmarks.includes(id) && "fill-primary text-primary")} /></Button></div></CardContent></Card>
          }) : <EmptyState title={filter === "bookmarks" ? "No bookmarks yet" : "No missed questions yet"} description={filter === "bookmarks" ? "Bookmark questions during an attempt or from a finished attempt." : "Start a practice set to build your review queue."} onAction={onPractice} />}
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, description, onAction }: { title: string; description: string; onAction: () => void }) {
  return <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground"><BookOpen className="h-5 w-5" /></div><h2 className="mt-4 font-display text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p><Button className="mt-5" onClick={onAction}>Start practice</Button></div>
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
      <section className="hero-grid border-b bg-surface">
        <div className="container grid gap-8 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:py-18">
          <div><Eyebrow>GH-600 study path</Eyebrow><h1 className="section-title text-4xl lg:text-5xl">Learn the blueprint. Practice the decisions.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Follow a focused route through the official learning material, then use practice modes and answer review to strengthen each exam domain.</p></div>
          <div className="rounded-xl border border-border bg-card p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-success" /><p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Published exam profile:</strong> expertise operating, integrating, supervising, and governing agents in production-grade SDLC workflows, with GitHub as the system of record and control plane.</p></div></div>
        </div>
      </section>
      <section className="container max-w-5xl py-14 lg:py-18">
        <div><Eyebrow>Recommended sequence</Eyebrow><h2 className="section-title">A focused route through the material.</h2></div>
        <div className="mt-8 space-y-4">
          {steps.map((step) => (
            <Card key={step.number} className="shadow-none"><CardContent className="grid gap-5 p-6 sm:grid-cols-[56px_1fr_auto] sm:items-center"><div className="font-display text-2xl font-extrabold text-brand-bright">{step.number}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-bold">{step.title}</h3><Badge variant="secondary">{step.domains}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p><a href={step.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{step.resource} <ExternalLink className="h-3.5 w-3.5" /></a></div><FileText className="hidden h-5 w-5 text-muted-foreground sm:block" /></CardContent></Card>
          ))}
        </div>
      </section>
      <section className="container border-t py-14 text-center lg:py-16"><h2 className="font-display text-3xl font-extrabold tracking-tight">Ready to test the first pass?</h2><p className="mx-auto mt-3 max-w-xl text-muted-foreground">Use a full exam to establish your baseline, then alternate focused drills with answer review.</p><Button size="lg" className="mt-6" onClick={onPractice}>Choose a practice mode <ArrowRight className="h-4 w-4" /></Button></section>
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-bright">{children}</div>
}

function Footer() {
  return (
    <footer className="border-t bg-surface">
      <div className="container flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Brand />
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">Unofficial study aid. Not affiliated with or endorsed by Microsoft or GitHub. GH-600, GitHub, and Copilot are trademarks of their respective owners.</p>
        <a href="https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-brand-bright hover:underline"><Github className="h-4 w-4" /> Agentic AI Developer</a>
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
