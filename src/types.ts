export type KanaKind = 'hiragana' | 'katakana'
export type KanaRange = KanaKind | 'mixed'
export type PromptMode = 'trigger' | 'sound'

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

export interface Session {
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
