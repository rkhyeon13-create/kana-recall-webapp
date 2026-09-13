import { KANA_BY_CHARACTER } from '../data/kana'
import type { ProgressMap, Session } from '../types'

const SESSION_KEY = 'kana-recall:session:v1'
const PROGRESS_KEY = 'kana-recall:progress:v1'

function isValidSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<Session>
  const currentCharacter = session.queue?.[session.index ?? -1]
  const currentKana = currentCharacter ? KANA_BY_CHARACTER.get(currentCharacter) : undefined

  return (
    session.version === 1 &&
    typeof session.id === 'string' &&
    Boolean(session.settings) &&
    Array.isArray(session.queue) &&
    session.queue.length > 0 &&
    session.queue.every((character) => KANA_BY_CHARACTER.has(character)) &&
    Array.isArray(session.initialCharacters) &&
    typeof session.index === 'number' &&
    session.index >= 0 &&
    session.index < session.queue.length &&
    Array.isArray(session.options) &&
    session.options.length === 4 &&
    new Set(session.options).size === 4 &&
    Boolean(currentKana) &&
    typeof currentCharacter === 'string' &&
    session.options.includes(currentCharacter) &&
    session.options.every((character) => KANA_BY_CHARACTER.get(character)?.kind === currentKana?.kind) &&
    typeof session.optionsVisibleAt === 'number' &&
    typeof session.correctCount === 'number' &&
    typeof session.wrongCount === 'number' &&
    Array.isArray(session.reviewCharacters) &&
    typeof session.completed === 'boolean'
  )
}

export function loadSession(): Session | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    return isValidSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // The quiz remains usable if storage is unavailable or full.
  }
}

export function updateProgress(character: string, correct: boolean): void {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY)
    const progress: ProgressMap = stored ? (JSON.parse(stored) as ProgressMap) : {}
    const previous = progress[character] ?? { shown: 0, correct: 0, wrong: 0, lastStudiedAt: '' }
    progress[character] = {
      shown: previous.shown + 1,
      correct: previous.correct + (correct ? 1 : 0),
      wrong: previous.wrong + (correct ? 0 : 1),
      lastStudiedAt: new Date().toISOString(),
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // Learning must not be blocked by malformed or unavailable storage.
  }
}
