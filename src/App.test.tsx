import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ExamRunner, ExamSetup } from "@/App"
import { domains } from "@/data/domains"
import questionData from "@/data/questions.json"
import type { ActiveAttempt, Question } from "@/types"

function escapeHtmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")
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
    const [firstQuestion, secondQuestion] = questionData as Question[]
    const attempt: ActiveAttempt = {
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
        onComplete={vi.fn()}
        onBookmark={vi.fn()}
        onExit={vi.fn()}
      />,
    )

    expect(markup).toContain(`title="${escapeHtmlAttribute(firstQuestion.prompt)}"`)
    expect(markup).toContain(`aria-label="Question 1: ${escapeHtmlAttribute(firstQuestion.prompt)}"`)
    expect(markup).toContain(`title="${escapeHtmlAttribute(secondQuestion.prompt)}"`)
  })
})
