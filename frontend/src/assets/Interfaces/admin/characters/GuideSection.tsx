import type { ModelContent, ModelGuide } from '../../../../api/types'
import { CloseIcon } from '../../../icons'
import { HEAD_MARKS } from './engine/guides'
import { GUIDE_HEAD_RANGE, GUIDE_LINES_MAX } from './modelContent'
import { Stepper } from './Stepper'

// The proportion guide (slice 9a), in the shape editor's Overview: whether it is shown and whether shapes snap to it, a head's height, and its named lines (each a name and
// how many heads down from the crown it is). A model with none can be given the canon's.
export interface GuideActions {
  shown: boolean
  snap: boolean
  onShow: (on: boolean) => void
  onSnap: (on: boolean) => void
  onGuide: (next: ModelGuide | null) => void
}

const r2 = (v: number) => Math.round(v * 100) / 100
const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞']
// a number of heads as a whole and eighths ("2¼") when it is one, else to the hundredth
export function headsText(h: number): string {
  const e = Math.round(h * 8)
  if (Math.abs(h * 8 - e) > 0.02) return String(r2(h))
  const whole = Math.floor(e / 8), rest = e - whole * 8
  return rest === 0 ? String(whole) : `${whole === 0 ? '' : whole}${EIGHTHS[rest]}`
}

// The canon's guide for a model that has none: the crown at its highest shape (or 10), a head of 56 units, and the canon's landmarks.
export function canonGuide(c: ModelContent): ModelGuide {
  const ys = c.shapes.flatMap(s => s.pts.map(p => p.y))
  const top = ys.length ? r2(Math.min(...ys)) : 10
  const name: Record<string, string> = { Nipples: 'Chest', Navel: 'Waist' }
  return { top, head: 56, lines: HEAD_MARKS.map(m => ({ name: name[m.name] ?? m.name, y: r2(top + m.at * 56) })) }
}

export function GuideSection({ content, actions }: { content: ModelContent; actions: GuideActions }) {
  const guide = content.guide ?? null
  if (!guide) {
    return (
      <div className="cmGuide" role="group" aria-label="Proportion guide">
        <h3 className="cmInsSub">Proportion guide</h3>
        <p className="cmInsText">This model has no proportion guide. A guide draws a line every head from the crown down, with lines at the chin, the chest, the waist, the crotch, the knees and the soles, that shapes snap to.</p>
        <div className="cmInline"><button type="button" className="cmBtn cmBtn--small" onClick={() => actions.onGuide(canonGuide(content))}>Add a guide</button></div>
      </div>
    )
  }
  const set = (patch: Partial<ModelGuide>) => actions.onGuide({ ...guide, ...patch })
  const setLine = (i: number, patch: Partial<ModelGuide['lines'][number]>) => set({ lines: guide.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  const heads = (y: number) => (y - guide.top) / guide.head
  const stepHead = (dir: -1 | 1, big: boolean) => set({ head: r2(Math.min(GUIDE_HEAD_RANGE.max, Math.max(GUIDE_HEAD_RANGE.min, guide.head + dir * (big ? 5 : 1)))) })
  const addLine = () => {
    const lowest = guide.lines.reduce((m, l) => Math.max(m, l.y), guide.top)
    set({ lines: [...guide.lines, { name: `Line ${guide.lines.length + 1}`, y: r2(Math.min(450, lowest + guide.head / 2)) }] })
  }
  return (
    <div className="cmGuide" role="group" aria-label="Proportion guide">
      <h3 className="cmInsSub">Proportion guide</h3>
      <div className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${actions.shown ? ' cmBtn--on' : ''}`} aria-pressed={actions.shown} onClick={() => actions.onShow(!actions.shown)}>Show the guide</button>
        <button type="button" className={`cmBtn cmBtn--small${actions.snap ? ' cmBtn--on' : ''}`} aria-pressed={actions.snap} onClick={() => actions.onSnap(!actions.snap)}>Snap to the guide</button>
      </div>
      <Stepper label="Head height" value={String(r2(guide.head))} lowerOff={guide.head <= GUIDE_HEAD_RANGE.min} raiseOff={guide.head >= GUIDE_HEAD_RANGE.max} bigBy={5} onStep={stepHead} />
      <p className="cmInsText">{guide.lines.length ? 'Each line, in heads down from the crown:' : 'No lines yet.'}</p>
      <ul className="cmGuideLines">
        {guide.lines.map((l, i) => {
          const label = l.name || `line ${i + 1}`
          return (
            <li key={i} className="cmGuideLine">
              <input className="cmGuideName" value={l.name} maxLength={40} aria-label={`Name of line ${i + 1}`} onChange={e => setLine(i, { name: e.target.value })} />
              <Stepper label={`Height of ${label}`} value={headsText(heads(l.y))} lowerOff={l.y <= -50} raiseOff={l.y >= 450} bigBy={4}
                onStep={(dir, big) => setLine(i, { y: r2(Math.min(450, Math.max(-50, guide.top + (Math.round(heads(l.y) * 8) + dir * (big ? 4 : 1)) * guide.head / 8))) })} />
              <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => set({ lines: guide.lines.filter((_, k) => k !== i) })}><CloseIcon size={12} /></button>
            </li>
          )
        })}
      </ul>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={guide.lines.length >= GUIDE_LINES_MAX} onClick={addLine}>Add a line</button>
        <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.onGuide(null)}>Remove the guide</button>
      </div>
    </div>
  )
}
