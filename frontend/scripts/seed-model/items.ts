// The held items of the seed model (phase 6c-3b): a staff, a crook, a crystal, a wand, a book (closed and open), a scroll (rolled and unrolled), a lantern, a torch, a candle, a
// goblet, a flower and a quill, as the old portrait engine drew them, in the hand of the mannequin.
//
// Each hand has an item of its own (an object with one axis of forms, hidden until one is chosen). It is in a group hung from the hand, so it goes where the hand goes; the group
// turns about the grip (a slider, "Item angle"), which a pose uses to keep the item upright whatever the arm does. The outlines are the old ones, moved so that every item's grip
// (the middle of the fist that held it) is at the same spot, which is the middle of the mannequin's palm, with a band of skin over the item for the fingers.
import type { ModelAxis, ModelContent, ModelForm, ModelGrip, ModelGroup, ModelObject, ModelPreset, ModelRange, ModelShape } from '../../src/api/types'
import { reflectList } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { apartSlider } from '../../src/assets/Interfaces/admin/characters/engine/sidesEdit'
import { drive, range } from './body'
import type { ExactData, ExactShape } from './exact'
import type { PartResult, PartSpec } from './face'
import { CHIN_Y, HS, type Exact } from './outline'

// Where a hand takes an item, in the mannequin's space with the arm hanging: the middle of the palm (the hand of the realistic body, phase O4b).
export const GRIP_REST = { x: 149.7, y: 208.5 }

// The old drawing's space, for a place in the mannequin's.
const toOld = (m: { x: number; y: number }): { x: number; y: number } => ({ x: 100 + (m.x - 100) / HS, y: 123 - (CHIN_Y - m.y) / HS })

const boxOf = (n: Exact): { x: number; y: number } => {
  const xs = n.map(p => p[0]), ys = n.map(p => p[1])
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}
// An outline moved by (dx, dy) and scaled by k about `at` (the handles with it).
const placed = (n: Exact, at: { x: number; y: number }, dx: number, dy: number, k: number): Exact =>
  n.map(p => [at.x + (p[0] + dx - at.x) * k, at.y + (p[1] + dy - at.y) * k, p[2], ...p.slice(3).map(v => (typeof v === 'number' ? v * k : v))] as Exact[number])

// Items are drawn a quarter larger than the portrait drew them (the mannequin's hand is larger against its head than the portrait's fist was), and none rises more than this far
// above the hand (a staff is held a good way up its shaft), so that an item held up beside the head stays inside the bust.
const SCALE = 1.25
const ABOVE_GRIP = 34

// An ellipse as four curve points (the fingers of a fist), and a box with rounded ends as a few: all about (cx, cy), in the old drawing's units.
const K = 0.5523
const oval = (cx: number, cy: number, w: number, h: number): Exact => [
  [cx, cy - h / 2, 'c', -w / 2 * K, 0, w / 2 * K, 0], [cx + w / 2, cy, 'c', 0, -h / 2 * K, 0, h / 2 * K],
  [cx, cy + h / 2, 'c', w / 2 * K, 0, -w / 2 * K, 0], [cx - w / 2, cy, 'c', 0, h / 2 * K, 0, -h / 2 * K],
]
const box = (x0: number, y0: number, x1: number, y1: number): Exact => [[x0, y0, 's'], [x1, y0, 's'], [x1, y1, 's'], [x0, y1, 's']]
const shape = (f: string, n: Exact, o = 1, c: ExactShape['c'] = null): ExactShape => ({ p: 'heldItem', f, o, c, n })

// The scroll unrolled (the old drawing has only the rolled one): the roll the hand holds at the top, the sheet hanging from it with lines of writing, and the roll at the bottom.
function unrolledScroll(gx: number, gy: number): ExactShape[] {
  const x = (v: number): number => gx + v, y = (v: number): number => gy + v
  const lines: ExactShape[] = [9, 19, 29, 39].map(dy => shape('#8a7a5a', box(x(-9), y(dy), x(dy === 39 ? 2 : 9), y(dy + 1.6))))
  return [
    shape('#e8dcc0', box(x(-12), y(0), x(12), y(54))),
    shape('#dac493', box(x(-15), y(-6), x(15), y(4))),
    ...lines,
    shape('#dac493', box(x(-15), y(53), x(15), y(62))),
  ]
}

// The old drawing used a tone for each of its shapes; the items share the shapes of one object, so the tones, the opacities and the dark inks are few (a shape of the same kind
// of paint is the same shape in the next item), and the colour of a torch's wrapping is the item's.
const OPACITIES = [0.2, 0.5, 0.8, 1]
const near = (v: number, set: number[]): number => set.reduce((a, b) => (Math.abs(b - v) <= Math.abs(a - v) ? b : a))
const TONES = [0.1, 0.2, 0.3, 0.5, 0.75]
function tidy(s: ExactShape): Pick<ExactShape, 'c' | 'o' | 'f'> {
  let c = s.c
  if (c && c[0] === 'hair') c = ['item', c[1], c[2]]
  if (c && (c[1] === 'shade' || c[1] === 'light')) c = [c[0], c[1], near(c[2], TONES)]
  // the dark inks (a torch's bands, a quill's tip) are one ink
  const f = /^#[0-3][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]$/i.test(s.f) ? '#241810' : s.f
  return { c, o: near(s.o, OPACITIES), f }
}
// The lines of writing on the open book: every other one is enough at this size.
const thinLines = (shapes: ExactShape[]): ExactShape[] => {
  let n = 0
  return shapes.filter(s => s.f.toLowerCase() !== '#8a7a5a' || n++ % 2 === 0)
}

// Sets the old held items up for the mannequin: the item shapes only (the hand and the sleeve are the mannequin's own), every item's grip at the palm, a band of skin for the
// fingers over each, the colour of a torch's wrapping as the item's, and the unrolled scroll beside the rolled one.
export function prepareItems(data: ExactData): void {
  const want = toOld(GRIP_REST)
  const used = data.options.heldItem.map(o => {
    if (o.shapes.length === 0) return o
    const fist = o.shapes.find(s => s.c?.[0] === 'skin' && s.c[1] === 'base')
    if (!fist) throw new Error(`the old ${o.id} has no hand to take the grip from`)
    const at = boxOf(fist.n), dx = want.x - at.x, dy = want.y - at.y
    const kept = o.shapes.filter(s => !(s.c && (s.c[0] === 'skin' || s.c[0] === 'top')))
    // the highest point of the item above the grip, in the mannequin's units once scaled, and how far to shift the item down the shaft to bring it under the limit
    const top = Math.min(...kept.flatMap(s => s.n.map(p => want.y + (p[1] + dy - want.y) * SCALE)))
    const lower = Math.max(0, ((want.y - top) * HS - ABOVE_GRIP) / HS)
    const shapes = kept.map(s => ({ ...s, ...tidy(s), n: placed(s.n, want, dx, dy, SCALE).map(p => [p[0], p[1] + lower, ...p.slice(2)] as Exact[number]) }))
    return { ...o, shapes: o.id === 'openbook' ? thinLines(shapes) : shapes }
  })
  const withFingers = used.map(o => (o.shapes.length === 0 ? o : { ...o, shapes: [...o.shapes, shape('#c8a58a', oval(want.x, want.y, 22, 12), 1, ['skin', 'base', 0])] }))
  const at = withFingers.findIndex(o => o.id === 'scroll')
  withFingers.splice(at + 1, 0, { id: 'openscroll', name: 'Unrolled scroll', shapes: [...unrolledScroll(want.x, want.y).map(sh => ({ ...sh, n: placed(sh.n, want, 0, 0, SCALE) })), shape('#c8a58a', oval(want.x, want.y, 22, 12), 1, ['skin', 'base', 0])] })
  data.options.heldUsed = withFingers
}

export const itemSpec = (side: 'L' | 'R'): PartSpec => ({
  part: 'heldItem', options: 'heldUsed', objectId: `item${side}`, objectName: `Held item (${side === 'L' ? 'left' : 'right'} hand)`, axisId: 'item', axisName: `Held item (${side === 'L' ? 'left' : 'right'} hand)`, defaultOption: 'none',
  z: 56, prefix: `item${side}`, layer: 'clothing', roll: 0, noPairs: true, coarse: true, tol: 0.15,
})

// The right hand's item is the left one's mirror image, with its own axis (the two hands hold what each is given).
export function mirrorItem(left: PartResult): PartResult {
  const rename = (id: string): string => id.replace(/^itemL/, 'itemR')
  const shapes: ModelShape[] = left.shapes.map(s => ({ ...s, id: rename(s.id), name: s.name.replace('(left hand)', '(right hand)'), pts: reflectList(s.pts, 100) }))
  const axes: ModelAxis[] = left.object.axes!.map(a => ({
    ...a, name: a.name.replace('(left hand)', '(right hand)'),
    options: a.options.map((f): ModelForm => ({ ...f, ovr: f.ovr.map(o => ({ shape: rename(o.shape), pts: o.pts.length > 0 ? reflectList(o.pts, 100) : [] })) })),
  }))
  const object: ModelObject = { ...left.object, id: 'itemR', name: left.object.name.replace('(left hand)', '(right hand)'), shapes: shapes.map(s => s.id), axes }
  return { ...left, shapes, object }
}

// The poses that hold a hand up beside the head: the upper arm raised a little and turned toward the viewer, the elbow bent as far as it goes, which brings the hand up beside the
// shoulder (the realistic arm is long: raised to the side, its elbow would leave the card), and the item turned back upright about the grip (the hand has turned by the arm and the
// elbow together; the item's angle turns the other way round to them).
const UP = { shoulder: 25, elbow: 150, armDepth: 75 }
export const HOLD_ANGLE = UP.shoulder + UP.elbow

export interface Items { shapes: ModelShape[]; objects: ModelObject[]; groups: ModelGroup[]; ranges: ModelRange[]; presets: ModelPreset[]; grips: ModelGrip[] }

export function itemParts(c: ModelContent, left: PartResult, right: PartResult): Items {
  const handR = c.groups.find(g => g.mirrorOf === 'handL')
  if (!handR) throw new Error('the right hand has no group')
  const side = (s: 'L' | 'R', hand: string, res: PartResult): { group: ModelGroup; range: ModelRange; grip: ModelGrip } => {
    const x = s === 'L' ? GRIP_REST.x : 200 - GRIP_REST.x
    return {
      group: { id: `hold${s}`, name: `Held item (${s === 'L' ? 'left' : 'right'} hand)`, parent: hand, objects: [res.object.id], pivot: [x, GRIP_REST.y], attach: null },
      range: range(`hold${s}`, `Item angle (${s === 'L' ? 'left' : 'right'} hand)`, `hold${s}`, -180, 0, 180, '°', [drive({ kind: 'turn', group: `hold${s}`, atMin: -180, atMax: 180, mirror: false })], { rand: [0, 0] }),
      grip: { id: `grip${s}`, name: `${s === 'L' ? 'Left' : 'Right'} hand`, group: hand, x, y: GRIP_REST.y, angle: 0 },
    }
  }
  const l = side('L', 'handL', left), r = side('R', handR.id, right)
  const preset = (id: string, name: string, values: Record<string, number>): ModelPreset => ({ id, name, kind: 'Pose', values, hidden: [] })
  return {
    shapes: [...left.shapes, ...right.shapes], objects: [left.object, right.object], groups: [l.group, r.group], ranges: [l.range, r.range], grips: [l.grip, r.grip],
    presets: [
      preset('pose_down', 'Arms down', {}),
      preset('pose_left_up', 'Left hand up', { shoulder: UP.shoulder, elbow: UP.elbow, armDepth: UP.armDepth, holdL: HOLD_ANGLE }),
      preset('pose_right_up', 'Right hand up', { shoulderR: UP.shoulder, elbowR: UP.elbow, armDepthR: UP.armDepth, holdR: -HOLD_ANGLE }),
      preset('pose_both_up', 'Both hands up', { shoulder: UP.shoulder, elbow: UP.elbow, armDepth: UP.armDepth, holdL: HOLD_ANGLE, shoulderR: UP.shoulder, elbowR: UP.elbow, armDepthR: UP.armDepth, holdR: -HOLD_ANGLE }),
    ],
  }
}

// The arm sliders, one for each side (an arm is posed alone: a hand holds up an item while the other hangs): the original slider keeps the left arm, a new "(other side)"
// slider has the right.
export function poseArmsApart(c: ModelContent): ModelContent {
  let next = c
  for (const [id, other, name] of [['shoulder', 'shoulderR', 'Arm raise'], ['elbow', 'elbowR', 'Elbow bend'], ['wrist', 'wristR', 'Wrist turn']] as const) {
    const e = apartSlider(next, id, () => other)
    if (!e.ok) throw new Error(`${id}: ${e.reason}`)
    next = e.content
    next = {
      ...next,
      ranges: next.ranges.map(r => (r.id === id ? { ...r, name: `${name} (left)` } : r.id === other ? { ...r, name: `${name} (right)` } : r)),
    }
  }
  return next
}
