import type { ModelContent, ModelDrive, ModelRange } from '../../../../../api/types'
import { freshId, randomId, type MakeId } from '../modelContent'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// Posing the two sides apart (phase 5c). A twin group follows its original: whatever a slider does to the original, the twin does mirrored. That is right for a
// symmetrical pose and wrong for a wave, a pointing hand or one fist. **Pose the other side apart** gives the twin groups a slider of their own: the drives of the
// slider that turn or scale a group that has a twin stop being followed (`mirror: false`), and a copy of them for the twin groups goes into a new slider, "<name>
// (other side)". The drawing stays mirrored (the twin shapes still follow their originals); only the pose is separate. Drives that move points or bend a shape
// still reach the twin shape through its original.

const OTHER = ' (other side)'

export const twinGroupOf = (c: ModelContent, groupId: string): string | undefined => c.groups.find(g => g.mirrorOf === groupId)?.id

// The drives of a slider that a twin could be posed apart from: a turn or a scale of a group that has a twin group.
const poseable = (c: ModelContent, d: ModelDrive): boolean =>
  (d.kind === 'turn' && !!d.group && !!twinGroupOf(c, d.group)) || (d.kind === 'scale' && d.target === 'group' && !!d.id && !!twinGroupOf(c, d.id))

// Whether the slider is the original side of a pair posed apart (its poseable drives do not mirror).
export const isApart = (r: ModelRange): boolean => r.drives.some(d => d.mirror === false)

// Why a slider cannot be posed apart (null when it can).
export function whyNotApart(c: ModelContent, r: ModelRange): string | null {
  if (isApart(r)) return 'This slider is already posed apart: the other side has a slider of its own.'
  if (!r.drives.some(d => poseable(c, d))) return 'None of its drives turns or scales a group that has a twin.'
  if (c.ranges.length >= LIMITS.rangesMax) return `A model may have at most ${LIMITS.rangesMax} sliders.`
  return null
}

// The slider that poses the other side of this one: the one whose drives are on the twins of the groups this one drives (found by the groups, not by name).
export function otherSideOf(c: ModelContent, r: ModelRange): ModelRange | undefined {
  const mine = new Set(r.drives.filter(d => d.mirror === false).flatMap(d => (d.kind === 'turn' && d.group ? [d.group] : d.kind === 'scale' && d.id ? [d.id] : [])))
  if (mine.size === 0) return undefined
  const twins = new Set([...mine].flatMap(id => { const t = twinGroupOf(c, id); return t ? [t] : [] }))
  return c.ranges.find(x => x.id !== r.id && x.drives.some(d => (d.kind === 'turn' && d.group && twins.has(d.group)) || (d.kind === 'scale' && d.target === 'group' && d.id && twins.has(d.id))))
}

// The slider that poses the original side of this other-side slider, if it is one.
export const originalSideOf = (c: ModelContent, r: ModelRange): ModelRange | undefined => c.ranges.find(x => x.id !== r.id && isApart(x) && otherSideOf(c, x)?.id === r.id)

export function apartSlider(c: ModelContent, rangeId: string, make: MakeId = randomId): Edit & { rangeId?: string } {
  const r = c.ranges.find(x => x.id === rangeId)
  if (!r) return fail('There is no such slider.')
  const why = whyNotApart(c, r)
  if (why) return fail(why)
  const id = freshId(c, 'r', make)
  const copies: ModelDrive[] = []
  const drives = r.drives.map(d => {
    if (!poseable(c, d)) return d
    const twin = d.kind === 'turn' ? twinGroupOf(c, d.group!) : twinGroupOf(c, d.id!)
    copies.push(d.kind === 'turn' ? { ...d, group: twin!, mirror: true } : { ...d, id: twin!, mirror: true })
    return { ...d, mirror: false }
  })
  const scopeTwin = r.scope ? twinGroupOf(c, r.scope) : undefined
  const other: ModelRange = {
    ...r, id, name: `${r.name.trim().slice(0, 40 - OTHER.length)}${OTHER}`, scope: scopeTwin ?? r.scope, role: r.role ? `${r.role}~`.slice(0, 40) : null, drives: copies,
  }
  const at = c.ranges.findIndex(x => x.id === rangeId)
  const ranges = c.ranges.map(x => (x.id === rangeId ? { ...r, drives } : x))
  ranges.splice(at + 1, 0, other)
  // a shape that shows with the slider (a crease) shows on the twin with the other side's slider
  const fades = new Set(c.shapes.filter(s => s.opBy?.slider === rangeId).map(s => s.id))
  const shapes = fades.size === 0 ? c.shapes : c.shapes.map(s => (s.mirrorOf && fades.has(s.mirrorOf) && !s.opBy ? { ...s, opBy: { ...c.shapes.find(x => x.id === s.mirrorOf)!.opBy!, slider: id } } : s))
  const keeps = r.drives.some(d => !poseable(c, d))
  return { ...done({ ...c, ranges, shapes }, keeps ? 'What moves points or bends a shape still follows the original side.' : undefined), rangeId: id }
}

// Pose both sides together again: the other side's slider goes (and with it any preset value for it) and the drives mirror again.
export function joinSides(c: ModelContent, rangeId: string): Edit {
  const r = c.ranges.find(x => x.id === rangeId)
  if (!r) return fail('There is no such slider.')
  const other = isApart(r) ? otherSideOf(c, r) : originalSideOf(c, r) ? r : undefined
  const mine = isApart(r) ? r : originalSideOf(c, r)
  if (!mine || !other) return fail('This slider is not posed apart.')
  const gone = other.id
  const ranges = c.ranges.filter(x => x.id !== gone).map(x => (x.id === mine.id ? { ...x, drives: x.drives.map(d => (d.mirror === false ? { ...d, mirror: true } : d)) } : x))
  const presets = c.presets?.map(p => (gone in p.values ? { ...p, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => k !== gone)) } : p))
  const shapes = c.shapes.map(s => (s.opBy?.slider === gone ? { ...s, opBy: null } : s))
  return done({ ...c, ranges, ...(presets ? { presets } : {}), shapes })
}
