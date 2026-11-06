import { useEffect, useRef, useState } from 'react'
import { CommitText as MapCommitText } from '../maps/MapFields'
import { pick, type Option } from './art/library'

// Small inputs for the character panels: a name, a slider with its value, a colour with a row of swatches, a heading over a field and a grid of choices.

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

// A colour: the swatch opens the browser's picker (handed over a moment after the last change, or when the field is left); `swatches` are quick choices.
export function Colour({ label, value, onChange, swatches = [], none }: { label: string; value: string | null; onChange: (value: string | null) => void; swatches?: readonly string[]; none?: string }) {
  const [colour, setColour] = useState(value ?? '#888888')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ colour, value, onChange })
  latest.current = { colour, value, onChange }
  useEffect(() => { setColour(value ?? '#888888') }, [value])
  const send = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const { colour: c, value: v, onChange: change } = latest.current
    if (c !== v) change(c)
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

// A grid of choices: each a button (with a picture when `thumb` draws one) and its name, the chosen one `aria-pressed`.
export function Options<T extends Option>({ label, items, value, onPick, thumb, none }: {
  label: string; items: readonly T[]; value: string | null; onPick: (id: string | null) => void; thumb?: (item: T) => React.ReactNode; none?: string
}) {
  const chosen = value === null ? null : pick(items, value).id
  return (
    <div className={thumb ? 'charOptions charOptions--thumbs' : 'charOptions'} role="group" aria-label={label}>
      {none !== undefined && (
        <button type="button" className="charOpt" aria-pressed={value === null} onClick={() => onPick(null)}><span className="charOptName">{none}</span></button>
      )}
      {items.map(o => (
        <button key={o.id} type="button" className="charOpt" aria-pressed={chosen === o.id} aria-label={o.name} title={o.name} onClick={() => onPick(o.id)}>
          {thumb && <span className="charThumbBox" aria-hidden="true">{thumb(o)}</span>}
          <span className="charOptName">{o.name}</span>
        </button>
      ))}
    </div>
  )
}
