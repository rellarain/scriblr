import type { ModelAttach, ModelContent, ModelGrip, ModelPoint, ModelPreset, ModelRange } from '../../../../../api/types'
import { KIND_MAX, NAME_MAX, addGroup, addObject, addShape, freshId, groupById, newGroup, randomId, shapeById, type MakeId } from '../modelContent'
import { apply, clamp, r2, type Box } from './geometry'
import { bakedPaint } from './colour'
import { newShape } from './edit'
import { freshFormId } from './formEdit'
import { LIMITS } from './limits'
import { makeTwin } from './pairEdit'
import { chainDepth, descendantsOf, solveAtRest, type Solved } from './rig'
import { addRange, addTurn, attachFromClick, attachGroup, done, fail, newRange, reparent, setPivot, type Edit } from './rigEdit'
import { apartSlider, isApart, twinGroupOf } from './sidesEdit'
import { autoSkin } from './skinEdit'

// Hands (phase 5c, rebuilt in phase O5): fingers and thumbs, the sliders that bend them, the starter hand poses and the grip points where a held item is taken.
// Everything here is the same data the rest of the designer edits (groups, objects, shapes, skin weights, sliders with Turn drives, presets), so a hand built by these
// tools can be reshaped, re-posed and re-wired by hand afterwards.
//
// A finger is ONE smooth shape bent over two joints: a joint group hung from the palm at the knuckle holds it, a second joint group hung from that one at the middle
// joint holds nothing, and the shape's points follow the palm near the knuckle and the second joint toward the tip (skin weights, given with Auto across each joint),
// so a curled finger bends like skin instead of breaking into pieces. Two joints keep the deepest chain of a body (pelvis, waist, chest, collarbone, upper arm,
// forearm, hand, two finger joints) within the limit of nine. Its Curl slider turns both joints toward the thumb side (the front view cannot show a finger folding
// toward the viewer, so a curl is a sideways bend). A hand is a palm with four fingers and a thumb; the thumb hangs from the palm's side edge, is built like a finger and
// has Swing, Curl and Across sliders. A slider carries a role (`curl-index`, `spread`...) so the starter poses can find it; the slider that poses the other hand's side
// has the same role with `~` added. When the arm has a twin, the hand is copied to the twin side and the sliders are made apart (the two hands are posed on their own).

export const HAND_ROLES = ['curl-index', 'curl-middle', 'curl-ring', 'curl-little', 'curl-thumb', 'spread', 'swing-thumb', 'oppose-thumb'] as const
export type HandRole = (typeof HAND_ROLES)[number]
export const isHandRole = (role: string | null | undefined): boolean => !!role && (HAND_ROLES as readonly string[]).includes(role.replace(/~$/, ''))
export type ThumbSide = 'left' | 'right'

const FINGERS: Array<{ name: string; role: HandRole; length: number; spread: number }> = [
  { name: 'Index finger', role: 'curl-index', length: 0.95, spread: 14 },
  { name: 'Middle finger', role: 'curl-middle', length: 1.05, spread: 5 },
  { name: 'Ring finger', role: 'curl-ring', length: 0.97, spread: -5 },
  { name: 'Little finger', role: 'curl-little', length: 0.8, spread: -14 },
]
// degrees each joint of a finger turns at full curl: the knuckle, then the middle joint (which stands for the two joints of a real finger's end)
const CURL = [80, 80]

const cut =(name: string) => name.trim().slice(0, NAME_MAX)

// ---- finding places ----

// The lowest shape of a group, as drawn at rest: its box, and the shape it is (the hand hangs from the bottom of it).
function lowestShape(c: ModelContent, rest: Solved, groupId: string): { id: string; box: Box } | null {
  const g = groupById(c, groupId)
  if (!g) return null
  let best: { id: string; box: Box } | null = null
  for (const oid of g.objects) {
    const o = c.objects.find(x => x.id === oid)
    for (const sid of o?.shapes ?? []) {
      const r = rest.shapes[sid]
      if (!r || r.pre.length < 3 || !r.visible) continue
      if (!best || r.box.y + r.box.h > best.box.y + best.box.h) best = { id: sid, box: { ...r.box } }
    }
  }
  return best
}

// The side of the picture the thumb is on for a hand at this x: toward the middle of the figure, as a hand hanging at the side shows it.
export function thumbSideAt(x: number, axis: number): ThumbSide {
  return x >= axis ? 'left' : 'right'
}

// ---- one part of a hand: a group with an object and a shape, hung from another ----

interface Made { c: ModelContent; groupId: string; shapeId: string; box: Box }
// A part is painted as the shape it hangs from (a hand is skin like the forearm it is on); the attach names that shape.
function addPart(c: ModelContent, make: MakeId, o: { name: string; parent: string; template: string; box: Box; attach: ModelAttach }): Made | string {
  if (c.groups.length >= LIMITS.groupsMax) return `A model may have at most ${LIMITS.groupsMax} groups.`
  if (c.objects.length >= LIMITS.objectsMax) return `A model may have at most ${LIMITS.objectsMax} objects.`
  if (c.shapes.length >= LIMITS.shapesMax) return `A model may have at most ${LIMITS.shapesMax} shapes.`
  const name = cut(o.name) || 'Part'
  const gid = freshId(c, 'g', make)
  let next = addGroup(c, newGroup(gid, name, o.parent))
  const oid = freshId(next, 'o', make)
  next = addObject(next, gid, { id: oid, name, layer: 'body', shapes: [] })
  const sid = freshId(next, 's', make)
  const from = shapeById(c, o.attach.shape), paint = from ? bakedPaint(c, from) : null
  next = addShape(next, oid, { ...newShape(sid, name, o.template, o.box), slot: paint?.slot ?? null, gray: paint?.gray ?? null })
  const hung = attachGroup(next, gid, o.attach)
  if (!hung.ok) return hung.reason
  return { c: hung.content, groupId: gid, shapeId: sid, box: o.box }
}

const insideBottom = (shape: string, rx = 0.5): ModelAttach => ({ shape, kind: 'inside', i: 0, t: 0, slider: null, rx, ry: 1 })

// ---- one finger or thumb: one shape over two joints ----

export interface DigitSpec {
  cx: number           // the middle of the knuckle, across
  base: number         // the knuckle, down (the first joint's pivot)
  length: number       // from the knuckle to the tip
  width: number        // at the knuckle
  overlap?: number     // how far the flat top reaches back into the palm (it is hidden under the same skin): a little more than half the width by default
  lean?: number        // degrees the whole digit is turned about its knuckle, positive toward the picture's left (as a turn drive turns); 0 hangs straight down
  joint?: number       // where the middle joint is, as a share of the length (0.55)
  roundTop?: boolean   // a round top instead of a flat one, for a digit whose top shows beside the palm (a thumb's base, the mound under it)
}

const turnAbout = (cx: number, cy: number, deg: number) => {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  return (x: number, y: number): [number, number] => [r2(cx + (x - cx) * cos - (y - cy) * sin), r2(cy + (x - cx) * sin + (y - cy) * cos)]
}

// A finger or a thumb as one smooth outline hanging from its knuckle: a flat top hidden inside the palm (or a round one), sides that narrow a little past the middle joint and toward
// the tip, and a round tip; and where its middle joint is (the second joint group's pivot). Two points sit either side of the middle joint, so the outline bends
// smoothly there.
export function digitOutline(d: DigitSpec): { pts: ModelPoint[]; joint: [number, number] } {
  const w = clamp(Number.isFinite(d.width) ? d.width : 4, 1, 40), L = clamp(Number.isFinite(d.length) ? d.length : 16, 2, 160)
  const top = d.base - clamp(d.overlap ?? w * 0.6, 0, L), jy = d.base + L * clamp(d.joint ?? 0.55, 0.2, 0.8), tip = d.base + L
  const turn = turnAbout(d.cx, d.base, Number.isFinite(d.lean) ? d.lean! : 0)
  const side: Array<[number, number]> = [[0.5, top], [0.5, d.base + L * 0.15], [0.47, jy - L * 0.12], [0.45, jy + L * 0.12], [0.41, tip - w * 0.45]]
  const point = (x: number, y: number, m: ModelPoint['m']): ModelPoint => { const [px, py] = turn(x, y); return { x: px, y: py, m, hi: null, ho: null } }
  const corner: ModelPoint['m'] = d.roundTop ? 'c' : 's'
  const pts: ModelPoint[] = [
    ...side.map(([k, y], i) => point(d.cx + k * w, y, i === 0 ? corner : 'c')),
    point(d.cx, tip, 'c'),
    ...[...side].reverse().map(([k, y], i, all) => point(d.cx - k * w, y, i === all.length - 1 ? corner : 'c')),
    ...(d.roundTop ? [point(d.cx, top - w * 0.3, 'c')] : []),
  ]
  return { pts, joint: turn(d.cx, jy) }
}

interface Digit { c: ModelContent; joints: [string, string]; shapeId: string }
// One finger or thumb: a joint group hung from the palm's group at the knuckle (by `attach`, or at the knuckle as a plain pivot), a second joint group hung from it
// at the middle joint (it holds nothing), and one shape in the first whose base follows the palm and whose tip follows the second joint (Auto across each joint).
// The shape is painted as the palm is (a finger is skin like the hand it is on).
function addDigit(c: ModelContent, make: MakeId, o: { name: string; parent: string; attach: ModelAttach | null; spec: DigitSpec; z: number; paintFrom: string }): Digit | string {
  if (c.groups.length + 2 > LIMITS.groupsMax) return `A model may have at most ${LIMITS.groupsMax} groups.`
  if (c.objects.length >= LIMITS.objectsMax) return `A model may have at most ${LIMITS.objectsMax} objects.`
  if (c.shapes.length >= LIMITS.shapesMax) return `A model may have at most ${LIMITS.shapesMax} shapes.`
  const name = cut(o.name) || 'Finger'
  const g1 = freshId(c, 'g', make)
  let next = addGroup(c, newGroup(g1, name, o.parent))
  if (o.attach) {
    const hung = attachGroup(next, g1, o.attach)
    if (!hung.ok) return hung.reason
    next = hung.content
  } else next = setPivot(next, g1, o.spec.cx, o.spec.base)
  const oid = freshId(next, 'o', make)
  next = addObject(next, g1, { id: oid, name, layer: 'body', shapes: [] })
  const sid = freshId(next, 's', make)
  const from = shapeById(c, o.paintFrom), paint = from ? bakedPaint(c, from) : null
  const { pts, joint } = digitOutline(o.spec)
  next = addShape(next, oid, { id: sid, name, closed: true, z: o.z, op: 1, view: 'both', pts, half: 0, template: null, slot: paint?.slot ?? null, gray: paint?.gray ?? null })
  const g2 = freshId(next, 'g', make)
  next = setPivot(addGroup(next, newGroup(g2, cut(`${name} tip`), g1)), g2, ...joint)
  const reach = clamp(o.spec.width * 0.6, 1, 10)
  for (const partner of [o.parent, g2]) {
    const e = autoSkin(next, sid, partner, reach)
    if (!e.ok) return e.reason
    next = e.content
  }
  return { c: next, joints: [g1, g2], shapeId: sid }
}

// The turn drives of a slider set to these amounts at its maximum (and nothing at its minimum): the slider must already exist.
function setTurns(c: ModelContent, rangeId: string, turns: Array<[string, number]>, atMin: number[] = []): Edit {
  let next = c
  turns.forEach(([gid], i) => {
    const e = addTurn(next, rangeId, gid)
    if (!e.ok) return
    next = e.content
    const amount = turns[i][1], low = atMin[i] ?? 0
    next = { ...next, ranges: next.ranges.map(r => (r.id === rangeId ? { ...r, drives: r.drives.map(d => (d.kind === 'turn' && d.group === gid ? { ...d, atMin: low, atMax: amount } : d)) } : r)) }
  })
  return done(next)
}

// A new slider listed under a group, with its role, driving the given groups.
function addSlider(c: ModelContent, make: MakeId, o: { name: string; role: HandRole | null; scope: string; min: number; max: number; unit: ModelRange['unit']; turns: Array<[string, number]>; atMin?: number[] }): Edit & { rangeId?: string } {
  const id = freshId(c, 'r', make)
  const range: ModelRange = { ...newRange(id, cut(o.name), 'turn', o.scope), min: o.min, rest: 0, max: o.max, unit: o.unit, role: o.role }
  const added = addRange(c, range)
  if (!added.ok) return added
  const turned = setTurns(added.content, id, o.turns, o.atMin)
  return turned.ok ? { ...turned, rangeId: id } : turned
}

// ---- a finger ----

export interface FingerOptions { name?: string; width?: number; length?: number; at?: number; role?: HandRole | null; curlSign?: 1 | -1 }
export interface FingerMade { joints: string[]; shapeId: string; rangeId: string }

// Hang a finger from the bottom of the lowest shape of a group (at a place along that shape's bottom, 0 to 1): one shape over two joints, with a Curl slider that
// turns both joints toward `curlSign` (1: toward the picture's left).
export function addFinger(c: ModelContent, parentGroupId: string, opts: FingerOptions = {}, make: MakeId = randomId): Edit & { finger?: FingerMade } {
  const parent = groupById(c, parentGroupId)
  if (!parent) return fail('There is no such group.')
  if (parent.mirrorOf) return fail('A twin follows its original: build the finger on the original group, and the twin gets a copy.')
  if (chainDepth(c, parentGroupId) + 2 > LIMITS.chainMax) return fail(`That would make a pivot chain ${chainDepth(c, parentGroupId) + 2} groups long; the most is ${LIMITS.chainMax}.`)
  if (c.ranges.length >= LIMITS.rangesMax) return fail(`A model may have at most ${LIMITS.rangesMax} sliders.`)
  const rest = solveAtRest(c), base = lowestShape(c, rest, parentGroupId)
  if (!base) return fail('Draw an outline in this group first: the finger hangs from the bottom of its lowest shape.')
  const width = clamp(opts.width ?? base.box.w * 0.22, 2, 20), length = clamp(opts.length ?? width * 4.2, 6, 120)
  const at = clamp(opts.at ?? 0.5, 0, 1), name = cut(opts.name ?? 'Finger') || 'Finger'
  const cx = base.box.x + base.box.w * at, knuckle = base.box.y + base.box.h
  // drawn just over the palm, so the knuckle is one skin
  const z = (shapeById(c, base.id)?.z ?? 40) + 0.02
  const digit = addDigit(c, make, { name, parent: parentGroupId, attach: insideBottom(base.id, at), spec: { cx, base: knuckle, length, width }, z, paintFrom: base.id })
  if (typeof digit === 'string') return fail(digit)
  const sign = opts.curlSign ?? 1
  // a finger with no role keeps none: the starter poses only look for the fingers of a hand
  const slider = addSlider(digit.c, make, {
    name: `${name} curl`, role: opts.role ?? null, scope: digit.joints[0], min: 0, max: 100, unit: '%',
    turns: digit.joints.map((g, k): [string, number] => [g, sign * CURL[k]]),
  })
  if (!slider.ok) return slider
  return { ...done(slider.content), finger: { joints: digit.joints, shapeId: digit.shapeId, rangeId: slider.rangeId! } }
}

// ---- a thumb ----

export interface ThumbOptions { side?: ThumbSide; width?: number; length?: number; at?: number }

// Hang a thumb from the side edge of the lowest shape of a group (the palm): one shape over two joints, like a finger, and the Swing, Curl and Across sliders.
// Its range is wider than a finger's: it swings out, folds across the palm and bends at the tip.
export function addThumb(c: ModelContent, palmGroupId: string, opts: ThumbOptions = {}, make: MakeId = randomId): Edit & { joints?: string[]; shapeId?: string } {
  const palm = groupById(c, palmGroupId)
  if (!palm) return fail('There is no such group.')
  if (palm.mirrorOf) return fail('A twin follows its original: build the thumb on the original group, and the twin gets a copy.')
  if (chainDepth(c, palmGroupId) + 2 > LIMITS.chainMax) return fail(`That would make a pivot chain ${chainDepth(c, palmGroupId) + 2} groups long; the most is ${LIMITS.chainMax}.`)
  if (c.ranges.length + 3 > LIMITS.rangesMax) return fail(`A thumb takes three sliders and a model may have at most ${LIMITS.rangesMax}.`)
  const rest = solveAtRest(c), base = lowestShape(c, rest, palmGroupId)
  if (!base) return fail('Draw an outline in this group first: the thumb hangs from the side of its shape.')
  const side = opts.side ?? thumbSideAt(base.box.x + base.box.w / 2, c.axis ?? 100)
  const out = side === 'left' ? 1 : -1                       // a positive turn leans toward the picture's left: toward the thumb, and away from the palm
  const width = clamp(opts.width ?? base.box.w * 0.27, 2, 24), length = clamp(opts.length ?? base.box.h * 0.95, 6, 120)
  const edgeX = side === 'left' ? base.box.x : base.box.x + base.box.w
  const y0 = base.box.y + base.box.h * clamp(opts.at ?? 0.3, 0.05, 0.9)
  const anchor = attachFromClick(rest, 'edge', base.id, ...apply(rest.global, edgeX, y0))
  if (!anchor) return fail('The palm has no edge to hang the thumb from.')
  const cx = edgeX - out * width * 0.3
  // it leans a little away from the palm, as a thumb at rest does, and is drawn just over the palm
  const z = (shapeById(c, base.id)?.z ?? 40) + 0.02
  const digit = addDigit(c, make, { name: 'Thumb', parent: palmGroupId, attach: anchor, spec: { cx, base: y0, length, width, overlap: width * 0.4, lean: out * 10, roundTop: true }, z, paintFrom: base.id })
  if (typeof digit === 'string') return fail(digit)
  const [base1, tip] = digit.joints
  let next = digit.c
  const specs: Array<Parameters<typeof addSlider>[2]> = [
    { name: 'Thumb swing', role: 'swing-thumb', scope: base1, min: -20, max: 40, unit: '°', turns: [[base1, out * 40]], atMin: [-out * 20] },
    { name: 'Thumb curl', role: 'curl-thumb', scope: base1, min: 0, max: 100, unit: '%', turns: [[base1, -out * 20], [tip, -out * 70]] },
    { name: 'Thumb across', role: 'oppose-thumb', scope: base1, min: 0, max: 100, unit: '%', turns: [[base1, -out * 45], [tip, -out * 15]] },
  ]
  for (const spec of specs) {
    const s = addSlider(next, make, spec)
    if (!s.ok) return s
    next = s.content
  }
  return { ...done(next), joints: [base1, tip], shapeId: digit.shapeId }
}

// ---- a whole hand ----

export interface HandMade { palm: string; fingers: string[][]; thumb: string[]; twin?: string }

// Everything the hand tool puts in the model counts against its limits, twice when the arm is twinned.
function handFits(c: ModelContent, twinned: boolean): string | null {
  // a palm, and two joint groups, one object and one shape for each finger and the thumb
  const k = twinned ? 2 : 1
  if (c.groups.length + 11 * k > LIMITS.groupsMax) return `A hand takes ${11 * k} groups and a model may have at most ${LIMITS.groupsMax}.`
  if (c.objects.length + 6 * k > LIMITS.objectsMax) return `A hand takes ${6 * k} objects and a model may have at most ${LIMITS.objectsMax}.`
  if (c.shapes.length + 6 * k > LIMITS.shapesMax) return `A hand takes ${6 * k} shapes and a model may have at most ${LIMITS.shapesMax}.`
  if (c.ranges.length + 8 * k > LIMITS.rangesMax) return `A hand takes ${8 * k} sliders and a model may have at most ${LIMITS.rangesMax}.`
  return null
}

// A palm with four fingers and a thumb (each one shape over two joints), and the sliders that bend them (a Curl for each finger and the thumb, the thumb's Swing and Across and
// a Spread for the fingers), hung from the bottom of the lowest shape of a group (the forearm). When the group has a twin, the twin gets a hand too and the
// sliders are made apart, so each hand is posed on its own.
export function addHand(c: ModelContent, forearmGroupId: string, opts: { side?: ThumbSide } = {}, make: MakeId = randomId): Edit & { hand?: HandMade } {
  const forearm = groupById(c, forearmGroupId)
  if (!forearm) return fail('There is no such group.')
  if (forearm.mirrorOf) return fail('A twin follows its original: build the hand on the original group, and the twin gets a copy.')
  const twinForearm = twinGroupOf(c, forearmGroupId)
  const tight = handFits(c, !!twinForearm)
  if (tight) return fail(tight)
  if (chainDepth(c, forearmGroupId) + 3 > LIMITS.chainMax) return fail(`That would make a pivot chain ${chainDepth(c, forearmGroupId) + 3} groups long; the most is ${LIMITS.chainMax}.`)
  const rest = solveAtRest(c), wrist = lowestShape(c, rest, forearmGroupId)
  if (!wrist) return fail('Draw an outline in this group first: the hand hangs from the bottom of its lowest shape.')
  const cx = wrist.box.x + wrist.box.w / 2, side = opts.side ?? thumbSideAt(cx, c.axis ?? 100)
  const pw = clamp(wrist.box.w * 1.15, 8, 44), ph = pw * 1.05
  const palmPart = addPart(c, make, { name: 'Hand', parent: forearmGroupId, template: 'rounded', box: { x: cx - pw / 2, y: wrist.box.y + wrist.box.h - 1, w: pw, h: ph }, attach: insideBottom(wrist.id) })
  if (typeof palmPart === 'string') return fail(palmPart)
  let next = palmPart.c
  const palm = palmPart.groupId
  // the fingers across the bottom of the palm, the index nearest the thumb
  const order = side === 'left' ? FINGERS : [...FINGERS].reverse()
  const sign = side === 'left' ? 1 : -1
  const fw = pw * 0.215
  const fingers: string[][] = []
  const curls: Array<[string, HandRole]> = []
  const bases: Record<string, string> = {}
  for (let i = 0; i < order.length; i++) {
    const f = order[i]
    const e = addFinger(next, palm, { name: f.name, role: f.role, width: fw, length: ph * f.length, at: (i + 0.5) / order.length, curlSign: sign }, make)
    if (!e.ok) return e
    next = e.content
    fingers.push(e.finger!.joints)
    curls.push([e.finger!.rangeId, f.role])
    bases[f.role] = e.finger!.joints[0]
  }
  const thumb = addThumb(next, palm, { side, width: fw * 1.25, length: ph * 0.95 }, make)
  if (!thumb.ok) return thumb
  next = thumb.content
  // the fingers spread: the index leans toward the thumb and the little finger away from it
  const spread = addSlider(next, make, {
    name: 'Finger spread', role: 'spread', scope: palm, min: 0, max: 100, unit: '%',
    turns: FINGERS.map((f): [string, number] => [bases[f.role], sign * f.spread]),
  })
  if (!spread.ok) return spread
  next = spread.content
  const hand: HandMade = { palm, fingers, thumb: thumb.joints! }
  if (!twinForearm) return { ...done(next), hand }
  // the other arm gets a hand too, hung from the twin forearm, and the sliders are made apart
  const twinned = makeTwin(next, 'group', palm, make)
  if (!twinned.ok) return twinned
  const twinPalm = twinGroupOf(twinned.content, palm)!
  const hung = reparent(twinned.content, twinPalm, twinForearm)
  if (!hung.ok) return hung
  const apart = apartHand(hung.content, palm, make)
  if (!apart.ok) return apart
  return { ...done(apart.content, apart.note), hand: { ...hand, twin: twinPalm } }
}

// ---- the two hands apart ----

// The sliders of a hand: those with a hand role that turn a group in the hand (the palm and everything hung from it).
export function handSliders(c: ModelContent, palmGroupId: string): ModelRange[] {
  const inHand = new Set([palmGroupId, ...descendantsOf(c, palmGroupId)])
  return c.ranges.filter(r => isHandRole(r.role) && r.drives.some(d => d.kind === 'turn' && d.group && inHand.has(d.group)))
}

// Pose the other hand apart: every hand slider of this palm gets a slider of its own for the twin hand (the starter poses then have a side each).
export function apartHand(c: ModelContent, palmGroupId: string, make: MakeId = randomId): Edit {
  if (!groupById(c, palmGroupId)) return fail('There is no such group.')
  if (!twinGroupOf(c, palmGroupId)) return fail('This hand has no twin: make a twin of the arm first.')
  let next = c
  let n = 0
  for (const r of handSliders(c, palmGroupId)) {
    if (isApart(next, next.ranges.find(x => x.id === r.id) ?? r)) continue
    const e = apartSlider(next, r.id, make)
    if (!e.ok) return e
    next = e.content; n++
  }
  return n > 0 ? done(next) : fail('The hand\'s sliders are posed apart already.')
}

// ---- the starter hand poses ----

// Each pose as the amount of each role, in percent of full curl (the thumb's swing in degrees). The seed model makes its own hand presets from these.
export const HAND_POSES: Array<{ name: string; values: Partial<Record<HandRole, number>> }> = [
  { name: 'Open', values: { spread: 70, 'swing-thumb': 30 } },
  { name: 'Fist', values: { 'curl-index': 100, 'curl-middle': 100, 'curl-ring': 100, 'curl-little': 100, 'curl-thumb': 80, 'oppose-thumb': 70 } },
  { name: 'Point', values: { 'curl-middle': 100, 'curl-ring': 100, 'curl-little': 100, 'curl-thumb': 60, 'oppose-thumb': 50 } },
  { name: 'Pinch', values: { 'curl-index': 45, 'curl-middle': 25, 'curl-ring': 15, 'curl-thumb': 30, 'oppose-thumb': 100 } },
  { name: 'Grip', values: { 'curl-index': 65, 'curl-middle': 70, 'curl-ring': 75, 'curl-little': 80, 'curl-thumb': 50, 'oppose-thumb': 60 } },
]
export const HAND_KIND = 'Hand'
export const HAND_KIND_OTHER = 'Hand (other side)'

// The slider of each role on one side of the model: the original side (a role) or the other side (the role with `~`), the first of each if the model has several.
export function slidersByRole(c: ModelContent, other: boolean, palmGroupId?: string): Partial<Record<HandRole, string>> {
  const inHand = palmGroupId ? new Set([palmGroupId, ...descendantsOf(c, palmGroupId)]) : null
  const twinHand = palmGroupId ? twinGroupOf(c, palmGroupId) : undefined
  const inTwin = twinHand ? new Set([twinHand, ...descendantsOf(c, twinHand)]) : null
  const out: Partial<Record<HandRole, string>> = {}
  for (const r of c.ranges) {
    if (!r.role || other !== r.role.endsWith('~')) continue
    const role = r.role.replace(/~$/, '') as HandRole
    if (!HAND_ROLES.includes(role) || out[role]) continue
    const scope = other ? inTwin : inHand
    if (scope && !r.drives.some(d => d.kind === 'turn' && d.group && scope.has(d.group))) continue
    out[role] = r.id
  }
  return out
}

// Add the starter poses (Open, Fist, Point, Pinch, Grip) as presets of kind Hand, from the sliders the model has; and, when the other hand has sliders of its own,
// the same poses as presets of kind "Hand (other side)", so each hand takes a pose on its own. A pose that is there already (same kind and name) is left alone.
export function addHandPoses(c: ModelContent, palmGroupId?: string, make: MakeId = randomId): Edit {
  const sides: Array<{ kind: string; ids: Partial<Record<HandRole, string>> }> = [
    { kind: HAND_KIND, ids: slidersByRole(c, false, palmGroupId) }, { kind: HAND_KIND_OTHER, ids: slidersByRole(c, true, palmGroupId) },
  ]
  const bends = (ids: Partial<Record<HandRole, string>>) => Object.keys(ids).some(role => role.startsWith('curl-'))
  if (!sides.some(s => bends(s.ids))) return fail('Add a hand or fingers first: the poses bend their Curl sliders.')
  let next = c
  let added = 0
  const have = (kind: string, name: string) => (next.presets ?? []).some(p => p.kind.toLowerCase() === kind.toLowerCase() && p.name.toLowerCase() === name.toLowerCase())
  for (const side of sides) {
    if (!bends(side.ids)) continue
    for (const pose of HAND_POSES) {
      if (have(side.kind, pose.name)) continue
      if ((next.presets ?? []).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
      const values: Record<string, number> = {}
      for (const [role, v] of Object.entries(pose.values)) { const id = side.ids[role as HandRole]; if (id && v) values[id] = v }
      const id = freshFormId((next.presets ?? []).map(p => p.id), 'p', make)
      const preset: ModelPreset = { id, name: pose.name, kind: side.kind.slice(0, KIND_MAX), values, hidden: [], scope: null, forms: {}, fall: null, grip: null }
      next = { ...next, presets: [...(next.presets ?? []), preset] }
      added++
    }
  }
  return added > 0 ? done(next) : fail('The starter hand poses are there already.')
}

// ---- grip points ----

const GRIP_STEP = 5
export const gripsOf = (c: ModelContent): ModelGrip[] => c.grips ?? []

// The grip's own group: where it is carried. The new grip sits in the middle of the group's lowest shape (the palm), pointing straight down.
export function addGrip(c: ModelContent, groupId: string, make: MakeId = randomId): Edit & { gripId?: string } {
  const g = groupById(c, groupId)
  if (!g) return fail('There is no such group.')
  const grips = gripsOf(c)
  if (grips.length >= LIMITS.gripsMax) return fail(`A model may have at most ${LIMITS.gripsMax} grip points.`)
  const rest = solveAtRest(c), shape = lowestShape(c, rest, groupId)
  if (!shape) return fail('Draw an outline in this group first: a grip point sits on the hand.')
  const id = freshId(c, 'k', make)
  let n = grips.length + 1
  const names = new Set(grips.map(x => x.name.toLowerCase()))
  while (names.has(`grip ${n}`) || (n === 1 && names.has('grip'))) n++
  const grip: ModelGrip = { id, name: n === 1 ? 'Grip' : `Grip ${n}`, group: groupId, x: r2(shape.box.x + shape.box.w / 2), y: r2(shape.box.y + shape.box.h * 0.6), angle: 0 }
  return { ...done({ ...c, grips: [...grips, grip] }), gripId: id }
}

const mapGrip = (c: ModelContent, id: string, change: (g: ModelGrip) => ModelGrip): ModelContent => ({ ...c, grips: gripsOf(c).map(g => (g.id === id ? change(g) : g)) })
export const renameGrip = (c: ModelContent, id: string, name: string): ModelContent => mapGrip(c, id, g => ({ ...g, name: cut(name) }))
export const moveGrip = (c: ModelContent, id: string, x: number, y: number): ModelContent =>
  mapGrip(c, id, g => ({ ...g, x: r2(clamp(Number.isFinite(x) ? x : g.x, -50, 250)), y: r2(clamp(Number.isFinite(y) ? y : g.y, -50, 450)) }))
export function stepGripAngle(c: ModelContent, id: string, dir: -1 | 1, big = false): ModelContent {
  return mapGrip(c, id, g => ({ ...g, angle: clamp(r2(g.angle + dir * GRIP_STEP * (big ? 3 : 1)), -180, 180) }))
}
export const setGripGroup = (c: ModelContent, id: string, groupId: string): Edit =>
  groupById(c, groupId) ? done(mapGrip(c, id, g => ({ ...g, group: groupId }))) : fail('There is no such group.')

// A grip leaves, and the poses that held with it let go.
export function removeGrip(c: ModelContent, id: string): ModelContent {
  return { ...c, grips: gripsOf(c).filter(g => g.id !== id), presets: c.presets?.map(p => (p.grip === id ? { ...p, grip: null } : p)) }
}

// The same grip on the other hand: at the mirror image of this one, on the twin of its group, pointing the other way.
export function mirrorGrip(c: ModelContent, id: string, make: MakeId = randomId): Edit & { gripId?: string } {
  const g = gripsOf(c).find(x => x.id === id)
  if (!g) return fail('There is no such grip point.')
  const twin = g.group ? twinGroupOf(c, g.group) : undefined
  if (!twin) return fail('The group this grip is on has no twin: make a twin of the hand first.')
  if (gripsOf(c).some(x => x.group === twin && Math.abs(x.y - g.y) < 0.01 && Math.abs(x.x - (2 * (c.axis ?? 100) - g.x)) < 0.01)) return fail('The other hand has this grip already.')
  const added = addGrip(c, twin, make)
  if (!added.ok) return added
  const axis = c.axis ?? 100
  return { ...done(mapGrip(added.content, added.gripId!, x => ({ ...x, name: cut(`${g.name} (other side)`), x: r2(clamp(2 * axis - g.x, -50, 250)), y: g.y, angle: clamp(-g.angle, -180, 180) }))), gripId: added.gripId }
}

// A pose holds with a grip (null: none).
export function setPresetGrip(c: ModelContent, presetId: string, gripId: string | null): Edit {
  if (gripId !== null && !gripsOf(c).some(g => g.id === gripId)) return fail('There is no such grip point.')
  if (!(c.presets ?? []).some(p => p.id === presetId)) return fail('There is no such preset.')
  return done({ ...c, presets: (c.presets ?? []).map(p => (p.id === presetId ? { ...p, grip: gripId } : p)) })
}

// Where a grip is now and the way a held item points: the point carried by its group, and the direction (0 = straight down, positive toward the picture's
// right) turned with the group, in the model's space (before the whole-model transform).
export function gripAt(solved: Solved, grip: ModelGrip): { x: number; y: number; angle: number } {
  const m = (grip.group ? solved.mats[grip.group] : undefined) ?? [1, 0, 0, 1, 0, 0]
  const [x, y] = apply(m, grip.x, grip.y)
  const a = (grip.angle * Math.PI) / 180
  const dx = Math.sin(a), dy = Math.cos(a)
  const tx = m[0] * dx + m[2] * dy, ty = m[1] * dx + m[3] * dy
  return { x, y, angle: r2((Math.atan2(tx, ty) * 180) / Math.PI) }
}

// Take hold of a grip for Reach: the point in its group's own frame, so the hand carries it as the arm moves.
export const gripGrab = (grip: ModelGrip): { groupId: string; local: [number, number] } | null => (grip.group ? { groupId: grip.group, local: [grip.x, grip.y] } : null)
