import type { ModelBone, ModelBoneEnd, ModelContent } from '../../../../../api/types'
import { RANGE_NAME_MAX, freshId, randomId, type MakeId } from '../modelContent'
import { LIMITS } from './limits'
import { boneAtRest, boneEndAtRest, type Solved } from './rig'
import { done, fail, type Edit } from './rigEdit'

// The skeleton of measured lengths (phase 5a): a bone runs from the pivot of a group to the pivot of another group or to a point of a shape, and a slider's
// Length drive lengthens it. The measures here are in the model's own space, before the whole-model Height, so they read the same from the front and the back.
// The edit operations return new content (or why they cannot) and leave the content they were given alone.

const dist = (a: [number, number], b: [number, number]): number => Math.hypot(b[0] - a[0], b[1] - a[1])
const bonesOf = (c: ModelContent): ModelBone[] => c.bones ?? []
const cleanName = (name: string): string => name.trim().slice(0, RANGE_NAME_MAX)
export const boneById = (c: ModelContent, id: string): ModelBone | undefined => bonesOf(c).find(b => b.id === id)
export const boneLabel = (b: Pick<ModelBone, 'name' | 'id'>): string => b.name || b.id

// ---- measures ----

// Where a bone is now: the pivot of its group and its end, as the rig has put them (null when either is not there).
export function boneEnds(solved: Solved, b: ModelBone): { a: [number, number]; b: [number, number] } | null {
  const a = solved.pivots[b.start]
  const p = b.end.kind === 'group' ? solved.pivots[b.end.id] : solved.shapes[b.end.id]?.pre[b.end.i]
  const end: [number, number] | null = !p ? null : Array.isArray(p) ? p : [p.x, p.y]
  return a && end ? { a, b: end } : null
}

// How long a bone is now, and how long it is at rest, in the model's units (null when it cannot be found).
export function boneLength(solved: Solved, b: ModelBone): number | null {
  const e = boneEnds(solved, b)
  return e ? dist(e.a, e.b) : null
}
export function restLength(c: ModelContent, b: ModelBone): number | null {
  const e = boneAtRest(c, b)
  return e ? dist(e.a, e.b) : null
}

// How tall the figure stands as drawn, in the model's units (what is drawn now, with the whole-model Height taken out).
export function figureHeight(solved: Solved): number {
  let y0 = Infinity, y1 = -Infinity
  for (const id of solved.order) {
    const s = solved.shapes[id]
    if (!s || s.box.h <= 0) continue
    y0 = Math.min(y0, s.box.y); y1 = Math.max(y1, s.box.y + s.box.h)
  }
  const gy = Math.abs(solved.global[3]) || 1
  return y1 > y0 ? (y1 - y0) / gy : 0
}

// The head bone's length now, or null when no bone is the head (or it cannot be found, or has no length).
export function headLength(c: ModelContent, solved: Solved): number | null {
  const b = c.headBone ? boneById(c, c.headBone) : undefined
  const len = b ? boneLength(solved, b) : null
  return len && len > 1e-6 ? len : null
}

// How many head bones tall the figure is (null with no head bone).
export function headHeights(c: ModelContent, solved: Solved): number | null {
  const head = headLength(c, solved), height = figureHeight(solved)
  return head && height > 0 ? height / head : null
}

export interface Measure { id: string; name: string; length: number | null; rest: number | null; percent: number | null; heads: number | null }

// Every bone's length in units, in head bones, and as a percent of its length at rest.
export function measures(c: ModelContent, solved: Solved): Measure[] {
  const head = headLength(c, solved)
  return bonesOf(c).map(b => {
    const length = boneLength(solved, b), rest = restLength(c, b)
    return {
      id: b.id, name: boneLabel(b), length, rest,
      percent: length != null && rest != null && rest > 1e-6 ? (length / rest) * 100 : null,
      heads: length != null && head ? length / head : null,
    }
  })
}

// ---- editing ----

// Why a bone's two ends are not acceptable, or null: the start is the pivot of an original group; the end is the pivot of another group or a point that a
// shape has of its own.
function endFault(c: ModelContent, start: string, end: ModelBoneEnd): string | null {
  const g = c.groups.find(x => x.id === start)
  if (!g) return 'The bone starts at a group that is not there.'
  if (g.mirrorOf) return 'A bone starts at an original group, not a twin: its twin follows it.'
  if (end.kind === 'group') {
    if (!c.groups.some(x => x.id === end.id)) return 'The bone ends at a group that is not there.'
    if (end.id === start) return 'A bone runs between two places: pick another group for its end.'
    return null
  }
  const s = c.shapes.find(x => x.id === end.id)
  if (!s) return 'The bone ends at a shape that is not there.'
  if (!s.pts[end.i]) return s.mirrorOf ? 'That shape is a twin and has no points of its own: pick a point on the original.' : 'That point is not there.'
  return null
}

const mapBone = (c: ModelContent, id: string, change: (b: ModelBone) => ModelBone): ModelContent => ({ ...c, bones: bonesOf(c).map(b => (b.id === id ? change(b) : b)) })
const sameEnd = (a: ModelBoneEnd, b: ModelBoneEnd): boolean => a.kind === b.kind && a.id === b.id && (a.kind === 'group' || a.i === b.i)

// A new bone from the pivot of a group to the pivot of another group or to a point of a shape. The first bone added becomes the head bone only when the admin
// says so; there is no head until then.
export function addBone(c: ModelContent, start: string, end: ModelBoneEnd, name = 'Bone', make: MakeId = randomId): Edit & { boneId?: string } {
  if (bonesOf(c).length >= LIMITS.bonesMax) return fail(`A model may have at most ${LIMITS.bonesMax} bones.`)
  const why = endFault(c, start, end)
  if (why) return fail(why)
  if (bonesOf(c).some(b => b.start === start && sameEnd(b.end, end))) return fail('There is a bone between those two places already.')
  const here = boneAtRest(c, { id: '', name: '', start, end })
  const id = freshId(c, 'b', make)
  const bone: ModelBone = { id, name: cleanName(name) || 'Bone', start, end: { kind: end.kind, id: end.id, i: end.kind === 'point' ? Math.max(0, Math.round(end.i)) : 0 } }
  const edit = done({ ...c, bones: [...bonesOf(c), bone] }, here && dist(here.a, here.b) < 0.5 ? 'The two places are on top of each other: the bone has no length.' : undefined)
  return { ...edit, boneId: id }
}

export function renameBone(c: ModelContent, id: string, name: string): ModelContent {
  return mapBone(c, id, b => ({ ...b, name: cleanName(name) }))
}

// A bone starts somewhere else (the pivot of another original group).
export function setBoneStart(c: ModelContent, id: string, start: string): Edit {
  const b = boneById(c, id)
  if (!b) return fail('There is no such bone.')
  const why = endFault(c, start, b.end)
  return why ? fail(why) : done(mapBone(c, id, x => ({ ...x, start })))
}

// A bone ends somewhere else (the pivot of another group, or a point of a shape).
export function setBoneEnd(c: ModelContent, id: string, end: ModelBoneEnd): Edit {
  const b = boneById(c, id)
  if (!b) return fail('There is no such bone.')
  const why = endFault(c, b.start, end)
  return why ? fail(why) : done(mapBone(c, id, x => ({ ...x, end: { kind: end.kind, id: end.id, i: end.kind === 'point' ? Math.max(0, Math.round(end.i)) : 0 } })))
}

// Delete a bone, and the Length drives of sliders that lengthened it; the head bone is cleared when it was this one. Returns the names of the sliders that
// lost a drive.
export function removeBone(c: ModelContent, id: string): { content: ModelContent; sliders: string[] } {
  const sliders: string[] = []
  const ranges = c.ranges.map(r => {
    if (!r.drives.some(d => d.kind === 'length' && d.id === id)) return r
    sliders.push(r.name || r.id)
    return { ...r, drives: r.drives.filter(d => !(d.kind === 'length' && d.id === id)) }
  })
  return { content: { ...c, bones: bonesOf(c).filter(b => b.id !== id), headBone: c.headBone === id ? null : c.headBone ?? null, ranges: sliders.length ? ranges : c.ranges }, sliders }
}

// The bone whose length is the unit for head heights (or none).
export function setHeadBone(c: ModelContent, id: string | null): Edit {
  if (id !== null && !boneById(c, id)) return fail('There is no such bone.')
  return done({ ...c, headBone: id })
}

// Where a bone's end is at rest, for the canvas to mark it (null when it cannot be found).
export const endPlace = (c: ModelContent, b: ModelBone): [number, number] | null => boneEndAtRest(c, b.end)
