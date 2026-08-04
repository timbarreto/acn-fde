import type { Attempt, AttemptMode, DomainId, FinishedAttempt, Question } from "@/types"

export const PASS_SCORE = 70

const fullExamDistribution: Array<[DomainId, number]> = [
  ["architecture", 5],
  ["tools", 6],
  ["memory", 4],
  ["evaluation", 5],
  ["orchestration", 5],
  ["guardrails", 5],
]

function queueByLastSeen(questions: Question[], latestAnswers: Record<string, string[]>, finishedAttempts: FinishedAttempt[]) {
  const lastSeen = new Map<string, number>()

  finishedAttempts.forEach((attempt) => {
    Object.entries(attempt.answers).forEach(([id, answer]) => {
      if (answer.length) lastSeen.set(id, Math.max(lastSeen.get(id) ?? 0, attempt.finishedAt))
    })
  })

  return questions
    .map((question) => ({
      question,
      answered: Boolean(latestAnswers[question.id]?.length),
      lastSeen: lastSeen.get(question.id) ?? 0,
      sort: Math.random(),
    }))
    .sort((a, b) => Number(a.answered) - Number(b.answered) || a.lastSeen - b.lastSeen || a.sort - b.sort)
    .map(({ question }) => question)
}

export function selectDomain(domains: DomainId[], domain: DomainId) {
  return domains.includes(domain) ? domains : [...domains, domain]
}

export function unselectDomain(domains: DomainId[], domain: DomainId) {
  return domains.filter((id) => id !== domain)
}

export function selectQuestions(questions: Question[], mode: AttemptMode, domains?: DomainId[], latestAnswers: Record<string, string[]> = {}, finishedAttempts: FinishedAttempt[] = []) {
  const queue = queueByLastSeen(questions, latestAnswers, finishedAttempts)

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

export function calculateScore(attempt: Pick<Attempt, "questionIds" | "answers">, questionMap: Map<string, Question>) {
  const correct = attempt.questionIds.filter((id) => {
    const question = questionMap.get(id)
    return question ? answersMatch(attempt.answers[id], question.correctAnswers) : false
  }).length
  return Math.round((correct / attempt.questionIds.length) * 100) || 0
}

export function latestAnswersFromAttempts(attempts: Array<Pick<Attempt, "answers">>) {
  const latestAnswers: Record<string, string[]> = {}
  const oldestFirst = [...attempts].reverse()
  oldestFirst.forEach((attempt) => {
    Object.entries(attempt.answers).forEach(([id, answer]) => {
      if (answer.length) latestAnswers[id] = answer
    })
  })
  return latestAnswers
}

export function countAnswered(latestAnswers: Record<string, string[]>, questions: Question[]) {
  const known = new Set(questions.map((question) => question.id))
  return Object.entries(latestAnswers).filter(([id, answer]) => answer.length > 0 && known.has(id)).length
}

export function readinessScore(latestAnswers: Record<string, string[]>, questions: Question[]) {
  if (!questions.length) return 0
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  let correct = 0
  Object.entries(latestAnswers).forEach(([id, answer]) => {
    const question = questionMap.get(id)
    if (question && answer.length && answersMatch(answer, question.correctAnswers)) correct += 1
  })
  return Math.round((correct / questions.length) * 100)
}

export function domainProgress(latestAnswers: Record<string, string[]>, questions: Question[], domain: DomainId) {
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  const total = questions.filter((question) => question.domain === domain).length
  let answered = 0
  let correct = 0
  Object.entries(latestAnswers).forEach(([id, answer]) => {
    const question = questionMap.get(id)
    if (question?.domain === domain && answer.length) {
      answered += 1
      if (answersMatch(answer, question.correctAnswers)) correct += 1
    }
  })
  return { answered, correct, score: total ? Math.round((correct / total) * 100) : 0 }
}

export function formatDuration(seconds: number) {
  const safe = Math.max(seconds, 0)
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`
}

type TimedAttempt = Pick<Attempt, "startedAt" | "durationMinutes" | "pausedAt" | "pausedDurationMs">

export function isAttemptPaused(attempt: TimedAttempt) {
  return typeof attempt.pausedAt === "number"
}

export function getAttemptElapsedMs(attempt: TimedAttempt, now = Date.now()) {
  const referenceTime = attempt.pausedAt ?? now
  return Math.max(0, referenceTime - attempt.startedAt - (attempt.pausedDurationMs ?? 0))
}

export function getAttemptRemainingSeconds(attempt: TimedAttempt, now = Date.now()) {
  const durationMs = attempt.durationMinutes * 60_000
  return Math.max(0, Math.ceil((durationMs - getAttemptElapsedMs(attempt, now)) / 1000))
}

export function pauseAttemptTimer(attempt: Attempt, now = Date.now()) {
  if (isAttemptPaused(attempt)) return attempt
  return { ...attempt, pausedAt: now }
}

export function resumeAttemptTimer(attempt: Attempt, now = Date.now()) {
  const pausedAt = attempt.pausedAt
  if (pausedAt === undefined) return attempt
  const pausedDurationMs = (attempt.pausedDurationMs ?? 0) + Math.max(0, now - pausedAt)
  return { ...attempt, pausedAt: undefined, pausedDurationMs }
}
