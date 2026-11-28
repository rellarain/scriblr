import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ModelContent, ModelRange } from '../../../../api/types'
import { BODY_GROUPS, blendBodies, bodiesOf, bodyRange, cornersOf, headsNow, heldToBands, pointOf, spanOf, valueText, weightsAt, type Corner } from './engine/bodySliders'
import { valueOf, type Values } from './engine/rig'

// The Body section (slice 9f) in the shape editor's Overview, for a model started from a body: blend up to three bodies (a point on a segment or in a triangle), then
// refine with the body sliders, in groups: the frame, the soft tissue, the age and (opened on asking) the regions. Each slider shows its band (what writers may use,
// inside the measured people) and a tick at its default; the knob stays in the band unless the ranges are unlocked. The figure on the canvas is the test character:
// nothing here changes the model.

export interface BodyActions {
  values: Values
  onValues: (change: Values) => void
  onReset: (ids: string[]) => void
}

const W = 220, H = 124, PAD = 18, MAX_BODIES = 3

export function BodySection({ content, actions }: { content: ModelContent; actions: BodyActions }) {
  const [unlocked, setUnlocked] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const [weights, setWeights] = useState<number[]>([])
  const [regions, setRegions] = useState(false)
  const svg = useRef<SVGSVGElement>(null)
  const bodies = bodiesOf(content), corners = cornersOf(picks.length, W, H, PAD)
  const { values } = actions

  const blend = (ids: string[], ws: number[]) => actions.onValues(blendBodies(content, ids.map((id, i) => ({ id, w: ws[i] ?? 0 }))))
  const pick = (id: string) => {
    const next = picks.includes(id) ? picks.filter(x => x !== id) : [...picks, id].slice(0, MAX_BODIES)
    const ws = next.map(() => 1 / Math.max(1, next.length))
    setPicks(next); setWeights(ws)
    if (next.length) blend(next, ws)
  }
  const moveTo = (p: Corner) => { const ws = weightsAt(p, corners); setWeights(ws); blend(picks, ws) }
  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || !box.width || !box.height) return
    moveTo([((e.clientX - box.left) / box.width) * W, ((e.clientY - box.top) / box.height) * H])
  }
  const dot = pointOf(weights, corners)
  const onDotKey = (e: KeyboardEvent<SVGCircleElement>) => {
    const step = e.shiftKey ? 24 : 8, d: Record<string, Corner> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    moveTo([dot[0] + m[0], dot[1] + m[1]])
  }
  const blendText = picks.map((id, i) => `${bodies.find(b => b.id === id)?.name ?? id} ${Math.round((weights[i] ?? 0) * 100)}%`).join(', ')

  const row = (r: ModelRange) => {
    const v = valueOf(r, values), [lo, hi] = spanOf(r, unlocked), span = r.max - r.min || 1
    const left = ((Math.min(lo, hi) - r.min) / span) * 100, right = ((r.max - Math.max(lo, hi)) / span) * 100, tick = ((r.rest - r.min) / span) * 100
    const text = valueText(content, r, values)
    return (
      <div key={r.id} className="cmBodyRow">
        <label className="cmBodyLabel" htmlFor={`body-${r.id}`}>{r.name}</label>
        <span className="cmBodyTrack">
          <b className="cmBodyBand" style={{ left: `${left}%`, right: `${right}%` }} aria-hidden="true" />
          <span className="cmBodyTick" style={{ left: `${tick}%` }} aria-hidden="true" />
          <input id={`body-${r.id}`} type="range" min={r.min} max={r.max} step={1} value={v} aria-valuetext={text}
            onChange={e => { const x = Number(e.target.value); actions.onValues({ [r.id]: Math.min(hi, Math.max(lo, x)) }) }} />
        </span>
        <span className="cmBodyValue">{text}</span>
      </div>
    )
  }
  const heads = headsNow(content, values)
  const groupRanges = (roles: string[]) => roles.map(role => bodyRange(content, role)).filter((r): r is ModelRange => !!r)

  return (
    <div className="cmDraw" role="group" aria-label="Body">
      <h3 className="cmInsSub">Body</h3>
      <p className="cmInsText">The figure on the canvas is a test character: the bodies and the sliders change it, not the model.</p>
      {bodies.length > 0 && (
        <div className="cmBodyBlend" role="group" aria-label="Bodies">
          <span className="cmBodyHead">Bodies</span>
          {picks.length > 1 && (
            <svg ref={svg} className="cmBlendPad" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Blend of the bodies"
              onPointerDown={e => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); fromPointer(e) }}
              onPointerMove={e => { if (e.buttons & 1) fromPointer(e) }}>
              {picks.length === 3 ? <polygon className="cmBlendShape" points={corners.map(c => c.join(',')).join(' ')} /> : <line className="cmBlendShape" x1={corners[0][0]} y1={corners[0][1]} x2={corners[1][0]} y2={corners[1][1]} />}
              {corners.map((c, i) => (
                <text key={picks[i]} className="cmBlendName" x={c[0]} y={picks.length === 3 && i === 0 ? c[1] - 6 : c[1] + 14} textAnchor="middle">{bodies.find(b => b.id === picks[i])?.name}</text>
              ))}
              <circle className="cmBlendDot" cx={dot[0]} cy={dot[1]} r={6} tabIndex={0} role="img" aria-label={`Blend: ${blendText}`} onKeyDown={onDotKey} />
            </svg>
          )}
          <p className="cmInsText">{picks.length === 0 ? 'Start from up to three bodies and blend them, then refine with the sliders below.' : picks.length === 1 ? 'Pick another body or two to blend them.' : `${blendText}. Drag the point to blend them (the arrow keys move it too).`}</p>
          <div className="cmInline">
            {bodies.map(b => {
              const on = picks.includes(b.id)
              return (
                <button key={b.id} type="button" className={`cmBtn cmBtn--small${on ? ' cmBtn--on' : ''}`} aria-pressed={on} disabled={!on && picks.length >= MAX_BODIES}
                  title={!on && picks.length >= MAX_BODIES ? 'Up to three bodies' : undefined} onClick={() => pick(b.id)}>{b.name}</button>
              )
            })}
          </div>
        </div>
      )}
      {BODY_GROUPS.filter(g => g.id !== 'regions').map(g => {
        const list = groupRanges(g.roles)
        if (!list.length) return null
        return (
          <div key={g.id} className="cmBodyGroup" role="group" aria-label={g.name}>
            <span className="cmBodyHead">{g.name}</span>
            {list.map(row)}
            <p className="cmInsText">{g.id === 'frame' && heads !== null ? `${heads} heads. ` : ''}{g.note}</p>
          </div>
        )
      })}
      {groupRanges(BODY_GROUPS.find(g => g.id === 'regions')!.roles).length > 0 && (
        <div className="cmBodyGroup">
          <button type="button" className="cmBtn cmBtn--small" aria-expanded={regions} onClick={() => setRegions(o => !o)}>More sliders, by region</button>
          {regions && <div role="group" aria-label="By region">{groupRanges(BODY_GROUPS.find(g => g.id === 'regions')!.roles).map(row)}</div>}
        </div>
      )}
      <div className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${unlocked ? ' cmBtn--on' : ''}`} aria-pressed={unlocked}
          onClick={() => { const next = !unlocked; setUnlocked(next); if (!next) { const held = heldToBands(content, values); if (Object.keys(held).length) actions.onValues(held) } }}>Unlock the ranges</button>
        <button type="button" className="cmBtn cmBtn--small" onClick={() => { setPicks([]); setWeights([]); actions.onReset(content.ranges.filter(r => r.role?.startsWith('body-')).map(r => r.id)) }}>Reset the body</button>
      </div>
      <p className="cmInsText">The band is what writers may use, the tick the default. The ranges stay inside the measured people unless unlocked.</p>
    </div>
  )
}
