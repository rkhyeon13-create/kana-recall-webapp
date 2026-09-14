import { WORDS, WORD_BY_ID } from '../data/words'
import { OPTIONS_DELAY_MS, shuffle } from './quiz'
import type { Word, WordDirection, WordPromptMode, WordRange, WordSession, WordSessionItem } from '../types'

export const WORD_SESSION_SIZE = 10

export function getWordsForRange(range: WordRange): Word[] {
  return WORDS.filter((word) => range === 'all' || word.category === range)
}

export function directionForMode(mode: WordPromptMode, random: () => number = Math.random): WordDirection {
  if (mode !== 'mixed') return mode
  return random() < 0.5 ? 'meaning-to-japanese' : 'japanese-to-meaning'
}

export function wordAnswerText(word: Word, direction: WordDirection): string {
  return direction === 'meaning-to-japanese' ? word.japanese : word.meaningKo
}

export function comparableWordAnswer(word: Word, direction: WordDirection): string {
  const answer = wordAnswerText(word, direction)
  if (direction === 'meaning-to-japanese') return answer.replace(/[\s/·]/g, '').toLocaleLowerCase()
  return answer
    .replace(/\([^)]*\)/g, '')
    .split('/')[0]
    .replace(/[\s?.!,·]/g, '')
    .toLocaleLowerCase()
}

export function createWordOptions(
  wordId: string,
  direction: WordDirection,
  random: () => number = Math.random,
): string[] {
  const answer = WORD_BY_ID.get(wordId)
  if (!answer) throw new Error(`Unknown word: ${wordId}`)
  const answerKey = comparableWordAnswer(answer, direction)
  const isUsable = (candidate: Word) => candidate.id !== wordId && comparableWordAnswer(candidate, direction) !== answerKey
  const sameCategory = WORDS.filter((candidate) => candidate.category === answer.category && isUsable(candidate))
  const otherCategories = WORDS.filter((candidate) => candidate.category !== answer.category && isUsable(candidate))
  const distractors = [...shuffle(sameCategory, random), ...shuffle(otherCategories, random)]
    .filter((candidate, index, all) => all.findIndex(
      (item) => comparableWordAnswer(item, direction) === comparableWordAnswer(candidate, direction),
    ) === index)
    .slice(0, 3)
    .map((candidate) => candidate.id)

  if (distractors.length !== 3) throw new Error(`Not enough word options for ${wordId}`)
  return shuffle([wordId, ...distractors], random)
}

function createItems(
  words: readonly Word[],
  mode: WordPromptMode,
  sessionId: string,
  random: () => number,
): WordSessionItem[] {
  return words.map((word, index) => ({
    id: `${sessionId}:${index}:${word.id}`,
    wordId: word.id,
    direction: directionForMode(mode, random),
    source: 'initial',
  }))
}

export function createWordSession(
  range: WordRange = 'all',
  promptMode: WordPromptMode = 'meaning-to-japanese',
  now: number = Date.now(),
  random: () => number = Math.random,
): WordSession {
  const id = `words-${now}-${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36)}`
  const selectedWords = shuffle(getWordsForRange(range), random).slice(0, WORD_SESSION_SIZE)
  const items = createItems(selectedWords, promptMode, id, random)
  const first = items[0]

  return {
    version: 1,
    id,
    range,
    promptMode,
    items,
    initialItemCount: items.length,
    index: 0,
    options: first ? createWordOptions(first.wordId, first.direction, random) : [],
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
    correctCount: 0,
    wrongCount: 0,
    reviewWordIds: [],
    completed: items.length === 0,
    completedAt: items.length === 0 ? now : null,
  }
}

export function answerWordSession(session: WordSession, selectedWordId: string): WordSession {
  if (session.answer || session.completed) return session
  const item = session.items[session.index]
  if (!item) return session
  const correct = item.wordId === selectedWordId
  const shouldRetry = !correct && item.source === 'initial' && !session.reviewWordIds.includes(item.wordId)
  const items = shouldRetry
    ? [...session.items, {
      id: `${item.id}:retry`,
      wordId: item.wordId,
      direction: item.direction,
      source: 'retry' as const,
    }]
    : session.items

  return {
    ...session,
    items,
    answer: { selected: selectedWordId, correct },
    correctCount: session.correctCount + (correct ? 1 : 0),
    wrongCount: session.wrongCount + (correct ? 0 : 1),
    reviewWordIds: shouldRetry ? [...session.reviewWordIds, item.wordId] : session.reviewWordIds,
  }
}

export function advanceWordSession(
  session: WordSession,
  now: number = Date.now(),
  random: () => number = Math.random,
): WordSession {
  if (!session.answer || session.completed) return session
  const nextIndex = session.index + 1
  if (nextIndex >= session.items.length) return { ...session, completed: true, completedAt: now }
  const next = session.items[nextIndex]
  return {
    ...session,
    index: nextIndex,
    options: createWordOptions(next.wordId, next.direction, random),
    optionsVisibleAt: now + OPTIONS_DELAY_MS,
    answer: null,
  }
}

export function wordPrompt(word: Word, direction: WordDirection): string {
  return direction === 'meaning-to-japanese' ? word.meaningKo : word.japanese
}

export function wordRecallGuide(direction: WordDirection): string {
  return direction === 'meaning-to-japanese'
    ? '일본어를 머릿속으로 떠올려보세요'
    : '뜻을 머릿속으로 떠올려보세요'
}
