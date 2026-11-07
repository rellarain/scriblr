import { useEffect, useRef, useState } from 'react'
import { CommitText as MapCommitText } from '../maps/MapFields'

// Small inputs for the character panels: a name, a slider with its value, a colour with a row of swatches, a heading over a field and a text.

export function CommitText({ label, value, onCommit, max }: { label: string; value: string; onCommit: (value: string) => void; max?: number }) {
  return <MapCommitText label={label} value={value} onCommit={onCommit} max={max} className="charInput" />
}

export function Field({ label, children, short = false }: { label: string; children: React.ReactNode; short?: boolean }) {
  return (
    <div className={short ? 'charField charField--short' : 'charField'}>
      <span className="charLabel" aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}

// A slider: the range input, and its value beside it.
export function Slider({ label, value, min, max, step = 0.01, onChange, format }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; format?: (value: number) => string
}) {
  return (
    <label className="charSlider">
      <span className="charLabel">{label}</span>
      <input type="range" className="charRange" aria-label={label} title={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className="charValue" aria-hidden="true">{format ? format(value) : (Math.round(value * 100) / 100).toString()}</span>
    </label>
  )
}

// A colour: the swatch opens the browser's picker (handed over a moment after the last change, or when the field is left); `swatches` are quick choices. A colour that follows
// another one (`none` names that choice, and `value` is null) shows `shown`, the colour it is drawn in, in the picker.
export function Colour({ label, value, onChange, swatches = [], none, shown }: { label: string; value: string | null; onChange: (value: string | null) => void; swatches?: readonly string[]; none?: string; shown?: string }) {
  const [colour, setColour] = useState(value ?? shown ?? '#888888')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether the picker was moved since the colour was last handed over (leaving the field without changing it hands nothing over).
  const moved = useRef(false)
  const latest = useRef({ colour, value, onChange })
  latest.current = { colour, value, onChange }
  useEffect(() => { setColour(value ?? shown ?? '#888888') }, [value, shown])
  const send = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const { colour: c, value: v, onChange: change } = latest.current
    if (moved.current && c !== v) change(c)
    moved.current = false
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <div className="charColour" role="group" aria-label={label}>
      {none !== undefined && (
        <button type="button" className="charSwatch charSwatch--none" aria-pressed={value === null} aria-label={none} title={none} onClick={() => onChange(null)} />
      )}
      {swatches.map(c => (
        <button key={c} type="button" className="charSwatch" style={{ background: c }} aria-pressed={value === c} aria-label={`${label} ${c}`} title={c} onClick={() => onChange(c)} />
      ))}
      <input
        type="color" className="charPicker" aria-label={`${label}, choose any`} title={`${label}, choose any`} value={colour}
        onChange={e => {
          moved.current = true
          setColour(e.target.value)
          latest.current.colour = e.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(send, 500)
        }}
        onBlur={send}
      />
    </div>
  )
}

// Text typed straight into the character (a line or a paragraph): every keystroke is handed over, and edits in one run are one undo step (the caller gives the group).
export function TextField({ label, value, onChange, multiline = false, rows = 3, max, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; rows?: number; max?: number; placeholder?: string
}) {
  return (
    <div className="charField">
      <span className="charLabel" aria-hidden="true">{label}</span>
      {multiline
        ? <textarea className="charInput charArea" aria-label={label} title={label} rows={rows} maxLength={max} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
        : <input type="text" className="charInput" aria-label={label} title={label} maxLength={max} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />}
    </div>
  )
}
