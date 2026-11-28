import { useState } from 'react'
import { MEASURES, type MeasureKey, type Measures, type ShapeClass } from './engine/measure'

// The Measurements section (slice 9f-2) in the shape editor's Overview, for a model started from a body: the test character's body in cm, as a fashion designer takes it
// (girths from the front and the side at the guide's levels, lengths between them), and its shape class. A measurement that has a body slider can be typed: the slider
// moves to bring it there, as near as its band allows.

export interface MeasureActions {
  measures: Measures
  shape: ShapeClass
  // move the slider for a typed measurement; the note to show (null: none)
  onType: (key: MeasureKey, cm: number) => string | null
}

export function MeasureSection({ actions }: { actions: MeasureActions }) {
  const [drafts, setDrafts] = useState<Partial<Record<MeasureKey, string>>>({})
  const [note, setNote] = useState<string | null>(null)
  const m = actions.measures
  const apply = (key: MeasureKey) => {
    const text = drafts[key]
    setDrafts(d => { const { [key]: _x, ...rest } = d; return rest })
    if (text === undefined) return
    const cm = Number(text.replace(',', '.'))
    if (!Number.isFinite(cm) || cm <= 0 || Math.abs(cm - m[key]) < 0.05) return
    setNote(actions.onType(key, cm))
  }
  const b = m.bust, w = m.waist, h = m.hip
  // a difference with its sign, a true minus below none
  const signed = (v: number) => { const n = Math.round(v); return n < 0 ? `−${-n}` : String(n) }
  return (
    <div className="cmDraw" role="group" aria-label="Measurements">
      <h3 className="cmInsSub">Measurements</h3>
      <p className="cmInsText">The body in cm, at the guide's levels: a girth from the front and the side, a length between the levels. Type one with a slider to move it there.</p>
      <div className="cmMeasureList">
        {MEASURES.map(({ key, name, slider }) => (
          <div key={key} className="cmMeasureRow">
            <span className="cmBodyLabel" id={`measure-${key}`}>{name}</span>
            {slider ? (
              <input className="cmMeasureInput" type="text" inputMode="decimal" aria-label={`${name} in cm`} value={drafts[key] ?? String(m[key])}
                onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))} onBlur={() => apply(key)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDrafts(d => { const { [key]: _x, ...rest } = d; return rest }) }} />
            ) : <span className="cmBodyValue" aria-labelledby={`measure-${key}`}>{m[key]}</span>}
            <span className="cmMeasureUnit" aria-hidden="true">cm</span>
          </div>
        ))}
      </div>
      {note && <p className="cmInsText" role="status">{note}</p>}
      <p className="cmInsText" role="note" aria-label="Shape">{`Shape: ${actions.shape} · bust ${Math.round(b)} · waist ${Math.round(w)} · hip ${Math.round(h)} cm (bust less waist ${signed(b - w)} cm, hip less bust ${signed(h - b)} cm).`}</p>
    </div>
  )
}
