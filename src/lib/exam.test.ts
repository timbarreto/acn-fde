import { describe, expect, it } from "vitest"
import { selectDomain, selectQuestions, unselectDomain } from "@/lib/exam"
import type { DomainId, Question } from "@/types"

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

describe("selectQuestions in other modes", () => {
  it("ignores the domain selection in quick mode", () => {
    const selected = selectQuestions(bank, "quick", ["tools"])
    expect(selected).toHaveLength(10)
    expect(selected.some((question) => question.domain !== "tools")).toBe(true)
  })

  it("ignores the domain selection in full mode", () => {
    const selected = selectQuestions(bank, "full", ["tools"])
    expect(selected).toHaveLength(bank.length)
    expect(new Set(selected.map((question) => question.domain))).toEqual(new Set(allDomains))
  })
})
