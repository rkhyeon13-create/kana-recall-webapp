interface SettingDropdownProps<T extends string> {
  id: string
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  isOpen: boolean
  onToggle: () => void
  onChange: (value: T) => void
}

export function SettingDropdown<T extends string>({
  id,
  label,
  value,
  options,
  isOpen,
  onToggle,
  onChange,
}: SettingDropdownProps<T>) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value

  return (
    <div className="setting-field">
      <span className="setting-label" id={`${id}-label`}>{label}</span>
      <div className={`setting-picker ${isOpen ? 'is-open' : ''}`}>
        <button
          className="setting-summary"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={onToggle}
        >
          <span id={`${id}-value`}>{selectedLabel}</span>
          <span className="setting-chevron" aria-hidden="true" />
        </button>
        {isOpen && (
          <div className="setting-menu" role="listbox" aria-labelledby={`${id}-label`}>
            {options.map((option) => (
              <button
                className={`setting-option ${option.value === value ? 'selected' : ''}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => onChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
