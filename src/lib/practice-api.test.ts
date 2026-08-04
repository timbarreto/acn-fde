import { describe, expect, it } from "vitest"
import { createPracticeApi } from "@/lib/practice-api"
import type { PracticeStateEnvelope } from "@/types"

const completeEnvelope = {
  schemaVersion: 2,
  state: {
    activeAttempt: {
      id: "11111111-1111-4111-8111-111111111111",
      mode: "full",
      label: "Full practice",
      questionIds: ["arch-001", "arch-002"],
      answers: { "arch-001": ["a"] },
      flagged: ["arch-002"],
      currentIndex: 1,
      startedAt: 1_767_225_600_000,
      durationMinutes: 120,
      pausedAt: 1_767_225_660_000,
      pausedDurationMs: 60_000,
      domains: ["architecture"],
    },
    attempts: [{
      id: "22222222-2222-4222-8222-222222222222",
      mode: "quick",
      label: "Quick practice",
      questionIds: ["arch-003"],
      answers: { "arch-003": ["a", "b"] },
      flagged: [],
      startedAt: 1_767_139_200_000,
      durationMinutes: 30,
      finishedAt: 1_767_141_000_000,
      score: 100,
      outcome: "submitted",
    }],
    bookmarks: ["arch-003"],
    latestAnswers: { "arch-001": ["a"], "arch-003": ["a", "b"] },
  },
  receipts: {
    activeAttemptReceivedAt: "2026-08-04T20:00:00.000Z",
    finishedAttempts: {
      "22222222-2222-4222-8222-222222222222": "2026-08-04T20:00:00.000Z",
    },
    bookmarks: {
      "arch-003": { isBookmarked: true, receivedAt: "2026-08-04T20:00:00.000Z" },
    },
    latestAnswers: {
      "arch-001": "2026-08-04T20:00:00.000Z",
      "arch-003": "2026-08-04T20:00:00.000Z",
    },
  },
} satisfies PracticeStateEnvelope

describe("practice state API adapter", () => {
  it("round-trips every envelope field through the save contract", async () => {
    const requests: Request[] = []
    const api = createPracticeApi(async (input, init) => {
      requests.push(new Request(new URL(String(input), "http://localhost:3000"), init))
      return Response.json(completeEnvelope)
    })

    const result = await api.postPracticeState("identity-token", completeEnvelope)

    expect(result).toEqual(completeEnvelope)
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe("http://localhost:3000/api/practice-state")
    expect(requests[0].method).toBe("POST")
    expect(requests[0].headers.get("authorization")).toBe("Bearer identity-token")
    expect(requests[0].headers.get("content-type")).toBe("application/json")
    await expect(requests[0].json()).resolves.toEqual(completeEnvelope)
  })

  it("loads the complete envelope through the same typed boundary", async () => {
    const requests: Request[] = []
    const api = createPracticeApi(async (input, init) => {
      requests.push(new Request(new URL(String(input), "http://localhost:3000"), init))
      return Response.json(completeEnvelope)
    })

    const result = await api.getPracticeState("identity-token")

    expect(result).toEqual(completeEnvelope)
    expect(requests[0].method).toBe("GET")
    expect(requests[0].headers.get("authorization")).toBe("Bearer identity-token")
  })
})
