import { WORD_BY_ID } from '../data/words'
import type { WordDirection, WordProgressMap, WordPromptMode, WordRange, WordSession, WordSessionItem } from '../types'

export const WORD_PROGRESS_KEY = 'kana-recall:word-progress:v1'
export const WORD_SESSION_KEY = 'kana-recall:word-session:v1'

function isDirection(value: unknown): value is WordDirection {
  return value === 'meaning-to-japanese' || value === 'japanese-to-meaning'
}

function isRange(value: unknown): value is WordRange {
  return value === 'all' || [
    '인사 및 기본 표현', '사람 및 가족', '숫자 및 시간', '장소',
    '주문 및 음식', '쇼핑 및 형용사', '수속 및 길 묻기', '동사',
  ].includes(String(value))
}

function isPromptMode(value: unknown): value is WordPromptMode {
  return value === 'mixed' || isDirection(value)
}

function isWordItem(value: unknown): value is WordSessionItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<WordSessionItem>
  return typeof item.id === 'string' && typeof item.wordId === 'string' && WORD_BY_ID.has(item.wordId) &&
    isDirection(item.direction) && (item.source === 'initial' || item.source === 'retry')
}

function isAnswer(value: unknown, options: readonly string[]): boolean {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const answer = value as { selected?: unknown; correct?: unknown }
  return typeof answer.selected === 'string' && options.includes(answer.selected) && typeof answer.correct === 'boolean'
}

function isWordSession(value: unknown): value is WordSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<WordSession>
  const items = session.items
  if (
    session.version !== 1 || typeof session.id !== 'string' || !isRange(session.range) ||
    !isPromptMode(session.promptMode) || !Array.isArray(items) || !items.every(isWordItem) ||
    typeof session.initialItemCount !== 'number' || !Number.isInteger(session.initialItemCount) || session.initialItemCount < 0 || session.initialItemCount > items.length ||
    typeof session.index !== 'number' || !Number.isInteger(session.index) ||
    !Array.isArray(session.options) || !session.options.every((id) => typeof id === 'string' && WORD_BY_ID.has(id)) ||
    typeof session.optionsVisibleAt !== 'number' || !Number.isFinite(session.optionsVisibleAt) ||
    typeof session.correctCount !== 'number' || !Number.isInteger(session.correctCount) || session.correctCount < 0 ||
    typeof session.wrongCount !== 'number' || !Number.isInteger(session.wrongCount) || session.wrongCount < 0 ||
    !isAnswer(session.answer, session.options) || !Array.isArray(session.reviewWordIds) ||
    !session.reviewWordIds.every((id) => typeof id === 'string' && WORD_BY_ID.has(id)) ||
    new Set(session.reviewWordIds).size !== session.reviewWordIds.length ||
    typeof session.completed !== 'boolean' ||
    !(session.completedAt === null || (typeof session.completedAt === 'number' && Number.isFinite(session.completedAt)))
  ) return false

  if (session.completed && items.length === 0) return session.index === 0 && session.options.length === 0
  const current = items[session.index]
  if (!current || session.index < 0 || session.index >= items.length) return false
  return session.options.length === 4 && new Set(session.options).size === 4 && session.options.includes(current.wordId)
}

function isWordProgress(value: unknown): value is WordProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([wordId, item]) => {
    if (!WORD_BY_ID.has(wordId) || !item || typeof item !== 'object') return false
    const progress = item as Partial<WordProgressMap[string]>
    return typeof progress.shown === 'number' && Number.isFinite(progress.shown) && progress.shown >= 0 &&
      typeof progress.correct === 'number' && Number.isFinite(progress.correct) && progress.correct >= 0 &&
      typeof progress.wrong === 'number' && Number.isFinite(progress.wrong) && progress.wrong >= 0 &&
      typeof progress.lastStudiedAt === 'string' && !Number.isNaN(Date.parse(progress.lastStudiedAt))
  })
}

export function loadWordSession(): WordSession | null {
  try {
    const stored = localStorage.getItem(WORD_SESSION_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    return isWordSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveWordSession(session: WordSession): void {
  try {
    localStorage.setItem(WORD_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Word learning remains usable when storage is unavailable.
  }
}

export function loadWordProgress(): WordProgressMap {
  try {
    const stored = localStorage.getItem(WORD_PROGRESS_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    return isWordProgress(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function saveWordProgress(progress: WordProgressMap): void {
  try {
    localStorage.setItem(WORD_PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // Word learning remains usable when storage is unavailable.
  }
}

export function recordWordProgress(
  progress: WordProgressMap,
  wordId: string,
  correct: boolean,
  now: Date = new Date(),
): WordProgressMap {
  const previous = progress[wordId] ?? { shown: 0, correct: 0, wrong: 0, lastStudiedAt: '' }
  return {
    ...progress,
    [wordId]: {
      shown: previous.shown + 1,
      correct: previous.correct + (correct ? 1 : 0),
      wrong: previous.wrong + (correct ? 0 : 1),
      lastStudiedAt: now.toISOString(),
    },
  }
}
