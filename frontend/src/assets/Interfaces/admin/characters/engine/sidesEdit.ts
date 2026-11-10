import type { ModelContent, ModelDrive, ModelRange } from '../../../../../api/types'
import { freshId, randomId, type MakeId } from '../modelContent'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// Posing the two sides apart (phases 5c and 6). A twin group follows its original: whatever a slider does to the original, the twin does mirrored. That is right
// for a measure of the body (a length, a size) and wrong for a pose (a wave, a pointing hand, one fist), so a **Turn drive moves only its own side** by default
// (`mirror: false`): the twin stays where it is until it has a slider of its own. **Pose the other side apart** gives the twin groups that slider: the drives of
// the slider that turn or scale a group that has a twin stop being followed, and a copy of them for the twin groups goes into a new slider, "<name> (other
// side)". The drawing stays mirrored (the twin shapes still follow their originals); only the pose is separate. Drives that move points or bend a shape still
// reach the twin shape through its original. In Pose mode, grabbing the twin makes its slider on the spot (`poseSides`).

const OTHER = ' (other side)'

export const twinGroupOf = (c: ModelContent, groupId: string): string | undefined => c.groups.find(g => g.mirrorOf === groupId)?.id

// The group a turn or a scale drive of a group moves.
const groupOfDrive = (d: ModelDrive): string | undefined => (d.kind === 'turn' ? d.group ?? undefined : d.kind === 'scale' && d.target === 'group' ? d.id ?? undefined : undefined)

// The drives of a slider that a twin could be posed apart from: a turn or a scale of a group that has a twin group.
const poseable = (c: ModelContent, d: ModelDrive): boolean => { const g = groupOfDrive(d); return !!g && !!twinGroupOf(c, g) }

// A drive of the original side that its twin does not follow.
const keepsApart = (c: ModelContent, d: ModelDrive): boolean => d.mirror === false && poseable(c, d)

// Whether the slider moves only its own side (it has such a drive), and whether its twins are moved by it as well (a pose that is made for both sides together).
export const movesOneSide = (c: ModelContent, r: ModelRange): boolean => r.drives.some(d => keepsApart(c, d))
export const movesBothSides = (c: ModelContent, r: ModelRange): boolean => r.drives.some(d => d.mirror !== false && poseable(c, d))

// Which slider poses the other side of which. A slider that keeps to its side is matched, in the order of the model's sliders, with the not yet claimed slider whose
// turns and scales are on exactly the twins of its groups (a slider that also drives something else on that side will do when there is no exact one; the name
// "<name> (other side)" decides between two that turn the same group). Matching by the groups and claiming each other-side slider once is what keeps two
// sliders that turn the same group (a thumb's Swing and Across) from sharing one other side. Remembered for the content it was worked out for.
const pairings = new WeakMap<ModelContent, Map<string, string>>()
function pairsOf(c: ModelContent): Map<string, string> {
  const known = pairings.get(c)
  if (known) return known
  const keysOf = (r: ModelRange): Set<string> => new Set(r.drives.flatMap(d => { const g = groupOfDrive(d); return g ? [`${d.kind}:${g}`] : [] }))
  const out = new Map<string, string>(), claimed = new Set<string>()
  for (const r of c.ranges) {
    const wanted = new Set(r.drives.filter(d => keepsApart(c, d)).map(d => `${d.kind}:${twinGroupOf(c, groupOfDrive(d)!)}`))
    if (wanted.size === 0) continue
    const named = `${r.name.trim().slice(0, 40 - OTHER.length)}${OTHER}`
    let best: ModelRange | undefined, bestScore = Infinity
    for (const x of c.ranges) {
      if (x.id === r.id || claimed.has(x.id)) continue
      const keys = keysOf(x)
      if (![...wanted].every(k => keys.has(k))) continue
      const score = (x.name === named ? 0 : 2) + (keys.size === wanted.size ? 0 : 1)
      if (score < bestScore) { best = x; bestScore = score }
    }
    if (best) { out.set(r.id, best.id); claimed.add(best.id) }
  }
  pairings.set(c, out)
  return out
}

// The slider that poses the other side of this one, if there is one.
export const otherSideOf = (c: ModelContent, r: ModelRange): ModelRange | undefined => { const id = pairsOf(c).get(r.id); return id ? c.ranges.find(x => x.id === id) : undefined }

// The slider that poses the original side of this other-side slider, if it is one.
export function originalSideOf(c: ModelContent, r: ModelRange): ModelRange | undefined {
  for (const [from, to] of pairsOf(c)) if (to === r.id) return c.ranges.find(x => x.id === from)
  return undefined
}

// Whether the slider is one of a pair posed apart (the original side or the other side): each side has its own slider.
export const isApart = (c: ModelContent, r: ModelRange): boolean => !!otherSideOf(c, r) || !!originalSideOf(c, r)

// Whether the slider moves its own side only and the other side has no slider yet.
export const oneSided = (c: ModelContent, r: ModelRange): boolean => movesOneSide(c, r) && !otherSideOf(c, r)

// Why a slider cannot be posed apart (null when it can).
export function whyNotApart(c: ModelContent, r: ModelRange): string | null {
  if (isApart(c, r)) return 'This slider is already posed apart: the other side has a slider of its own.'
  if (!r.drives.some(d => poseable(c, d))) return 'None of its drives turns or scales a group that has a twin.'
  if (c.ranges.length >= LIMITS.rangesMax) return `A model may have at most ${LIMITS.rangesMax} sliders.`
  return null
}

export function apartSlider(c: ModelContent, rangeId: string, make: MakeId = randomId): Edit & { rangeId?: string } {
  const r = c.ranges.find(x => x.id === rangeId)
  if (!r) return fail('There is no such slider.')
  const why = whyNotApart(c, r)
  if (why) return fail(why)
  // A slider that already moves only its own side splits just those drives; one that moves both sides splits every drive that turns or scales a group with a twin.
  const asked = movesOneSide(c, r)
  const copies: ModelDrive[] = []
  const drives = r.drives.map(d => {
    if (!poseable(c, d) || (asked && d.mirror !== false)) return d
    const twin = twinGroupOf(c, groupOfDrive(d)!)!
    copies.push(d.kind === 'turn' ? { ...d, group: twin, mirror: true } : { ...d, id: twin, mirror: true })
    return { ...d, mirror: false }
  })
  const id = freshId(c, 'r', make)
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

// Pose both sides together again: the other side's slider goes (and with it any preset value for it) and the drives mirror again. A slider that only moves its
// own side (the other side has no slider yet) simply starts moving both.
export function joinSides(c: ModelContent, rangeId: string): Edit {
  const r = c.ranges.find(x => x.id === rangeId)
  if (!r) return fail('There is no such slider.')
  const mate = otherSideOf(c, r)
  const original = mate ? undefined : originalSideOf(c, r)
  const mine = mate ? r : original
  const gone = mate?.id ?? (original ? r.id : undefined)
  if (!mine) {
    if (!movesOneSide(c, r)) return fail('This slider is not posed apart.')
    return done({ ...c, ranges: c.ranges.map(x => (x.id === r.id ? { ...x, drives: x.drives.map(d => (keepsApart(c, d) ? { ...d, mirror: true } : d)) } : x)) })
  }
  const ranges = c.ranges.filter(x => x.id !== gone).map(x => (x.id === mine.id ? { ...x, drives: x.drives.map(d => (d.mirror === false ? { ...d, mirror: true } : d)) } : x))
  const presets = c.presets?.map(p => (gone! in p.values ? { ...p, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => k !== gone)) } : p))
  const shapes = c.shapes.map(s => (s.opBy?.slider === gone ? { ...s, opBy: null } : s))
  return done({ ...c, ranges, ...(presets ? { presets } : {}), shapes })
}

// ---- one side each ----

// How many Turn drives of the model still turn a group and its twin together (a model made before a pose belonged to one side).
export const turnsTogether = (c: ModelContent): number => c.ranges.reduce((n, r) => n + r.drives.filter(d => d.kind === 'turn' && d.mirror !== false && poseable(c, d)).length, 0)

// Make every slider that turns a group that has a twin move only its own side. The twin stays where it was; the other side's slider is made when it is wanted
// (Pose mode makes it the moment that side is grabbed; "Pose the other side apart" makes it at once). Sliders that already have an other side are left as they are.
export function oneSideEach(c: ModelContent): Edit {
  let n = 0
  const ranges = c.ranges.map(r => {
    if (isApart(c, r) || !r.drives.some(d => d.kind === 'turn' && d.mirror !== false && poseable(c, d))) return r
    n++
    return { ...r, drives: r.drives.map(d => (d.kind === 'turn' && d.mirror !== false && poseable(c, d) ? { ...d, mirror: false } : d)) }
  })
  if (n === 0) return fail('Every slider that turns a group with a twin already moves only its own side.')
  return done({ ...c, ranges }, `${n} slider${n === 1 ? '' : 's'} now ${n === 1 ? 'moves' : 'move'} only ${n === 1 ? 'its' : 'their'} own side.`)
}

// ---- Pose mode: grab either side ----

const ownDrive = (c: ModelContent, groupId: string, kind: 'turn' | 'scale'): boolean =>
  c.ranges.some(r => r.drives.some(d => (kind === 'turn' ? d.kind === 'turn' && d.group === groupId : d.kind === 'scale' && d.target === 'group' && d.id === groupId)))

// The slider of the original side that keeps to its side and could give this twin group a slider of its own (null when the twin has one, follows its original
// or has no original with such a slider).
export function sideSliderFor(c: ModelContent, twinId: string, kind: 'turn' | 'scale'): ModelRange | null {
  const twin = c.groups.find(g => g.id === twinId)
  const original = twin?.mirrorOf ? c.groups.find(g => g.id === twin.mirrorOf && !g.mirrorOf) : undefined
  if (!twin || !original || ownDrive(c, twin.id, kind)) return null
  return c.ranges.find(r => !isApart(c, r) && r.drives.some(d => d.mirror === false && d.kind === kind && groupOfDrive(d) === original.id)) ?? null
}

// Give these twin groups the slider they lack: each one whose original has a slider that moves only that side gets the other side's slider from it. Returns the
// content and the new sliders' ids (none when nothing was needed or the model has no room).
export function poseSides(c: ModelContent, groupIds: string[], kind: 'turn' | 'scale', make: MakeId = randomId): { content: ModelContent; made: string[] } {
  let next = c
  const made: string[] = []
  for (const id of groupIds) {
    const r = sideSliderFor(next, id, kind)
    if (!r) continue
    const e = apartSlider(next, r.id, make)
    if (!e.ok || !e.rangeId) continue
    next = e.content
    made.push(e.rangeId)
  }
  return { content: next, made }
}
