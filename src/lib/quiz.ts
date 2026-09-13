import { KANA, KANA_BY_CHARACTER } from '../data/kana'
import { getFsrsCardKey, localDateKey } from './fsrs'
import type {
  CompletionStatus,
  FirstCheckOrder,
  FsrsCardMap,
  HomeStats,
  Kana,
  KanaRange,
  ScheduledSessionItem,
  Session,
  SessionItemSource,
  SessionMode,
  Settings,
  ProgressMap,
} from '../types'

export const OPTIONS_DELAY_MS = 2_000
export const MAX_SESSION_SIZE = 10

export const DEFAULT_SETTINGS: Settings = {
  range: 'mixed',
  promptMode: 'sound',
  sessionSize: MAX_SESSION_SIZE,
}

export const CONFUSABLES: Readonly<Record<string, readonly string[]>> = {
  く: ['へ', 'し', 'つ'],
  い: ['り', 'こ', 'し'],
  ぬ: ['め', 'ね', 'の'],
  る: ['ろ', 'れ', 'ね'],
  れ: ['わ', 'ね', 'る'],
  わ: ['れ', 'ね', 'る'],
  さ: ['き', 'ち', 'せ'],
  き: ['さ', 'ち', 'け'],
  あ: ['お', 'ぬ', 'め'],
  シ: ['ツ', 'ン', 'ソ'],
  ツ: ['シ', 'ソ', 'ン'],
  ソ: ['ン', 'シ', 'ツ'],
  ン: ['ソ', 'シ', 'ツ'],
  ク: ['ケ', 'タ', 'ワ'],
  ワ: ['ク', 'ウ', 'フ'],
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function getKanaForRange(range: KanaRange): Kana[] {
  return KANA.filter((kana) => range === 'mixed' || kana.kind === range)
}

export function createOptions(character: string, random: () => number = Math.random): string[] {
  const answer = KANA_BY_CHARACTER.get(character)
  if (!answer) throw new Error(`Unknown kana: ${character}`)

  const sameKind = KANA.filter((kana) => kana.kind === answer.kind && kana.character !== character)
  const preferred = (CONFUSABLES[character] ?? [])
    .map((candidate) => KANA_BY_CHARACTER.get(candidate))
    .filter((candidate): candidate is Kana => Boolean(candidate && candidate.kind === answer.kind))
  const preferredCharacters = new Set(preferred.map((kana) => kana.character))
  const fallback = sameKind.filter((kana) => !preferredCharacters.has(kana.character))
  const distractors = [...shuffle(preferred, random), ...shuffle(fallback, random)]
    .filter((kana, index, all) => all.findIndex((item) => item.character === kana.character) === index)
    .slice(0, 3)
    .map((kana) => kana.character)

  return shuffle([character, ...distractors], random)
}

function sessionLimit(settings: Settings): number {
  return Math.max(1, Math.min(MAX_SESSION_SIZE, settings.sessionSize))
}

function createItems(
  characters: readonly string[],
  sources: readonly SessionItemSource[],
  sessionId: string,
): ScheduledSessionItem[] {
  return characters.map((character, index) => ({
    id: `${sessionId}:${index}:${character}`,
    character,
    source: sources[index],
    fsrsRecorded: sources[index] === 'practice' || sources[index] === 'retry',
  }))
}

function buildSession(
  settings: Settings,
  characters: readonly string[],
  sources: readonly SessionItemSource[],
  mode: SessionMode,
  now: number,
  random: () => number,
): Session {
  const id = `${now}-${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36)}`
  const items = createItems(characters, sources, id)
  const firstCharacter = items[0]?.character

  return {
    version: 2,
    id,
    settings,
    mode,
    items,
    initialItemCount: items.length,
    index: 0,
    options: firstCharacter ? createOptions(firstCharacter, random) : [],
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
    correctCount: 0,
    wrongCount: 0,
    reviewCharacters: [],
    completed: items.length === 0,
    completedAt: items.length === 0 ? now : null,
    freePracticePromotedAt: null,
  }
}

export function createScheduledSession(
  settings: Settings,
  cards: FsrsCardMap,
  firstCheckOrder: FirstCheckOrder,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  const scheduledSettings: Settings = { ...settings, promptMode: 'sound' }
  const eligible = new Set(getKanaForRange(settings.range).map((kana) => kana.character))
  const dueCharacters = Object.values(cards)
    .filter((record) => eligible.has(record.character) && record.promptMode === 'sound' && record.card.due <= now)
    .sort((left, right) => left.card.due - right.card.due)
    .map((record) => record.character)
  const limit = sessionLimit(settings)
  const selectedDue = dueCharacters.slice(0, limit)
  const selected = new Set(selectedDue)
  const firstChecks = firstCheckOrder.characters
    .filter((character) => eligible.has(character))
    .filter((character) => !cards[getFsrsCardKey(character)] && !selected.has(character))
    .slice(0, limit - selectedDue.length)
  const characters = [...selectedDue, ...firstChecks]
  const sources: SessionItemSource[] = [
    ...selectedDue.map(() => 'due' as const),
    ...firstChecks.map(() => 'first-check' as const),
  ]

  return buildSession(scheduledSettings, characters, sources, 'scheduled', now, random)
}

export function createTriggerPracticeSession(
  settings: Settings,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  const triggerSettings: Settings = { ...settings, promptMode: 'trigger' }
  const characters = shuffle(getKanaForRange(settings.range), random)
    .slice(0, sessionLimit(settings))
    .map((kana) => kana.character)
  return buildSession(triggerSettings, characters, characters.map(() => 'practice'), 'trigger-practice', now, random)
}

export function createFreePracticeSession(
  settings: Settings,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  const practiceSettings: Settings = { ...settings, promptMode: 'sound' }
  const characters = shuffle(getKanaForRange(settings.range), random)
    .slice(0, sessionLimit(settings))
    .map((kana) => kana.character)
  return buildSession(practiceSettings, characters, characters.map(() => 'practice'), 'free-practice', now, random)
}

export function answerSession(session: Session, selected: string, fsrsRecorded = false): Session {
  if (session.answer || session.completed) return session

  const item = session.items[session.index]
  if (!item) return session
  const correct = selected === item.character
  const shouldAddReview = !correct && item.source !== 'retry' && !session.reviewCharacters.includes(item.character)
  const updatedItems = session.items.map((candidate, index) => (
    index === session.index && fsrsRecorded ? { ...candidate, fsrsRecorded: true } : candidate
  ))

  if (shouldAddReview) {
    updatedItems.push({
      id: `${item.id}:retry`,
      character: item.character,
      source: 'retry',
      fsrsRecorded: true,
      retryOf: item.id,
    })
  }

  return {
    ...session,
    items: updatedItems,
    answer: { selected, correct },
    correctCount: session.correctCount + (correct ? 1 : 0),
    wrongCount: session.wrongCount + (correct ? 0 : 1),
    reviewCharacters: shouldAddReview ? [...session.reviewCharacters, item.character] : session.reviewCharacters,
  }
}

export function advanceSession(
  session: Session,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  if (!session.answer || session.completed) return session
  const nextIndex = session.index + 1
  if (nextIndex >= session.items.length) return { ...session, completed: true, completedAt: now }

  return {
    ...session,
    index: nextIndex,
    options: createOptions(session.items[nextIndex].character, random),
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
  }
}

export function getCompletionStatus(
  cards: FsrsCardMap,
  range: KanaRange,
  now: number = Date.now(),
): CompletionStatus {
  const eligible = new Set(getKanaForRange(range).map((kana) => kana.character))
  const records = Object.values(cards).filter((record) => eligible.has(record.character) && record.promptMode === 'sound')
  const dueRemaining = records.filter((record) => record.card.due <= now).length
  const future = records.filter((record) => record.card.due > now).sort((left, right) => left.card.due - right.card.due)
  const nextDueAt = future[0]?.card.due ?? null
  const nextDueCount = nextDueAt === null
    ? 0
    : future.filter((record) => localDateKey(record.card.due) === localDateKey(nextDueAt)).length

  return {
    dueRemaining,
    canFreePractice: dueRemaining === 0,
    nextDueAt,
    nextDueCount,
  }
}

export function shouldRecordFsrs(session: Session, item: ScheduledSessionItem | undefined = session.items[session.index]): boolean {
  return Boolean(
    item &&
    session.mode === 'scheduled' &&
    session.settings.promptMode === 'sound' &&
    item.source !== 'retry' &&
    !item.fsrsRecorded,
  )
}

export function shouldRecordLongTermProgress(
  session: Session,
  item: ScheduledSessionItem | undefined = session.items[session.index],
): boolean {
  return Boolean(item && item.source !== 'retry' && session.mode !== 'free-practice')
}

export function canOfferFreePractice(session: Session, completion: CompletionStatus): boolean {
  return session.completed && session.mode === 'scheduled' && completion.canFreePractice
}

export function canPromoteFreePracticeErrors(session: Session): boolean {
  return (
    session.completed &&
    session.mode === 'free-practice' &&
    session.reviewCharacters.length > 0 &&
    session.freePracticePromotedAt === null
  )
}

export function getHomeStats(
  cards: FsrsCardMap,
  progress: ProgressMap,
  range: KanaRange,
  now: number = Date.now(),
): HomeStats {
  const eligibleCharacters = getKanaForRange(range).map((kana) => kana.character)
  const eligible = new Set(eligibleCharacters)
  const records = Object.values(cards).filter((record) => eligible.has(record.character) && record.promptMode === 'sound')
  const progressRecords = Object.entries(progress).filter(([character]) => eligible.has(character)).map(([, value]) => value)
  const attempts = progressRecords.reduce((total, item) => total + item.shown, 0)
  const correct = progressRecords.reduce((total, item) => total + item.correct, 0)

  return {
    due: records.filter((record) => record.card.due <= now).length,
    firstCheckRemaining: eligibleCharacters.length - records.length,
    checked: records.length,
    attempts,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
  }
}
