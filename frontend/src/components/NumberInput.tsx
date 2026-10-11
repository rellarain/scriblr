import { useState } from 'react'

// A whole number held to its limits. While it is being typed the text is the field's own (a half-typed "1" on the way to "1000" is not yet a
// goal); a value inside the limits applies at once, and leaving the field puts the number back inside them.
export function NumberInput({ value, min, max, onChange, className, label }: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  className?: string
  label: string
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      className={className} type="number" aria-label={label} min={min} max={max} value={text ?? value}
      onChange={e => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n))
      }}
      onBlur={e => {
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))))
        setText(null)
      }}
    />
  )
}
