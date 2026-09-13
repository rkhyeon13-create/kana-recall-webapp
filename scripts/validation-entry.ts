import assert from 'node:assert/strict'
import { KANA, KANA_BY_CHARACTER } from '../src/data/kana'
import {
  advanceSession,
  answerSession,
  createOptions,
  createSession,
  OPTIONS_DELAY_MS,
} from '../src/lib/quiz'
import { loadSession, saveSession, updateProgress } from '../src/lib/storage'

const memory = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => { memory.delete(key) },
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
}

assert.equal(KANA.length, 92, '전체 가나는 92자여야 합니다.')
assert.equal(KANA.filter((kana) => kana.kind === 'hiragana').length, 46)
assert.equal(KANA.filter((kana) => kana.kind === 'katakana').length, 46)
assert.equal(new Set(KANA.map((kana) => kana.character)).size, 92)
for (const kana of KANA) {
  assert.ok(kana.character && kana.sound && kana.trigger && kana.description && kana.kind)
}

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

const now = 1_000_000
const session = createSession(undefined, now)
assert.equal(session.initialCharacters.length, 10)
assert.equal(new Set(session.initialCharacters).size, 10)
assert.equal(session.optionsVisibleAt - now, OPTIONS_DELAY_MS)

const wrongChoice = session.options.find((option) => option !== session.queue[0])!
const afterWrong = answerSession(session, wrongChoice)
assert.equal(afterWrong.queue.length, 11)
assert.deepEqual(afterWrong.reviewCharacters, [session.queue[0]])
const retryState = { ...afterWrong, index: afterWrong.queue.length - 1, answer: null, completed: false }
const afterRetryWrong = answerSession(retryState, wrongChoice)
assert.equal(afterRetryWrong.queue.length, 11, '재복습 오답은 다시 추가하면 안 됩니다.')

const afterNext = advanceSession(afterWrong, now + 10_000)
assert.equal(afterNext.index, 1)
assert.equal(afterNext.answer, null)
assert.ok(afterNext.options.includes(afterNext.queue[afterNext.index]))

saveSession(afterNext)
assert.deepEqual(loadSession(), afterNext, '저장한 세션이 동일하게 복원되어야 합니다.')
updateProgress(afterNext.queue[afterNext.index], true)
const progress = JSON.parse(memory.get('kana-recall:progress:v1')!)
assert.equal(progress[afterNext.queue[afterNext.index]].shown, 1)
assert.equal(progress[afterNext.queue[afterNext.index]].correct, 1)

console.log('검증 통과: 92자 데이터, 선택지 규칙, 2초 지연, 오답 1회 재출제, 세션/진행 저장 복원')
