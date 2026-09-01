// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  ACCOUNT_DELETION_NAVIGATION_HINT,
  AccountView,
  AnswerSummary,
  ExamRunner,
  ExamSetup,
  FinishedAttemptOutcome,
  readSignInFailureNotice,
  RECOVERY_NAVIGATION_HINT,
  SyncNotificationBanner,
  SyncStatusIndicator,
  TopNav,
} from "@/App"
import { domains } from "@/data/domains"
import questionData from "@/data/questions.json"
import {
  createLocalizationStore,
  createMemoryLocalizationEnvironment,
} from "@/lib/localization"
import type { PracticeStateMode, PracticeSyncStatus } from "@/lib/persistence"
import { LocalizationProvider } from "@/lib/use-localization"
import type { Attempt, AttemptOutcome, PracticeState, Question } from "@/types"

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function markupText(markup: string) {
  return markup.replace(/<[^>]+>/g, "")
}

function renderTree(node: ReactNode) {
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount() {
      act(() => {
        root.unmount()
      })
    },
  }
}

function labeledButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((element) => element.textContent?.includes(label))
  if (!button) throw new Error(`Could not find button: ${label}`)
  return button
}

function clickLabeledButton(container: HTMLElement, label: string) {
  const button = labeledButton(container, label)
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  return button
}

const syncStatusCases: Array<[PracticeSyncStatus, string]> = [
  [{ kind: "guest" }, "Saved on this device"],
  [{ kind: "syncing" }, "Syncing…"],
  [{ kind: "synced", syncedAt: 10_000 }, "Synced now"],
  [{ kind: "offline" }, "Offline · saved on this device"],
  [{ kind: "attention" }, "Not synced · saved on this device"],
  [{ kind: "signing-out" }, "Signing out…"],
]

const dataControlPracticeState: PracticeState = {
  activeAttempt: null,
  attempts: [],
  bookmarks: ["arch-001"],
  latestAnswers: { "arch-001": ["b"] },
}

const accountModes: Array<[string, PracticeStateMode]> = [
  ["guest", { kind: "guest" }],
  ["user", { kind: "account", subject: "subject-1" }],
]

describe("SyncStatusIndicator", () => {
  it.each(syncStatusCases)("renders the exact %s state copy", (status, label) => {
    const markup = renderToStaticMarkup(
      <SyncStatusIndicator status={status} now={10_000} />,
    )

    expect(markup).toContain('role="status"')
    expect(markupText(markup)).toContain(label)
  })

  it("turns a synced acceptance time into human-readable relative copy", () => {
    const markup = renderToStaticMarkup(
      <SyncStatusIndicator
        status={{ kind: "synced", syncedAt: 10_000 }}
        now={130_000}
      />,
    )

    expect(markupText(markup)).toContain("Synced 2 minutes ago")
  })

  it("keeps the elapsed time out of the live region so ticking is not announced", () => {
    const liveRegion = /<span role="status"[^>]*>([^<]*)<\/span>/

    const early = renderToStaticMarkup(
      <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={130_000} />,
    )
    const later = renderToStaticMarkup(
      <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={190_000} />,
    )

    expect(markupText(early)).toContain("Synced 2 minutes ago")
    expect(markupText(later)).toContain("Synced 3 minutes ago")
    expect(early.match(liveRegion)![1]).toBe("Synced")
    expect(later.match(liveRegion)![1]).toBe("Synced")
  })

  it("announces from a single live region when the same status is shown twice", () => {
    const markup = renderToStaticMarkup(
      <>
        <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={10_000} />
        <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={10_000} announce={false} />
      </>,
    )

    expect(markup.match(/role="status"/g)).toHaveLength(1)
    expect(markupText(markup)).toContain("Synced now")
  })

  it.each([
    [{ kind: "guest" }, "Guardado en este dispositivo"],
    [{ kind: "syncing" }, "Sincronizando…"],
    [{ kind: "synced", syncedAt: 10_000 }, "Sincronizado"],
    [{ kind: "offline" }, "Sin conexión · guardado en este dispositivo"],
    [{ kind: "attention" }, "No sincronizado · guardado en este dispositivo"],
    [{ kind: "signing-out" }, "Cerrando sesión…"],
  ] as Array<[PracticeSyncStatus, string]>)(
    "renders the %s state in the active interface language",
    (status, label) => {
      const store = createLocalizationStore(
        createMemoryLocalizationEnvironment({ stored: "es" }),
      )
      const markup = renderToStaticMarkup(
        <LocalizationProvider store={store}>
          <SyncStatusIndicator status={status} now={10_000} />
        </LocalizationProvider>,
      )

      expect(markupText(markup)).toContain(label)
    },
  )
})

describe("readSignInFailureNotice", () => {
  it("explains a failed GitHub authorization returned on the Account callback", () => {
    const notice = readSignInFailureNotice("?error=access_denied")

    expect(notice?.kind).toBe("error")
    expect(notice?.code).toBe("signInCallbackFailed")
  })

  it("stays silent when the callback carries no error", () => {
    expect(readSignInFailureNotice("")).toBeNull()
    expect(readSignInFailureNotice("?code=abc")).toBeNull()
  })
})

describe("TopNav", () => {
  it("exposes Account as the fifth primary destination without inviting sign-in", () => {
    const markup = renderToStaticMarkup(
      <TopNav
        view="account"
        syncStatus={{ kind: "guest" }}
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileOpen={vi.fn()}
      />,
    )

    expect(markup).toContain("Account")
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain("Saved on this device")
    expect(markup).not.toContain("Sign in")
  })

  it("navigates to Account from its primary action", () => {
    const onNavigate = vi.fn()
    const { container, unmount } = renderTree(
      <TopNav
        view="dashboard"
        syncStatus={{ kind: "guest" }}
        onNavigate={onNavigate}
        mobileOpen={false}
        onMobileOpen={vi.fn()}
      />,
    )

    clickLabeledButton(container, "Account")

    expect(onNavigate).toHaveBeenCalledWith("account")
    unmount()
  })

  it("keeps the inline destinations and header practice action from the medium breakpoint", () => {
    const markup = renderToStaticMarkup(
      <TopNav
        view="dashboard"
        syncStatus={{ kind: "guest" }}
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileOpen={vi.fn()}
      />,
    )

    expect(markup).toContain("md:flex")
    expect(markup).toContain("md:hidden")
    expect(markup).not.toContain("xl:flex")
  })

  it("explains why other destinations are unavailable during account recovery", () => {
    const onNavigate = vi.fn()
    const props = {
      view: "account" as const,
      syncStatus: { kind: "attention" } as PracticeSyncStatus,
      pinnedToAccount: true,
      onNavigate,
      mobileOpen: false,
      onMobileOpen: vi.fn(),
    }
    const { container, unmount } = renderTree(<TopNav {...props} />)
    const markup = renderToStaticMarkup(<TopNav {...props} />)

    expect(labeledButton(container, "Dashboard")).toHaveProperty("disabled", true)
    expect(labeledButton(container, "Start practice")).toHaveProperty("disabled", true)
    expect(labeledButton(container, "Account")).toHaveProperty("disabled", false)
    expect(markup).toContain('id="recovery-navigation-hint"')
    expect(markupText(markup)).toContain(RECOVERY_NAVIGATION_HINT)
    unmount()
  })

  it("explains navigation locking while account deletion is unfinished", () => {
    const markup = renderToStaticMarkup(
      <TopNav
        view="account"
        syncStatus={{ kind: "attention" }}
        pinnedToAccount
        navigationLockMessage={ACCOUNT_DELETION_NAVIGATION_HINT}
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileOpen={vi.fn()}
      />,
    )

    expect(markupText(markup)).toContain("Finish account deletion from Account")
    expect(markup).toContain('aria-describedby="recovery-navigation-hint"')
  })

  it("locks the brand destination during account recovery and leaves it usable otherwise", () => {
    const brandButton = (markup: string) =>
      markup.match(/<button[^>]*aria-label="Agentic Ready dashboard"[^>]*>/)![0]
    const props = {
      view: "account" as const,
      syncStatus: { kind: "attention" } as PracticeSyncStatus,
      onNavigate: vi.fn(),
      mobileOpen: false,
      onMobileOpen: vi.fn(),
    }

    const recovering = brandButton(renderToStaticMarkup(<TopNav {...props} pinnedToAccount />))
    const usual = brandButton(renderToStaticMarkup(<TopNav {...props} />))

    expect(recovering).toContain('disabled=""')
    expect(recovering).toContain('aria-describedby="recovery-navigation-hint"')
    expect(usual).not.toContain('disabled=""')
    expect(usual).not.toContain("aria-describedby")
  })
})

describe("AccountView", () => {
  it("shows the signed-in GitHub identity in the Sync status panel", () => {
    const markup = renderToStaticMarkup(
      <AccountView
        mode={{ kind: "account", subject: "subject-1" }}
        syncStatus={{ kind: "synced", syncedAt: 10_000 }}
        accountIdentity={{
          githubUsername: "candidate",
          avatarUrl: "https://avatars.githubusercontent.com/u/123456",
        }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(markup).toContain('aria-label="Sync status for @candidate"')
    expect(markupText(markup)).toContain("@candidateSynced")
    expect(markup).toContain('src="https://avatars.githubusercontent.com/u/123456"')
    expect(markup).toContain('alt="@candidate GitHub avatar"')
  })

  it.each([
    { kind: "guest" } as PracticeStateMode,
    { kind: "reauthenticating", subject: "subject-1" } as PracticeStateMode,
  ])("does not show a GitHub identity outside a signed-in mode", (mode) => {
    const markup = renderToStaticMarkup(
      <AccountView
        mode={mode}
        syncStatus={mode.kind === "guest" ? { kind: "guest" } : { kind: "attention" }}
        accountIdentity={{
          githubUsername: "candidate",
          avatarUrl: "https://avatars.githubusercontent.com/u/123456",
        }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(markup).not.toContain("@candidate")
    expect(markup).not.toContain("avatars.githubusercontent.com")
  })

  for (const [modeName, mode] of accountModes) {
    it.each(syncStatusCases)(`renders every sync state for ${modeName} mode`, (status, label) => {
      const markup = renderToStaticMarkup(
        <AccountView
          mode={mode}
          syncStatus={status}
          accountAvailable
          signingIn={false}
          notice={null}
          onSignIn={vi.fn()}
          onSignOut={vi.fn()}
        />,
      )

      expect(markupText(markup)).toContain(status.kind === "synced" ? "Synced" : label)
      expect(markup).not.toContain("aria-live")
      expect(markup).toContain(modeName === "guest" ? "Optional GitHub sign-in" : "Sign out safely")
    })
  }

  it("lets guests and users export exactly the practice state they can see", () => {
    for (const [, mode] of accountModes) {
      const onExport = vi.fn()
      const { container, unmount } = renderTree(
        <AccountView
          mode={mode}
          syncStatus={mode.kind === "guest" ? { kind: "guest" } : { kind: "synced", syncedAt: 10_000 }}
          accountAvailable
          signingIn={false}
          notice={null}
          practiceState={dataControlPracticeState}
          dataAction={null}
          confirmation={null}
          accountDeletionStage={null}
          onSignIn={vi.fn()}
          onSignOut={vi.fn()}
          onExport={onExport}
          onRequestReset={vi.fn()}
          onRequestAccountDeletion={vi.fn()}
          onCancelConfirmation={vi.fn()}
          onConfirmReset={vi.fn()}
          onConfirmAccountDeletion={vi.fn()}
        />,
      )

      clickLabeledButton(container, "Download JSON")

      expect(onExport).toHaveBeenCalledWith(dataControlPracticeState)
      unmount()
    }
  })

  it("confirms reset with explicit practice-state language for guests and users", () => {
    for (const [, mode] of accountModes) {
      const onRequestReset = vi.fn()
      const common = {
        mode,
        syncStatus: mode.kind === "guest"
          ? { kind: "guest" } as PracticeSyncStatus
          : { kind: "synced", syncedAt: 10_000 } as PracticeSyncStatus,
        accountAvailable: true,
        signingIn: false,
        notice: null,
        practiceState: dataControlPracticeState,
        dataAction: null,
        accountDeletionStage: null,
        onSignIn: vi.fn(),
        onSignOut: vi.fn(),
        onExport: vi.fn(),
        onRequestReset,
        onRequestAccountDeletion: vi.fn(),
        onCancelConfirmation: vi.fn(),
        onConfirmReset: vi.fn(),
        onConfirmAccountDeletion: vi.fn(),
      }
      const { container, unmount } = renderTree(<AccountView {...common} confirmation={null} />)

      clickLabeledButton(container, "Reset practice state")
      const confirmation = renderToStaticMarkup(
        <AccountView {...common} confirmation="reset" />,
      )

      expect(onRequestReset).toHaveBeenCalledOnce()
      expect(confirmation).toContain('role="alertdialog"')
      expect(markupText(confirmation)).toContain("finished attempts, bookmarks, and latest answers")
      expect(markupText(confirmation)).toContain(
        mode.kind === "guest" ? "only from this browser" : "keeps your sign-in",
      )
      unmount()
    }
  })

  it("orders account deletion after practice-state deletion with explicit confirmation", () => {
    const onRequestAccountDeletion = vi.fn()
    const common = {
      mode: { kind: "account", subject: "subject-1" } as PracticeStateMode,
      syncStatus: { kind: "synced", syncedAt: 10_000 } as PracticeSyncStatus,
      accountAvailable: true,
      signingIn: false,
      notice: null,
      practiceState: dataControlPracticeState,
      dataAction: null,
      accountDeletionStage: null,
      onSignIn: vi.fn(),
      onSignOut: vi.fn(),
      onExport: vi.fn(),
      onRequestReset: vi.fn(),
      onRequestAccountDeletion,
      onCancelConfirmation: vi.fn(),
      onConfirmReset: vi.fn(),
      onConfirmAccountDeletion: vi.fn(),
    }
    const { container, unmount } = renderTree(<AccountView {...common} confirmation={null} />)

    clickLabeledButton(container, "Delete account")
    const confirmation = renderToStaticMarkup(
      <AccountView {...common} confirmation="delete-account" />,
    )
    const text = markupText(confirmation)

    expect(onRequestAccountDeletion).toHaveBeenCalledOnce()
    expect(text).toContain("finished attempts, bookmarks, and latest answers")
    expect(text.indexOf("Practice state is deleted first"))
      .toBeLessThan(text.indexOf("account for this practice app is deleted"))
    expect(text).toContain("Your GitHub account itself is not changed")
    unmount()
  })

  it("offers the unfinished identity step as a retry without restoring practice data", () => {
    const markup = renderToStaticMarkup(
      <AccountView
        mode={{ kind: "account", subject: "subject-1" }}
        syncStatus={{ kind: "attention" }}
        accountAvailable
        signingIn={false}
        notice={null}
        practiceState={{ activeAttempt: null, attempts: [], bookmarks: [], latestAnswers: {} }}
        dataAction={null}
        confirmation={null}
        accountDeletionStage="identity"
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
        onExport={vi.fn()}
        onRequestReset={vi.fn()}
        onRequestAccountDeletion={vi.fn()}
        onCancelConfirmation={vi.fn()}
        onConfirmReset={vi.fn()}
        onConfirmAccountDeletion={vi.fn()}
      />,
    )

    expect(markupText(markup)).toContain("Practice data is deleted")
    expect(markupText(markup)).toContain("Retry account deletion")
    expect(markupText(markup)).toContain("Sign in again with GitHub")
  })

  it("surfaces a failed GitHub authorization returned to Account", () => {
    const markup = renderToStaticMarkup(
      <AccountView
        mode={{ kind: "guest" }}
        syncStatus={{ kind: "guest" }}
        accountAvailable
        signingIn={false}
        notice={readSignInFailureNotice("?error=access_denied")}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(markup).toContain('role="alert"')
    expect(markupText(markup)).toContain("GitHub sign-in did not finish")
  })

  it("starts GitHub sign-in only from the guest Account action", () => {
    const onSignIn = vi.fn()
    const { container, unmount } = renderTree(
      <AccountView
        mode={{ kind: "guest" }}
        syncStatus={{ kind: "guest" }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={onSignIn}
        onSignOut={vi.fn()}
      />,
    )

    clickLabeledButton(container, "Sign in with GitHub")

    expect(onSignIn).toHaveBeenCalledOnce()
    unmount()
  })

  it("starts safe sign-out and explains why it can remain blocked", () => {
    const onSignOut = vi.fn()
    const view = (
      <AccountView
        mode={{ kind: "account", subject: "subject-1" }}
        syncStatus={{ kind: "synced", syncedAt: 10_000 }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={vi.fn()}
        onSignOut={onSignOut}
      />
    )
    const { container, unmount } = renderTree(view)

    clickLabeledButton(container, "Sign out")
    const markup = renderToStaticMarkup(view)

    expect(onSignOut).toHaveBeenCalledOnce()
    expect(markup).toContain("sign-out stays blocked")
    expect(markup).toContain("never offers a discard shortcut")
    unmount()
  })

  it("disables sign-out while safe completion is in progress", () => {
    const { container, unmount } = renderTree(
      <AccountView
        mode={{ kind: "account", subject: "subject-1" }}
        syncStatus={{ kind: "signing-out" }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(labeledButton(container, "Signing out…")).toHaveProperty("disabled", true)
    unmount()
  })

  it("offers same-subject recovery from Account", () => {
    const markup = renderToStaticMarkup(
      <AccountView
        mode={{ kind: "reauthenticating", subject: "subject-1" }}
        syncStatus={{ kind: "attention" }}
        accountAvailable
        signingIn={false}
        notice={null}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(markup).toContain("Reconnect safely.")
    expect(markup).toContain("Sign in again with GitHub")
    expect(markup).toContain("same GitHub account")
  })

  it("shows the same interface language control to guests and signed-in candidates", () => {
    for (const [, mode] of accountModes) {
      const markup = renderToStaticMarkup(
        <AccountView
          mode={mode}
          syncStatus={mode.kind === "guest" ? { kind: "guest" } : { kind: "synced", syncedAt: 10_000 }}
          accountAvailable
          signingIn={false}
          notice={null}
          onSignIn={vi.fn()}
          onSignOut={vi.fn()}
        />,
      )
      const text = markupText(markup)
      const english = markup.indexOf(">English<")
      const spanish = markup.indexOf(">Español<")
      const german = markup.indexOf(">Deutsch<")

      expect(markup).toContain('for="interface-language"')
      expect(markup).toContain('id="interface-language"')
      expect(markup).toContain('aria-describedby="interface-language-helper"')
      expect(markup).toMatch(/<option value="en" lang="en"(?: selected="")?>English<\/option>/)
      expect(markup).toMatch(/<option value="es" lang="es"(?: selected="")?>Español<\/option>/)
      expect(markup).toMatch(/<option value="de" lang="de"(?: selected="")?>Deutsch<\/option>/)
      expect(text).toContain("Interface language")
      expect(text).toContain("Changes controls, status, and guidance in this browser")
      expect(text).toContain("Practice question content and explanations remain in English")
      expect(text).toContain("This preference is not synced")
      expect(english).toBeGreaterThan(-1)
      expect(english).toBeLessThan(spanish)
      expect(spanish).toBeLessThan(german)
      const controlAt = markup.indexOf('id="interface-language"')
      const cardsAt = ["Guest practice", "Sync status", "Optional GitHub sign-in", "Sign out safely"]
        .map((label) => markup.indexOf(`>${label}<`))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0]
      expect(controlAt).toBeGreaterThan(-1)
      expect(cardsAt).toBeGreaterThan(controlAt)
    }
  })

  it("applies a language choice immediately across the Account control", () => {
    const store = createLocalizationStore(
      createMemoryLocalizationEnvironment({ languages: ["en"] }),
    )
    const view = (mode: PracticeStateMode) => (
      <LocalizationProvider store={store}>
        <AccountView
          mode={mode}
          syncStatus={mode.kind === "guest" ? { kind: "guest" } : { kind: "synced", syncedAt: 10_000 }}
          accountAvailable
          signingIn={false}
          notice={null}
          onSignIn={vi.fn()}
          onSignOut={vi.fn()}
        />
      </LocalizationProvider>
    )

    expect(markupText(renderToStaticMarkup(view({ kind: "guest" })))).toContain("Interface language")

    store.setLanguage("es")

    const guest = markupText(renderToStaticMarkup(view({ kind: "guest" })))
    const user = markupText(renderToStaticMarkup(view({ kind: "account", subject: "subject-1" })))
    for (const text of [guest, user]) {
      expect(text).toContain("Idioma de la interfaz")
      expect(text).toContain("Esta preferencia no se sincroniza")
      expect(text).not.toContain("Interface language")
    }
  })

  it("explains when the selected language applies for this visit but could not be saved", () => {
    const store = createLocalizationStore({
      ...createMemoryLocalizationEnvironment({ languages: ["en"] }),
      writePreference() {
        throw new Error("storage write failed")
      },
    })
    store.setLanguage("es")

    const markup = renderToStaticMarkup(
      <LocalizationProvider store={store}>
        <AccountView
          mode={{ kind: "guest" }}
          syncStatus={{ kind: "guest" }}
          accountAvailable
          signingIn={false}
          notice={null}
          onSignIn={vi.fn()}
          onSignOut={vi.fn()}
        />
      </LocalizationProvider>,
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markupText(markup)).toContain(
      "El idioma seleccionado se aplica en esta visita, pero no se pudo guardar.",
    )
  })
})

describe("ExamSetup", () => {
  it("renders every focused-practice domain with its published number and name", () => {
    const markup = renderToStaticMarkup(<ExamSetup onStart={vi.fn()} />)

    for (const domain of domains) {
      const renderedName = domain.short.replaceAll("&", "&amp;")
      expect(markup).toContain(`${domain.number} · ${renderedName}`)
      expect(markup).not.toContain(`Domain ${domain.number} · ${renderedName}`)
    }
  })

  it("places a concise English question-bank notice above attempt-mode choices", () => {
    const store = createLocalizationStore(
      createMemoryLocalizationEnvironment({ stored: "de" }),
    )
    const markup = renderToStaticMarkup(
      <LocalizationProvider store={store}>
        <ExamSetup onStart={vi.fn()} />
      </LocalizationProvider>,
    )
    const text = markupText(markup)
    const noticeAt = text.indexOf("Übungsfragen und Erklärungen bleiben auf Englisch.")
    const modesAt = text.indexOf("Vollständige Übungsprüfung")

    expect(noticeAt).toBeGreaterThan(-1)
    expect(modesAt).toBeGreaterThan(noticeAt)
    expect(markup).not.toContain("role=\"alert\"")
  })
})

describe("ExamRunner", () => {
  it("gives each question map button an accessible English prompt", () => {
    const questions = questionData as Question[]
    const firstQuestion = questions.find(({ id }) => id === "arch-001")!
    const secondQuestion = questions.find(({ id }) => id === "arch-002")!
    const attempt: Attempt = {
      id: "attempt-1",
      mode: "quick",
      label: "Quick practice",
      questionIds: [firstQuestion.id, secondQuestion.id],
      answers: {},
      flagged: [],
      currentIndex: 0,
      startedAt: 0,
      durationMinutes: 30,
    }

    const markup = renderToStaticMarkup(
      <ExamRunner
        attempt={attempt}
        bookmarks={[]}
        onUpdate={vi.fn()}
        onFinish={vi.fn()}
        onBookmark={vi.fn()}
        onExit={vi.fn()}
      />,
    )

    expect(markup).toContain(`aria-labelledby="question-map-label-${firstQuestion.id} question-map-prompt-${firstQuestion.id}"`)
    expect(markup).toContain(`title="${firstQuestion.prompt}"`)
    expect(markup).toContain(`id="question-map-prompt-${firstQuestion.id}" class="sr-only" lang="en">${firstQuestion.prompt}</span>`)
    expect(markup).toContain(`aria-labelledby="question-map-label-${secondQuestion.id} question-map-prompt-${secondQuestion.id}"`)
    expect(markup).toContain(`title="${secondQuestion.prompt}"`)
    expect(markup).toContain(`id="question-map-prompt-${secondQuestion.id}" class="sr-only" lang="en">${secondQuestion.prompt}</span>`)
    for (const [, syncCopy] of syncStatusCases) {
      expect(markup).not.toContain(syncCopy)
    }
  })
})

describe("FinishedAttemptOutcome", () => {
  it.each([
    ["submitted", "Submitted"],
    ["expired", "Expired"],
    ["abandoned", "Abandoned"],
  ] as Array<[AttemptOutcome, string]>)("renders %s as %s", (outcome, label) => {
    const markup = renderToStaticMarkup(<FinishedAttemptOutcome outcome={outcome} />)

    expect(markup).toContain(`>${label}</div>`)
  })
})

describe("AnswerSummary", () => {
  it("marks only question-bank option text as English", () => {
    const question = (questionData as Question[]).find(({ id }) => id === "arch-001")!
    const selectedOption = question.options[0]

    const optionMarkup = renderToStaticMarkup(
      <AnswerSummary
        label="Your answer"
        ids={[selectedOption.id]}
        question={question}
        correct
      />,
    )
    const fallbackMarkup = renderToStaticMarkup(
      <AnswerSummary
        label="Your answer"
        ids={[]}
        question={question}
        correct={false}
      />,
    )

    expect(optionMarkup).toContain('lang="en"')
    expect(optionMarkup).toContain(selectedOption.text)
    expect(fallbackMarkup).toContain("No answer")
    expect(fallbackMarkup).not.toContain('lang="en"')
  })
})

describe("SyncNotificationBanner", () => {
  it("renders a permanent-sync explanation as a dismissible alert", () => {
    const markup = renderToStaticMarkup(
      <SyncNotificationBanner
        notification={{
          kind: "sync-rejected",
          reason: "invalid_practice_state",
        }}
        onDismiss={vi.fn()}
      />,
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain("The last synced practice state has been restored.")
    expect(markup).toContain('aria-label="Dismiss sync explanation"')
  })
})
