import { useEffect, useState } from 'react'
import { SettingDropdown } from './SettingDropdown'
import { WORD_BY_ID, WORD_CATEGORIES } from './data/words'
import {
  advanceWordSession,
  answerWordSession,
  createWordSession,
  wordAnswerText,
  wordPrompt,
  wordRecallGuide,
} from './lib/wordQuiz'
import {
  loadWordProgress,
  loadWordSession,
  recordWordProgress,
  saveWordProgress,
  saveWordSession,
} from './lib/wordStorage'
import type { WordPromptMode, WordRange, WordSession } from './types'

const RANGE_OPTIONS: readonly { value: WordRange; label: string }[] = [
  { value: 'all', label: '전체 130개' },
  ...WORD_CATEGORIES.map((category) => ({ value: category, label: category })),
]

const MODE_OPTIONS: readonly { value: WordPromptMode; label: string }[] = [
  { value: 'meaning-to-japanese', label: '뜻 → 일본어' },
  { value: 'japanese-to-meaning', label: '일본어 → 뜻' },
  { value: 'mixed', label: '랜덤 혼합' },
]

function initializeWordSession(): WordSession {
  return loadWordSession() ?? createWordSession()
}

interface WordModuleProps {
  onBack: () => void
}

export function WordModule({ onBack }: WordModuleProps) {
  const [session, setSession] = useState<WordSession>(initializeWordSession)
  const [progress, setProgress] = useState(loadWordProgress)
  const [openSetting, setOpenSetting] = useState<'range' | 'promptMode' | null>(null)
  const [choicesVisible, setChoicesVisible] = useState(
    () => session.answer !== null || Date.now() >= session.optionsVisibleAt,
  )

  const item = session.items[session.index]
  const word = item ? WORD_BY_ID.get(item.wordId) : undefined

  useEffect(() => saveWordSession(session), [session])

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.setting-picker')) return
      setOpenSetting(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenSetting(null)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (session.completed || session.answer || Date.now() >= session.optionsVisibleAt) {
      setChoicesVisible(true)
      return
    }
    setChoicesVisible(false)
    const timeout = window.setTimeout(() => setChoicesVisible(true), session.optionsVisibleAt - Date.now())
    return () => window.clearTimeout(timeout)
  }, [session.answer, session.completed, session.index, session.optionsVisibleAt])

  const choose = (wordId: string) => {
    if (!choicesVisible || session.answer || session.completed || !item || !word) return
    const correct = wordId === word.id
    const nextProgress = recordWordProgress(progress, word.id, correct)
    setProgress(nextProgress)
    saveWordProgress(nextProgress)
    setSession(answerWordSession(session, wordId))
  }

  const next = () => setSession((current) => advanceWordSession(current))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (session.completed) return
      if (session.answer && event.key === 'Enter') {
        event.preventDefault()
        next()
        return
      }
      const optionIndex = Number(event.key) - 1
      if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < 4) {
        event.preventDefault()
        choose(session.options[optionIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const restart = (range: WordRange = session.range, promptMode: WordPromptMode = session.promptMode) => {
    setOpenSetting(null)
    setSession(createWordSession(range, promptMode))
  }

  const changeRange = (range: WordRange) => restart(range, session.promptMode)
  const changePromptMode = (promptMode: WordPromptMode) => restart(session.range, promptMode)

  if (session.completed) {
    const reviewWords = session.reviewWordIds
      .map((wordId) => WORD_BY_ID.get(wordId)?.japanese)
      .filter((value): value is string => Boolean(value))

    return (
      <main className="app-shell">
        <section className="card summary-card" aria-labelledby="word-summary-title">
          <button className="brand-button" type="button" onClick={onBack}>도전! 일본어</button>
          <p className="eyebrow">단어 학습 완료</p>
          <h1 id="word-summary-title">단어 학습을 마쳤어요</h1>
          <div className="summary-numbers">
            <div><strong>{session.correctCount}</strong><span>정답</span></div>
            <div><strong>{session.wrongCount}</strong><span>오답</span></div>
          </div>
          <div className="review-summary word-review-summary">
            <span>다시 본 단어</span>
            <strong lang="ja">{reviewWords.length ? reviewWords.join(' · ') : '없음'}</strong>
          </div>
          <button className="primary-action" type="button" onClick={() => restart()}>
            같은 범위 다시 학습
          </button>
          <button className="home-return-action" type="button" onClick={onBack}>
            홈으로 돌아가기
          </button>
        </section>
      </main>
    )
  }

  if (!item || !word) return null

  const progressText = `${session.index + 1} / ${session.items.length}`

  return (
    <main className="app-shell">
      <section className="card quiz-card" aria-labelledby="word-app-title">
        <header className="topbar">
          <div>
            <button className="brand-button" type="button" onClick={onBack}>도전! 일본어</button>
            <h1 id="word-app-title" className="sr-only">핵심 일본어 단어 학습</h1>
          </div>
          <span className="progress" aria-label={`진행 ${progressText}`}>{progressText}</span>
        </header>

        <div className="settings word-settings" aria-label="단어 문제 설정">
          <SettingDropdown
            id="word-range-setting"
            label="학습 범위"
            value={session.range}
            options={RANGE_OPTIONS}
            isOpen={openSetting === 'range'}
            onToggle={() => setOpenSetting((current) => current === 'range' ? null : 'range')}
            onChange={changeRange}
          />
          <SettingDropdown
            id="word-prompt-setting"
            label="출제 방식"
            value={session.promptMode}
            options={MODE_OPTIONS}
            isOpen={openSetting === 'promptMode'}
            onToggle={() => setOpenSetting((current) => current === 'promptMode' ? null : 'promptMode')}
            onChange={changePromptMode}
          />
        </div>

        <div className="question word-question" key={`${session.id}-${session.index}`}>
          <p className="question-kind">{word.category} · {item.direction === 'meaning-to-japanese' ? '뜻 → 일본어' : '일본어 → 뜻'}</p>
          <p className="question-meta" lang={item.direction === 'japanese-to-meaning' ? 'ja' : undefined}>
            {wordPrompt(word, item.direction)}
          </p>
          <p className="recall-guide">{wordRecallGuide(item.direction)}</p>
        </div>

        <div className={`choice-area ${choicesVisible ? 'is-visible' : 'is-waiting'}`} aria-live="polite">
          {!choicesVisible ? (
            <div className="quiet-wait" aria-label="선택지를 준비하고 있어요"><span /></div>
          ) : (
            <div className="choices" role="group" aria-label="답 선택지">
              {session.options.map((optionId, index) => {
                const option = WORD_BY_ID.get(optionId)
                if (!option) return null
                const isCorrect = optionId === word.id
                const isSelected = session.answer?.selected === optionId
                const stateClass = session.answer
                  ? isCorrect ? 'correct' : isSelected ? 'wrong' : 'muted'
                  : ''
                const answerText = wordAnswerText(option, item.direction)
                return (
                  <button
                    key={optionId}
                    type="button"
                    className={`choice word-choice ${stateClass}`}
                    disabled={Boolean(session.answer)}
                    onClick={() => choose(optionId)}
                    aria-label={`${index + 1}번, ${answerText}`}
                  >
                    <span lang={item.direction === 'meaning-to-japanese' ? 'ja' : undefined}>{answerText}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {session.answer && (
          <div className={`feedback word-feedback ${session.answer.correct ? 'success' : 'error'}`} aria-live="assertive">
            <h2 className="feedback-title">
              <span className="status-badge" aria-hidden="true">{session.answer.correct ? 'O' : 'X'}</span>
              <span>{session.answer.correct ? '맞았어요' : '오답이에요'}</span>
            </h2>
            <dl className="word-answer-details">
              <div><dt>일본어</dt><dd lang="ja">{word.japanese}</dd></div>
              <div><dt>읽는 법</dt><dd>{word.readingKo}</dd></div>
              <div><dt>뜻</dt><dd>{word.meaningKo}</dd></div>
            </dl>
            {word.pronunciationWarning && <p className="pronunciation-warning">발음 주의 · {word.pronunciationWarning}</p>}
            {word.note && <p className="word-note">{word.note}</p>}
            <p className="read-aloud-guide">한 번 소리 내어 읽어보세요.</p>
            <button className="primary-action" type="button" onClick={next} autoFocus>
              다음 단어 <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
