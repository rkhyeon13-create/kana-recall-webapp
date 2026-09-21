import { useEffect, useMemo, useState } from 'react'
import { COURSE_LABEL, KANA_BY_CHARACTER, KIND_LABEL } from './data/kana'
import { SettingDropdown } from './SettingDropdown'
import { KanaLearn } from './KanaLearn'
import { BackButton } from './BackButton'
import { WordModule } from './WordModule'
import { createFsrsRecord, getFsrsCardKey, localDateKey, promoteCharactersToFsrs } from './lib/fsrs'
import {
  advanceSession,
  answerSession,
  createFreePracticeSession,
  createScheduledSession,
  createTriggerPracticeSession,
  canOfferFreePractice,
  canPromoteFreePracticeErrors,
  DEFAULT_SETTINGS,
  getCompletionStatus,
  getHomeAction,
  getHomeStats,
  shouldRecordFsrs,
  shouldRecordLongTermProgress,
} from './lib/quiz'
import {
  loadFsrsCards,
  loadOrCreateFirstCheckOrder,
  loadProgress,
  loadSession,
  saveFsrsCards,
  saveSession,
  updateProgress,
} from './lib/storage'
import type { FirstCheckOrder, FsrsCardMap, KanaCourse, KanaRange, ProgressMap, PromptMode, Session, Settings } from './types'

const COURSE_OPTIONS: { value: KanaCourse; label: string }[] = [
  { value: 'basic', label: '기본' },
  { value: 'voiced', label: '탁음·반탁음' },
  { value: 'yoon', label: '요음' },
]

const RANGE_OPTIONS: { value: KanaRange; label: string }[] = [
  { value: 'katakana', label: '가타카나' },
  { value: 'hiragana', label: '히라가나' },
  { value: 'mixed', label: '랜덤혼합' },
]

const MODE_OPTIONS: { value: PromptMode; label: string }[] = [
  { value: 'sound', label: '소리' },
  { value: 'trigger', label: '연상' },
]

interface InitialState {
  cards: FsrsCardMap
  firstCheckOrder: FirstCheckOrder
  progress: ProgressMap
  session: Session
}

function newSession(
  settings: Settings,
  cards: FsrsCardMap,
  firstCheckOrder: FirstCheckOrder,
  now = Date.now(),
): Session {
  return settings.promptMode === 'sound' || (settings.course ?? 'basic') !== 'basic'
    ? createScheduledSession(settings, cards, firstCheckOrder, now)
    : createTriggerPracticeSession(settings, now)
}

function initialize(): InitialState {
  const cards = loadFsrsCards()
  const firstCheckOrder = loadOrCreateFirstCheckOrder()
  const progress = loadProgress()
  const stored = loadSession()
  if (!stored) return { cards, firstCheckOrder, progress, session: newSession(DEFAULT_SETTINGS, cards, firstCheckOrder) }

  const isNewLocalDay = stored.completedAt !== null && localDateKey(stored.completedAt) !== localDateKey(Date.now())
  if (stored.completed && isNewLocalDay) {
    return {
      cards,
      firstCheckOrder,
      progress,
      session: createScheduledSession({ ...stored.settings, promptMode: 'sound' }, cards, firstCheckOrder),
    }
  }
  return { cards, firstCheckOrder, progress, session: stored }
}

function formatNextReview(timestamp: number | null, count: number, now = Date.now()): string {
  if (timestamp === null) return '다음 복습: 예정 없음'
  const due = new Date(timestamp)
  const current = new Date(now)
  const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime()
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const dayDifference = Math.round((dueStart - todayStart) / 86_400_000)
  const dateLabel = dayDifference === 0
    ? `오늘 ${due.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`
    : dayDifference === 1
      ? '내일'
      : due.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  return `다음 복습: ${dateLabel} ${count}자`
}

export default function App() {
  const [initial] = useState<InitialState>(initialize)
  const [cards, setCards] = useState<FsrsCardMap>(initial.cards)
  const [progress, setProgress] = useState<ProgressMap>(initial.progress)
  const [session, setSession] = useState<Session>(initial.session)
  const [view, setView] = useState<'home' | 'quiz' | 'learn'>('home')
  const [learnSettings, setLearnSettings] = useState<Settings>(initial.session.settings)
  const [learnCourse, setLearnCourse] = useState<KanaCourse>('basic')
  const [learnRange, setLearnRange] = useState<KanaRange>('mixed')
  const [module, setModule] = useState<'picker' | 'kana-menu' | 'kana' | 'dictation' | 'words'>('picker')
  const [openSetting, setOpenSetting] = useState<'course' | 'range' | 'promptMode' | null>(null)
  const [choicesVisible, setChoicesVisible] = useState(() => session.answer !== null || Date.now() >= session.optionsVisibleAt)

  const currentItem = session.items[session.index]
  const currentKana = currentItem ? KANA_BY_CHARACTER.get(currentItem.character) : undefined
  const completion = useMemo(
    () => getCompletionStatus(cards, session.settings.range, session.settings.course ?? 'basic'),
    [cards, session.settings.range, session.settings.course],
  )
  const homeStats = useMemo(
    () => getHomeStats(cards, progress, 'mixed', session.settings.course ?? 'basic'),
    [cards, progress, session.settings.course],
  )
  const homeAction = getHomeAction(session, homeStats)

  useEffect(() => saveSession(session), [session])

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

  const choose = (character: string) => {
    if (!choicesVisible || session.answer || session.completed || !currentItem || !currentKana) return
    const correct = character === currentKana.character
    const recordWithFsrs = shouldRecordFsrs(session, currentItem)
    let recorded = false

    if (recordWithFsrs) {
      try {
        const key = getFsrsCardKey(currentKana.character)
        const record = createFsrsRecord(currentKana.character, correct, new Date(), cards[key])
        const nextCards = { ...cards, [key]: record }
        setCards(nextCards)
        saveFsrsCards(nextCards)
        recorded = true
      } catch {
        // A scheduler failure must not prevent answer feedback or session progress.
      }
    }

    if (shouldRecordLongTermProgress(session, currentItem)) {
      setProgress(updateProgress(currentKana.character, correct))
    }
    const answeredSession = answerSession(session, character, recorded)
    saveSession(answeredSession)
    setSession(answeredSession)
  }

  const next = () => setSession((current) => advanceSession(current))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view !== 'quiz' || session.completed) return
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

  const restart = (settings: Settings = session.settings) => {
    setSession({ ...newSession(settings, cards, initial.firstCheckOrder), startedAt: Date.now() })
  }

  const changeSetting = (key: 'range' | 'promptMode', value: KanaRange | PromptMode) => {
    setOpenSetting(null)
    restart({ ...session.settings, [key]: value })
  }

  const changeCourse = (course: KanaCourse) => {
    setOpenSetting(null)
    const settings: Settings = {
      ...session.settings,
      course,
      promptMode: course === 'basic' ? session.settings.promptMode : 'sound',
    }
    const nextSession = newSession(settings, cards, initial.firstCheckOrder)
    setSession({ ...nextSession, startedAt: view === 'quiz' ? Date.now() : null })
  }

  const startFreePractice = () => {
    setSession({ ...createFreePracticeSession(session.settings), startedAt: Date.now() })
    setView('quiz')
  }

  const promoteFreePracticeErrors = () => {
    if (!canPromoteFreePracticeErrors(session)) return
    const promotedAt = Date.now()
    const nextCards = promoteCharactersToFsrs(cards, session.reviewCharacters, new Date(promotedAt))
    const nextSession = { ...session, freePracticePromotedAt: promotedAt }
    setCards(nextCards)
    saveFsrsCards(nextCards)
    setSession(nextSession)
    saveSession(nextSession)
  }

  const startFromHome = () => {
    const startedAt = Date.now()
    if (homeAction === 'continue') {
      setSession({
        ...createScheduledSession({ ...session.settings, range: 'mixed', promptMode: 'sound' }, cards, initial.firstCheckOrder),
        startedAt,
      })
    } else if (homeAction === 'free-practice') {
      setSession({
        ...createFreePracticeSession({ ...session.settings, range: 'mixed', promptMode: 'sound' }),
        startedAt,
      })
    } else if (homeAction === 'start') {
      setSession({ ...session, startedAt })
    }
    setView('quiz')
  }

  const startLearning = () => {
    setLearnSettings({ ...session.settings, course: learnCourse, range: learnRange, promptMode: 'sound' })
    setView('learn')
  }

  const startQuizFromLearning = (settings: Settings) => {
    setSession({ ...createScheduledSession(settings, cards, initial.firstCheckOrder), startedAt: Date.now() })
    setModule('kana')
    setView('quiz')
  }

  const returnToKanaMenu = () => {
    setView('home')
    setModule('kana-menu')
  }

  if (module === 'picker') {
    return (
      <main className="app-shell">
        <section className="card module-picker-card" aria-labelledby="module-picker-title">
          <header className="module-picker-header">
            <p className="eyebrow">도전! 일본어</p>
            <h1 id="module-picker-title">무엇을 학습할까요?</h1>
            <p>바로 시작할 학습 모듈을 선택해보세요.</p>
          </header>
          <div className="module-options">
            <button type="button" className="module-option" onClick={() => {
              setView('home')
              setModule('kana-menu')
            }}>
              <span className="module-option-count">히라가나·가타카나</span>
              <strong>가나</strong>
              <span>객관식과 주관식으로 가나 학습</span>
            </button>
            <button type="button" className="module-option" onClick={() => setModule('words')}>
              <span className="module-option-count">130개</span>
              <strong>핵심 단어</strong>
              <span>여행과 일상의 기본 어휘</span>
            </button>
          </div>
          <p className="local-note">학습 기록은 이 기기의 브라우저에만 저장됩니다.</p>
        </section>
      </main>
    )
  }

  if (module === 'kana-menu') {
    return (
      <main className="app-shell">
        <section className="card module-picker-card" aria-labelledby="kana-module-title">
          <header className="module-picker-header">
            <BackButton onClick={() => setModule('picker')} label="홈으로 돌아가기" />
            <h1 id="kana-module-title">가나 학습</h1>
            <p>학습할 방식을 선택해보세요.</p>
          </header>
          <div className="module-options">
            <button type="button" className="module-option" onClick={() => {
              setView('home')
              setModule('kana')
            }}>
              <span className="module-option-count">1단계</span>
              <strong>객관식</strong>
              <span>소리를 떠올리고 보기에서 정답 선택</span>
            </button>
            <button type="button" className="module-option" onClick={() => {
              setView('home')
              setModule('dictation')
            }}>
              <span className="module-option-count">2단계</span>
              <strong>주관식</strong>
              <span>소리를 듣고 화면에 직접 쓰기</span>
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (module === 'words') return <WordModule onBack={() => setModule('picker')} />

  if (module === 'dictation' && view !== 'learn') {
    return (
      <main className="app-shell">
        <section className="card home-card dictation-home" aria-labelledby="dictation-home-title">
          <header className="home-header">
            <BackButton onClick={returnToKanaMenu} />
            <h1 id="dictation-home-title">가나 받아쓰기</h1>
            <p>학습할 과정과 문자 범위를 선택해보세요.</p>
          </header>
          <div className="dictation-settings">
            <SettingDropdown
              id="dictation-course-setting"
              label="학습 과정"
              value={learnCourse}
              options={COURSE_OPTIONS}
              isOpen={openSetting === 'course'}
              onToggle={() => setOpenSetting((current) => current === 'course' ? null : 'course')}
              onChange={(value) => {
                setOpenSetting(null)
                setLearnCourse(value)
              }}
            />
            <SettingDropdown
              id="dictation-range-setting"
              label="문자 범위"
              value={learnRange}
              options={RANGE_OPTIONS}
              isOpen={openSetting === 'range'}
              onToggle={() => setOpenSetting((current) => current === 'range' ? null : 'range')}
              onChange={(value) => {
                setOpenSetting(null)
                setLearnRange(value)
              }}
            />
          </div>
          <button className="primary-action" type="button" onClick={startLearning}>받아쓰기 시작</button>
          <p className="local-note">받아쓰기 결과는 복습 일정과 학습 통계에 반영되지 않습니다.</p>
        </section>
      </main>
    )
  }

  if (view === 'learn') {
    return (
      <KanaLearn
        settings={learnSettings}
        onBack={() => setView('home')}
        onMenu={returnToKanaMenu}
        onStartQuiz={startQuizFromLearning}
      />
    )
  }

  if (view === 'home') {
    const course = session.settings.course ?? 'basic'
    const homeButtonLabel = {
      start: '학습 시작',
      continue: '계속 학습',
      resume: '이어서 학습',
      'free-practice': '자유 연습 시작',
    }[homeAction]
    return (
      <main className="app-shell">
        <section className="card home-card" aria-labelledby="home-title">
          <header className="home-header">
            <BackButton onClick={returnToKanaMenu} />
            <h1 id="home-title">오늘의 {COURSE_LABEL[course]} 학습</h1>
            <p>학습 기록에 따라 복습 시점이 자동으로 조정돼요.</p>
          </header>
          <div className="home-course-setting">
            <SettingDropdown
              id="home-course-setting"
              label="학습 과정"
              value={course}
              options={COURSE_OPTIONS}
              isOpen={openSetting === 'course'}
              onToggle={() => setOpenSetting((current) => current === 'course' ? null : 'course')}
              onChange={changeCourse}
            />
          </div>
          <div className="home-stats" aria-label="학습 통계">
            <div><strong>{homeStats.due}</strong><span>남은 복습</span></div>
            <div><strong>{homeStats.firstCheckRemaining}</strong><span>학습 시작 전</span></div>
            <div><strong>{homeStats.checked}</strong><span>학습 중</span></div>
            <div><strong>{homeStats.accuracy === null ? '—' : `${homeStats.accuracy}%`}</strong><span>누적 정답률</span></div>
          </div>
          <button className="primary-action" type="button" onClick={startFromHome}>
            {homeButtonLabel}
          </button>
          <p className="local-note">학습 기록은 이 기기의 브라우저에만 저장됩니다.</p>
        </section>
      </main>
    )
  }

  if (session.completed) {
    const isScheduled = session.mode === 'scheduled'
    const showsSchedule = isScheduled || session.mode === 'free-practice'
    const hasDueRemaining = showsSchedule && completion.dueRemaining > 0
    const title = hasDueRemaining
      ? `${session.initialItemCount}문제 완료`
      : isScheduled
        ? '오늘 복습을 마쳤어요'
        : session.mode === 'free-practice'
          ? '자유 연습을 마쳤어요'
          : session.mode === 'trigger-practice'
            ? '연상 학습을 마쳤어요'
            : '이번 세션을 마쳤어요'

    return (
      <main className="app-shell">
        <section className="card summary-card" aria-labelledby="summary-title">
          <BackButton onClick={returnToKanaMenu} />
          <p className="eyebrow">학습 완료</p>
          <h1 id="summary-title">{title}</h1>
          {hasDueRemaining && <p className="schedule-note">오늘 복습 {completion.dueRemaining}자 남음</p>}
          {showsSchedule && !hasDueRemaining && (
            <p className="schedule-note">{formatNextReview(completion.nextDueAt, completion.nextDueCount)}</p>
          )}
          <div className="summary-numbers">
            <div><strong>{session.correctCount}</strong><span>정답</span></div>
            <div><strong>{session.wrongCount}</strong><span>오답</span></div>
          </div>
          <div className="review-summary">
            <span>다시 복습한 글자</span>
            <strong lang="ja">{session.reviewCharacters.length ? session.reviewCharacters.join(' · ') : '없음'}</strong>
          </div>

          {session.mode === 'free-practice' && session.reviewCharacters.length > 0 && (
            <div className="promotion-option">
              <p>다시 복습한 글자를 장기 복습 주기에 넣을 수 있어요.</p>
              <button
                className="secondary-action"
                type="button"
                onClick={promoteFreePracticeErrors}
                disabled={!canPromoteFreePracticeErrors(session)}
              >
                {session.freePracticePromotedAt === null
                  ? `${session.reviewCharacters.length}자를 복습 주기에 추가`
                  : '복습 주기에 추가했어요'}
              </button>
            </div>
          )}

          {hasDueRemaining ? (
            <button className="primary-action" type="button" onClick={() => restart({ ...session.settings, promptMode: 'sound' })}>
              계속 복습
            </button>
          ) : canOfferFreePractice(session, completion) ? (
            <button className="secondary-action" type="button" onClick={startFreePractice}>
              자유 연습 시작
            </button>
          ) : session.mode === 'free-practice' ? (
            <button className="secondary-action" type="button" onClick={startFreePractice}>
              자유 연습 다시 시작
            </button>
          ) : (
            <button
              className="primary-action"
              type="button"
              onClick={() => restart(session.mode === 'legacy-practice' ? { ...session.settings, promptMode: 'sound' } : session.settings)}
            >
              {session.mode === 'legacy-practice' ? '예약 학습 시작' : '새 세션 시작'}
            </button>
          )}
          <button className="home-return-action" type="button" onClick={() => setModule('picker')}>
            홈으로 돌아가기
          </button>
        </section>
      </main>
    )
  }

  if (!currentItem || !currentKana) return null

  const course = session.settings.course ?? 'basic'
  const prompt = session.settings.promptMode === 'trigger' ? (currentKana.trigger ?? currentKana.sound) : currentKana.sound
  const progressText = `${session.index + 1} / ${session.items.length}`
  const modeOptions = course === 'basic' ? MODE_OPTIONS : MODE_OPTIONS.slice(0, 1)

  return (
    <main className="app-shell">
      <section className="card quiz-card" aria-labelledby="app-title">
        <header className="topbar">
          <div>
            <BackButton onClick={returnToKanaMenu} />
            <h1 id="app-title" className="sr-only">일본어 가나 떠올리기 학습</h1>
          </div>
          <span className="progress" aria-label={`진행 ${progressText}`}>{progressText}</span>
        </header>

        <div className="settings kana-settings" aria-label="문제 설정">
          <SettingDropdown
            id="course-setting"
            label="학습 과정"
            value={course}
            options={COURSE_OPTIONS}
            isOpen={openSetting === 'course'}
            onToggle={() => setOpenSetting((current) => current === 'course' ? null : 'course')}
            onChange={changeCourse}
          />
          <SettingDropdown
            id="range-setting"
            label="문자 범위"
            value={session.settings.range}
            options={RANGE_OPTIONS}
            isOpen={openSetting === 'range'}
            onToggle={() => setOpenSetting((current) => current === 'range' ? null : 'range')}
            onChange={(value) => changeSetting('range', value)}
          />
          <SettingDropdown
            id="prompt-setting"
            label="출제 방식"
            value={session.settings.promptMode}
            options={modeOptions}
            isOpen={openSetting === 'promptMode'}
            onToggle={() => setOpenSetting((current) => current === 'promptMode' ? null : 'promptMode')}
            onChange={(value) => changeSetting('promptMode', value)}
          />
        </div>

        <div className="question" key={`${session.id}-${session.index}`}>
          <p className="question-kind">{KIND_LABEL[currentKana.kind]} · {COURSE_LABEL[currentKana.course]}</p>
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
                <h2 className="feedback-title">
                  <span className="status-badge" aria-hidden="true">O</span>
                  <span>맞았어요</span>
                </h2>
                {currentKana.course !== 'basic' ? (
                  <>
                    <p className="feedback-trigger">{currentKana.composition}</p>
                    <p className="feedback-description">{currentKana.description}</p>
                  </>
                ) : session.settings.promptMode === 'trigger' ? (
                  <>
                    <p className="feedback-trigger">{currentKana.trigger}</p>
                    <p>{currentKana.description}</p>
                  </>
                ) : (
                  <>
                    <p>소리 <strong>{currentKana.sound}</strong>와 글자 <strong lang="ja">{currentKana.character}</strong>를 올바르게 연결했어요.</p>
                    <p className="feedback-trigger">{currentKana.trigger}</p>
                    <p className="feedback-description">{currentKana.description}</p>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 className="feedback-title">
                  <span className="status-badge" aria-hidden="true">X</span>
                  <span className="feedback-title-text">
                    <span className="feedback-title-copy">오답이에요 · 정답은</span>
                    <span className="answer-character" lang="ja">{currentKana.character}</span>
                  </span>
                </h2>
                {currentKana.course === 'basic' ? (
                  <>
                    <p className="repair-guide">연상 Trigger로 문자와 소리를 다시 연결해보세요.</p>
                    <p className="feedback-trigger">{currentKana.trigger}</p>
                    <p>{currentKana.description}</p>
                  </>
                ) : (
                  <>
                    <p className="repair-guide">조합 원리로 글자와 소리를 다시 연결해보세요.</p>
                    <p className="feedback-trigger">{currentKana.composition}</p>
                    <p>{currentKana.description}</p>
                  </>
                )}
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
