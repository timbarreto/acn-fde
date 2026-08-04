import { latestAnswersFromAttempts } from "@/lib/exam"
import type { Attempt, AttemptMode, AttemptOutcome, DomainId, FinishedAttempt, PracticeState } from "@/types"

export const PRACTICE_STATE_STORAGE_KEY = "agentic-ready-gh600-v1"
export const FINISHED_ATTEMPT_LIMIT = 30

type StorageReader = Pick<Storage, "getItem">
type StorageWriter = Pick<Storage, "setItem">
type JsonRecord = Record<string, unknown>

const attemptModes: AttemptMode[] = ["full", "quick", "domain"]
const attemptOutcomes: AttemptOutcome[] = ["submitted", "expired", "abandoned"]
const domainIds: DomainId[] = ["architecture", "tools", "memory", "evaluation", "orchestration", "guardrails"]

// These types and field reads are the compatibility boundary for browser data
// written before the practice-state vocabulary was adopted.
interface LegacyFinishedAttempt extends Omit<FinishedAttempt, "finishedAt" | "outcome"> {
  completedAt: number
  pausedDurationMs?: number
}

interface LegacyPracticeState {
  progress: Record<string, string[]>
}

function emptyPracticeState(): PracticeState {
  return { activeAttempt: null, attempts: [], bookmarks: [], latestAnswers: {} }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function readAnswers(value: unknown): Record<string, string[]> {
  const record = asRecord(value)
  if (!record) return {}
  return Object.fromEntries(
    Object.entries(record).map(([questionId, answers]) => [questionId, readStringArray(answers)]),
  )
}

function readMode(value: unknown): AttemptMode | null {
  return typeof value === "string" && attemptModes.includes(value as AttemptMode) ? value as AttemptMode : null
}

function readOutcome(value: unknown): AttemptOutcome | null {
  return typeof value === "string" && attemptOutcomes.includes(value as AttemptOutcome) ? value as AttemptOutcome : null
}

function readDomains(value: unknown): DomainId[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is DomainId => typeof item === "string" && domainIds.includes(item as DomainId))
}

function readAttemptCommon(record: JsonRecord) {
  const id = readString(record.id)
  const mode = readMode(record.mode)
  const label = readString(record.label)
  const startedAt = readNumber(record.startedAt)
  const durationMinutes = readNumber(record.durationMinutes)
  if (id === null || mode === null || label === null || startedAt === null || durationMinutes === null) return null

  return {
    id,
    mode,
    label,
    questionIds: readStringArray(record.questionIds),
    answers: readAnswers(record.answers),
    flagged: readStringArray(record.flagged),
    startedAt,
    durationMinutes,
    domains: readDomains(record.domains),
  }
}

function readAttempt(value: unknown): Attempt | null {
  const record = asRecord(value)
  if (!record) return null
  const common = readAttemptCommon(record)
  const currentIndex = readNumber(record.currentIndex)
  if (!common || currentIndex === null) return null

  const pausedAt = readNumber(record.pausedAt)
  const pausedDurationMs = readNumber(record.pausedDurationMs)
  return {
    ...common,
    currentIndex,
    ...(pausedAt === null ? {} : { pausedAt }),
    ...(pausedDurationMs === null ? {} : { pausedDurationMs }),
  }
}

function inferLegacyOutcome(attempt: LegacyFinishedAttempt): AttemptOutcome {
  const elapsedMs = attempt.completedAt - attempt.startedAt - (attempt.pausedDurationMs ?? 0)
  return elapsedMs >= attempt.durationMinutes * 60_000 ? "expired" : "submitted"
}

function readFinishedAttempt(value: unknown): FinishedAttempt | null {
  const record = asRecord(value)
  if (!record) return null
  const common = readAttemptCommon(record)
  const finishedAt = readNumber(record.finishedAt) ?? readNumber(record.completedAt)
  const score = readNumber(record.score)
  if (!common || finishedAt === null || score === null) return null

  const pausedDurationMs = readNumber(record.pausedDurationMs) ?? undefined
  const legacyAttempt: LegacyFinishedAttempt = { ...common, completedAt: finishedAt, score, pausedDurationMs }
  const outcome = readOutcome(record.outcome) ?? inferLegacyOutcome(legacyAttempt)
  return { ...common, finishedAt, score, outcome }
}

export function retainRecentFinishedAttempts(attempts: FinishedAttempt[]) {
  return [...attempts]
    .sort((left, right) => right.finishedAt - left.finishedAt)
    .slice(0, FINISHED_ATTEMPT_LIMIT)
}

export function migrateStoredPracticeState(raw: string | null): PracticeState {
  if (!raw) return emptyPracticeState()

  try {
    const parsed = asRecord(JSON.parse(raw))
    if (!parsed) return emptyPracticeState()

    const legacy = parsed as Partial<LegacyPracticeState>
    const activeAttempt = readAttempt(parsed.activeAttempt)
    const finishedAttemptValues = Array.isArray(parsed.attempts) ? parsed.attempts : []
    const allFinishedAttempts = finishedAttemptValues
      .map(readFinishedAttempt)
      .filter((attempt): attempt is FinishedAttempt => attempt !== null)
    const finishedAttempts = retainRecentFinishedAttempts(allFinishedAttempts)
    const bookmarks = [...new Set(readStringArray(parsed.bookmarks))]
    const currentLatestAnswers = readAnswers(parsed.latestAnswers)
    const legacyLatestAnswers = readAnswers(legacy.progress)
    const storedLatestAnswers = Object.keys(currentLatestAnswers).length ? currentLatestAnswers : legacyLatestAnswers
    const latestAnswers = Object.keys(storedLatestAnswers).length
      ? storedLatestAnswers
      : latestAnswersFromAttempts(activeAttempt ? [activeAttempt, ...allFinishedAttempts] : allFinishedAttempts)

    return { activeAttempt, attempts: finishedAttempts, bookmarks, latestAnswers }
  } catch {
    return emptyPracticeState()
  }
}

export function loadPracticeState(storage: StorageReader = localStorage): PracticeState {
  return migrateStoredPracticeState(storage.getItem(PRACTICE_STATE_STORAGE_KEY))
}

export function savePracticeState(practiceState: PracticeState, storage: StorageWriter = localStorage) {
  storage.setItem(PRACTICE_STATE_STORAGE_KEY, JSON.stringify(practiceState))
}
