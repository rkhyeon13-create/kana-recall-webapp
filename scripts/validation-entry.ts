import assert from 'node:assert/strict'
import { Rating, State } from 'ts-fsrs'
import type { Card } from 'ts-fsrs'
import { KANA, KANA_BY_CHARACTER } from '../src/data/kana'
import {
  createFsrsRecord,
  deserializeCard,
  FSRS_PACKAGE_VERSION,
  getFsrsCardKey,
  localDateKey,
  ratingForAnswer,
  serializeCard,
} from '../src/lib/fsrs'
import {
  advanceSession,
  answerSession,
  canOfferFreePractice,
  createFreePracticeSession,
  createOptions,
  createScheduledSession,
  createTriggerPracticeSession,
  DEFAULT_SETTINGS,
  getCompletionStatus,
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
  loadSession,
  migrateSessionV1,
  PROGRESS_KEY,
  saveFsrsCards,
  saveSession,
  SESSION_V1_KEY,
  SESSION_V2_KEY,
  updateProgress,
} from '../src/lib/storage'
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
assert.equal(KANA.length, 92, '전체 가나는 92자여야 합니다.')
assert.equal(KANA.filter((kana) => kana.kind === 'hiragana').length, 46)
assert.equal(KANA.filter((kana) => kana.kind === 'katakana').length, 46)
assert.equal(new Set(KANA.map((kana) => kana.character)).size, 92)
for (const kana of KANA) assert.ok(kana.character && kana.sound && kana.trigger && kana.description && kana.kind)

for (const kana of KANA) {
  const observedPositions = new Set<number>()
  for (let run = 0; run < 40; run += 1) {
    const options = createOptions(kana.character)
    assert.equal(options.length, 4)
    assert.equal(new Set(options).size, 4)
    assert.equal(options.filter((option) => option === kana.character).length, 1)
    assert.ok(options.every((option) => KANA_BY_CHARACTER.get(option)?.kind === kana.kind))
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

const dueCompletion = getCompletionStatus({ [getFsrsCardKey('あ')]: record('あ', now - 1) }, 'mixed', now)
assert.equal(dueCompletion.dueRemaining, 1)
assert.equal(dueCompletion.canFreePractice, false)
assert.equal(canOfferFreePractice({ ...scheduled, completed: true, completedAt: now }, dueCompletion), false)
const futureCompletion = getCompletionStatus({
  [getFsrsCardKey('あ')]: record('あ', now + 3_600_000),
  [getFsrsCardKey('い')]: record('い', now + 3_700_000),
}, 'mixed', now)
assert.equal(futureCompletion.dueRemaining, 0)
assert.equal(futureCompletion.nextDueCount, 2)
assert.equal(canOfferFreePractice({ ...scheduled, completed: true, completedAt: now }, futureCompletion), true)
assert.equal(canOfferFreePractice(scheduled, futureCompletion), false, '완료 화면이 아니면 자유 연습을 노출하면 안 됩니다.')

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
assert.equal(stableOrder.characters.length, 92)
assert.deepEqual(loadOrCreateFirstCheckOrder(() => 0.1), stableOrder)
assert.ok(memory.has(FIRST_CHECK_ORDER_KEY))

const beforeMidnight = new Date(2026, 8, 14, 23, 59).getTime()
const afterMidnight = new Date(2026, 8, 15, 0, 1).getTime()
assert.notEqual(localDateKey(beforeMidnight), localDateKey(afterMidnight), '기기 현지 날짜 경계를 구분해야 합니다.')

memory.clear()
memory.set(SESSION_V2_KEY, '{broken')
memory.set(FSRS_KEY, JSON.stringify({ broken: { card: 'bad' } }))
memory.set(FIRST_CHECK_ORDER_KEY, JSON.stringify({ version: 1, characters: ['あ'] }))
assert.equal(loadSession(), null)
assert.deepEqual(loadFsrsCards(), {})
assert.equal(loadOrCreateFirstCheckOrder(() => 0.5).characters.length, 92)

memory.clear()
updateProgress('あ', true)
const progress = JSON.parse(memory.get(PROGRESS_KEY)!)
assert.equal(progress.あ.shown, 1)
assert.equal(progress.あ.correct, 1)

console.log([
  '검증 통과: 92자 데이터와 선택지 규칙',
  'due 우선/오래 지난 순서/범위/최대 10문제',
  '첫 확인 순환 순서',
  'Sound 전용 FSRS와 Again/Good',
  '최초 응답 1회/오답 재도전 1회',
  'Trigger·자유 연습·재도전 제외 정책',
  '완료 화면 자유 연습 조건',
  'Date 직렬화/현지 날짜 경계',
  'v1→v2 마이그레이션/손상 데이터 복구',
].join('\n'))
