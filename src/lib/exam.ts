import type { ActiveAttempt, CompletedAttempt, DomainId, ExamMode, Question } from "@/types"

export const PASS_SCORE = 70

const fullExamDistribution: Array<[DomainId, number]> = [
  ["architecture", 5],
  ["tools", 6],
  ["memory", 4],
  ["evaluation", 5],
  ["orchestration", 5],
  ["guardrails", 5],
]

function queueByLastSeen(questions: Question[], attempts: CompletedAttempt[]) {
  const lastSeen = new Map<string, number>()

  attempts.forEach((attempt) => {
    attempt.questionIds.forEach((id) => {
      lastSeen.set(id, Math.max(lastSeen.get(id) ?? 0, attempt.completedAt))
    })
  })

  return questions
    .map((question) => ({
      question,
      lastSeen: lastSeen.get(question.id) ?? 0,
      sort: Math.random(),
    }))
    .sort((a, b) => a.lastSeen - b.lastSeen || a.sort - b.sort)
    .map(({ question }) => question)
}

export function selectDomain(domains: DomainId[], domain: DomainId) {
  return domains.includes(domain) ? domains : [...domains, domain]
}

export function unselectDomain(domains: DomainId[], domain: DomainId) {
  return domains.filter((id) => id !== domain)
}

export function selectQuestions(questions: Question[], mode: ExamMode, domains?: DomainId[], attempts: CompletedAttempt[] = []) {
  const queue = queueByLastSeen(questions, attempts)

  if (mode === "domain") return domains?.length ? queue.filter((question) => domains.includes(question.domain)) : []
  if (mode === "quick") {
    const pool = domains?.length ? queue.filter((question) => domains.includes(question.domain)) : queue
    return pool.slice(0, 10)
  }

  const selectedIds = new Set(
    fullExamDistribution.flatMap(([examDomain, count]) =>
      queue
        .filter((question) => question.domain === examDomain)
        .slice(0, count)
        .map((question) => question.id),
    ),
  )

  return queue.filter((question) => selectedIds.has(question.id))
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
