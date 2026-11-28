import type { ModelContent, ModelLimitsFor } from '../../../../api/types'
import { JOINT_LABEL, LIMITS_FOR_DEFAULT, jointName, jointRows } from './engine/jointLimits'
import { TURN_LIMIT, poseOf } from './engine/pivots'
import { Stepper } from './Stepper'

// Joint limits (slice 9d) in the shape editor's Overview: the body the limits are for (men or women, a child, an adult or an elder, hypermobile), which sets every joint
// that stands for one of the body's from the table, and every pivot point's limits (a twin's are its original's, mirrored).

export interface LimitsActions {
  onFor: (f: ModelLimitsFor) => void
  onLimit: (shapeId: string, i: number, key: 'lo' | 'hi', value: number) => void
}

const SEXES: Array<[ModelLimitsFor['sex'], string]> = [['men', 'Men'], ['women', 'Women']]
const AGES: Array<[ModelLimitsFor['age'], string]> = [['child', 'Child'], ['adult', 'Adult'], ['elder', 'Elder']]

export function JointLimitsSection({ content, actions }: { content: ModelContent; actions: LimitsActions }) {
  const rows = jointRows(content), f = content.limitsFor ?? LIMITS_FOR_DEFAULT
  // a joint whose twin turns on its own side (a twin in the object its original is in joins nothing new)
  const joints = poseOf(content).joints
  const twinned = new Set([...joints.values()].flatMap(j => { const t = content.shapes.find(s => s.id === j.shape); return j.twin && t?.mirrorOf ? [`${t.mirrorOf}:${j.i}`] : [] }))
  const chip = (on: boolean, label: string, next: Partial<ModelLimitsFor>) => (
    <button key={label} type="button" className={`cmBtn cmBtn--small${on ? ' cmBtn--on' : ''}`} aria-pressed={on} onClick={() => actions.onFor({ ...f, ...next })}>{label}</button>
  )
  const deg = (v: number) => `${v}°`, step = (big: boolean) => (big ? 15 : 5)
  return (
    <div className="cmDraw" role="group" aria-label="Joint limits">
      <h3 className="cmInsSub">Joint limits</h3>
      {rows.length === 0 ? (
        <p className="cmInsText">No pivot points yet. Link a point of one object to another, then make it a pivot point in the point's form.</p>
      ) : (
        <>
          <div className="cmInline" role="group" aria-label="Limits for">
            {SEXES.map(([v, label]) => chip(f.sex === v, label, { sex: v }))}
          </div>
          <div className="cmInline" role="group" aria-label="Age">
            {AGES.map(([v, label]) => chip(f.age === v, label, { age: v }))}
            {chip(f.hyper, 'Hypermobile', { hyper: !f.hyper })}
          </div>
          <p className="cmInsText">A pivot point that stands for a joint of the body takes the limits measured for it: women about 5° more at the elbow, knee and ankle, and
            straightening about 5° past, as children do; hypermobile about 10° past; every joint a tenth less from mid-life.</p>
          <ul className="cmGuideLines">
            {rows.map((r, n) => {
              const j = r.joint, label = jointName(j) || `Pivot point ${n + 1}`
              return (
                <li key={r.id} className="cmJointRow" role="group" aria-label={label}>
                  <span className="cmJointName">{label}{twinned.has(r.id) ? ' (and its twin)' : ''}{j.kind && j.name && j.name !== JOINT_LABEL[j.kind] ? <span className="cmPartHint"> · {JOINT_LABEL[j.kind]}</span> : null}</span>
                  <Stepper label="From" value={deg(j.lo)} bigBy={15} lowerOff={j.lo <= -TURN_LIMIT} raiseOff={j.lo >= 0} onStep={(dir, big) => actions.onLimit(r.shapeId, r.i, 'lo', j.lo + dir * step(big))} />
                  <Stepper label="To" value={deg(j.hi)} bigBy={15} lowerOff={j.hi <= 0} raiseOff={j.hi >= TURN_LIMIT} onStep={(dir, big) => actions.onLimit(r.shapeId, r.i, 'hi', j.hi + dir * step(big))} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
