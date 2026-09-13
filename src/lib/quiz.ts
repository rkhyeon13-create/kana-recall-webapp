import { KANA, KANA_BY_CHARACTER } from '../data/kana'
import type { Kana, Session, Settings } from '../types'

export const OPTIONS_DELAY_MS = 2_000

export const DEFAULT_SETTINGS: Settings = {
  range: 'mixed',
  promptMode: 'trigger',
  sessionSize: 10,
}

export const CONFUSABLES: Readonly<Record<string, readonly string[]>> = {
  く: ['へ', 'し', 'つ'],
  い: ['り', 'こ', 'し'],
  ぬ: ['め', 'ね', 'の'],
  る: ['ろ', 'れ', 'ね'],
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

export function getKanaForRange(range: Settings['range']): Kana[] {
  return KANA.filter((kana) => range === 'mixed' || kana.kind === range)
}

export function createOptions(character: string, random: () => number = Math.random): string[] {
  const answer = KANA_BY_CHARACTER.get(character)
  if (!answer) throw new Error(`Unknown kana: ${character}`)

  const sameKind = KANA.filter((kana) => kana.kind === answer.kind && kana.character !== character)
  const preferred = (CONFUSABLES[character] ?? [])
    .map((candidate) => KANA_BY_CHARACTER.get(candidate))
    .filter((candidate): candidate is Kana => Boolean(candidate && candidate.kind === answer.kind))
  const distractors = shuffle([...preferred, ...shuffle(sameKind, random)], random)
    .filter((kana, index, all) => all.findIndex((item) => item.character === kana.character) === index)
    .slice(0, 3)
    .map((kana) => kana.character)

  return shuffle([character, ...distractors], random)
}

export function createSession(
  settings: Settings = DEFAULT_SETTINGS,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  const initialCharacters = shuffle(getKanaForRange(settings.range), random)
    .slice(0, Math.min(settings.sessionSize, getKanaForRange(settings.range).length))
    .map((kana) => kana.character)

  return {
    version: 1,
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    settings,
    queue: [...initialCharacters],
    initialCharacters,
    index: 0,
    options: createOptions(initialCharacters[0], random),
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
    correctCount: 0,
    wrongCount: 0,
    reviewCharacters: [],
    completed: false,
  }
}

export function answerSession(session: Session, selected: string): Session {
  if (session.answer || session.completed) return session

  const character = session.queue[session.index]
  const correct = selected === character
  const shouldAddReview = !correct && !session.reviewCharacters.includes(character)

  return {
    ...session,
    queue: shouldAddReview ? [...session.queue, character] : session.queue,
    answer: { selected, correct },
    correctCount: session.correctCount + (correct ? 1 : 0),
    wrongCount: session.wrongCount + (correct ? 0 : 1),
    reviewCharacters: shouldAddReview ? [...session.reviewCharacters, character] : session.reviewCharacters,
  }
}

export function advanceSession(
  session: Session,
  now: number = Date.now(),
  random: () => number = Math.random,
): Session {
  if (!session.answer || session.completed) return session
  const nextIndex = session.index + 1
  if (nextIndex >= session.queue.length) return { ...session, completed: true }

  return {
    ...session,
    index: nextIndex,
    options: createOptions(session.queue[nextIndex], random),
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
  }
}
