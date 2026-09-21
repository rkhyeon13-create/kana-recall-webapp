import assert from 'node:assert/strict'
import { Rating, State } from 'ts-fsrs'
import type { Card } from 'ts-fsrs'
import { BASIC_KANA, KANA, KANA_BY_CHARACTER } from '../src/data/kana'
import { WORDS, WORD_BY_ID, WORD_CATEGORIES } from '../src/data/words'
import {
  createFsrsRecord,
  deserializeCard,
  FSRS_PACKAGE_VERSION,
  getFsrsCardKey,
  localDateKey,
  promoteCharactersToFsrs,
  ratingForAnswer,
  serializeCard,
} from '../src/lib/fsrs'
import {
  advanceSession,
  answerSession,
  canOfferFreePractice,
  canPromoteFreePracticeErrors,
  createFreePracticeSession,
  createOptions,
  createScheduledSession,
  createTriggerPracticeSession,
  DEFAULT_SETTINGS,
  getCompletionStatus,
  getHomeAction,
  getHomeStats,
  MAX_SESSION_SIZE,
  OPTIONS_DELAY_MS,
  shouldRecordFsrs,
  shouldRecordLongTermProgress,
} from '../src/lib/quiz'
import {
  FIRST_CHECK_ORDER_KEY,
  FSRS_KEY,
  loadFsrsCards,
  loadOrCreateFirstCheckOrder,
  loadProgress,
  loadSession,
  migrateSessionV1,
  PROGRESS_KEY,
  saveFsrsCards,
  saveSession,
  SESSION_V1_KEY,
  SESSION_V2_KEY,
  updateProgress,
} from '../src/lib/storage'
import {
  advanceWordSession,
  answerWordSession,
  comparableWordAnswer,
  createWordOptions,
  createWordSession,
  directionForMode,
  getWordsForRange,
  WORD_SESSION_SIZE,
  wordAnswerText,
} from '../src/lib/wordQuiz'
import {
  loadWordProgress,
  loadWordSession,
  recordWordProgress,
  saveWordProgress,
  saveWordSession,
  WORD_PROGRESS_KEY,
  WORD_SESSION_KEY,
} from '../src/lib/wordStorage'
import type {
  FirstCheckOrder,
  FsrsCardMap,
  FsrsCardRecord,
  LegacySessionV1,
  SerializedFsrsCard,
  Settings,
} from '../src/types'

const memory = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => { memory.delete(key) },
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
}

function serializedCard(due: number, state: State = State.Review): SerializedFsrsCard {
  return {
    due,
    stability: 2,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 2,
    learning_steps: 0,
    reps: 2,
    lapses: 0,
    state,
    last_review: due - 86_400_000,
  }
}

function record(character: string, due: number): FsrsCardRecord {
  return { key: getFsrsCardKey(character), character, promptMode: 'sound', card: serializedCard(due) }
}

function orderWith(first: string[]): FirstCheckOrder {
  const remaining = KANA.map((kana) => kana.character).filter((character) => !first.includes(character))
  return { version: 1, characters: [...first, ...remaining] }
}

const soundSettings: Settings = { ...DEFAULT_SETTINGS, promptMode: 'sound' }
const triggerSettings: Settings = { ...DEFAULT_SETTINGS, promptMode: 'trigger' }
const now = new Date(2026, 8, 14, 12, 0, 0).getTime()

assert.equal(FSRS_PACKAGE_VERSION, '5.4.2')
assert.equal(BASIC_KANA.length, 92, '기본 가나는 92자여야 합니다.')
assert.equal(KANA.length, 208, '기본·탁음·반탁음·요음을 합쳐 208개여야 합니다.')
assert.equal(KANA.filter((kana) => kana.course === 'basic' && kana.kind === 'hiragana').length, 46)
assert.equal(KANA.filter((kana) => kana.course === 'basic' && kana.kind === 'katakana').length, 46)
assert.equal(KANA.filter((kana) => kana.course === 'voiced' && kana.kind === 'hiragana').length, 25)
assert.equal(KANA.filter((kana) => kana.course === 'voiced' && kana.kind === 'katakana').length, 25)
assert.equal(KANA.filter((kana) => kana.course === 'yoon' && kana.kind === 'hiragana').length, 33)
assert.equal(KANA.filter((kana) => kana.course === 'yoon' && kana.kind === 'katakana').length, 33)
assert.equal(new Set(KANA.map((kana) => kana.character)).size, 208)
for (const kana of KANA) {
  assert.ok(kana.character && kana.sound && kana.description && kana.kind && kana.course)
  if (kana.course === 'basic') assert.ok(kana.trigger)
  else assert.ok(kana.composition && !kana.trigger)
}

for (const kana of KANA) {
  const observedPositions = new Set<number>()
  for (let run = 0; run < 40; run += 1) {
    const options = createOptions(kana.character)
    assert.equal(options.length, 4)
    assert.equal(new Set(options).size, 4)
    assert.equal(options.filter((option) => option === kana.character).length, 1)
    assert.ok(options.every((option) => KANA_BY_CHARACTER.get(option)?.kind === kana.kind))
    assert.ok(options.every((option) => KANA_BY_CHARACTER.get(option)?.course === kana.course))
    observedPositions.add(options.indexOf(kana.character))
  }
  assert.ok(observedPositions.size > 1, `${kana.character} 정답 위치가 섞이지 않았습니다.`)
}
assert.ok(createOptions('シ', () => 0).includes('ツ'), '형태가 비슷한 가타카나를 우선 오답으로 사용해야 합니다.')
assert.ok(createOptions('ぬ', () => 0).includes('め'), '형태가 비슷한 히라가나를 우선 오답으로 사용해야 합니다.')

const dueCards: FsrsCardMap = {
  [getFsrsCardKey('い')]: record('い', now - 1_000),
  [getFsrsCardKey('あ')]: record('あ', now - 10_000),
  [getFsrsCardKey('ア')]: record('ア', now - 20_000),
}
const dueOrder = orderWith(['う', 'え', 'お'])
const hiraSession = createScheduledSession({ ...soundSettings, range: 'hiragana' }, dueCards, dueOrder, now, () => 0.5)
assert.deepEqual(hiraSession.items.slice(0, 2).map((item) => item.character), ['あ', 'い'])
assert.deepEqual(hiraSession.items.slice(0, 2).map((item) => item.source), ['due', 'due'])
assert.ok(hiraSession.items.every((item) => KANA_BY_CHARACTER.get(item.character)?.kind === 'hiragana'))
assert.equal(hiraSession.settings.promptMode, 'sound')
assert.equal(hiraSession.items.length, MAX_SESSION_SIZE)
assert.equal(hiraSession.optionsVisibleAt - now, OPTIONS_DELAY_MS)
assert.equal(new Set(hiraSession.items.map((item) => item.character)).size, hiraSession.items.length)

const kataSession = createScheduledSession({ ...soundSettings, range: 'katakana' }, dueCards, dueOrder, now, () => 0.5)
assert.equal(kataSession.items[0].character, 'ア')
assert.ok(kataSession.items.every((item) => KANA_BY_CHARACTER.get(item.character)?.kind === 'katakana'))
const mixedSession = createScheduledSession(soundSettings, dueCards, dueOrder, now, () => 0.5)
assert.deepEqual(mixedSession.items.slice(0, 3).map((item) => item.character), ['ア', 'あ', 'い'])
const cappedSession = createScheduledSession({ ...soundSettings, sessionSize: 50 }, {}, dueOrder, now, () => 0.5)
assert.equal(cappedSession.items.length, MAX_SESSION_SIZE)

const voicedSession = createScheduledSession(
  { ...soundSettings, course: 'voiced' },
  {},
  dueOrder,
  now,
  () => 0.5,
)
assert.equal(voicedSession.items.length, MAX_SESSION_SIZE)
assert.ok(voicedSession.items.every((item) => KANA_BY_CHARACTER.get(item.character)?.course === 'voiced'))
assert.ok(voicedSession.options.every((character) => KANA_BY_CHARACTER.get(character)?.course === 'voiced'))
const yoonSession = createScheduledSession(
  { ...soundSettings, course: 'yoon', range: 'katakana' },
  {},
  dueOrder,
  now,
  () => 0.5,
)
assert.ok(yoonSession.items.every((item) => {
  const kana = KANA_BY_CHARACTER.get(item.character)
  return kana?.course === 'yoon' && kana.kind === 'katakana'
}))

const firstOrder = orderWith(KANA.slice(0, 20).map((kana) => kana.character))
const firstSession = createScheduledSession(soundSettings, {}, firstOrder, now, () => 0.5)
const learnedCards = Object.fromEntries(firstSession.items.map((item) => [
  getFsrsCardKey(item.character),
  record(item.character, now + 86_400_000),
]))
const secondSession = createScheduledSession(soundSettings, learnedCards, firstOrder, now, () => 0.5)
assert.equal(firstSession.items.length, 10)
assert.equal(secondSession.items.length, 10)
assert.equal(firstSession.items.some((item) => secondSession.items.some((next) => next.character === item.character)), false)
assert.deepEqual(
  [...firstSession.items, ...secondSession.items].map((item) => item.character),
  firstOrder.characters.slice(0, 20),
  '첫 확인 순서는 전체 순환 전까지 유지되어야 합니다.',
)

assert.equal(ratingForAnswer(false), Rating.Again)
assert.equal(ratingForAnswer(true), Rating.Good)
const correctRecord = createFsrsRecord('あ', true, new Date(now))
const wrongRecord = createFsrsRecord('い', false, new Date(now))
assert.equal(correctRecord.promptMode, 'sound')
assert.equal(wrongRecord.promptMode, 'sound')
assert.equal(correctRecord.card.reps, 1)
assert.equal(wrongRecord.card.reps, 1)
const hydratedCard = deserializeCard(correctRecord.card)
assert.equal((hydratedCard.due as Date).getTime(), correctRecord.card.due)
assert.deepEqual(serializeCard(hydratedCard as Card), correctRecord.card)

const scheduled = createScheduledSession(soundSettings, {}, firstOrder, now, () => 0.5)
assert.equal(shouldRecordFsrs(scheduled), true)
const correctChoice = scheduled.items[0].character
const afterFirstAnswer = answerSession(scheduled, correctChoice, true)
assert.equal(afterFirstAnswer.items[0].fsrsRecorded, true)
assert.equal(shouldRecordFsrs(afterFirstAnswer, afterFirstAnswer.items[0]), false)

const wrongChoice = scheduled.options.find((option) => option !== correctChoice)!
const afterWrong = answerSession(scheduled, wrongChoice, true)
assert.equal(afterWrong.items.length, scheduled.items.length + 1)
assert.equal(afterWrong.items.at(-1)?.source, 'retry')
assert.equal(afterWrong.items.at(-1)?.fsrsRecorded, true)
assert.deepEqual(afterWrong.reviewCharacters, [correctChoice])
assert.equal(shouldRecordFsrs(afterWrong, afterWrong.items.at(-1)), false)
assert.equal(shouldRecordLongTermProgress(afterWrong, afterWrong.items.at(-1)), false)
const retryState = { ...afterWrong, index: afterWrong.items.length - 1, answer: null, completed: false, completedAt: null }
const afterRetryWrong = answerSession(retryState, wrongChoice)
assert.equal(afterRetryWrong.items.length, afterWrong.items.length, '재도전 오답은 다시 추가하면 안 됩니다.')

const afterNext = advanceSession(afterWrong, now + 10_000, () => 0.5)
assert.equal(afterNext.index, 1)
assert.equal(afterNext.answer, null)
assert.ok(afterNext.options.includes(afterNext.items[afterNext.index].character))

const triggerSession = createTriggerPracticeSession(triggerSettings, now, () => 0.5)
assert.equal(triggerSession.mode, 'trigger-practice')
assert.equal(shouldRecordFsrs(triggerSession), false)
assert.equal(shouldRecordLongTermProgress(triggerSession), true)
const freeSession = createFreePracticeSession(soundSettings, now, () => 0.5)
assert.equal(freeSession.mode, 'free-practice')
assert.equal(new Set(freeSession.items.map((item) => item.character)).size, 10)
assert.equal(shouldRecordFsrs(freeSession), false)
assert.equal(shouldRecordLongTermProgress(freeSession), false)
const completedFreeSession = {
  ...freeSession,
  completed: true,
  completedAt: now,
  reviewCharacters: ['あ', 'い'],
}
assert.equal(canPromoteFreePracticeErrors(completedFreeSession), true)
const promotedCards = promoteCharactersToFsrs({}, ['あ', 'い', 'あ'], new Date(now))
assert.deepEqual(Object.keys(promotedCards).sort(), ['あ:sound', 'い:sound'])
assert.ok(Object.values(promotedCards).every((item) => item.card.reps === 1 && item.promptMode === 'sound'))
assert.equal(canPromoteFreePracticeErrors({ ...completedFreeSession, freePracticePromotedAt: now }), false)
assert.equal(canPromoteFreePracticeErrors({ ...completedFreeSession, mode: 'scheduled' }), false)

const dueCompletion = getCompletionStatus({ [getFsrsCardKey('あ')]: record('あ', now - 1) }, 'mixed', 'basic', now)
assert.equal(dueCompletion.dueRemaining, 1)
assert.equal(dueCompletion.canFreePractice, false)
assert.equal(canOfferFreePractice({ ...scheduled, completed: true, completedAt: now }, dueCompletion), false)
const futureCompletion = getCompletionStatus({
  [getFsrsCardKey('あ')]: record('あ', now + 3_600_000),
  [getFsrsCardKey('い')]: record('い', now + 3_700_000),
}, 'mixed', 'basic', now)
assert.equal(futureCompletion.dueRemaining, 0)
assert.equal(futureCompletion.nextDueCount, 2)
assert.equal(canOfferFreePractice({ ...scheduled, completed: true, completedAt: now }, futureCompletion), true)
assert.equal(canOfferFreePractice(scheduled, futureCompletion), false, '완료 화면이 아니면 자유 연습을 노출하면 안 됩니다.')

const homeStats = getHomeStats(
  {
    [getFsrsCardKey('あ')]: record('あ', now - 1),
    [getFsrsCardKey('い')]: record('い', now + 1_000),
  },
  {
    あ: { shown: 3, correct: 2, wrong: 1, lastStudiedAt: 'saved' },
    い: { shown: 1, correct: 1, wrong: 0, lastStudiedAt: 'saved' },
  },
  'hiragana',
  'basic',
  now,
)
assert.equal(homeStats.due, 1)
assert.equal(homeStats.checked, 2)
assert.equal(homeStats.firstCheckRemaining, 44)
assert.equal(homeStats.attempts, 4)
assert.equal(homeStats.accuracy, 75)
assert.equal(getHomeAction(scheduled, homeStats), 'start')
assert.equal(getHomeAction({ ...scheduled, startedAt: now }, homeStats), 'resume')
assert.equal(getHomeAction({ ...scheduled, completed: true, completedAt: now }, homeStats), 'continue')
assert.equal(getHomeAction(
  { ...scheduled, completed: true, completedAt: now },
  { ...homeStats, due: 0, firstCheckRemaining: 0 },
), 'free-practice')

memory.clear()
saveFsrsCards({ [correctRecord.key]: correctRecord })
assert.deepEqual(loadFsrsCards(), { [correctRecord.key]: correctRecord })
const invalidTriggerRecord = { ...correctRecord, key: 'あ:trigger', promptMode: 'trigger' }
memory.set(FSRS_KEY, JSON.stringify({ [correctRecord.key]: correctRecord, 'あ:trigger': invalidTriggerRecord }))
assert.deepEqual(Object.keys(loadFsrsCards()), [correctRecord.key], 'Sound 카드만 FSRS 저장소에서 복원해야 합니다.')

memory.clear()
saveSession(afterNext)
assert.deepEqual(loadSession(), afterNext, 'v2 세션은 새로고침 후 동일하게 복원되어야 합니다.')
assert.ok(memory.has(SESSION_V2_KEY))
const {
  freePracticePromotedAt: _oldMissingPromotionField,
  startedAt: _oldMissingStartedAtField,
  ...oldV2Session
} = afterNext
memory.set(SESSION_V2_KEY, JSON.stringify(oldV2Session))
assert.equal(loadSession()?.freePracticePromotedAt, null, '이전 v2 세션의 새 필드는 안전하게 기본값으로 보완해야 합니다.')
assert.equal(typeof loadSession()?.startedAt, 'number', '진행 중인 이전 v2 세션은 시작 시각을 안전하게 보완해야 합니다.')

const legacy: LegacySessionV1 = {
  version: 1,
  id: 'legacy',
  settings: triggerSettings,
  queue: ['あ', 'い', 'あ'],
  initialCharacters: ['あ', 'い'],
  index: 1,
  options: createOptions('い', () => 0.5),
  optionsVisibleAt: now,
  answer: null,
  correctCount: 1,
  wrongCount: 1,
  reviewCharacters: ['あ'],
  completed: false,
}
const migrated = migrateSessionV1(legacy)
assert.equal(migrated.version, 2)
assert.equal(migrated.mode, 'legacy-practice')
assert.deepEqual(migrated.items.map((item) => item.character), legacy.queue)
assert.ok(migrated.items.every((item) => item.fsrsRecorded))
memory.clear()
memory.set(PROGRESS_KEY, JSON.stringify({ あ: { shown: 3, correct: 2, wrong: 1, lastStudiedAt: 'saved' } }))
memory.set(SESSION_V1_KEY, JSON.stringify(legacy))
assert.deepEqual(loadSession(), migrated)
assert.equal(JSON.parse(memory.get(PROGRESS_KEY)!).あ.shown, 3, '마이그레이션 중 기존 통계를 보존해야 합니다.')
assert.ok(memory.has(SESSION_V1_KEY), '마이그레이션 실패 복구를 위해 기존 세션 키를 삭제하지 않습니다.')
assert.ok(memory.has(SESSION_V2_KEY))

memory.clear()
const stableOrder = loadOrCreateFirstCheckOrder(() => 0.5)
assert.equal(stableOrder.characters.length, KANA.length)
assert.deepEqual(loadOrCreateFirstCheckOrder(() => 0.1), stableOrder)
assert.ok(memory.has(FIRST_CHECK_ORDER_KEY))

memory.clear()
const legacyBasicOrder: FirstCheckOrder = { version: 1, characters: BASIC_KANA.map((kana) => kana.character) }
memory.set(FIRST_CHECK_ORDER_KEY, JSON.stringify(legacyBasicOrder))
const expandedOrder = loadOrCreateFirstCheckOrder(() => 0.5)
assert.equal(expandedOrder.characters.length, KANA.length)
assert.deepEqual(expandedOrder.characters.slice(0, BASIC_KANA.length), legacyBasicOrder.characters)

const beforeMidnight = new Date(2026, 8, 14, 23, 59).getTime()
const afterMidnight = new Date(2026, 8, 15, 0, 1).getTime()
assert.notEqual(localDateKey(beforeMidnight), localDateKey(afterMidnight), '기기 현지 날짜 경계를 구분해야 합니다.')

memory.clear()
memory.set(SESSION_V2_KEY, '{broken')
memory.set(FSRS_KEY, JSON.stringify({ broken: { card: 'bad' } }))
memory.set(FIRST_CHECK_ORDER_KEY, JSON.stringify({ version: 1, characters: ['あ'] }))
assert.equal(loadSession(), null)
assert.deepEqual(loadFsrsCards(), {})
assert.equal(loadOrCreateFirstCheckOrder(() => 0.5).characters.length, KANA.length)

memory.clear()
updateProgress('あ', true)
const progress = JSON.parse(memory.get(PROGRESS_KEY)!)
assert.equal(progress.あ.shown, 1)
assert.equal(progress.あ.correct, 1)
assert.deepEqual(loadProgress(), progress)
memory.set(PROGRESS_KEY, '{broken')
assert.deepEqual(loadProgress(), {})

assert.equal(WORDS.length, 130, 'PDF의 학습 항목은 정확히 130개여야 합니다.')
assert.equal(new Set(WORDS.map((word) => word.id)).size, 130)
assert.deepEqual(
  WORDS.map((word) => word.id),
  Array.from({ length: 130 }, (_, index) => `word-${String(index + 1).padStart(3, '0')}`),
  '단어 ID는 001부터 130까지 빠짐없이 이어져야 합니다.',
)
for (const word of WORDS) {
  assert.ok(word.japanese && word.readingKo && word.meaningKo && word.category)
  assert.ok(WORD_CATEGORIES.includes(word.category))
}
assert.deepEqual(
  Object.fromEntries(WORD_CATEGORIES.map((category) => [category, getWordsForRange(category).length])),
  {
    '인사 및 기본 표현': 12,
    '사람 및 가족': 16,
    '숫자 및 시간': 18,
    '장소': 14,
    '주문 및 음식': 16,
    '쇼핑 및 형용사': 18,
    '수속 및 길 묻기': 16,
    '동사': 20,
  },
)
assert.equal(WORDS.filter((word) => word.japanese === 'これ / それ / あれ').length, 1)
assert.equal(WORDS.filter((word) => word.japanese === '一つ / 二つ / 三つ').length, 1)
assert.equal(WORDS.filter((word) => word.japanese === '右 / 左').length, 1)
assert.deepEqual(WORDS.slice(117, 120).map((word) => word.japanese), ['見る', '観る', '診る'])

for (const word of WORDS) {
  for (const direction of ['meaning-to-japanese', 'japanese-to-meaning'] as const) {
    const options = createWordOptions(word.id, direction, () => 0.37)
    assert.equal(options.length, 4)
    assert.equal(new Set(options).size, 4)
    assert.equal(options.filter((id) => id === word.id).length, 1)
    const answerKeys = options.map((id) => comparableWordAnswer(WORD_BY_ID.get(id)!, direction))
    assert.equal(new Set(answerKeys).size, 4, `${word.id}에 사실상 같은 답이 중복됐습니다.`)
    assert.equal(options.filter((id) => WORD_BY_ID.get(id)?.category === word.category).length, 4)
  }
}

assert.equal(directionForMode('meaning-to-japanese'), 'meaning-to-japanese')
assert.equal(directionForMode('japanese-to-meaning'), 'japanese-to-meaning')
assert.equal(directionForMode('mixed', () => 0.1), 'meaning-to-japanese')
assert.equal(directionForMode('mixed', () => 0.9), 'japanese-to-meaning')
assert.equal(wordAnswerText(WORDS[0], 'meaning-to-japanese'), WORDS[0].japanese)
assert.equal(wordAnswerText(WORDS[0], 'japanese-to-meaning'), WORDS[0].meaningKo)

const wordSession = createWordSession('all', 'meaning-to-japanese', now, () => 0.37)
assert.equal(wordSession.items.length, WORD_SESSION_SIZE)
assert.equal(new Set(wordSession.items.map((item) => item.wordId)).size, WORD_SESSION_SIZE)
assert.ok(wordSession.items.every((item) => item.direction === 'meaning-to-japanese'))
assert.equal(wordSession.optionsVisibleAt - now, OPTIONS_DELAY_MS)
assert.equal(wordSession.options.filter((id) => id === wordSession.items[0].wordId).length, 1)

const categorySession = createWordSession('장소', 'japanese-to-meaning', now, () => 0.61)
assert.ok(categorySession.items.every((item) => WORD_BY_ID.get(item.wordId)?.category === '장소'))
assert.ok(categorySession.items.every((item) => item.direction === 'japanese-to-meaning'))

const wordCorrectId = wordSession.items[0].wordId
const wordWrongId = wordSession.options.find((id) => id !== wordCorrectId)!
const afterWordWrong = answerWordSession(wordSession, wordWrongId)
assert.equal(afterWordWrong.items.length, WORD_SESSION_SIZE + 1)
assert.equal(afterWordWrong.items.at(-1)?.source, 'retry')
assert.deepEqual(afterWordWrong.reviewWordIds, [wordCorrectId])
const wordRetry = { ...afterWordWrong, index: afterWordWrong.items.length - 1, answer: null, completed: false, completedAt: null }
const afterWordRetryWrong = answerWordSession(wordRetry, wordWrongId)
assert.equal(afterWordRetryWrong.items.length, afterWordWrong.items.length, '단어 재도전은 한 번만 추가해야 합니다.')
const advancedWordSession = advanceWordSession(afterWordWrong, now + 10_000, () => 0.42)
assert.equal(advancedWordSession.index, 1)
assert.equal(advancedWordSession.answer, null)

memory.clear()
saveWordSession(afterWordWrong)
assert.deepEqual(loadWordSession(), afterWordWrong, '단어 세션은 새로고침 후 복원되어야 합니다.')
assert.ok(memory.has(WORD_SESSION_KEY))
const wordProgress = recordWordProgress({}, wordCorrectId, false, new Date(now))
saveWordProgress(wordProgress)
assert.deepEqual(loadWordProgress(), wordProgress)
assert.ok(memory.has(WORD_PROGRESS_KEY))
assert.notEqual(WORD_PROGRESS_KEY, PROGRESS_KEY)
assert.notEqual(WORD_SESSION_KEY, SESSION_V2_KEY)
memory.set(WORD_SESSION_KEY, '{broken')
memory.set(WORD_PROGRESS_KEY, JSON.stringify({ [wordCorrectId]: { shown: Number.NaN, correct: 0, wrong: 0, lastStudiedAt: 'bad' } }))
assert.equal(loadWordSession(), null)
assert.deepEqual(loadWordProgress(), {})

console.log([
  '검증 통과: 기본 92자와 확장 가나 116개 데이터/선택지 규칙',
  'due 우선/오래 지난 순서/범위/최대 10문제',
  '첫 확인 순환 순서',
  '기존 92자 첫 확인 순서 보존 및 확장',
  'Sound 전용 FSRS와 Again/Good',
  '최초 응답 1회/오답 재도전 1회',
  'Trigger·자유 연습·재도전 제외 정책',
  '완료 화면 자유 연습 조건',
  '자유 연습 오답의 선택적 FSRS 등록',
  '홈 학습 통계 계산',
  'Date 직렬화/현지 날짜 경계',
  'v1→v2 마이그레이션/손상 데이터 복구',
  '130개 단어 데이터/카테고리/묶음 항목 검증',
  '단어 양방향 선택지/같은 답 중복 방지',
  '단어 10문제 세션/오답 재도전/별도 저장/복원',
].join('\n'))
