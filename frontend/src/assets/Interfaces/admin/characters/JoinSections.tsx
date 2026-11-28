import { useState } from 'react'
import type { ModelContent, ModelGroup, ModelShape } from '../../../../api/types'
import { capOf, joinOf, joinSets } from './engine/joins'
import { CAP_RANGE, JOIN_NAME_MAX } from './modelContent'
import { Stepper } from './Stepper'

// Joins (slice 9c) in the shape editor's panel: the Overview's Joins section (one outline round parts that touch, for the whole model, and the join sets with their
// names), the shape's join set in Look (and the set it is in from behind), and a group's Joint cap.

export interface JoinActions {
  onJoins: (on: boolean) => void
  onRename: (from: string, to: string) => void
  onCap: (groupId: string, cap: number | null) => void
}

// a set's name made unique among the model's sets
function freshSet(c: ModelContent): string {
  const taken = new Set(joinSets(c).map(s => s.name.toLowerCase()))
  for (let n = 1; ; n++) if (!taken.has(`set ${n}`)) return `Set ${n}`
}

export function ModelJoinsSection({ content, actions }: { content: ModelContent; actions: JoinActions }) {
  const on = content.joins === true, sets = joinSets(content)
  const [names, setNames] = useState<Record<string, string>>({})
  return (
    <div className="cmDraw" role="group" aria-label="Joins">
      <h3 className="cmInsSub">Joins</h3>
      <div className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${on ? ' cmBtn--on' : ''}`} aria-pressed={on} onClick={() => actions.onJoins(!on)}>One outline round parts that touch</button>
      </div>
      <p className="cmInsText">{on
        ? 'The shapes of a join set are drawn as one outline round them, so where they overlap no line shows, however they are posed.'
        : 'Each shape draws its own outline. Turn this on to draw the shapes of each join set as one outline.'}</p>
      {sets.length === 0 ? <p className="cmInsText">No shape is in a join set yet: choose one in a shape's Look.</p> : (
        <ul className="cmGuideLines">
          {sets.map((s, i) => (
            <li key={s.name} className="cmGuideLine">
              <input className="cmGuideName" value={names[s.name] ?? s.name} maxLength={JOIN_NAME_MAX} aria-label={`Name of the join set ${s.name}`}
                onChange={e => setNames(n => ({ ...n, [s.name]: e.target.value }))}
                onBlur={() => { const to = (names[s.name] ?? s.name).trim(); if (to && to !== s.name) actions.onRename(s.name, to); setNames(n => { const { [s.name]: _x, ...rest } = n; return rest }) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} data-set={i} />
              <span className="cmPartHint">{s.count === 1 ? '1 shape' : `${s.count} shapes`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type EditShape = (id: string, next: ModelShape, selectPoint?: number, remember?: boolean) => void
const NEW = '\u0000new', SAME = '\u0000same', NONE = ''

export function ShapeJoinSection({ content, shape, onEditShape }: { content: ModelContent; shape: ModelShape; onEditShape: EditShape }) {
  const sets = joinSets(content).map(s => s.name)
  const front = joinOf(content, shape), back = typeof shape.joinBack === 'string' ? shape.joinBack : null
  const withSet = (list: string[], name: string | null) => (name && !list.includes(name) ? [...list, name] : list)
  const set = (patch: Partial<ModelShape>) => {
    const next: ModelShape = { ...shape, ...patch }
    if (!next.join) delete next.join
    if (next.joinBack === undefined || next.joinBack === null) delete next.joinBack
    onEditShape(shape.id, next)
  }
  const pick = (v: string) => set({ join: v === NEW ? freshSet(content) : v || null })
  const pickBack = (v: string) => set({ joinBack: v === SAME ? null : v === NEW ? freshSet(content) : v })
  return (
    <div className="cmDraw" role="group" aria-label="Join set">
      <label className="cmField">
        <span>Joins</span>
        <select value={front ?? NONE} onChange={e => pick(e.target.value)}>
          <option value={NONE}>Not joined</option>
          {withSet(sets, front).map(n => <option key={n} value={n}>{n}</option>)}
          <option value={NEW}>New set…</option>
        </select>
      </label>
      <label className="cmField">
        <span>From behind</span>
        <select value={back === null ? SAME : back} onChange={e => pickBack(e.target.value)}>
          <option value={SAME}>The same as from the front</option>
          <option value={NONE}>Not joined</option>
          {withSet(sets, back).map(n => <option key={n} value={n}>{n}</option>)}
          <option value={NEW}>New set…</option>
        </select>
      </label>
      {content.joins !== true && front && <p className="cmInsText">The model's joins are off: turn on One outline round parts that touch in the Overview.</p>}
    </div>
  )
}

export function JointCapSection({ content, group, actions }: { content: ModelContent; group: ModelGroup; actions: JoinActions }) {
  const twin = !!group.mirrorOf, cap = capOf(content, group), on = cap !== null
  const pct = Math.round((cap ?? 1.05) * 100)
  const step = (dir: -1 | 1, big: boolean) => actions.onCap(group.id, Math.min(CAP_RANGE.max, Math.max(CAP_RANGE.min, (pct + dir * (big ? 25 : 5)) / 100)))
  return (
    <div className="cmDraw" role="group" aria-label="Joint cap">
      <h3 className="cmInsSub">Joint cap</h3>
      {twin ? <p className="cmInsText">{on ? `A cap of ${pct}%, as its original has.` : 'No cap: its original has none.'} A twin's cap is its original's.</p> : (
        <>
          <div className="cmInline">
            <button type="button" className={`cmBtn cmBtn--small${on ? ' cmBtn--on' : ''}`} aria-pressed={on} onClick={() => actions.onCap(group.id, on ? null : 1.05)}>Joint cap</button>
            {on && <Stepper label="Cap size" value={`${pct}%`} lowerOff={pct <= CAP_RANGE.min * 100} raiseOff={pct >= CAP_RANGE.max * 100} bigBy={25} onStep={step} />}
          </div>
          <p className="cmInsText">A circle at the pivot, as wide as the limb there, drawn with the group's shapes in their join set, so a limb turned a long way shows no notch at the joint.{content.joins !== true ? ' It shows while the model\'s joins are on.' : ''}</p>
        </>
      )}
    </div>
  )
}
