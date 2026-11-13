import type { ModelContent, ModelRange, ModelShape } from '../../../../../api/types'
import { groupById, shapeById, updateShape } from '../modelContent'
import { boxOf, build, flatten, reflectList } from './geometry'
import { LIMITS } from './limits'
import { chainOf, pivotAtRest } from './rig'
import { done, fail, groupOfShape, type Edit } from './rigEdit'
import { autoWeights, copiedSkin, mirrorWeights, mirroredSkin, paintWeights, setWeights, smoothWeights, stepSkin, weightsOf } from './skin'

// The Skin tool of the Designer (phase O1): which group the selected shape's weights are painted for, and the edits the tool makes. Each edit returns the new content or why it
// cannot be made, like the rig's (rigEdit.ts).

const ownGroup = (c: ModelContent, shapeId: string): string | null => groupOfShape(c, shapeId) ?? null
const label = (c: ModelContent, gid: string) => groupById(c, gid)?.name.trim() || gid
const FULL = `A shape may follow at most ${LIMITS.skinMax} groups besides its own: clear one of them first.`

// Why the selected shape's weights cannot be painted, in words (null: they can). They are painted on the base outline, seen from the front.
export function skinBlocked(c: ModelContent, shapeId: string, view: 'front' | 'back', formEditing: boolean): string | null {
  const s = shapeById(c, shapeId)
  if (!s) return 'Pick a shape to paint its skin weights.'
  if (s.mirrorOf) return 'This is a twin: it is skinned as its original is. Paint the original.'
  if (s.copyOf && s.pts.length < 3) return 'This shape follows its pattern: paint the pattern, or give it an outline of its own.'
  if (s.pts.length < 3) return 'This shape has no outline to paint.'
  if (!ownGroup(c, shapeId)) return 'This shape is in no group, so it has nothing to follow: put its object in a group first.'
  if (view === 'back') return 'Skin weights are painted from the front: go back to the front view.'
  if (formEditing) return 'Skin weights are painted on the base outline: choose the default form to paint them.'
  return null
}

// The groups the shape's points may follow: every group but its own, those it already follows first.
export function partnersOf(c: ModelContent, shapeId: string): Array<{ id: string; name: string; followed: boolean }> {
  const s = shapeById(c, shapeId), own = ownGroup(c, shapeId)
  const followed = new Set((s?.skin ?? []).filter(k => k.w.some(w => w > 0)).map(k => k.g))
  return c.groups.filter(g => g.id !== own).map(g => ({ id: g.id, name: g.name.trim() || g.id, followed: followed.has(g.id) })).sort((a, b) => Number(b.followed) - Number(a.followed))
}

// The middle of the shapes of some groups at rest (null when they have none with an outline).
function restCentre(c: ModelContent, groupIds: Set<string>): [number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const g of c.groups) {
    if (!groupIds.has(g.id)) continue
    for (const oid of g.objects) for (const sid of c.objects.find(o => o.id === oid)?.shapes ?? []) {
      const s = shapeById(c, sid)
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
  }
  return x1 >= x0 ? [(x0 + x1) / 2, (y0 + y1) / 2] : null
}
const below = (c: ModelContent, id: string): Set<string> => new Set(c.groups.filter(g => chainOf(c, g.id).includes(id)).map(g => g.id))

// Where the shape's group and another meet at rest, when one hangs from the other: the pivot of the lower one, and which way the bone runs into the other's part (null when they
// are not on one chain).
export function jointBetween(c: ModelContent, own: string, other: string): { joint: [number, number]; toward: [number, number] } | null {
  const ownChain = chainOf(c, own), otherChain = chainOf(c, other)
  const otherIsBelow = otherChain.includes(own), otherIsAbove = ownChain.includes(other)
  if (!otherIsBelow && !otherIsAbove) return null
  const lower = groupById(c, otherIsBelow ? other : own)
  if (!lower) return null
  const joint = pivotAtRest(c, lower)
  // the far side: the other group and what hangs from it (below), or the other group without the branch the shape is on (above)
  const far = otherIsBelow ? below(c, other) : new Set([other])
  const near = otherIsBelow ? new Set([own]) : below(c, own)
  const a = restCentre(c, far), b = restCentre(c, near)
  // Toward a group below: toward its middle. Toward the group above: away from the middle of the shape's own side (the group above may hold much besides the joint, such as
  // garments that hang far below it, so its middle says little about which way it lies).
  const fromFar: [number, number] | null = a ? [a[0] - joint[0], a[1] - joint[1]] : null, fromNear: [number, number] | null = b ? [joint[0] - b[0], joint[1] - b[1]] : null
  const toward = otherIsBelow ? fromFar ?? fromNear : fromNear ?? fromFar
  return toward && Math.hypot(toward[0], toward[1]) > 1e-6 ? { joint, toward } : null
}

// The group the tool starts with for a shape: the first it already follows, else the group next to its own nearest to its points (a group hung from it, or the one it hangs from).
export function defaultPartner(c: ModelContent, shapeId: string): string | null {
  const s = shapeById(c, shapeId), own = ownGroup(c, shapeId)
  if (!s || !own) return null
  const first = (s.skin ?? []).find(k => k.w.some(w => w > 0) && groupById(c, k.g))
  if (first) return first.g
  const g = groupById(c, own)
  const near = [...c.groups.filter(x => x.parent === own), ...(g?.parent ? c.groups.filter(x => x.id === g.parent) : [])]
  let best: string | null = null, bd = Infinity
  for (const n of near) {
    const lower = n.parent === own ? n : g
    if (!lower) continue
    const [px, py] = pivotAtRest(c, lower)
    const d = Math.min(...s.pts.map(p => Math.hypot(p.x - px, p.y - py)))
    if (d < bd) { bd = d; best = n.id }
  }
  return best ?? c.groups.find(x => x.id !== own)?.id ?? null
}

// The slider that bends the joint between the shape's group and another (a turn of the lower one; a twin group with no slider of its own turns with its original's).
export function bendSlider(c: ModelContent, shapeId: string, other: string): ModelRange | null {
  const own = ownGroup(c, shapeId)
  if (!own) return null
  const otherIsBelow = chainOf(c, other).includes(own), otherIsAbove = chainOf(c, own).includes(other)
  if (!otherIsBelow && !otherIsAbove) return null
  const lower = otherIsBelow ? other : own
  const turning = (gid: string) => c.ranges.find(r => r.drives.some(d => d.kind === 'turn' && d.group === gid)) ?? null
  return turning(lower) ?? (groupById(c, lower)?.mirrorOf ? turning(groupById(c, lower)!.mirrorOf!) : null)
}

function withWeights(c: ModelContent, shapeId: string, group: string, w: number[], note?: string): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('That shape is not there.')
  const next = setWeights(s, group, w)
  if (!next) return fail(FULL)
  return done(updateShape(c, shapeId, () => next), note)
}

// One point's weight a tenth up or down.
export function stepPointSkin(c: ModelContent, shapeId: string, group: string, i: number, dir: -1 | 1): Edit {
  const s = shapeById(c, shapeId)
  if (!s || !s.pts[i]) return fail('That point is not there.')
  const w = weightsOf(s, group)
  w[i] = stepSkin(w[i], dir)
  return withWeights(c, shapeId, group, w)
}

// The points near the pointer painted to a weight while a drag lasts (null when the shape could not take another group).
export function paintSkin(c: ModelContent, shapeId: string, group: string, points: number[], value: number): ModelContent | null {
  const s = shapeById(c, shapeId)
  if (!s || points.length === 0) return c
  const next = setWeights(s, group, paintWeights(weightsOf(s, group), points, value))
  return next ? updateShape(c, shapeId, () => next) : null
}

// Weights made across the joint between the shape's group and the other: they rise from 0 to 1 over `reach` units along the bone, centred on the joint.
export function autoSkin(c: ModelContent, shapeId: string, group: string, reach: number): Edit {
  const s = shapeById(c, shapeId), own = ownGroup(c, shapeId)
  if (!s || !own) return fail('That shape is not in a group.')
  const j = jointBetween(c, own, group)
  if (!j) return fail(`Auto works across a joint: ${label(c, group)} neither hangs from this shape's group nor holds it. Choose a group next to it, or paint the weights.`)
  return withWeights(c, shapeId, group, autoWeights(s.pts, j.joint, j.toward, reach), `Weights for ${label(c, group)} rise across the joint over ${Math.round(reach * 2)} units.`)
}

// Each weight for the group eased toward its neighbours'.
export function smoothSkin(c: ModelContent, shapeId: string, group: string): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('That shape is not there.')
  return withWeights(c, shapeId, group, smoothWeights(weightsOf(s, group), s.closed))
}

// The weights on one side of the shape's outline (`side`: -1 left of the mirror line, 1 right) copied to the points that mirror them, for the group's twin (or the group itself
// when it has none: a group in the middle).
export function mirrorSkin(c: ModelContent, shapeId: string, group: string, side: -1 | 1): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('That shape is not there.')
  const g = groupById(c, group)
  const twin = g ? (c.groups.find(x => x.mirrorOf === g.id)?.id ?? g.mirrorOf ?? g.id) : group
  if (twin === ownGroup(c, shapeId)) return fail(`The twin of ${label(c, group)} is this shape's own group: there is nothing to copy the weights to.`)
  const into = mirrorWeights(s.pts, weightsOf(s, group), weightsOf(s, twin), side, c.axis ?? 100)
  return withWeights(c, shapeId, twin, into, twin === group ? undefined : `The other side follows ${label(c, twin)}.`)
}

// The weights of another shape (the one under it), as this shape's points would have them: the other's groups and the other's own group (see skin.ts copiedSkin). A twin is
// read as the mirror image of its original.
export function copySkin(c: ModelContent, toId: string, fromId: string): Edit {
  const to = shapeById(c, toId)
  let from = shapeById(c, fromId)
  if (!to || !from) return fail('That shape is not there.')
  if (toId === fromId) return fail('Pick another shape to copy the weights from.')
  const fromGroup = ownGroup(c, fromId)
  if (from.mirrorOf) {
    const orig = shapeById(c, from.mirrorOf)
    if (!orig) return fail('That twin has no original to read.')
    from = { ...orig, pts: reflectList(orig.pts, c.axis ?? 100), skin: mirroredSkin(c, orig.skin, null) } as ModelShape
  }
  if (from.pts.length < 3) return fail('That shape has no outline to copy from.')
  const skin = copiedSkin(to, ownGroup(c, toId), from, fromGroup)
  if (skin.length === 0) return fail(`${from.name.trim() || 'That shape'} is in this shape's own group and follows nothing else: there is nothing to copy.`)
  return done(updateShape(c, toId, s => ({ ...s, skin })), `Weights copied from ${shapeById(c, fromId)?.name.trim() || 'the shape'}: ${skin.map(k => label(c, k.g)).join(', ')}.`)
}

// The weights for the group taken away.
export function clearSkin(c: ModelContent, shapeId: string, group: string): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('That shape is not there.')
  if (!(s.skin ?? []).some(k => k.g === group)) return fail(`This shape does not follow ${label(c, group)}.`)
  return done(updateShape(c, shapeId, x => ({ ...x, skin: (x.skin ?? []).filter(k => k.g !== group) })))
}
