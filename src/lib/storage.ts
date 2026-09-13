import { KANA, KANA_BY_CHARACTER } from '../data/kana'
import { getFsrsCardKey, isSerializedFsrsCard } from './fsrs'
import { shuffle } from './quiz'
import type {
  FirstCheckOrder,
  FsrsCardMap,
  FsrsCardRecord,
  LegacySessionV1,
  ProgressMap,
  ScheduledSessionItem,
  Session,
  SessionMode,
} from '../types'

export const SESSION_V1_KEY = 'kana-recall:session:v1'
export const SESSION_V2_KEY = 'kana-recall:session:v2'
export const PROGRESS_KEY = 'kana-recall:progress:v1'
export const FSRS_KEY = 'kana-recall:fsrs:v1'
export const FIRST_CHECK_ORDER_KEY = 'kana-recall:first-check-order:v1'

function isSettings(value: unknown): value is Session['settings'] {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<Session['settings']>
  return (
    ['hiragana', 'katakana', 'mixed'].includes(settings.range ?? '') &&
    ['trigger', 'sound'].includes(settings.promptMode ?? '') &&
    typeof settings.sessionSize === 'number' &&
    Number.isFinite(settings.sessionSize) &&
    settings.sessionSize > 0
  )
}

function isSessionItem(value: unknown): value is ScheduledSessionItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ScheduledSessionItem>
  return (
    typeof item.id === 'string' &&
    typeof item.character === 'string' &&
    KANA_BY_CHARACTER.has(item.character) &&
    ['due', 'first-check', 'practice', 'retry'].includes(item.source ?? '') &&
    typeof item.fsrsRecorded === 'boolean' &&
    (item.retryOf === undefined || typeof item.retryOf === 'string')
  )
}

function isValidSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<Session>
  const modes: SessionMode[] = ['scheduled', 'trigger-practice', 'free-practice', 'legacy-practice']
  const items = session.items
  const currentItem = items?.[session.index ?? -1]
  const currentKana = currentItem ? KANA_BY_CHARACTER.get(currentItem.character) : undefined

  if (
    session.version !== 2 ||
    typeof session.id !== 'string' ||
    !(
      session.startedAt === undefined ||
      session.startedAt === null ||
      (typeof session.startedAt === 'number' && Number.isFinite(session.startedAt))
    ) ||
    !isSettings(session.settings) ||
    !modes.includes(session.mode as SessionMode) ||
    !Array.isArray(items) ||
    !items.every(isSessionItem) ||
    typeof session.initialItemCount !== 'number' ||
    session.initialItemCount < 0 ||
    session.initialItemCount > items.length ||
    typeof session.index !== 'number' ||
    !Number.isInteger(session.index) ||
    !Array.isArray(session.options) ||
    typeof session.optionsVisibleAt !== 'number' ||
    typeof session.correctCount !== 'number' ||
    typeof session.wrongCount !== 'number' ||
    !Array.isArray(session.reviewCharacters) ||
    !session.reviewCharacters.every((character) => typeof character === 'string' && KANA_BY_CHARACTER.has(character)) ||
    typeof session.completed !== 'boolean' ||
    !(session.completedAt === null || (typeof session.completedAt === 'number' && Number.isFinite(session.completedAt))) ||
    !(
      session.freePracticePromotedAt === undefined ||
      session.freePracticePromotedAt === null ||
      (typeof session.freePracticePromotedAt === 'number' && Number.isFinite(session.freePracticePromotedAt))
    )
  ) return false

  if (session.completed && items.length === 0) return session.index === 0 && session.options.length === 0
  if (session.index < 0 || session.index >= items.length || !currentKana) return false
  if (session.options.length !== 4 || new Set(session.options).size !== 4) return false
  if (!session.options.includes(currentItem!.character)) return false
  return session.options.every((character) => KANA_BY_CHARACTER.get(character)?.kind === currentKana.kind)
}

function normalizeSession(session: Session): Session {
  return {
    ...session,
    startedAt: session.startedAt === undefined ? (
      session.index > 0 || session.answer !== null
        ? Math.max(0, session.optionsVisibleAt - 2_000)
        : null
    ) : session.startedAt,
    freePracticePromotedAt: session.freePracticePromotedAt ?? null,
  }
}

function isLegacySession(value: unknown): value is LegacySessionV1 {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<LegacySessionV1>
  return (
    session.version === 1 &&
    typeof session.id === 'string' &&
    isSettings(session.settings) &&
    Array.isArray(session.queue) &&
    session.queue.length > 0 &&
    session.queue.every((character) => typeof character === 'string' && KANA_BY_CHARACTER.has(character)) &&
    Array.isArray(session.initialCharacters) &&
    typeof session.index === 'number' &&
    Number.isInteger(session.index) &&
    session.index >= 0 &&
    session.index < session.queue.length &&
    Array.isArray(session.options) &&
    session.options.length === 4 &&
    new Set(session.options).size === 4 &&
    typeof session.optionsVisibleAt === 'number' &&
    typeof session.correctCount === 'number' &&
    typeof session.wrongCount === 'number' &&
    Array.isArray(session.reviewCharacters) &&
    typeof session.completed === 'boolean'
  )
}

export function migrateSessionV1(session: LegacySessionV1): Session {
  const initialCount = session.initialCharacters.length
  const items = session.queue.map((character, index): ScheduledSessionItem => ({
    id: `${session.id}:legacy:${index}:${character}`,
    character,
    source: index < initialCount ? 'practice' : 'retry',
    fsrsRecorded: true,
    ...(index >= initialCount ? { retryOf: `${session.id}:legacy:${session.initialCharacters.indexOf(character)}:${character}` } : {}),
  }))

  return {
    version: 2,
    id: session.id,
    startedAt: session.index > 0 || session.answer !== null
      ? Math.max(0, session.optionsVisibleAt - 2_000)
      : null,
    settings: session.settings,
    mode: 'legacy-practice',
    items,
    initialItemCount: initialCount,
    index: session.index,
    options: session.options,
    optionsVisibleAt: session.optionsVisibleAt,
    answer: session.answer,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    reviewCharacters: session.reviewCharacters,
    completed: session.completed,
    completedAt: session.completed ? Date.now() : null,
    freePracticePromotedAt: null,
  }
}

export function loadSession(): Session | null {
  try {
    const current = localStorage.getItem(SESSION_V2_KEY)
    if (current) {
      const parsed: unknown = JSON.parse(current)
      if (isValidSession(parsed)) return normalizeSession(parsed)
    }

    const legacy = localStorage.getItem(SESSION_V1_KEY)
    if (!legacy) return null
    const parsedLegacy: unknown = JSON.parse(legacy)
    if (!isLegacySession(parsedLegacy)) return null
    const migrated = migrateSessionV1(parsedLegacy)
    saveSession(migrated)
    return migrated
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_V2_KEY, JSON.stringify(session))
  } catch {
    // The quiz remains usable if storage is unavailable or full.
  }
}

function isFsrsRecord(value: unknown): value is FsrsCardRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<FsrsCardRecord>
  return (
    typeof record.key === 'string' &&
    typeof record.character === 'string' &&
    KANA_BY_CHARACTER.has(record.character) &&
    record.promptMode === 'sound' &&
    record.key === getFsrsCardKey(record.character) &&
    isSerializedFsrsCard(record.card)
  )
}

export function loadFsrsCards(): FsrsCardMap {
  try {
    const stored = localStorage.getItem(FSRS_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isFsrsRecord(value)))
  } catch {
    return {}
  }
}

export function saveFsrsCards(cards: FsrsCardMap): void {
  try {
    localStorage.setItem(FSRS_KEY, JSON.stringify(cards))
  } catch {
    // The current session remains usable if persistence is unavailable.
  }
}

function isCompleteKanaOrder(value: unknown): value is FirstCheckOrder {
  if (!value || typeof value !== 'object') return false
  const order = value as Partial<FirstCheckOrder>
  return (
    order.version === 1 &&
    Array.isArray(order.characters) &&
    order.characters.length === KANA.length &&
    new Set(order.characters).size === KANA.length &&
    order.characters.every((character) => typeof character === 'string' && KANA_BY_CHARACTER.has(character))
  )
}

export function loadOrCreateFirstCheckOrder(random: () => number = Math.random): FirstCheckOrder {
  try {
    const stored = localStorage.getItem(FIRST_CHECK_ORDER_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isCompleteKanaOrder(parsed)) return parsed
    }
  } catch {
    // Fall through to a fresh order without touching other stored data.
  }

  const order: FirstCheckOrder = { version: 1, characters: shuffle(KANA.map((kana) => kana.character), random) }
  try {
    localStorage.setItem(FIRST_CHECK_ORDER_KEY, JSON.stringify(order))
  } catch {
    // A stable in-memory order still supports the current browser session.
  }
  return order
}

function isProgressMap(value: unknown): value is ProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([character, item]) => {
    if (!KANA_BY_CHARACTER.has(character) || !item || typeof item !== 'object') return false
    const progress = item as Partial<ProgressMap[string]>
    return (
      typeof progress.shown === 'number' && Number.isFinite(progress.shown) && progress.shown >= 0 &&
      typeof progress.correct === 'number' && Number.isFinite(progress.correct) && progress.correct >= 0 &&
      typeof progress.wrong === 'number' && Number.isFinite(progress.wrong) && progress.wrong >= 0 &&
      typeof progress.lastStudiedAt === 'string'
    )
  })
}

export function loadProgress(): ProgressMap {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    return isProgressMap(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function updateProgress(character: string, correct: boolean): ProgressMap {
  const progress = loadProgress()
  const previous = progress[character] ?? { shown: 0, correct: 0, wrong: 0, lastStudiedAt: '' }
  progress[character] = {
    shown: previous.shown + 1,
    correct: previous.correct + (correct ? 1 : 0),
    wrong: previous.wrong + (correct ? 0 : 1),
    lastStudiedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // Learning must not be blocked by malformed or unavailable storage.
  }
  return progress
}
