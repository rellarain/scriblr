import { useEffect, useRef, useState } from 'react'

// Small inputs for the map panels. Typing is kept in the field and handed over when the field is left or Enter is pressed (one undo step for a title,
// not one per letter); a value that does not fit is put back.

export function CommitText({ label, value, onCommit, max, className = 'mapInput', live = false, autoFocus = false }: {
  label: string
  value: string
  onCommit: (value: string) => void
  max?: number
  className?: string
  // Hand over every keystroke (a form that is submitted with Enter), not just the finished text.
  live?: boolean
  // Take the cursor, with the text selected, when it appears (a thing that was just made).
  autoFocus?: boolean
}) {
  const [text, setText] = useState(value)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (autoFocus) { input.current?.focus(); input.current?.select() } }, [autoFocus])
  useEffect(() => { setText(value) }, [value])
  const done = () => {
    if (text !== value) onCommit(text)
    if (text.trim() === '') setText(value)
  }
  return (
    <input
      ref={input} type="text" className={className} aria-label={label} title={label} value={text} maxLength={max}
      onChange={e => { setText(e.target.value); if (live) onCommit(e.target.value) }} onBlur={done}
      onKeyDown={e => { if (e.key === 'Enter') { if (!live) e.currentTarget.blur() } else if (e.key === 'Escape') { setText(value); e.currentTarget.blur() } }}
    />
  )
}

export function CommitNumber({ label, value, onCommit, min, max, step = 1, className = 'mapInput mapInput--num', live = false }: {
  label: string
  value: number
  onCommit: (value: number) => void
  min: number
  max: number
  step?: number | 'any'
  className?: string
  live?: boolean
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const done = () => {
    const n = Number(text)
    if (text.trim() !== '' && Number.isFinite(n)) {
      const held = Math.min(max, Math.max(min, n))
      if (held !== value) onCommit(held)
      setText(String(held))
    } else {
      setText(String(value))
    }
  }
  return (
    <input
      type="number" className={className} aria-label={label} title={label} value={text} min={min} max={max} step={step}
      onChange={e => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (live && e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n)
      }}
      onBlur={done}
      onKeyDown={e => { if (e.key === 'Enter') { if (!live) e.currentTarget.blur() } else if (e.key === 'Escape') { setText(String(value)); e.currentTarget.blur() } }}
    />
  )
}

// A colour: the swatch opens the browser's picker; the colour is handed over a moment after the last change (or when the field is left).
export function ColourInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [colour, setColour] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ colour, value, onCommit })
  latest.current = { colour, value, onCommit }
  useEffect(() => { setColour(value) }, [value])
  const send = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const { colour: c, value: v, onCommit: commit } = latest.current
    if (c !== v) commit(c)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <input
      type="color" className="mapColour" aria-label={label} title={label} value={colour}
      onChange={e => {
        setColour(e.target.value)
        latest.current.colour = e.target.value
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(send, 500)
      }}
      onBlur={send}
    />
  )
}

// A heading over its field (the field names itself to assistive technology).
export function Field({ label, children, short = false }: { label: string; children: React.ReactNode; short?: boolean }) {
  return (
    <div className={short ? 'mapField mapField--short' : 'mapField'}>
      <span className="mapLabel" aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}
