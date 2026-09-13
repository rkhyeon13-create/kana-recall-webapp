import { useEffect, useMemo, useState } from 'react'
import { KANA_BY_CHARACTER, KIND_LABEL } from './data/kana'
import { advanceSession, answerSession, createSession, DEFAULT_SETTINGS } from './lib/quiz'
import { loadSession, saveSession, updateProgress } from './lib/storage'
import type { PromptMode, KanaRange, Session, Settings } from './types'

const RANGE_OPTIONS: { value: KanaRange; label: string }[] = [
  { value: 'hiragana', label: '히라가나 46자' },
  { value: 'katakana', label: '가타카나 46자' },
  { value: 'mixed', label: '랜덤 혼합 92자' },
]

const MODE_OPTIONS: { value: PromptMode; label: string }[] = [
  { value: 'trigger', label: '연상 Trigger' },
  { value: 'sound', label: '소리' },
]

function makeSession(settings: Settings = DEFAULT_SETTINGS): Session {
  return createSession({ ...settings })
}

export default function App() {
  const [session, setSession] = useState<Session>(() => loadSession() ?? makeSession())
  const [choicesVisible, setChoicesVisible] = useState(() => session.answer !== null || Date.now() >= session.optionsVisibleAt)

  const currentKana = useMemo(
    () => KANA_BY_CHARACTER.get(session.queue[session.index])!,
    [session.index, session.queue],
  )

  useEffect(() => saveSession(session), [session])

  useEffect(() => {
    if (session.completed || session.answer || Date.now() >= session.optionsVisibleAt) {
      setChoicesVisible(true)
      return
    }
    setChoicesVisible(false)
    const timeout = window.setTimeout(() => setChoicesVisible(true), session.optionsVisibleAt - Date.now())
    return () => window.clearTimeout(timeout)
  }, [session.answer, session.completed, session.index, session.optionsVisibleAt])

  const choose = (character: string) => {
    if (!choicesVisible || session.answer || session.completed) return
    const correct = character === currentKana.character
    updateProgress(currentKana.character, correct)
    setSession((current) => answerSession(current, character))
  }

  const next = () => setSession((current) => advanceSession(current))

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

  const restart = (settings: Settings = session.settings) => setSession(makeSession(settings))

  const changeSetting = (key: 'range' | 'promptMode', value: KanaRange | PromptMode) => {
    restart({ ...session.settings, [key]: value })
  }

  if (session.completed) {
    return (
      <main className="app-shell">
        <section className="card summary-card" aria-labelledby="summary-title">
          <p className="eyebrow">학습 완료</p>
          <h1 id="summary-title">이번 세션을 마쳤어요</h1>
          <div className="summary-numbers">
            <div><strong>{session.correctCount}</strong><span>정답</span></div>
            <div><strong>{session.wrongCount}</strong><span>오답</span></div>
          </div>
          <div className="review-summary">
            <span>다시 복습한 글자</span>
            <strong lang="ja">{session.reviewCharacters.length ? session.reviewCharacters.join(' · ') : '없음'}</strong>
          </div>
          <button className="primary-action" type="button" onClick={() => restart()}>
            새 세션 시작
          </button>
        </section>
      </main>
    )
  }

  const prompt = session.settings.promptMode === 'trigger' ? currentKana.trigger : currentKana.sound
  const progressText = `${session.index + 1} / ${session.queue.length}`

  return (
    <main className="app-shell">
      <section className="card quiz-card" aria-labelledby="app-title">
        <header className="topbar">
          <div>
            <p className="eyebrow">도전! 일본어</p>
            <h1 id="app-title" className="sr-only">일본어 가나 떠올리기 학습</h1>
          </div>
          <span className="progress" aria-label={`진행 ${progressText}`}>{progressText}</span>
        </header>

        <div className="settings" aria-label="문제 설정">
          <label>
            <span>문자 범위</span>
            <select value={session.settings.range} onChange={(event) => changeSetting('range', event.target.value as KanaRange)}>
              {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>출제 방식</span>
            <select value={session.settings.promptMode} onChange={(event) => changeSetting('promptMode', event.target.value as PromptMode)}>
              {MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="question" key={`${session.id}-${session.index}`}>
          <p className="question-kind">{KIND_LABEL[currentKana.kind]} ·</p>
          <p className="question-meta">{prompt}</p>
          <p className="recall-guide">정답 글자를 머릿속으로 떠올려보세요</p>
        </div>

        <div className={`choice-area ${choicesVisible ? 'is-visible' : 'is-waiting'}`} aria-live="polite">
          {!choicesVisible ? (
            <div className="quiet-wait" aria-label="선택지를 준비하고 있어요"><span /></div>
          ) : (
            <div className="choices" role="group" aria-label="답 선택지">
              {session.options.map((character, index) => {
                const isCorrect = character === currentKana.character
                const isSelected = session.answer?.selected === character
                const stateClass = session.answer
                  ? isCorrect ? 'correct' : isSelected ? 'wrong' : 'muted'
                  : ''
                return (
                  <button
                    key={character}
                    type="button"
                    className={`choice ${stateClass}`}
                    disabled={Boolean(session.answer)}
                    onClick={() => choose(character)}
                    aria-label={`${index + 1}번, ${character}`}
                  >
                    <span lang="ja">{character}</span>
                    <kbd>{index + 1}</kbd>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {session.answer && (
          <div className={`feedback ${session.answer.correct ? 'success' : 'error'}`} aria-live="assertive">
            {session.answer.correct ? (
              <>
                <h2>맞았어요</h2>
                <p className="feedback-trigger">{currentKana.trigger}</p>
                <p>{currentKana.description}</p>
              </>
            ) : (
              <>
                <h2>정답은 <span lang="ja">{currentKana.character}</span></h2>
                <p className="feedback-trigger">{currentKana.trigger}</p>
                <p>{currentKana.description}</p>
              </>
            )}
            <button className="primary-action" type="button" onClick={next} autoFocus>
              다음 글자 <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
