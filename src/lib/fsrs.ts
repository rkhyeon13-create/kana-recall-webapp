import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
} from 'ts-fsrs'
import { KANA_BY_CHARACTER } from '../data/kana'
import type { FsrsCardMap, FsrsCardRecord, SerializedFsrsCard } from '../types'

export const FSRS_PACKAGE_VERSION = '5.4.2'
export const FSRS_PARAMETERS = {
  request_retention: 0.9,
  enable_fuzz: true,
} as const

const scheduler = fsrs(FSRS_PARAMETERS)

export function ratingForAnswer(correct: boolean): Rating.Again | Rating.Good {
  return correct ? Rating.Good : Rating.Again
}

export function getFsrsCardKey(character: string): string {
  return `${character}:sound`
}

export function serializeCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.getTime() ?? null,
  }
}

export function deserializeCard(card: SerializedFsrsCard): CardInput {
  return {
    ...card,
    due: new Date(card.due),
    state: card.state,
    last_review: card.last_review === null ? null : new Date(card.last_review),
  }
}

export function createFsrsRecord(
  character: string,
  correct: boolean,
  now: Date = new Date(),
  previous?: FsrsCardRecord,
): FsrsCardRecord {
  if (!KANA_BY_CHARACTER.has(character)) throw new Error(`Unknown kana: ${character}`)
  const card = previous ? deserializeCard(previous.card) : createEmptyCard(now)
  const rating = ratingForAnswer(correct)
  const result = scheduler.next(card, now, rating)

  return {
    key: getFsrsCardKey(character),
    character,
    promptMode: 'sound',
    card: serializeCard(result.card),
  }
}

export function promoteCharactersToFsrs(
  cards: FsrsCardMap,
  characters: readonly string[],
  now: Date = new Date(),
): FsrsCardMap {
  const next = { ...cards }
  for (const character of new Set(characters)) {
    if (!KANA_BY_CHARACTER.has(character)) continue
    const key = getFsrsCardKey(character)
    next[key] = createFsrsRecord(character, false, now, next[key])
  }
  return next
}

export function isSerializedFsrsCard(value: unknown): value is SerializedFsrsCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<SerializedFsrsCard>
  const state = card.state
  const finiteFields = [
    card.due,
    card.stability,
    card.difficulty,
    card.elapsed_days,
    card.scheduled_days,
    card.learning_steps,
    card.reps,
    card.lapses,
    card.state,
  ]

  return (
    finiteFields.every((field) => typeof field === 'number' && Number.isFinite(field)) &&
    (card.last_review === null || (typeof card.last_review === 'number' && Number.isFinite(card.last_review))) &&
    typeof state === 'number' &&
    Number.isInteger(state) &&
    state >= State.New &&
    state <= State.Relearning &&
    !Number.isNaN(new Date(card.due as number).getTime()) &&
    (card.last_review === null || !Number.isNaN(new Date(card.last_review).getTime()))
  )
}

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
