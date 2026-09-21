interface BackButtonProps {
  onClick: () => void
  label?: string
}

export function BackButton({ onClick, label = '가나 학습으로 돌아가기' }: BackButtonProps) {
  return (
    <button className="back-icon-button" type="button" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5-7 7 7 7" />
      </svg>
    </button>
  )
}
