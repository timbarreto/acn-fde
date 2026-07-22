import { afterEach, describe, expect, it, vi } from "vitest"
import { answersMatch, calculateScore, countAnswered, domainProgress, getAttemptElapsedMs, getAttemptRemainingSeconds, isAttemptPaused, pauseAttemptTimer, progressFromAttempts, readinessScore, resumeAttemptTimer, selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
import type { ActiveAttempt, CompletedAttempt, DomainId, ExamMode, Question } from "@/types"

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
const orderingBank = allDomains.flatMap((domain) => [
  makeQuestion(`${domain}-correct`, domain),
  makeQuestion(`${domain}-incorrect`, domain),
  makeQuestion(`${domain}-unseen`, domain),
])
const mixedProgress = Object.fromEntries(allDomains.flatMap((domain) => [
  [`${domain}-correct`, ["a"]],
  [`${domain}-incorrect`, ["b"]],
]))

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

function makeCompletedAttempt(questionIds: string[], answers: Record<string, string[]>): CompletedAttempt {
  return {
    ...makeAttempt({ questionIds, answers }),
    completedAt: 1_000,
    score: 0,
  }
}

function expectUnseenFirst(selected: Question[], progress: Record<string, string[]>) {
  const firstAnswered = selected.findIndex((question) => Boolean(progress[question.id]?.length))
  if (firstAnswered === -1) return
  expect(selected.slice(firstAnswered).every((question) => Boolean(progress[question.id]?.length))).toBe(true)
}

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe.each([
  ["full", undefined, orderingBank.length],
  ["quick", undefined, 10],
  ["domain", ["tools"], 3],
] as Array<[ExamMode, DomainId[] | undefined, number]>)('selectQuestions unseen-first ordering in %s mode', (mode, domains, expectedSize) => {
  const history = makeCompletedAttempt(orderingBank.map((question) => question.id), mixedProgress)

  it("puts every unseen question before prior correct and incorrect answers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)

    const selected = selectQuestions(orderingBank, mode, domains, mixedProgress, [history])

    expect(selected).toHaveLength(expectedSize)
    expectUnseenFirst(selected, mixedProgress)
    expect(selected.some((question) => question.id.endsWith("-correct"))).toBe(true)
    expect(selected.some((question) => question.id.endsWith("-incorrect"))).toBe(true)
  })

  it("keeps the normal eligible set when every question is unseen", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)

    const selected = selectQuestions(orderingBank, mode, domains, {}, [makeCompletedAttempt(orderingBank.map((question) => question.id), {})])

    expect(selected).toHaveLength(expectedSize)
    expect(new Set(selected).size).toBe(expectedSize)
  })

  it("keeps previously answered questions available when no unseen questions remain", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const allAnswered = Object.fromEntries(orderingBank.map((question) => [question.id, ["a"]]))

    const selected = selectQuestions(orderingBank, mode, domains, allAnswered, [makeCompletedAttempt(orderingBank.map((question) => question.id), allAnswered)])

    expect(selected).toHaveLength(expectedSize)
    expect(new Set(selected).size).toBe(expectedSize)
    expect(selected.every((question) => allAnswered[question.id].length > 0)).toBe(true)
  })
})

describe("selectQuestions randomization", () => {
  it("randomizes independently within the unseen and answered partitions", () => {
    const questions = [1, 2, 3, 4].map((number) => makeQuestion(`tools-${number}`, "tools"))
    const progress = { "tools-1": ["a"], "tools-2": ["b"] }
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.2)

    const selected = selectQuestions(questions, "domain", ["tools"], progress, [makeCompletedAttempt(questions.map((question) => question.id), progress)])

    expect(selected.map((question) => question.id)).toEqual(["tools-4", "tools-3", "tools-2", "tools-1"])
  })
})

describe("attempt timer", () => {
  it("calculates a running countdown for legacy attempts without pause fields", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000, durationMinutes: 1 })

    expect(isAttemptPaused(attempt)).toBe(false)
    expect(getAttemptRemainingSeconds(attempt, 16_000)).toBe(45)
    expect(getAttemptElapsedMs(attempt, 16_000)).toBe(15_000)
  })

  it("freezes the countdown at the instant an attempt is paused", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000, durationMinutes: 1 })
    const paused = pauseAttemptTimer(attempt, 11_000)

    expect(isAttemptPaused(paused)).toBe(true)
    expect(getAttemptRemainingSeconds(paused, 51_000)).toBe(50)
    expect(getAttemptElapsedMs(paused, 51_000)).toBe(10_000)
  })

  it("does not reset the pause timestamp when pausing an already paused attempt", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000 })
    const paused = pauseAttemptTimer(attempt, 11_000)

    expect(pauseAttemptTimer(paused, 31_000)).toBe(paused)
    expect(paused.pausedAt).toBe(11_000)
  })

  it("accumulates repeated pauses without consuming countdown time", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000, durationMinutes: 1 })
    const firstPause = pauseAttemptTimer(attempt, 11_000)
    const firstResume = resumeAttemptTimer(firstPause, 21_000)
    const secondPause = pauseAttemptTimer(firstResume, 31_000)
    const secondResume = resumeAttemptTimer(secondPause, 41_000)

    expect(isAttemptPaused(secondResume)).toBe(false)
    expect(secondResume.pausedDurationMs).toBe(20_000)
    expect(getAttemptRemainingSeconds(secondResume, 51_000)).toBe(30)
    expect(getAttemptElapsedMs(secondResume, 51_000)).toBe(30_000)
  })

  it("normalizes an active pause when the attempt is completed", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000, pausedDurationMs: 5_000 })
    const paused = pauseAttemptTimer(attempt, 21_000)
    const completed = resumeAttemptTimer(paused, 41_000)

    expect(completed.pausedAt).toBeUndefined()
    expect(completed.pausedDurationMs).toBe(25_000)
    expect(getAttemptElapsedMs(completed, 41_000)).toBe(15_000)
  })

  it("never returns a negative countdown for an expired attempt", () => {
    const attempt = makeAttempt({ questionIds: ["tools-1"], answers: {}, startedAt: 1_000, durationMinutes: 1 })

    expect(getAttemptRemainingSeconds(attempt, 71_000)).toBe(0)
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
