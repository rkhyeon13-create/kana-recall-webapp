import { useEffect, useRef, useState } from 'react'
import { COURSE_LABEL, KIND_LABEL } from './data/kana'
import { BackButton } from './BackButton'
import { getKanaForRange, shuffle } from './lib/quiz'
import type { Kana, Settings } from './types'

const LEARNING_SIZE = 10

function createLearningItems(settings: Settings): Kana[] {
  return shuffle(getKanaForRange(settings.range, settings.course ?? 'basic')).slice(0, LEARNING_SIZE)
}

interface KanaLearnProps {
  settings: Settings
  onBack: () => void
  onMenu: () => void
  onStartQuiz: (settings: Settings) => void
}

export function KanaLearn({ settings, onBack, onMenu, onStartQuiz }: KanaLearnProps) {
  const [items, setItems] = useState(() => createLearningItems(settings))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [audioUnavailable, setAudioUnavailable] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  const kana = items[index]

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.strokeStyle = '#202632'
      context.lineWidth = 7
      context.lineCap = 'round'
      context.lineJoin = 'round'
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [index])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    drawingRef.current = true
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    const point = pointFromEvent(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const stopDrawing = () => {
    drawingRef.current = false
  }

  const speak = () => {
    if (!kana || !('speechSynthesis' in window)) {
      setAudioUnavailable(true)
      return
    }
    const utterance = new SpeechSynthesisUtterance(kana.character)
    utterance.lang = 'ja-JP'
    utterance.rate = 0.75
    const japaneseVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ja'))
    if (japaneseVoice) utterance.voice = japaneseVoice
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setAudioUnavailable(false)
  }

  const next = () => {
    if (index + 1 >= items.length) {
      setCompleted(true)
      return
    }
    setIndex((current) => current + 1)
    setRevealed(false)
    setAudioUnavailable(false)
  }

  const restart = () => {
    setItems(createLearningItems(settings))
    setIndex(0)
    setRevealed(false)
    setCompleted(false)
    setAudioUnavailable(false)
  }

  if (completed) {
    return (
      <main className="app-shell">
        <section className="card summary-card" aria-labelledby="learn-summary-title">
          <BackButton onClick={onMenu} />
          <p className="eyebrow">듣고 써보기 완료</p>
          <h1 id="learn-summary-title">{items.length}자를 듣고 써봤어요</h1>
          <p className="schedule-note">이제 같은 과정과 문자 범위로 테스트해보세요.</p>
          <button className="primary-action" type="button" onClick={() => onStartQuiz(settings)}>
            이 범위 테스트 시작
          </button>
          <button className="secondary-action" type="button" onClick={restart}>
            같은 범위 다시 익히기
          </button>
          <button className="home-return-action" type="button" onClick={onBack}>
            가나 홈으로 돌아가기
          </button>
        </section>
      </main>
    )
  }

  if (!kana) return null

  return (
    <main className="app-shell">
      <section className="card quiz-card learn-card" aria-labelledby="learn-title">
        <header className="topbar">
          <div>
            <BackButton onClick={onMenu} />
            <h1 id="learn-title" className="sr-only">가나 소리 듣고 써보기</h1>
          </div>
          <span className="progress" aria-label={`진행 ${index + 1} / ${items.length}`}>{index + 1} / {items.length}</span>
        </header>

        <div className="learn-heading">
          <p className="question-kind">{KIND_LABEL[kana.kind]} · {COURSE_LABEL[kana.course]} · 듣고 써보기</p>
          <h2>소리를 듣고 글자를 써보세요</h2>
          <p className="learn-sound">{kana.sound}</p>
          <button className="listen-action" type="button" onClick={speak}>
            <span aria-hidden="true">🔊</span> 소리 듣기
          </button>
          {audioUnavailable && <p className="audio-note">이 브라우저에서는 음성 재생을 사용할 수 없어요.</p>}
        </div>

        <div className="writing-pad">
          <canvas
            ref={canvasRef}
            aria-label="글자 쓰기 연습장"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
        </div>

        <div className="learn-actions">
          <button className="clear-action" type="button" onClick={clearCanvas}>지우기</button>
          {!revealed && (
            <button className="primary-action" type="button" onClick={() => setRevealed(true)}>정답 보기</button>
          )}
        </div>

        {revealed && (
          <div className="learn-answer" aria-live="polite">
            <span>정답</span>
            <strong lang="ja">{kana.character}</strong>
            <p className="feedback-trigger">{kana.course === 'basic' ? kana.trigger : kana.composition}</p>
            <p>{kana.description}</p>
            <button className="primary-action" type="button" onClick={next}>
              {index + 1 === items.length ? '학습 마치기' : '다음 글자'} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
