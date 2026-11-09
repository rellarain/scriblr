import type { ModelContent, ModelDrive, ModelGroup, ModelRange } from '../../../../../api/types'
import { IDENTITY, apply, clamp, inverse, type Mat } from './geometry'
import { amount, rangeById, solve, valueOf, type Solved, type Values, type View } from './rig'

// Posing the figure by dragging, in the designer. Every drag is the inverse of what a slider does: a turn drive turns a group about its pivot by an angle
// that depends on the slider, so the angle the pointer sweeps about the pivot tells which value the slider should have. The result is only new test values
// (nothing here changes the model): the sliders follow, and "Save as preset" keeps a pose. Pure and finite for any input, so it is tested in node.
//
// All points here are in the model's space (before the whole-model transform: the Height slider and the back view's flip), so `toModel` brings a pointer
// from the canvas into it first; a drag in the back view then sweeps the same angles as in the front view.

export type Point = [number, number]
export const toModel = (solved: Solved, wx: number, wy: number): Point => apply(inverse(solved.global), wx, wy)

const r2 = (v: number) => Math.round(v * 100) / 100
const angleOf = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI
const wrap = (deg: number) => { let d = deg % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d }

// ---- from an amount back to a slider value ----

// The slider value whose drive amount is `target`: the inverse of rig.amount, which is a straight line from `base` at rest to the drive's end at each end of
// the range. A target on the wrong side of the rest value (a drive that moves only one way) gives rest; one beyond the end gives the end. When both halves of
// the range can give the amount (a drive that moves the same way at both ends), the value nearer `near` is taken.
export function valueForAmount(r: ModelRange, d: ModelDrive, target: number, base = 0, near?: number): number {
  if (!Number.isFinite(target)) return r.rest
  // a half of the range gives the amount exactly when the amount lies between rest and that end; otherwise it only gets as close as the end
  const exact: number[] = [], short: number[] = []
  const up = d.atMax - base, down = d.atMin - base
  if (up !== 0) { const t = (target - base) / up; if (t >= 0) (t <= 1 ? exact : short).push(r.rest + clamp(t, 0, 1) * (r.max - r.rest)) }
  if (down !== 0) { const t = (target - base) / down; if (t >= 0) (t <= 1 ? exact : short).push(r.rest - clamp(t, 0, 1) * (r.rest - r.min)) }
  const candidates = exact.length > 0 ? exact : short
  if (candidates.length === 0) return r.rest
  const at = near !== undefined && Number.isFinite(near) ? near : r.rest
  const best = candidates.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a))
  return r2(clamp(best, r.min, r.max))
}

// ---- which slider a drag on a part moves ----

export interface Driver { range: ModelRange; drive: ModelDrive }
export type PoseTarget = { ok: true; group: ModelGroup; range: ModelRange; drive: ModelDrive } | { ok: false; reason: string }

// The turn drives of a group, in the order of the model's sliders.
export function turnDrivers(c: ModelContent, groupId: string): Driver[] {
  const out: Driver[] = []
  for (const range of c.ranges) for (const drive of range.drives) if (drive.kind === 'turn' && drive.group === groupId) out.push({ range, drive })
  return out
}

// The group that turns when a part of `groupId` is dragged: the group itself or the nearest one above it that has a Turn slider. A twin follows its original, so
// it cannot be posed, and nor can anything under it.
export function poseTarget(c: ModelContent, groupId: string | null | undefined): PoseTarget {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const seen = new Set<string>()
  let g = groupId ? byId.get(groupId) : undefined
  if (!g) return { ok: false, reason: 'This shape is in no group, so nothing turns it.' }
  while (g && !seen.has(g.id)) {
    seen.add(g.id)
    if (g.mirrorOf) return { ok: false, reason: 'This is a twin: it follows its original. Pose the original, or break the pair.' }
    const first = turnDrivers(c, g.id)[0]
    if (first) return { ok: true, group: g, range: first.range, drive: first.drive }
    g = g.parent ? byId.get(g.parent) : undefined
  }
  return { ok: false, reason: 'Nothing turns this part: give its group, or a group above it, a Turn slider in the Ranges tab.' }
}

// How far a group is turned now by all its turn drives together.
export function turnNow(c: ModelContent, groupId: string, values: Values): number {
  return turnDrivers(c, groupId).reduce((sum, d) => sum + amount(d.range, d.drive, valueOf(d.range, values)), 0)
}

// ---- turning a group about its pivot ----

export interface TurnDrag {
  groupId: string
  rangeId: string
  driveIndex: number
  pivot: Point
  // The angle of the pointer about the pivot at the last move, and how far it has swept since the drag began (not wrapped: a drag can go round).
  last: number
  swept: number
  start: Values
  ownStart: number
}

export function beginTurn(c: ModelContent, solved: Solved, values: Values, target: Extract<PoseTarget, { ok: true }>, pointer: Point): TurnDrag | null {
  const pivot = solved.pivots[target.group.id]
  if (!pivot) return null
  return {
    groupId: target.group.id, rangeId: target.range.id, driveIndex: target.range.drives.indexOf(target.drive), pivot, last: angleOf(pointer[0] - pivot[0], pointer[1] - pivot[1]), swept: 0,
    start: values, ownStart: amount(target.range, target.drive, valueOf(target.range, values)),
  }
}

// The slider's new value for the pointer's new place; the drag state carries the sweep on.
export function moveTurn(c: ModelContent, drag: TurnDrag, pointer: Point): { drag: TurnDrag; values: Values } {
  const range = rangeById(c, drag.rangeId), drive = range?.drives[drag.driveIndex]
  const dx = pointer[0] - drag.pivot[0], dy = pointer[1] - drag.pivot[1]
  if (!range || !drive || Math.hypot(dx, dy) < 1e-6) return { drag, values: drag.start }
  const now = angleOf(dx, dy)
  const swept = drag.swept + wrap(now - drag.last)
  const next = { ...drag, last: now, swept }
  return { drag: next, values: { ...drag.start, [range.id]: valueForAmount(range, drive, drag.ownStart + swept, 0, valueOf(range, drag.start)) } }
}

// ---- scaling a group ----

export interface ScaleDrag { groupId: string; rangeId: string; driveIndex: number; pivot: Point; toParent: Mat; axis: ModelDrive['axis']; startDist: number; startPercent: number; start: Values }

export const scaleDriver = (c: ModelContent, groupId: string): Driver | null => {
  for (const range of c.ranges) for (const drive of range.drives) if (drive.kind === 'scale' && drive.target === 'group' && drive.id === groupId) return { range, drive }
  return null
}

// The distance of a point from the pivot, in the parent's directions (a scale acts along its parent's axes): across, up and down, or both.
function reachFrom(drag: Pick<ScaleDrag, 'pivot' | 'toParent' | 'axis'>, p: Point): number {
  const [dx, dy] = apply(drag.toParent, p[0] - drag.pivot[0], p[1] - drag.pivot[1])
  return drag.axis === 'x' ? Math.abs(dx) : drag.axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy)
}

export function beginScale(c: ModelContent, solved: Solved, values: Values, groupId: string, pointer: Point): ScaleDrag | null {
  const group = c.groups.find(g => g.id === groupId), driver = scaleDriver(c, groupId), pivot = solved.pivots[groupId]
  if (!group || group.mirrorOf || !driver || !pivot) return null
  const parent = (group.parent ? solved.mats[group.parent] : undefined) ?? IDENTITY, inv = inverse(parent)
  const drag: ScaleDrag = {
    groupId, rangeId: driver.range.id, driveIndex: driver.range.drives.indexOf(driver.drive), pivot, toParent: [inv[0], inv[1], inv[2], inv[3], 0, 0], axis: driver.drive.axis,
    startDist: 0, startPercent: amount(driver.range, driver.drive, valueOf(driver.range, values), 100), start: values,
  }
  return { ...drag, startDist: reachFrom(drag, pointer) }
}

export function moveScale(c: ModelContent, drag: ScaleDrag, pointer: Point): Values {
  const range = rangeById(c, drag.rangeId), drive = range?.drives[drag.driveIndex]
  if (!range || !drive || drag.startDist < 1e-3) return drag.start
  const percent = drag.startPercent * (reachFrom(drag, pointer) / drag.startDist)
  return { ...drag.start, [range.id]: valueForAmount(range, drive, percent, 100, valueOf(range, drag.start)) }
}

// ---- sliding an anchor along an edge ----

// A group fixed along a side of a shape by a slider (anchor kind Range) slides when its anchor is dragged: the pointer's place along the edge is the value.
export function slideValue(c: ModelContent, solved: Solved, groupId: string, pointer: Point): { rangeId: string; value: number } | null {
  const g = c.groups.find(x => x.id === groupId), att = g?.attach
  if (!g || g.mirrorOf || !att || att.kind !== 'range' || !att.slider) return null
  const range = rangeById(c, att.slider), a = solved.shapes[att.shape]?.pre
  if (!range || !a || a.length < 2 || range.max <= range.min) return null
  const p0 = a[att.i % a.length], p1 = a[(att.i + 1) % a.length]
  const ex = p1.x - p0.x, ey = p1.y - p0.y, len2 = ex * ex + ey * ey
  if (len2 < 1e-9) return null
  const t = clamp(((pointer[0] - p0.x) * ex + (pointer[1] - p0.y) * ey) / len2, 0, 1)
  return { rangeId: range.id, value: r2(range.min + t * (range.max - range.min)) }
}

// ---- reaching: drag a hand or a foot and the limb bends ----

export const REACH_JOINTS = 4
const REACH_PASSES = 24
const REACH_TOLERANCE = 0.5

export interface ReachGrab { groupId: string; local: Point }

// Take hold of a point of a group: where the pointer is, in the group's own frame, so the point stays on the part as the limb moves.
export function grabPoint(solved: Solved, groupId: string, pointer: Point): ReachGrab {
  return { groupId, local: apply(inverse(solved.mats[groupId] ?? IDENTITY), pointer[0], pointer[1]) }
}

// The groups that can bend to bring the grabbed point to the target: from the grabbed group up through its parents, each with a Turn slider, at most four.
// The chain of a twin is empty (the original is the one to pose).
export function reachJoints(c: ModelContent, groupId: string, most = REACH_JOINTS): Array<Driver & { group: ModelGroup }> {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const out: Array<Driver & { group: ModelGroup }> = []
  const seen = new Set<string>()
  for (let g = byId.get(groupId); g && !seen.has(g.id) && out.length < most; g = g.parent ? byId.get(g.parent) : undefined) {
    seen.add(g.id)
    if (g.mirrorOf) return []
    const first = turnDrivers(c, g.id)[0]
    if (first) out.push({ ...first, group: g })
  }
  return out
}

export interface Reached { values: Values; error: number; passes: number }

// Cyclic coordinate descent: each joint, from the one nearest the grabbed point up to the root, turns by the angle that brings the grabbed point toward the
// target, held to its slider's range; a few passes settle the limb. A target out of reach leaves the limb stretched toward it. `view` is only for solving.
export function reach(c: ModelContent, values: Values, view: View, grab: ReachGrab, target: Point, opts: { joints?: number; passes?: number; tolerance?: number } = {}): Reached {
  const joints = reachJoints(c, grab.groupId, opts.joints ?? REACH_JOINTS)
  const passes = opts.passes ?? REACH_PASSES, tolerance = opts.tolerance ?? REACH_TOLERANCE
  const cur: Values = { ...values }
  const where = (): { s: Solved; end: Point } => { const s = solve(c, cur, view); return { s, end: apply(s.mats[grab.groupId] ?? IDENTITY, grab.local[0], grab.local[1]) } }
  let { s, end } = where()
  let error = Math.hypot(target[0] - end[0], target[1] - end[1]), done = 0
  if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) return { values: cur, error, passes: 0 }
  while (joints.length > 0 && error > tolerance && done < passes) {
    let moved = 0
    for (const j of joints) {
      const pivot = s.pivots[j.group.id]
      if (!pivot) continue
      const ax = end[0] - pivot[0], ay = end[1] - pivot[1], bx = target[0] - pivot[0], by = target[1] - pivot[1]
      if (Math.hypot(ax, ay) < 1e-6 || Math.hypot(bx, by) < 1e-6) continue
      const want = wrap(angleOf(bx, by) - angleOf(ax, ay))
      const before = amount(j.range, j.drive, valueOf(j.range, cur))
      const value = valueForAmount(j.range, j.drive, before + want, 0, valueOf(j.range, cur))
      const turned = amount(j.range, j.drive, value) - before         // what the slider actually allows
      moved = Math.max(moved, Math.abs(value - valueOf(j.range, cur)))
      cur[j.range.id] = value
      // the grabbed point goes round the pivot with the joint: carry it along, so the next joint sees where it has got to
      const a = (turned * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a)
      end = [pivot[0] + ax * cs - ay * sn, pivot[1] + ax * sn + ay * cs]
    }
    ;({ s, end } = where())
    error = Math.hypot(target[0] - end[0], target[1] - end[1])
    done++
    if (moved < 1e-4) break
  }
  return { values: cur, error, passes: done }
}
