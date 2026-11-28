import type { ModelContent, ModelJoint, ModelJointKind, ModelLimitsFor } from '../../../../../api/types'
import { JOINT_KINDS, JOINT_NAME_MAX, TURN_LIMIT } from './pivots'

// Joint limits (slice 9d). A pivot point may stand for a joint of the body (`ModelJoint.kind`); its limits then come from a table of how far that joint turns: the measured
// means of adults of 20 to 44 (the approved mockup's numbers, not the clinical maxima), adjusted for the body the model is (`ModelContent.limitsFor`): women about 5 degrees
// more at the elbow, knee and ankle, and women and children straightening about 5 past; hypermobile about 10 past and a tenth more everywhere; every joint a tenth less
// from mid-life.
//
// The turns are as the joint turns on the side the original is drawn (the figure's left, on the picture's right): a positive turn swings the part beyond the joint toward the
// middle of the figure and up. A twin reads its limits the same way (they are mirrored for it), so an elbow bends 0 to 145 on both sides.

export const LIMITS_FOR_DEFAULT: ModelLimitsFor = { sex: 'men', age: 'adult', hyper: false }
export const JOINT_LABEL: Record<ModelJointKind, string> = { neck: 'Neck', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist', hip: 'Hip', knee: 'Knee', ankle: 'Ankle' }
// what each joint does, in a few words for the panel
export const JOINT_NOTE: Record<ModelJointKind, string> = {
  neck: '45° each way', shoulder: 'up to 180° out from the body, 30° across it', elbow: 'bends 145°', wrist: '80° one way, 70° the other',
  hip: '125° out, 15° in', knee: 'bends 140°', ankle: '55° one way, 15° the other',
}
// [lowest, highest] turn for a man of 20 to 44
const TABLE: Record<ModelJointKind, [number, number]> = {
  neck: [-45, 45], shoulder: [-180, 30], elbow: [0, 145], wrist: [-70, 80], hip: [-125, 15], knee: [-140, 0], ankle: [-15, 55],
}
// the end a joint bends toward, and the end it straightens past (where it can)
const BENDS: Partial<Record<ModelJointKind, 'lo' | 'hi'>> = { elbow: 'hi', knee: 'lo', ankle: 'hi' }
const STRAIGHTENS: Partial<Record<ModelJointKind, 'lo' | 'hi'>> = { elbow: 'lo', knee: 'hi' }

export function repairLimitsFor(v: unknown): ModelLimitsFor | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  return { sex: p.sex === 'women' ? 'women' : 'men', age: p.age === 'child' || p.age === 'elder' ? p.age : 'adult', hyper: p.hyper === true }
}

// The limits of a joint for a body.
export function limitsOf(kind: ModelJointKind, f: ModelLimitsFor = LIMITS_FOR_DEFAULT): { lo: number; hi: number } {
  let [lo, hi] = TABLE[kind]
  const widen = (end: 'lo' | 'hi', by: number) => { if (end === 'lo') lo -= by; else hi += by }
  if (f.hyper) { lo = lo * 1.1; hi = hi * 1.1 }
  const bend = BENDS[kind], straight = STRAIGHTENS[kind]
  if (bend && f.sex === 'women') widen(bend, 5)
  if (straight && f.age !== 'elder') widen(straight, f.hyper ? 10 : f.sex === 'women' || f.age === 'child' ? 5 : 0)
  if (f.age === 'elder') { lo = lo * 0.9; hi = hi * 0.9 }
  // rounded half away from zero, so a joint's two ways stay alike
  const held = (v: number) => Math.sign(v) * Math.round(Math.abs(Math.min(TURN_LIMIT, Math.max(-TURN_LIMIT, v)))) || 0
  return { lo: Math.min(0, held(lo)), hi: Math.max(0, held(hi)) }
}

// The model's pivot points as the Joints section lists them: the originals' (a twin's are its original's, mirrored), in the order of the shapes, leaving out those that do
// not turn at all (a part held fast to another, as an ear to the head).
export interface JointRow { id: string; shapeId: string; i: number; joint: ModelJoint }
export function jointRows(c: ModelContent): JointRow[] {
  return c.shapes.flatMap(s => s.pts.flatMap((p, i) => {
    const j = p.bind?.pivot
    return j && (j.lo !== 0 || j.hi !== 0) ? [{ id: `${s.id}:${i}`, shapeId: s.id, i, joint: j }] : []
  }))
}
// A twin's name for its original's joint: the side swapped, else marked as the twin's.
export const twinJointName = (name: string): string => (/\(left\)/i.test(name) ? name.replace(/\(left\)/i, '(right)') : /\(right\)/i.test(name) ? name.replace(/\(right\)/i, '(left)') : `${name} (twin)`)
// A joint's name as shown: its own, else what it stands for, else none.
export const jointName = (j: ModelJoint): string => j.name || (j.kind ? JOINT_LABEL[j.kind] : '')

const withJoint = (c: ModelContent, shapeId: string, i: number, f: (j: ModelJoint) => ModelJoint): ModelContent => ({
  ...c, shapes: c.shapes.map(s => (s.id === shapeId ? { ...s, pts: s.pts.map((p, k) => (k === i && p.bind?.pivot ? { ...p, bind: { ...p.bind, pivot: f(p.bind.pivot) } } : p)) } : s)),
})
const held = (j: ModelJoint, lo: number, hi: number): ModelJoint => ({ ...j, lo, hi, turn: Math.min(hi, Math.max(lo, j.turn)) })

// A joint named (an empty name: none).
export function nameJoint(c: ModelContent, shapeId: string, i: number, name: string): ModelContent {
  const n = name.trim().slice(0, JOINT_NAME_MAX)
  return withJoint(c, shapeId, i, j => { const { name: _was, ...rest } = j; return n ? { ...rest, name: n } : rest })
}
// What a joint stands for (null: nothing): it takes that joint's limits for the model's body at once.
export function setJointKind(c: ModelContent, shapeId: string, i: number, kind: ModelJointKind | null): ModelContent {
  if (kind !== null && !JOINT_KINDS.includes(kind)) return c
  return withJoint(c, shapeId, i, j => {
    const { kind: _was, ...rest } = j
    if (!kind) return rest
    const { lo, hi } = limitsOf(kind, c.limitsFor ?? LIMITS_FOR_DEFAULT)
    return held({ ...rest, kind }, lo, hi)
  })
}
// The body the limits are for: every joint that stands for one takes the table's limits for it (each turn held inside them).
export function applyLimitsFor(c: ModelContent, f: ModelLimitsFor): ModelContent {
  const next = { ...c, limitsFor: f }
  return {
    ...next, shapes: next.shapes.map(s => (s.pts.some(p => p.bind?.pivot?.kind) ? {
      ...s, pts: s.pts.map(p => {
        const j = p.bind?.pivot
        if (!j?.kind) return p
        const { lo, hi } = limitsOf(j.kind, f)
        return { ...p, bind: { ...p.bind!, pivot: held(j, lo, hi) } }
      }),
    } : s)),
  }
}
