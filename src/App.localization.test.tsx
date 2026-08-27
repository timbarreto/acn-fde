// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { Results, Review, SyncStatusIndicator } from "@/App"
import questionData from "@/data/questions.json"
import {
  createLocalizationStore,
  createMemoryLocalizationEnvironment,
} from "@/lib/localization"
import { LocalizationProvider } from "@/lib/use-localization"
import type { FinishedAttempt, Question } from "@/types"

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const question = (questionData as Question[])[0]
const finishedAt = Date.UTC(2025, 0, 2, 12)
const attempt: FinishedAttempt = {
  id: "attempt-localization",
  mode: "quick",
  label: "Quick practice",
  questionIds: [question.id],
  answers: { [question.id]: question.correctAnswers },
  flagged: [],
  startedAt: finishedAt - 60_000,
  durationMinutes: 1,
  finishedAt,
  score: 100,
  outcome: "submitted",
}

function englishContent(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[lang="en"]'))
    .map((element) => element.textContent)
}

describe("localized application state", () => {
  it("formats sync and finished-at values with the selected locale", () => {
    const store = createLocalizationStore(
      createMemoryLocalizationEnvironment({ stored: "de" }),
    )
    const container = document.createElement("div")
    const root = createRoot(container)
    const expectedRelative = new Intl.RelativeTimeFormat("de", {
      numeric: "auto",
    }).format(-2, "minute")
    const expectedDateTime = new Intl.DateTimeFormat("de", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(finishedAt)
    const expectedDate = new Intl.DateTimeFormat("de", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(finishedAt)

    act(() => {
      root.render(
        <LocalizationProvider store={store}>
          <SyncStatusIndicator
            status={{ kind: "synced", syncedAt: finishedAt }}
            now={finishedAt + 120_000}
          />
          <Review
            practiceState={{
              activeAttempt: null,
              attempts: [attempt],
              bookmarks: [],
              latestAnswers: {},
            }}
            onBookmark={vi.fn()}
            onPractice={vi.fn()}
          />
        </LocalizationProvider>,
      )
    })

    expect(container.textContent).toContain(expectedRelative)
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain(expectedDateTime)

    const history = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("History"))
    act(() => history?.click())

    expect(container.textContent).toContain(expectedDate)
    expect(container.textContent).toContain("1 Fragen")

    act(() => root.unmount())
  })

  it("marks every rendered question-bank field as English", () => {
    const store = createLocalizationStore(
      createMemoryLocalizationEnvironment({ stored: "es" }),
    )
    const container = document.createElement("div")
    const root = createRoot(container)

    act(() => {
      root.render(
        <LocalizationProvider store={store}>
          <Results
            attempt={attempt}
            bookmarks={[]}
            onBookmark={vi.fn()}
            onDashboard={vi.fn()}
            onRetry={vi.fn()}
            onReview={vi.fn()}
          />
          <Review
            practiceState={{
              activeAttempt: null,
              attempts: [attempt],
              bookmarks: [question.id],
              latestAnswers: {},
            }}
            onBookmark={vi.fn()}
            onPractice={vi.fn()}
          />
        </LocalizationProvider>,
      )
    })

    const resultQuestion = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes(question.prompt))
    act(() => resultQuestion?.click())

    const content = englishContent(container)
    expect(content).toContain(question.prompt)
    expect(content).toContain(question.explanation)
    expect(content).toContain(question.source.label)
    for (const answer of question.correctAnswers) {
      expect(content).toContain(
        question.options.find((option) => option.id === answer)?.text,
      )
    }

    act(() => root.unmount())
  })
})
