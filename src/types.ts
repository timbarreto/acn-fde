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

export type ExamMode = "full" | "quick" | "domain"

export interface ActiveAttempt {
  id: string
  mode: ExamMode
  label: string
  questionIds: string[]
  answers: Record<string, string[]>
  flagged: string[]
  currentIndex: number
  startedAt: number
  durationMinutes: number
  domain?: DomainId
}

export interface CompletedAttempt extends ActiveAttempt {
  completedAt: number
  score: number
}

export interface PersistedState {
  activeAttempt: ActiveAttempt | null
  attempts: CompletedAttempt[]
  bookmarks: string[]
}
