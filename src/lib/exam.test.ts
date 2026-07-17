import { describe, expect, it } from "vitest"
import { answersMatch, calculateScore, countAnswered, domainProgress, readinessScore, selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
import type { ActiveAttempt, DomainId, Question } from "@/types"

const allDomains: DomainId[] = ["architecture", "tools", "memory", "evaluation", "orchestration", "guardrails"]

function makeQuestion(id: string, domain: DomainId): Question {
  return {
    id,
    domain,
    objective: `Objective for ${id}`,
    difficulty: "medium",
    type: "single",
    prompt: `Prompt for ${id}`,
    options: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
    ],
    correctAnswers: ["a"],
    explanation: `Explanation for ${id}`,
    source: { label: "Source", url: "https://example.com" },
  }
}

const bank = allDomains.flatMap((domain) => [makeQuestion(`${domain}-1`, domain), makeQuestion(`${domain}-2`, domain)])
const questionMap = new Map(bank.map((question) => [question.id, question]))

let attemptCounter = 0
function makeAttempt(overrides: Partial<ActiveAttempt> & Pick<ActiveAttempt, "questionIds" | "answers">): ActiveAttempt {
  attemptCounter += 1
  return {
    id: `attempt-${attemptCounter}`,
    mode: "quick",
    label: "Test attempt",
    flagged: [],
    currentIndex: 0,
    startedAt: 0,
    durationMinutes: 15,
    ...overrides,
  }
}

describe("selectDomain", () => {
  it("adds a domain to the selection", () => {
    expect(selectDomain([], "tools")).toEqual(["tools"])
  })

  it("accumulates multiple selected domains", () => {
    expect(selectDomain(["tools"], "memory")).toEqual(["tools", "memory"])
  })

  it("does not duplicate an already selected domain", () => {
    expect(selectDomain(["tools"], "tools")).toEqual(["tools"])
  })
})

describe("unselectDomain", () => {
  it("removes a selected domain", () => {
    expect(unselectDomain(["tools", "memory"], "tools")).toEqual(["memory"])
  })

  it("leaves the selection unchanged when the domain is not selected", () => {
    expect(unselectDomain(["memory"], "tools")).toEqual(["memory"])
  })
})

describe("selectQuestions in domain mode", () => {
  it("returns only questions from a single selected domain", () => {
    const selected = selectQuestions(bank, "domain", ["tools"])
    expect(selected).toHaveLength(2)
    expect(selected.every((question) => question.domain === "tools")).toBe(true)
  })

  it("returns questions from every selected domain", () => {
    const selected = selectQuestions(bank, "domain", ["tools", "memory", "guardrails"])
    expect(selected).toHaveLength(6)
    expect(new Set(selected.map((question) => question.domain))).toEqual(new Set(["tools", "memory", "guardrails"]))
  })

  it("excludes questions from unselected domains", () => {
    const selected = selectQuestions(bank, "domain", ["architecture"])
    expect(selected.some((question) => question.domain !== "architecture")).toBe(false)
  })

  it("returns no questions when the selection is empty", () => {
    expect(selectQuestions(bank, "domain", [])).toEqual([])
  })

  it("returns no questions when no domains are provided", () => {
    expect(selectQuestions(bank, "domain")).toEqual([])
  })
})

describe("selectQuestions in quick mode", () => {
  it("limits the set to a single selected domain", () => {
    const selected = selectQuestions(bank, "quick", ["tools"])
    expect(selected).toHaveLength(2)
    expect(selected.every((question) => question.domain === "tools")).toBe(true)
  })

  it("limits the set to multiple selected domains", () => {
    const selected = selectQuestions(bank, "quick", ["tools", "memory"])
    expect(selected).toHaveLength(4)
    expect(selected.every((question) => ["tools", "memory"].includes(question.domain))).toBe(true)
  })

  it("draws from the whole bank when no domains are selected", () => {
    const selected = selectQuestions(bank, "quick", [])
    expect(selected).toHaveLength(10)
    expect(selected.some((question) => question.domain !== "tools")).toBe(true)
  })
})

describe("selectQuestions in full mode", () => {
  it("ignores the domain selection", () => {
    const selected = selectQuestions(bank, "full", ["tools"])
    expect(selected).toHaveLength(bank.length)
    expect(new Set(selected.map((question) => question.domain))).toEqual(new Set(allDomains))
  })
})

describe("answersMatch", () => {
  it("matches the correct answer exactly", () => {
    expect(answersMatch(["a"], ["a"])).toBe(true)
  })

  it("matches multiple answers regardless of order", () => {
    expect(answersMatch(["b", "a"], ["a", "b"])).toBe(true)
  })

  it("rejects partial and extra selections", () => {
    expect(answersMatch(["a"], ["a", "b"])).toBe(false)
    expect(answersMatch(["a", "b"], ["a"])).toBe(false)
  })

  it("rejects missing and cleared answers", () => {
    expect(answersMatch(undefined, ["a"])).toBe(false)
    expect(answersMatch([], ["a"])).toBe(false)
  })
})

describe("calculateScore", () => {
  it("counts unanswered questions as incorrect", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"] } })
    expect(calculateScore(attempt, questionMap)).toBe(50)
  })
})

describe("domainProgress", () => {
  it("starts at zero when nothing has been answered", () => {
    expect(domainProgress([], bank, "tools")).toEqual({ answered: 0, correct: 0, score: 0 })
  })

  it("scores the correct share of all questions in the domain, not just the answered ones", () => {
    const firstAnswer = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"] } })
    expect(domainProgress([firstAnswer], bank, "tools")).toEqual({ answered: 1, correct: 1, score: 50 })

    const bothCorrect = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"], "tools-2": ["a"] } })
    expect(domainProgress([bothCorrect], bank, "tools")).toEqual({ answered: 2, correct: 2, score: 100 })
  })

  it("tracks progress question by question within an in-progress attempt", () => {
    const firstAnswer = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"] } })
    expect(domainProgress([firstAnswer], bank, "tools").answered).toBe(1)

    const secondAnswer = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"], "tools-2": ["b"] } })
    expect(domainProgress([secondAnswer], bank, "tools")).toEqual({ answered: 2, correct: 1, score: 50 })
  })

  it("ignores questions that have not been answered yet", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: {} })
    expect(domainProgress([attempt], bank, "tools")).toEqual({ answered: 0, correct: 0, score: 0 })
  })

  it("ignores cleared answers", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": [] } })
    expect(domainProgress([attempt], bank, "tools").answered).toBe(0)
  })

  it("aggregates answers across completed and in-progress attempts", () => {
    const completed = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    const active = makeAttempt({ questionIds: ["tools-2"], answers: { "tools-2": ["b"] } })
    expect(domainProgress([completed, active], bank, "tools")).toEqual({ answered: 2, correct: 1, score: 50 })
  })

  it("lets the latest answer per question win", () => {
    const older = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    const newer = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["b"] } })
    expect(domainProgress([newer, older], bank, "tools")).toEqual({ answered: 1, correct: 0, score: 0 })
    expect(domainProgress([older, newer], bank, "tools")).toEqual({ answered: 1, correct: 1, score: 50 })
  })

  it("only counts questions from the requested domain", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1", "memory-1"], answers: { "tools-1": ["b"], "memory-1": ["a"] } })
    expect(domainProgress([attempt], bank, "memory")).toEqual({ answered: 1, correct: 1, score: 50 })
  })
})

describe("countAnswered", () => {
  it("returns zero when there are no attempts", () => {
    expect(countAnswered([])).toBe(0)
  })

  it("counts each answered question once across attempts", () => {
    const first = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"], "tools-2": ["b"] } })
    const repeat = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    expect(countAnswered([first, repeat])).toBe(2)
  })

  it("ignores unanswered and cleared questions", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1", "tools-2", "memory-1"], answers: { "tools-1": ["a"], "tools-2": [] } })
    expect(countAnswered([attempt])).toBe(1)
  })

  it("includes answers from an in-progress attempt", () => {
    const active = makeAttempt({ questionIds: ["memory-1"], answers: { "memory-1": ["a"] } })
    expect(countAnswered([active])).toBe(1)
  })
})

describe("readinessScore", () => {
  it("returns zero when nothing has been answered", () => {
    expect(readinessScore([], bank)).toBe(0)
  })

  it("measures the demonstrated-correct share of the whole bank", () => {
    const oneCorrect = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    expect(readinessScore([oneCorrect], bank)).toBe(Math.round(100 / bank.length))

    const twoCorrect = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"], "tools-2": ["a"] } })
    expect(readinessScore([twoCorrect], bank)).toBe(Math.round(200 / bank.length))
  })

  it("does not reward a single domain like an average of domain accuracies would", () => {
    const oneCorrect = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    expect(readinessScore([oneCorrect], bank)).toBeLessThan(Math.round(100 / allDomains.length))
  })

  it("counts each question once no matter how many times it was answered", () => {
    const first = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    const repeat = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    expect(readinessScore([repeat, first], bank)).toBe(Math.round(100 / bank.length))
  })

  it("lets the latest answer per question win", () => {
    const older = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    const newer = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["b"] } })
    expect(readinessScore([newer, older], bank)).toBe(0)
    expect(readinessScore([older, newer], bank)).toBe(Math.round(100 / bank.length))
  })

  it("keeps an earlier correct result when a newer attempt has not answered the question yet", () => {
    const completed = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    const active = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: {} })
    expect(readinessScore([active, completed], bank)).toBe(Math.round(100 / bank.length))
  })
})
