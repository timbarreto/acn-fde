export type DomainId = "architecture" | "tools" | "memory" | "evaluation" | "orchestration" | "guardrails"
export type Difficulty = "easy" | "medium" | "hard"
export type QuestionType = "single" | "multiple"

export interface QuestionOption {
  id: string
  text: string
}

export interface Question {
  id: string
  domain: DomainId
  objective: string
  difficulty: Difficulty
  type: QuestionType
  prompt: string
  options: QuestionOption[]
  correctAnswers: string[]
  explanation: string
  source: { label: string; url: string }
}

export type AttemptMode = "full" | "quick" | "domain"
export type AttemptOutcome = "submitted" | "expired" | "abandoned"

export interface Attempt {
  id: string
  mode: AttemptMode
  label: string
  questionIds: string[]
  answers: Record<string, string[]>
  flagged: string[]
  currentIndex: number
  startedAt: number
  durationMinutes: number
  pausedAt?: number
  pausedDurationMs?: number
  domains?: DomainId[]
}

export interface FinishedAttempt {
  id: string
  mode: AttemptMode
  label: string
  questionIds: string[]
  answers: Record<string, string[]>
  flagged: string[]
  startedAt: number
  durationMinutes: number
  domains?: DomainId[]
  finishedAt: number
  score: number
  outcome: AttemptOutcome
}

export interface PracticeState {
  activeAttempt: Attempt | null
  attempts: FinishedAttempt[]
  bookmarks: string[]
  latestAnswers: Record<string, string[]>
}

export interface BookmarkReceipt {
  isBookmarked: boolean
  receivedAt?: string
}

export interface PracticeStateReceipts {
  activeAttemptReceivedAt?: string
  finishedAttempts: Record<string, string>
  bookmarks: Record<string, BookmarkReceipt>
  latestAnswers: Record<string, string>
}

export interface PracticeStateEnvelope {
  schemaVersion: 2
  state: PracticeState
  receipts: PracticeStateReceipts
}
