export type KanaKind = 'hiragana' | 'katakana'
export type KanaRange = KanaKind | 'mixed'
export type PromptMode = 'trigger' | 'sound'
export type SessionMode = 'scheduled' | 'trigger-practice' | 'free-practice' | 'legacy-practice'
export type SessionItemSource = 'due' | 'first-check' | 'practice' | 'retry'

export interface Kana {
  character: string
  sound: string
  trigger: string
  description: string
  kind: KanaKind
}

export interface Settings {
  range: KanaRange
  promptMode: PromptMode
  sessionSize: number
}

export interface AnswerResult {
  selected: string
  correct: boolean
}

export interface ScheduledSessionItem {
  id: string
  character: string
  source: SessionItemSource
  fsrsRecorded: boolean
  retryOf?: string
}

export interface Session {
  version: 2
  id: string
  settings: Settings
  mode: SessionMode
  items: ScheduledSessionItem[]
  initialItemCount: number
  index: number
  options: string[]
  optionsVisibleAt: number
  answer: AnswerResult | null
  correctCount: number
  wrongCount: number
  reviewCharacters: string[]
  completed: boolean
  completedAt: number | null
  freePracticePromotedAt: number | null
}

export interface LegacySessionV1 {
  version: 1
  id: string
  settings: Settings
  queue: string[]
  initialCharacters: string[]
  index: number
  options: string[]
  optionsVisibleAt: number
  answer: AnswerResult | null
  correctCount: number
  wrongCount: number
  reviewCharacters: string[]
  completed: boolean
}

export interface KanaProgress {
  shown: number
  correct: number
  wrong: number
  lastStudiedAt: string
}

export type ProgressMap = Record<string, KanaProgress>

export interface SerializedFsrsCard {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: number | null
}

export interface FsrsCardRecord {
  key: string
  character: string
  promptMode: 'sound'
  card: SerializedFsrsCard
}

export type FsrsCardMap = Record<string, FsrsCardRecord>

export interface FirstCheckOrder {
  version: 1
  characters: string[]
}

export interface CompletionStatus {
  dueRemaining: number
  canFreePractice: boolean
  nextDueAt: number | null
  nextDueCount: number
}

export interface HomeStats {
  due: number
  firstCheckRemaining: number
  checked: number
  attempts: number
  accuracy: number | null
}
