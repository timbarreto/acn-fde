import { describe, expect, it } from "vitest"
import questions from "@/data/questions.json"
import type { DomainId } from "@/types"

const domains = new Set<DomainId>([
  "architecture",
  "tools",
  "memory",
  "evaluation",
  "orchestration",
  "guardrails",
])

describe("question bank integrity", () => {
  it("uses unique question IDs", () => {
    const ids = questions.map((question) => question.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("references valid domains, options, answers, and sources", () => {
    for (const question of questions) {
      const optionIds = question.options.map((option) => option.id)

      expect(domains.has(question.domain as DomainId), question.id).toBe(true)
      expect(new Set(optionIds).size, question.id).toBe(optionIds.length)
      expect(question.correctAnswers.length, question.id).toBeGreaterThan(0)
      expect(
        question.correctAnswers.every((answer) => optionIds.includes(answer)),
        question.id,
      ).toBe(true)
      expect(question.source.url, question.id).toMatch(/^https:\/\//)

      if (question.type === "single") {
        expect(question.correctAnswers, question.id).toHaveLength(1)
      } else {
        expect(question.type, question.id).toBe("multiple")
        expect(question.correctAnswers.length, question.id).toBeGreaterThan(1)
        expect(question.prompt, question.id).toMatch(/Select (?:all that apply|\w+)\./)
      }
    }
  })
})
