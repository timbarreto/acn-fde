import { describe, expect, it } from "vitest"
import { answersMatch, calculateScore, countAnswered, domainProgress, progressFromAttempts, readinessScore, selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
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

describe("progressFromAttempts", () => {
  it("collects answers from every attempt with the newest answer winning", () => {
    const older = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["b"] } })
    const newer = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": ["a"] } })
    expect(progressFromAttempts([newer, older])).toEqual({ "tools-1": ["a"] })
  })

  it("keeps answers from attempts that were never completed", () => {
    const abandoned = makeAttempt({ questionIds: ["tools-1", "tools-2"], answers: { "tools-1": ["a"] } })
    const later = makeAttempt({ questionIds: ["memory-1"], answers: { "memory-1": ["a"] } })
    expect(progressFromAttempts([later, abandoned])).toEqual({ "tools-1": ["a"], "memory-1": ["a"] })
  })

  it("ignores cleared answers", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: { "tools-1": [] } })
    expect(progressFromAttempts([attempt])).toEqual({})
  })
})

describe("domainProgress", () => {
  it("starts at zero when nothing has been answered", () => {
    expect(domainProgress({}, bank, "tools")).toEqual({ answered: 0, correct: 0, score: 0 })
  })

  it("scores the correct share of all questions in the domain, not just the answered ones", () => {
    expect(domainProgress({ "tools-1": ["a"] }, bank, "tools")).toEqual({ answered: 1, correct: 1, score: 50 })
    expect(domainProgress({ "tools-1": ["a"], "tools-2": ["a"] }, bank, "tools")).toEqual({ answered: 2, correct: 2, score: 100 })
  })

  it("tracks cumulative progress across exams", () => {
    const progress = { "tools-1": ["a"], "memory-1": ["a"], "memory-2": ["b"] }
    expect(domainProgress(progress, bank, "memory")).toEqual({ answered: 2, correct: 1, score: 50 })
  })

  it("ignores cleared answers", () => {
    expect(domainProgress({ "tools-1": [] }, bank, "tools").answered).toBe(0)
  })

  it("only counts questions from the requested domain", () => {
    expect(domainProgress({ "tools-1": ["a"] }, bank, "memory")).toEqual({ answered: 0, correct: 0, score: 0 })
  })
})

describe("countAnswered", () => {
  it("returns zero when nothing has been answered", () => {
    expect(countAnswered({}, bank)).toBe(0)
  })

  it("counts every answered question once", () => {
    expect(countAnswered({ "tools-1": ["a"], "tools-2": ["b"], "memory-1": [] }, bank)).toBe(2)
  })

  it("ignores questions that are no longer in the bank", () => {
    expect(countAnswered({ ghost: ["a"], "tools-1": ["a"] }, bank)).toBe(1)
  })
})

describe("readinessScore", () => {
  it("returns zero when nothing has been answered", () => {
    expect(readinessScore({}, bank)).toBe(0)
  })

  it("measures the demonstrated-correct share of the whole bank", () => {
    expect(readinessScore({ "tools-1": ["a"] }, bank)).toBe(Math.round(100 / bank.length))
    expect(readinessScore({ "tools-1": ["a"], "tools-2": ["a"] }, bank)).toBe(Math.round(200 / bank.length))
  })

  it("does not count wrong answers", () => {
    expect(readinessScore({ "tools-1": ["b"] }, bank)).toBe(0)
  })
})
