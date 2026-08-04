import type {
  Attempt,
  AttemptMode,
  AttemptOutcome,
  BookmarkReceipt,
  DomainId,
  FinishedAttempt,
  PracticeState,
  PracticeStateEnvelope,
  PracticeStateReceipts,
} from "@/types"

type AttemptModeDto = "full" | "quick" | "domain"
type AttemptOutcomeDto = "submitted" | "expired" | "abandoned"
type DomainIdDto = "architecture" | "tools" | "memory" | "evaluation" | "orchestration" | "guardrails"

interface AttemptDto {
  id: string
  mode: AttemptModeDto
  label: string
  questionIds: string[]
  answers: Record<string, string[]>
  flagged: string[]
  currentIndex: number
  startedAt: number
  durationMinutes: number
  pausedAt?: number
  pausedDurationMs?: number
  domains?: DomainIdDto[]
}

interface FinishedAttemptDto {
  id: string
  mode: AttemptModeDto
  label: string
  questionIds: string[]
  answers: Record<string, string[]>
  flagged: string[]
  startedAt: number
  durationMinutes: number
  domains?: DomainIdDto[]
  finishedAt: number
  score: number
  outcome: AttemptOutcomeDto
}

interface PracticeStateDto {
  activeAttempt: AttemptDto | null
  attempts: FinishedAttemptDto[]
  bookmarks: string[]
  latestAnswers: Record<string, string[]>
}

interface BookmarkReceiptDto {
  isBookmarked: boolean
  receivedAt?: string
}

interface PracticeStateReceiptsDto {
  activeAttemptReceivedAt?: string
  finishedAttempts: Record<string, string>
  bookmarks: Record<string, BookmarkReceiptDto>
  latestAnswers: Record<string, string>
}

interface PracticeStateEnvelopeDto {
  schemaVersion: 2
  state: PracticeStateDto
  receipts: PracticeStateReceiptsDto
}

export type PracticeApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface PracticeApi {
  getPracticeState: (identityToken: string) => Promise<PracticeStateEnvelope>
  postPracticeState: (
    identityToken: string,
    envelope: PracticeStateEnvelope,
  ) => Promise<PracticeStateEnvelope>
}

export class PracticeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(`Practice state request failed with status ${status}.`)
    this.name = "PracticeApiError"
  }
}

export function createPracticeApi(fetcher: PracticeApiFetch = fetch): PracticeApi {
  return {
    async getPracticeState(identityToken) {
      const response = await fetcher("/api/practice-state", {
        headers: requestHeaders(identityToken),
      })
      return fromEnvelopeDto(await readResponse(response))
    },

    async postPracticeState(identityToken, envelope) {
      const response = await fetcher("/api/practice-state", {
        method: "POST",
        headers: requestHeaders(identityToken, true),
        body: JSON.stringify(toEnvelopeDto(envelope)),
      })
      return fromEnvelopeDto(await readResponse(response))
    },
  }
}

function requestHeaders(identityToken: string, hasBody = false): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${identityToken}`,
  })
  if (hasBody) headers.set("content-type", "application/json")
  return headers
}

async function readResponse(response: Response): Promise<PracticeStateEnvelopeDto> {
  if (response.ok) return await response.json() as PracticeStateEnvelopeDto

  let code: string | undefined
  try {
    const problem = await response.json() as { code?: unknown }
    if (typeof problem.code === "string") code = problem.code
  } catch {
    // The status remains actionable even when an intermediary returned no JSON.
  }
  throw new PracticeApiError(response.status, code)
}

function toEnvelopeDto(envelope: PracticeStateEnvelope): PracticeStateEnvelopeDto {
  return {
    schemaVersion: envelope.schemaVersion,
    state: toStateDto(envelope.state),
    receipts: toReceiptsDto(envelope.receipts),
  }
}

function fromEnvelopeDto(envelope: PracticeStateEnvelopeDto): PracticeStateEnvelope {
  return {
    schemaVersion: envelope.schemaVersion,
    state: fromStateDto(envelope.state),
    receipts: fromReceiptsDto(envelope.receipts),
  }
}

function toStateDto(state: PracticeState): PracticeStateDto {
  return {
    activeAttempt: state.activeAttempt ? toAttemptDto(state.activeAttempt) : null,
    attempts: state.attempts.map(toFinishedAttemptDto),
    bookmarks: [...state.bookmarks],
    latestAnswers: copyAnswers(state.latestAnswers),
  }
}

function fromStateDto(state: PracticeStateDto): PracticeState {
  return {
    activeAttempt: state.activeAttempt ? fromAttemptDto(state.activeAttempt) : null,
    attempts: state.attempts.map(fromFinishedAttemptDto),
    bookmarks: [...state.bookmarks],
    latestAnswers: copyAnswers(state.latestAnswers),
  }
}

function toAttemptDto(attempt: Attempt): AttemptDto {
  return {
    id: attempt.id,
    mode: attempt.mode,
    label: attempt.label,
    questionIds: [...attempt.questionIds],
    answers: copyAnswers(attempt.answers),
    flagged: [...attempt.flagged],
    currentIndex: attempt.currentIndex,
    startedAt: attempt.startedAt,
    durationMinutes: attempt.durationMinutes,
    ...(attempt.pausedAt === undefined ? {} : { pausedAt: attempt.pausedAt }),
    ...(attempt.pausedDurationMs === undefined ? {} : { pausedDurationMs: attempt.pausedDurationMs }),
    ...(attempt.domains === undefined ? {} : { domains: [...attempt.domains] }),
  }
}

function fromAttemptDto(attempt: AttemptDto): Attempt {
  return {
    id: attempt.id,
    mode: attempt.mode as AttemptMode,
    label: attempt.label,
    questionIds: [...attempt.questionIds],
    answers: copyAnswers(attempt.answers),
    flagged: [...attempt.flagged],
    currentIndex: attempt.currentIndex,
    startedAt: attempt.startedAt,
    durationMinutes: attempt.durationMinutes,
    ...(attempt.pausedAt === undefined ? {} : { pausedAt: attempt.pausedAt }),
    ...(attempt.pausedDurationMs === undefined ? {} : { pausedDurationMs: attempt.pausedDurationMs }),
    ...(attempt.domains === undefined ? {} : { domains: [...attempt.domains] as DomainId[] }),
  }
}

function toFinishedAttemptDto(attempt: FinishedAttempt): FinishedAttemptDto {
  return {
    id: attempt.id,
    mode: attempt.mode,
    label: attempt.label,
    questionIds: [...attempt.questionIds],
    answers: copyAnswers(attempt.answers),
    flagged: [...attempt.flagged],
    startedAt: attempt.startedAt,
    durationMinutes: attempt.durationMinutes,
    ...(attempt.domains === undefined ? {} : { domains: [...attempt.domains] }),
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    outcome: attempt.outcome,
  }
}

function fromFinishedAttemptDto(attempt: FinishedAttemptDto): FinishedAttempt {
  return {
    id: attempt.id,
    mode: attempt.mode as AttemptMode,
    label: attempt.label,
    questionIds: [...attempt.questionIds],
    answers: copyAnswers(attempt.answers),
    flagged: [...attempt.flagged],
    startedAt: attempt.startedAt,
    durationMinutes: attempt.durationMinutes,
    ...(attempt.domains === undefined ? {} : { domains: [...attempt.domains] as DomainId[] }),
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    outcome: attempt.outcome as AttemptOutcome,
  }
}

function toReceiptsDto(receipts: PracticeStateReceipts): PracticeStateReceiptsDto {
  return {
    ...(receipts.activeAttemptReceivedAt === undefined
      ? {}
      : { activeAttemptReceivedAt: receipts.activeAttemptReceivedAt }),
    finishedAttempts: { ...receipts.finishedAttempts },
    bookmarks: Object.fromEntries(
      Object.entries(receipts.bookmarks).map(([questionId, receipt]) => [
        questionId,
        toBookmarkReceiptDto(receipt),
      ]),
    ),
    latestAnswers: { ...receipts.latestAnswers },
  }
}

function fromReceiptsDto(receipts: PracticeStateReceiptsDto): PracticeStateReceipts {
  return {
    ...(receipts.activeAttemptReceivedAt === undefined
      ? {}
      : { activeAttemptReceivedAt: receipts.activeAttemptReceivedAt }),
    finishedAttempts: { ...receipts.finishedAttempts },
    bookmarks: Object.fromEntries(
      Object.entries(receipts.bookmarks).map(([questionId, receipt]) => [
        questionId,
        fromBookmarkReceiptDto(receipt),
      ]),
    ),
    latestAnswers: { ...receipts.latestAnswers },
  }
}

function toBookmarkReceiptDto(receipt: BookmarkReceipt): BookmarkReceiptDto {
  return {
    isBookmarked: receipt.isBookmarked,
    ...(receipt.receivedAt === undefined ? {} : { receivedAt: receipt.receivedAt }),
  }
}

function fromBookmarkReceiptDto(receipt: BookmarkReceiptDto): BookmarkReceipt {
  return {
    isBookmarked: receipt.isBookmarked,
    ...(receipt.receivedAt === undefined ? {} : { receivedAt: receipt.receivedAt }),
  }
}

function copyAnswers(answers: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, optionIds]) => [questionId, [...optionIds]]),
  )
}
