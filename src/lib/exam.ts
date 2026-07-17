import type { ActiveAttempt, CompletedAttempt, DomainId, ExamMode, Question } from "@/types"

export const PASS_SCORE = 70

export function shuffled<T>(items: T[]) {
  return [...items]
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
}

function sampleByDomain(questions: Question[], domain: DomainId, count: number) {
  return shuffled(questions.filter((question) => question.domain === domain)).slice(0, count)
}

export function selectQuestions(questions: Question[], mode: ExamMode, domain?: DomainId) {
  if (mode === "domain" && domain) return shuffled(questions.filter((question) => question.domain === domain))
  if (mode === "quick") return shuffled(questions).slice(0, 10)

  return shuffled([
    ...sampleByDomain(questions, "architecture", 5),
    ...sampleByDomain(questions, "tools", 6),
    ...sampleByDomain(questions, "memory", 4),
    ...sampleByDomain(questions, "evaluation", 5),
    ...sampleByDomain(questions, "orchestration", 5),
    ...sampleByDomain(questions, "guardrails", 5),
  ])
}

export function answersMatch(answer: string[] | undefined, correct: string[]) {
  if (!answer || answer.length !== correct.length) return false
  return [...answer].sort().every((value, index) => value === [...correct].sort()[index])
}

export function calculateScore(attempt: Pick<ActiveAttempt, "questionIds" | "answers">, questionMap: Map<string, Question>) {
  const correct = attempt.questionIds.filter((id) => {
    const question = questionMap.get(id)
    return question ? answersMatch(attempt.answers[id], question.correctAnswers) : false
  }).length
  return Math.round((correct / attempt.questionIds.length) * 100) || 0
}

export function domainScore(attempts: CompletedAttempt[], questions: Question[], domain: DomainId) {
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  let total = 0
  let correct = 0
  attempts.forEach((attempt) => {
    attempt.questionIds.forEach((id) => {
      const question = questionMap.get(id)
      if (question?.domain === domain) {
        total += 1
        if (answersMatch(attempt.answers[id], question.correctAnswers)) correct += 1
      }
    })
  })
  return total ? Math.round((correct / total) * 100) : 0
}

export function formatDuration(seconds: number) {
  const safe = Math.max(seconds, 0)
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`
}
