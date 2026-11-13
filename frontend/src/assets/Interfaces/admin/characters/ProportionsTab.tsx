import { useState } from 'react'
import type { ModelBone, ModelContent, ModelRange } from '../../../../api/types'
import { PlusIcon, TrashIcon } from '../../../icons'
import { LimitSteppers } from './LimitSteppers'
import { Stepper } from './Stepper'
import { headHeights, measures, type Measure } from './engine/bones'
import { useDesignerPolicy } from './designerPolicy'
import { LIMITS } from './engine/limits'
import type { Solved } from './engine/rig'
import type { ProportionActions, RigActions } from './rigActions'

// The Proportions tab (phase 5a): the skeleton of measured lengths and the span a writer may choose each slider within. A bone runs from the pivot of a group to the
// pivot of another group or to a point of a shape; its length is read live (with the Try it sliders), in the model's units, in head bones and as a percent of its
// length at rest. A Length slider (Ranges tab) is what stretches a bone. Lists, chips and steppers: no typed numbers.
const f1 = (n: number) => Math.round(n * 10) / 10
const f2 = (n: number) => Math.round(n * 100) / 100
const label = (name: string, fallback: string) => name.trim() || fallback

function measureText(m: Measure | undefined): string {
  if (!m || m.length == null) return 'It cannot be measured: one of its ends is missing.'
  const parts = [`${f1(m.length)} units`]
  if (m.heads != null) parts.push(`${f2(m.heads)} heads`)
  if (m.percent != null) parts.push(`${Math.round(m.percent)}% of its length at rest`)
  return parts.join(' · ')
}

export function ProportionsTab({ content, solved, picking, actions, limits }: {
  content: ModelContent
  solved: Solved
  // The bone whose end is being picked on the canvas.
  picking: string | null
  actions: ProportionActions
  limits: Pick<RigActions, 'stepLimit' | 'clearLimit'>
}) {
  const { max } = useDesignerPolicy()
  const [confirm, setConfirm] = useState<string | null>(null)
  const bones = content.bones ?? []
  const byId = new Map(measures(content, solved).map(m => [m.id, m]))
  const heads = headHeights(content, solved)
  const shown = content.ranges.filter(r => r.show)
  const originals = content.groups.filter(g => !g.mirrorOf)
  const shapes = content.shapes.filter(s => s.pts.length >= 3)

  function boneCard(b: ModelBone) {
    const name = label(b.name, 'Bone')
    const target = b.end.kind === 'point' ? content.shapes.find(s => s.id === b.end.id) : undefined
    const sliders = content.ranges.filter(r => r.drives.some(d => d.kind === 'length' && d.id === b.id))
    return (
      <section key={b.id} className="cmSlider" aria-label={`Bone ${name}`}>
        <div className="cmSliderHead">
          <input className="cmSliderName" aria-label={`Name of bone ${name}`} value={b.name} maxLength={40} placeholder="Name" onChange={e => actions.renameBone(b.id, e.target.value)} />
          {confirm === b.id ? (
            <span className="cmConfirm" role="group" aria-label={`Delete ${name}?`}>
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.removeBone(b.id) }}>Delete it</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
            </span>
          ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete bone ${name}`} title="Delete the bone (and the Length sliders' drives that lengthen it)" onClick={() => setConfirm(b.id)}><TrashIcon size={12} /></button>}
        </div>
        <p className="cmInsText cmMeasure" aria-label={`Length of ${name}`} role="status">{measureText(byId.get(b.id))}</p>
        <div className="cmChips" role="group" aria-label={`The head bone`}>
          <button type="button" className={`cmChip cmChip--wide${content.headBone === b.id ? ' cmChip--on' : ''}`} aria-pressed={content.headBone === b.id} title="Count heads in this bone's length" onClick={() => actions.setHeadBone(content.headBone === b.id ? null : b.id)}>Use as the head</button>
        </div>
        <label className="cmField">
          <span>Starts at the pivot of</span>
          <select value={b.start} aria-label={`Where ${name} starts`} onChange={e => actions.setStart(b.id, e.target.value)}>
            {!originals.some(g => g.id === b.start) && <option value={b.start}>(not an original group)</option>}
            {originals.map(g => <option key={g.id} value={g.id}>{label(g.name, 'Untitled group')}</option>)}
          </select>
        </label>
        <div className="cmChips" role="group" aria-label={`What ${name} ends at`}>
          <button type="button" className={`cmChip cmChip--wide${b.end.kind === 'group' ? ' cmChip--on' : ''}`} aria-pressed={b.end.kind === 'group'} onClick={() => b.end.kind !== 'group' && actions.setEnd(b.id, 'group', content.groups.find(g => g.id !== b.start)?.id ?? b.start, 0)}>A group&apos;s pivot</button>
          <button type="button" className={`cmChip cmChip--wide${b.end.kind === 'point' ? ' cmChip--on' : ''}`} aria-pressed={b.end.kind === 'point'} disabled={shapes.length === 0} onClick={() => b.end.kind !== 'point' && shapes[0] && actions.setEnd(b.id, 'point', shapes[0].id, 0)}>A point of a shape</button>
        </div>
        {b.end.kind === 'group' ? (
          <label className="cmField">
            <span>Ends at the pivot of</span>
            <select value={b.end.id} aria-label={`The group ${name} ends at`} onChange={e => actions.setEnd(b.id, 'group', e.target.value, 0)}>
              {!content.groups.some(g => g.id === b.end.id) && <option value={b.end.id}>(gone)</option>}
              {content.groups.map(g => <option key={g.id} value={g.id}>{label(g.name, 'Untitled group')}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="cmField">
              <span>Ends at a point of</span>
              <select value={b.end.id} aria-label={`The shape ${name} ends at`} onChange={e => actions.setEnd(b.id, 'point', e.target.value, 0)}>
                {!target && <option value={b.end.id}>(gone)</option>}
                {shapes.map(s => <option key={s.id} value={s.id}>{label(s.name, 'Untitled shape')}</option>)}
              </select>
            </label>
            {target && <Stepper label={`Point of ${name}`} value={`${b.end.i + 1} of ${target.pts.length}`} onStep={dir => actions.stepEndPoint(b.id, dir)} />}
          </>
        )}
        <div className="cmInline">
          <button type="button" className={`cmBtn cmBtn--small${picking === b.id ? ' cmBtn--on' : ''}`} aria-pressed={picking === b.id} onClick={() => actions.pickEnd(picking === b.id ? null : b.id)}>{picking === b.id ? 'Click a pivot or a shape…' : 'Pick its end on the canvas'}</button>
        </div>
        <p className="cmInsText">{sliders.length === 0 ? 'No slider lengthens it yet.' : 'Lengthened by'}</p>
        {sliders.length > 0 && <ul className="cmPlain">{sliders.map((r: ModelRange) => <li key={r.id}><button type="button" className="cmLink" onClick={() => actions.openSlider(r.id)}>{label(r.name, r.id)}</button></li>)}</ul>}
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={content.ranges.length >= max.sliders} onClick={() => actions.lengthSlider(b.id)}><PlusIcon size={12} /> Add a Length slider</button>
        </div>
      </section>
    )
  }

  return (
    <div className="cmTabBody">
      <section className="cmSec" aria-label="Bones">
        <h3 className="cmInsSub">Bones <span className={`cmCount${bones.length > LIMITS.bonesWarn ? ' cmCount--warn' : ''}`}>{bones.length} of {LIMITS.bonesMax}</span></h3>
        <p className="cmInsText">A bone runs from the pivot of a group to the pivot of another group or to a point of a shape. Its length reads live with the Try it sliders; a Length slider stretches it, and everything that hangs from it follows.</p>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={bones.length >= LIMITS.bonesMax} onClick={actions.addBone}><PlusIcon size={12} /> Add a bone</button>
        </div>
        <p className="cmInsText" role="status">{heads != null ? `The figure stands ${f2(heads)} heads tall.` : bones.length === 0 ? 'Add a bone to measure the figure.' : 'Mark a bone as the head to count heads.'}</p>
        {bones.map(boneCard)}
      </section>
      <section className="cmSec" aria-label="Writer's limits">
        <h3 className="cmInsSub">What a writer may choose</h3>
        <p className="cmInsText">The span of each slider that is offered to writers. The resting value is always allowed. The same steppers are in the Ranges tab.</p>
        {shown.length === 0 && <p className="cmInsText">No slider is offered to writers yet.</p>}
        {shown.map(r => (
          <div key={r.id} className="cmLimitRow">
            <p className="cmInsText"><b>{label(r.name, 'Slider')}</b></p>
            <LimitSteppers range={r} onStep={(end, dir, big) => limits.stepLimit(r.id, end, dir, big)} onClear={() => limits.clearLimit(r.id)} />
          </div>
        ))}
      </section>
    </div>
  )
}
