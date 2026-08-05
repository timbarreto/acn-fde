import { isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  AccountView,
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
import type { PracticeStateMode, PracticeSyncStatus } from "@/lib/persistence"
import type { Attempt, AttemptOutcome, Question } from "@/types"

function markupText(markup: string) {
  return markup.replace(/<[^>]+>/g, "")
}

function serializeAttributeValue(value: string) {
  const markup = renderToStaticMarkup(<div data-value={value} />)
  const match = markup.match(/data-value="([^"]*)"/)
  expect(match).not.toBeNull()
  return match![1]
}

interface InteractiveProps {
  children?: ReactNode
  disabled?: boolean
  onClick?: () => void
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join("")
  if (!isValidElement(node)) return ""
  return nodeText((node.props as InteractiveProps).children)
}

function findInteraction(node: ReactNode, label: string): InteractiveProps {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        try {
          return findInteraction(child, label)
        } catch {
          // Continue through sibling elements.
        }
      }
    }
    throw new Error(`Could not find interaction: ${label}`)
  }

  const props = node.props as InteractiveProps
  if (props.onClick && nodeText(props.children).includes(label)) return props
  const children = Array.isArray(props.children) ? props.children : [props.children]
  for (const child of children) {
    try {
      return findInteraction(child, label)
    } catch {
      // Continue through sibling elements.
    }
  }
  throw new Error(`Could not find interaction: ${label}`)
}

const syncStatusCases: Array<[PracticeSyncStatus, string]> = [
  [{ kind: "guest" }, "Saved on this device"],
  [{ kind: "syncing" }, "Syncing…"],
  [{ kind: "synced", syncedAt: 10_000 }, "Synced just now"],
  [{ kind: "offline" }, "Offline · saved on this device"],
  [{ kind: "attention" }, "Not synced · saved on this device"],
  [{ kind: "signing-out" }, "Signing out…"],
]

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

    expect(markupText(markup)).toContain("Synced 2 min ago")
  })

  it("keeps the elapsed time out of the live region so ticking is not announced", () => {
    const liveRegion = /<span role="status"[^>]*>([^<]*)<\/span>/

    const early = renderToStaticMarkup(
      <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={130_000} />,
    )
    const later = renderToStaticMarkup(
      <SyncStatusIndicator status={{ kind: "synced", syncedAt: 10_000 }} now={190_000} />,
    )

    expect(markupText(early)).toContain("Synced 2 min ago")
    expect(markupText(later)).toContain("Synced 3 min ago")
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
    expect(markupText(markup)).toContain("Synced just now")
  })
})

describe("readSignInFailureNotice", () => {
  it("explains a failed GitHub authorization returned on the Account callback", () => {
    const notice = readSignInFailureNotice("?error=access_denied")

    expect(notice?.kind).toBe("error")
    expect(notice?.message).toContain("GitHub sign-in did not finish")
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
    const tree = TopNav({
      view: "dashboard",
      syncStatus: { kind: "guest" },
      onNavigate,
      mobileOpen: false,
      onMobileOpen: vi.fn(),
    })

    findInteraction(tree, "Account").onClick?.()

    expect(onNavigate).toHaveBeenCalledWith("account")
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
    const tree = TopNav(props)
    const markup = renderToStaticMarkup(<TopNav {...props} />)

    expect(findInteraction(tree, "Dashboard").disabled).toBe(true)
    expect(findInteraction(tree, "Start practice").disabled).toBe(true)
    expect(findInteraction(tree, "Account").disabled).toBeUndefined()
    expect(markup).toContain('id="recovery-navigation-hint"')
    expect(markupText(markup)).toContain(RECOVERY_NAVIGATION_HINT)
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
    const tree = AccountView({
      mode: { kind: "guest" },
      syncStatus: { kind: "guest" },
      accountAvailable: true,
      signingIn: false,
      notice: null,
      onSignIn,
      onSignOut: vi.fn(),
    })

    findInteraction(tree, "Sign in with GitHub").onClick?.()

    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it("starts safe sign-out and explains why it can remain blocked", () => {
    const onSignOut = vi.fn()
    const tree = AccountView({
      mode: { kind: "account", subject: "subject-1" },
      syncStatus: { kind: "synced", syncedAt: 10_000 },
      accountAvailable: true,
      signingIn: false,
      notice: null,
      onSignIn: vi.fn(),
      onSignOut,
    })

    findInteraction(tree, "Sign out").onClick?.()
    const markup = renderToStaticMarkup(tree)

    expect(onSignOut).toHaveBeenCalledOnce()
    expect(markup).toContain("sign-out stays blocked")
    expect(markup).toContain("never offers a discard shortcut")
  })

  it("disables sign-out while safe completion is in progress", () => {
    const tree = AccountView({
      mode: { kind: "account", subject: "subject-1" },
      syncStatus: { kind: "signing-out" },
      accountAvailable: true,
      signingIn: false,
      notice: null,
      onSignIn: vi.fn(),
      onSignOut: vi.fn(),
    })

    expect(findInteraction(tree, "Signing out…").disabled).toBe(true)
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
})

describe("ExamRunner", () => {
  it("adds the question prompt to each question map button tooltip", () => {
    const questions = questionData as Question[]
    const firstQuestion = questions.find(({ id }) => id === "arch-001")!
    const secondQuestion = questions.find(({ id }) => id === "arch-002")!
    const firstPrompt = serializeAttributeValue(firstQuestion.prompt)
    const secondPrompt = serializeAttributeValue(secondQuestion.prompt)
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

    expect(markup).toContain(`title="${firstPrompt}"`)
    expect(markup).toContain(`aria-label="Question 1: ${firstPrompt}"`)
    expect(markup).toContain(`title="${secondPrompt}"`)
    expect(markup).toContain(`aria-label="Question 2: ${secondPrompt}"`)
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

describe("SyncNotificationBanner", () => {
  it("renders a permanent-sync explanation as a dismissible alert", () => {
    const markup = renderToStaticMarkup(
      <SyncNotificationBanner
        notification={{
          kind: "sync-rejected",
          message: "The latest changes were not valid. The last synced practice state has been restored.",
        }}
        onDismiss={vi.fn()}
      />,
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain("The last synced practice state has been restored.")
    expect(markup).toContain('aria-label="Dismiss sync explanation"')
  })
})
