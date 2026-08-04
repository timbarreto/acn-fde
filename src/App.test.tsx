import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ExamRunner, ExamSetup, FinishedAttemptOutcome } from "@/App"
import { domains } from "@/data/domains"
import questionData from "@/data/questions.json"
import type { Attempt, AttemptOutcome, Question } from "@/types"

function serializeAttributeValue(value: string) {
  const markup = renderToStaticMarkup(<div data-value={value} />)
  const match = markup.match(/data-value="([^"]*)"/)
  expect(match).not.toBeNull()
  return match![1]
}

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
