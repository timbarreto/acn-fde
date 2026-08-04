import { describe, expect, it } from "vitest"
import { FINISHED_ATTEMPT_LIMIT, migrateStoredPracticeState, retainRecentFinishedAttempts } from "@/lib/practice-state"
import type { AttemptOutcome, FinishedAttempt } from "@/types"

function makeFinishedAttempt(id: string, finishedAt: number, outcome: AttemptOutcome = "submitted"): FinishedAttempt {
  return {
    id,
    mode: "quick",
    label: `Attempt ${id}`,
    questionIds: ["tools-1"],
    answers: { "tools-1": ["a"] },
    flagged: [],
    startedAt: 1_000,
    durationMinutes: 15,
    finishedAt,
    score: 100,
    outcome,
  }
}

describe("migrateStoredPracticeState", () => {
  it("preserves representative version-1 browser data using the practice-state vocabulary", () => {
    const migrated = migrateStoredPracticeState(JSON.stringify({
      activeAttempt: {
        id: "active-1",
        mode: "domain",
        label: "Tools drill",
        questionIds: ["tools-1", "tools-2"],
        answers: { "tools-1": ["a"] },
        flagged: ["tools-2"],
        currentIndex: 1,
        startedAt: 10_000,
        durationMinutes: 10,
        pausedAt: 20_000,
        pausedDurationMs: 5_000,
        domains: ["tools"],
      },
      attempts: [
        {
          id: "submitted-1",
          mode: "quick",
          label: "Quick knowledge check",
          questionIds: ["tools-1"],
          answers: { "tools-1": ["b"] },
          flagged: ["tools-1"],
          currentIndex: 0,
          startedAt: 1_000,
          durationMinutes: 15,
          completedAt: 21_000,
          score: 0,
        },
        {
          id: "expired-1",
          mode: "quick",
          label: "Quick knowledge check",
          questionIds: ["memory-1"],
          answers: { "memory-1": ["a"] },
          flagged: [],
          currentIndex: 0,
          startedAt: 1_000,
          durationMinutes: 1,
          pausedDurationMs: 30_000,
          completedAt: 91_000,
          score: 100,
        },
      ],
      bookmarks: ["tools-2", "memory-1"],
      progress: { "architecture-1": ["a"], "tools-1": ["b"] },
    }))

    expect(migrated.activeAttempt).toEqual({
      id: "active-1",
      mode: "domain",
      label: "Tools drill",
      questionIds: ["tools-1", "tools-2"],
      answers: { "tools-1": ["a"] },
      flagged: ["tools-2"],
      currentIndex: 1,
      startedAt: 10_000,
      durationMinutes: 10,
      pausedAt: 20_000,
      pausedDurationMs: 5_000,
      domains: ["tools"],
    })
    expect(migrated.attempts).toEqual([
      expect.objectContaining({ id: "expired-1", finishedAt: 91_000, outcome: "expired", score: 100 }),
      expect.objectContaining({ id: "submitted-1", finishedAt: 21_000, outcome: "submitted", score: 0 }),
    ])
    expect(migrated.bookmarks).toEqual(["tools-2", "memory-1"])
    expect(migrated.latestAnswers).toEqual({ "architecture-1": ["a"], "tools-1": ["b"] })
    expect(JSON.stringify(migrated)).not.toContain("completedAt")
  })

  it("preserves all three outcomes in current practice state", () => {
    const finishedAttempts = [
      makeFinishedAttempt("submitted", 3_000, "submitted"),
      makeFinishedAttempt("expired", 2_000, "expired"),
      makeFinishedAttempt("abandoned", 1_000, "abandoned"),
    ]

    const migrated = migrateStoredPracticeState(JSON.stringify({
      activeAttempt: null,
      attempts: finishedAttempts,
      bookmarks: [],
      latestAnswers: { "tools-1": ["a"] },
    }))

    expect(migrated.attempts.map(({ outcome }) => outcome)).toEqual(["submitted", "expired", "abandoned"])
  })

  it("derives latest answers when an older browser record has no answer map", () => {
    const migrated = migrateStoredPracticeState(JSON.stringify({
      activeAttempt: {
        id: "active-1",
        mode: "quick",
        label: "Quick knowledge check",
        questionIds: ["memory-1"],
        answers: { "memory-1": ["a"] },
        flagged: [],
        currentIndex: 0,
        startedAt: 1_000,
        durationMinutes: 15,
      },
      attempts: [{
        id: "finished-1",
        mode: "quick",
        label: "Quick knowledge check",
        questionIds: ["tools-1"],
        answers: { "tools-1": ["b"] },
        flagged: [],
        currentIndex: 0,
        startedAt: 1_000,
        durationMinutes: 15,
        completedAt: 2_000,
        score: 0,
      }],
      bookmarks: [],
      progress: {},
    }))

    expect(migrated.latestAnswers).toEqual({ "tools-1": ["b"], "memory-1": ["a"] })
  })
})

describe("retainRecentFinishedAttempts", () => {
  it("keeps the 30 most recent finished attempts", () => {
    const finishedAttempts = Array.from({ length: 35 }, (_, index) => makeFinishedAttempt(`attempt-${index}`, index))

    const retained = retainRecentFinishedAttempts(finishedAttempts)

    expect(retained).toHaveLength(FINISHED_ATTEMPT_LIMIT)
    expect(retained.map(({ finishedAt }) => finishedAt)).toEqual(Array.from({ length: 30 }, (_, index) => 34 - index))
  })
})
