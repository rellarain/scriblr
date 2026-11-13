// The body of the seed model (phase O4b): a realistic adult seven and a half heads tall. Only the head, the face and the hair follow the old portrait; the body is drawn from
// anatomy (an artist's mannequin): a smooth outline of skin for each segment (neck, chest, pelvis, arm, hand, leg, foot, toes) whose points near a joint follow both segments
// (skin weights, given in build.ts with the engine's Auto), joints as on an anatomical mannequin (pelvis, waist, chest, neck, head, collarbone, shoulder, elbow, wrist, hip,
// knee, ankle, toes), one-light shading that follows the skin, the sliders, and the bones. The left side is built and then given a twin.
import type { ModelBind, ModelBone, ModelContent, ModelDrive, ModelGroup, ModelObject, ModelPoint, ModelPointMode, ModelRange, ModelShape } from '../../src/api/types'
import { symmetric } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { makeTwin } from '../../src/assets/Interfaces/admin/characters/engine/pairEdit'
import type { MakeId } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { CHIN_Y } from './outline'

const r2 = (v: number): number => Math.round(v * 100) / 100

// ---- proportions ----

// One head (crown to chin) in model units, and where the crown is: the feet stand at 392, seven and a half heads below it.
export const HEAD = 54
export const CROWN_Y = CHIN_Y - HEAD
export const heads = (u: number): number => r2(CROWN_Y + u * HEAD)
// The landmarks of the canon (heads from the crown), which run.ts reports against the figure as drawn.
export const LANDMARKS: Record<string, number> = {
  chin: heads(1), pit: heads(1.33), nipples: heads(2), elbow: heads(2.9), navel: heads(3), crotch: heads(3.75), wrist: heads(3.8), fingertips: heads(4.55), knees: heads(5.5), ankles: heads(7.2), soles: heads(7.5),
}

// ---- helpers ----

type XY = [number, number, ModelPointMode?]
const P = ([x, y, m]: XY): ModelPoint => ({ x, y, m: m ?? 'c', hi: null, ho: null })
const sym = (half: XY[]): ModelPoint[] => symmetric(half.map(P), 100)
const list = (pts: XY[]): ModelPoint[] => pts.map(P)
const skin = (id: string, name: string, z: number, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape =>
  ({ id, name, closed: true, z, op: 1, view: 'both', pts, half: 0, template: null, slot: 'k_skin', ...over })

// A point that follows the nearest point of a skin, at the offset it has from it at rest (a shading shape follows the pose and the shape sliders through it, and takes the skin's
// weights: see rig.ts, links to a skinned shape).
export interface Anchor { s: string; i: number; x: number; y: number }
export const anchorsOfShapes = (shapes: ModelShape[], ids: string[]): Anchor[] => ids.flatMap(sid => shapes.find(s => s.id === sid)!.pts.map((p, i) => ({ s: sid, i, x: p.x, y: p.y })))
export function followNearest(anchors: Anchor[], x: number, y: number, mode: ModelPointMode = 'c'): ModelPoint {
  let best = anchors[0], bd = Infinity
  for (const a of anchors) {
    const d = Math.hypot(a.x - x, a.y - y)
    if (d < bd - 1e-9) { bd = d; best = a }
  }
  const bind: ModelBind = { kind: 'point', s: best.s, i: best.i, d: [r2(x - best.x), r2(y - best.y)], e: 0, t: 0, o: 0 }
  return { x: r2(x), y: r2(y), m: mode, hi: null, ho: null, bind }
}

// A shape of the mockup's model as the app's shape (the hair and the clothes still read a few of the mockup's shapes). `z` may be moved.
function bindOf(b: any): ModelBind {
  if (b.e !== undefined) return { kind: 'edge', s: b.s, i: 0, d: [0, 0], e: b.e, t: r2(b.t), o: r2(b.o), ...(b.tan ? { tan: true } : {}) }
  return { kind: 'point', s: b.s, i: b.i, d: [r2(b.d[0] + (b.n?.[0] ?? 0)), r2(b.d[1] + (b.n?.[1] ?? 0))], e: 0, t: 0, o: 0 }
}
function pointOf(p: any): ModelPoint {
  const q: ModelPoint = { x: r2(p.x), y: r2(p.y), m: p.m, hi: p.hi ? [r2(p.hi[0]), r2(p.hi[1])] : null, ho: p.ho ? [r2(p.ho[0]), r2(p.ho[1])] : null }
  if (p.w) q.w = p.w
  if (p.bind) q.bind = bindOf(p.bind)
  return q
}
export function shapeOf(mock: any, id: string, over: Partial<ModelShape> = {}): ModelShape {
  const s = mock.shapes[id]
  if (!s) throw new Error(`the mockup has no shape ${id}`)
  return { id, name: s.name, closed: true, z: s.z, op: s.op ?? 1, view: 'both', pts: s.pts.map(pointOf), half: s.half ?? 0, slot: 'k_skin', ...(s.tone ? { tone: s.tone } : {}), ...over }
}

// ---- the skins (left side: the character's left, the picture's right) ----

const NECK = sym([[100, 26], [108.5, 27.5], [111, 36], [111, 46], [113, 53], [118, 59], [100, 63]])
// the chest from the base of the neck along the trapezius to the shoulder, down the side past the armpit to the waist
export const CHEST_HALF: XY[] = [[100, 53.5], [112, 54], [126, 59.5], [138, 63.2], [144.5, 66.2], [146, 75], [140.5, 84], [138, 97], [135.5, 114], [132, 131], [130.5, 146], [131, 156], [100, 158]]
// the pelvis from the waist over the hips to the crotch
export const PELVIS_HALF: XY[] = [[100, 141], [130.5, 142], [133, 157], [137.5, 171], [139, 183], [137, 193], [119, 197], [105, 192], [100, 190.5]]
// the arm, round from the top of the shoulder: over the deltoid, down the outside past the elbow and the swell of the forearm to the wrist, and up the inside to the armpit
export const ARM: XY[] = [
  [127, 61.5], [138, 64.2], [146.5, 66.8], [152, 72.5], [153.5, 84], [152.5, 98], [152.5, 113], [152, 128], [151.5, 139], [152.5, 148.5], [154.5, 159], [155.5, 172], [154.5, 184], [155.5, 193],
  [149.5, 196], [143.5, 193.5], [142.5, 183], [140.5, 168], [138.5, 155], [139, 146], [138, 133], [136, 116], [136, 99], [137.5, 87], [133, 76],
]
// the leg, round from the top of the thigh: down the outside past the knee and the calf to the ankle, and up the inside to the crotch
export const LEG: XY[] = [
  [101, 176], [120, 172], [136.5, 177], [139.5, 190], [139, 210], [136, 235], [131.5, 257], [126, 273], [124.5, 285], [125.5, 297], [127.5, 312], [126, 333], [121.5, 355], [119.5, 368], [119, 377],
  [111.5, 381], [104.5, 377.5], [104, 368], [104.5, 350], [103, 324], [102.5, 300], [101.5, 286], [102, 270], [101.5, 248], [101, 215], [100.5, 194],
]
// seen from the front, the foot is short: the instep under the ankle widening to the toes
const FOOT: XY[] = [[104.5, 370], [119, 370], [121.5, 379], [123.5, 387], [121.5, 392], [104.5, 392.5], [102, 388], [102.5, 379]]
const TOES: XY[] = [[104, 384.5], [122, 384.5], [123.5, 388], [121.5, 392.2], [104.5, 392.6], [102.2, 388.5]]

// The joints (pivots), left side.
export const JOINTS = {
  pelvis: [100, 168], waist: [100, 146], chest: [100, 122], neck: [100, 60], head: [100, CHIN_Y], collar: [104, 58],
  shoulder: [139, 71], elbow: [146, 144.5], wrist: [149.5, 192.5], hip: [119.5, 181], knee: [113, 285], ankle: [111.5, 376], ball: [112.5, 385],
} satisfies Record<string, [number, number]>

// The hand stays the mockup's mitten (five fingers come in phase O5), moved to the new wrist and made a hand three quarters of a head long.
function handFrom(mock: any, id: string, z: number): ModelShape {
  const s = mock.shapes[id]
  if (!s) throw new Error(`the mockup has no shape ${id}`)
  const kx = 1.15, ky = 1.27, [wx, wy] = JOINTS.wrist
  const pts: ModelPoint[] = s.pts.map((p: any) => ({
    x: r2(wx + (p.x - 148.8) * kx), y: r2(wy + (p.y - 198) * ky), m: p.m,
    hi: p.hi ? [r2(p.hi[0] * kx), r2(p.hi[1] * ky)] : null, ho: p.ho ? [r2(p.ho[0] * kx), r2(p.ho[1] * ky)] : null,
  }))
  return skin(id, s.name, z, pts)
}

// The one-light shading of the skin (light from the upper left): under the jaw and the far side of the neck, the far side of the torso (one shadow down the chest and the pelvis),
// the inside of each arm and leg. Every point follows the skin it lies on.
function shading(shapes: ModelShape[]): ModelShape[] {
  const on = (ids: string[], pts: XY[]) => { const a = anchorsOfShapes(shapes, ids); return pts.map(([x, y, m]) => followNearest(a, x, y, m ?? 'c')) }
  const shade = (id: string, name: string, z: number, t: number, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => skin(id, name, z, pts, { shade: { kind: 'shadow', t }, ...over })
  return [
    shade('neckShade', 'Shadow under the jaw', 21.55, 0.12, on(['neck'], [[100, 30], [107, 31], [110.5, 35], [108, 40.5], [100, 42.5], [92, 40.5], [89.5, 35], [93, 31]])),
    shade('neckSide', 'Far side of the neck', 21.56, 0.07, on(['neck'], [[107, 40], [111.5, 40], [112, 50], [114.5, 55], [110, 55], [108, 49]])),
    shade('torsoShade', 'Far side of the torso', 22.05, 0.08, on(['chest', 'pelvis'], [[131, 92], [146, 88], [146, 145], [141, 196], [131, 196], [128.5, 170], [128.5, 140], [130, 112]]), { over: ['pelvis'] }),
    shade('armShadeL', 'Inside of the arm', 31.21, 0.08, on(['uarmL'], [
      [136, 100], [138.5, 100], [139.5, 116], [140.5, 133], [141.5, 146], [141, 156], [143, 170], [145, 186], [143.5, 192], [141.5, 184], [139.5, 168], [137.8, 155], [138.2, 146], [137.2, 133], [135.8, 116],
    ])),
    shade('legShadeL', 'Inside of the leg', 20.05, 0.08, on(['legL'], [
      [101, 196], [104.5, 197], [105, 230], [105, 270], [104.5, 290], [106, 320], [106.5, 350], [106.5, 372], [104.5, 372], [104, 350], [103, 324], [102.5, 300], [101.5, 286], [102, 270], [101.5, 248], [101, 215],
    ])),
  ]
}

const obj = (id: string, name: string, shapes: string[]): ModelObject => ({ id, name, layer: 'body', shapes })
const grp = (id: string, name: string, parent: string | null, objects: string[], pivot: [number, number]): ModelGroup => ({ id, name, parent, objects, pivot, attach: null })

export interface Body { shapes: ModelShape[]; objects: ModelObject[]; groups: ModelGroup[]; twinGroups: string[] }

// The body's shapes, objects and groups. The head group (its objects are the face's) is made in build.ts and hangs from the neck.
export function bodyParts(mock: any): Body {
  const skins: ModelShape[] = [
    skin('neck', 'Neck', 21.5, NECK), skin('chest', 'Chest', 22, sym(CHEST_HALF)), skin('pelvis', 'Pelvis', 21, sym(PELVIS_HALF)),
    skin('uarmL', 'Arm', 31.2, list(ARM)), handFrom(mock, 'handL', 31.25), handFrom(mock, 'thumbL', 31.26),
    skin('legL', 'Leg', 20, list(LEG)), skin('instepL', 'Foot', 20.5, list(FOOT)), skin('toesL', 'Toes', 20.6, list(TOES)),
  ]
  const shapes = [...skins, ...shading(skins)]
  const objects: ModelObject[] = [
    obj('neck', 'Neck', ['neck', 'neckShade', 'neckSide']),
    obj('chest', 'Chest', ['chest', 'torsoShade']),
    obj('pelvis', 'Pelvis', ['pelvis']),
    obj('uarm', 'Arm', ['uarmL', 'armShadeL']),
    obj('hand', 'Hand', ['handL', 'thumbL']),
    obj('leg', 'Leg', ['legL', 'legShadeL']),
    obj('foot', 'Foot', ['instepL']),
    obj('toes', 'Toes', ['toesL']),
  ]
  const J = JOINTS
  const groups: ModelGroup[] = [
    grp('torso', 'Pelvis', null, ['pelvis'], J.pelvis),
    grp('waistJ', 'Waist', 'torso', [], J.waist),
    grp('chestJ', 'Chest', 'waistJ', ['chest'], J.chest),
    grp('neckJ', 'Neck', 'chestJ', ['neck'], J.neck),
    grp('shoulderL', 'Collarbone', 'chestJ', [], J.collar),
    grp('armL', 'Upper arm', 'shoulderL', ['uarm'], J.shoulder),
    grp('foreL', 'Forearm', 'armL', [], J.elbow),
    grp('handL', 'Hand', 'foreL', ['hand'], J.wrist),
    grp('legL', 'Thigh', 'torso', ['leg'], J.hip),
    grp('shinL', 'Shin', 'legL', [], J.knee),
    grp('footL', 'Foot', 'shinL', ['foot'], J.ankle),
    grp('toesL', 'Toes', 'footL', ['toes'], J.ball),
  ]
  return { shapes, objects, groups, twinGroups: ['shoulderL', 'legL'] }
}

// How far each skin's points follow the segments next to it (the engine's Auto across each joint, over twice the reach). Only the segment that holds a skin's group and the one
// that hangs from it: a weight toward a segment two joints away would turn about that joint's resting place. Given before the twins are made: a twin skins itself on the twin
// groups.
export const SKIN_WEIGHTS: Array<[shape: string, group: string, reach: number]> = [
  ['neck', 'chestJ', 6], ['neck', 'head', 5],
  ['chest', 'waistJ', 10],
  ['pelvis', 'waistJ', 10],
  ['uarmL', 'shoulderL', 7], ['uarmL', 'foreL', 9],
  ['handL', 'foreL', 4], ['thumbL', 'foreL', 4],
  ['legL', 'torso', 9], ['legL', 'shinL', 11],
  ['instepL', 'shinL', 4],
]

// The bones: the head (the unit of the head-units guide), the neck, and each segment of the left arm and leg (the Depth sliders turn them toward the viewer).
export function bonesOf(c: ModelContent): ModelBone[] {
  const skull = c.shapes.find(s => s.id === 'skull')!
  const crown = skull.pts.reduce((best, p, i) => (p.y < skull.pts[best].y ? i : best), 0)
  const hand = c.shapes.find(s => s.id === 'handL')!
  const tip = hand.pts.reduce((best, p, i) => (p.y > hand.pts[best].y ? i : best), 0)
  const toes = c.shapes.find(s => s.id === 'toesL')!
  const front = toes.pts.reduce((best, p, i) => (p.y > toes.pts[best].y ? i : best), 0)
  const toGroup = (id: string) => ({ kind: 'group' as const, id, i: 0 })
  return [
    { id: 'b_head', name: 'Head', start: 'head', end: { kind: 'point', id: 'skull', i: crown } },
    { id: 'b_neck', name: 'Neck', start: 'neckJ', end: toGroup('head') },
    { id: 'b_arm', name: 'Upper arm', start: 'armL', end: toGroup('foreL') },
    { id: 'b_fore', name: 'Forearm', start: 'foreL', end: toGroup('handL') },
    { id: 'b_hand', name: 'Hand', start: 'handL', end: { kind: 'point', id: 'handL', i: tip } },
    { id: 'b_thigh', name: 'Thigh', start: 'legL', end: toGroup('shinL') },
    { id: 'b_shin', name: 'Shin', start: 'shinL', end: toGroup('footL') },
    { id: 'b_foot', name: 'Foot', start: 'footL', end: { kind: 'point', id: 'toesL', i: front } },
  ]
}

// The twins of the body: the right arm and leg (groups, with everything in and under them).
export function twinBody(c: ModelContent, body: Body, make: MakeId): ModelContent {
  let next = c
  for (const id of body.twinGroups) {
    const e = makeTwin(next, 'group', id, make)
    if (!e.ok) throw new Error(`${id}: ${e.reason}`)
    next = e.content
  }
  return next
}

// ---- sliders ----

export const drive = (d: Partial<ModelDrive> & Pick<ModelDrive, 'kind'>): ModelDrive => ({ group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...d })
export const range = (id: string, name: string, scope: string | null, min: number, rest: number, max: number, unit: ModelRange['unit'], drives: ModelDrive[], extra: Partial<ModelRange> = {}): ModelRange =>
  ({ id, name, scope, min, rest, max, unit, show: true, rand: null, drives, ...extra })

const turn = (group: string, atMin: number, atMax: number, extra: Partial<ModelDrive> = {}): ModelDrive => drive({ kind: 'turn', group, atMin, atMax, ...extra })
const prop = (object: string, p: string, atMin: number, atMax: number): ModelDrive => drive({ kind: 'prop', feature: 'object', id: object, prop: p, atMin, atMax })
// Points of a skin moved across: [index, how far at the slider's maximum, how far at its minimum].
const moves = (shape: string, list: Array<[number, number, number]>, symmetric = false): ModelDrive =>
  drive({ kind: 'points', shape, sym: symmetric, moves: list.map(([i, dx, dxMin]) => ({ i, dx, dy: 0, dxMin, dyMin: 0 })) })
// A pose slider: Randomise leaves it at rest, so a rolled figure stands naturally.
const STILL: Partial<ModelRange> = { rand: [0, 0] }

export function bodyRanges(): ModelRange[] {
  const out: ModelRange[] = []
  out.push(range('height', 'Height', null, 35, 100, 110, '%', [drive({ kind: 'scale', target: 'model', atMin: 35, atMax: 110 })], { rand: [92, 108] }))
  out.push(range('headSize', 'Head size', 'head', 85, 100, 160, '%', [drive({ kind: 'scale', target: 'group', id: 'head', atMin: 85, atMax: 160 })], { rand: [96, 106] }))
  out.push(range('headTilt', 'Head tilt', 'head', -20, 0, 20, '°', [turn('head', -12, 12)], STILL))
  out.push(range('eyeSize', 'Eye size', 'eyes', 70, 100, 140, '%', [prop('eyes', 'width', 70, 140), prop('eyes', 'height', 70, 140)]))
  out.push(range('eyeSpacing', 'Eye spacing', 'eyes', -3, 0, 3, '', [prop('eyes', 'x', -3, 3)]))
  out.push(range('eyeTilt', 'Eye tilt', 'eyes', -12, 0, 12, '°', [prop('eyes', 'rotation', 12, -12)]))
  out.push(range('eyeOpen', 'Eyes open', 'eyes', 30, 100, 135, '%', [prop('eyes', 'height', 30, 135)]))
  out.push(range('browHeight', 'Brow height', 'brows', -2.5, 0, 2.5, '', [prop('brows', 'y', 2.5, -2.5)]))
  out.push(range('browAngle', 'Brow angle', 'brows', -12, 0, 12, '°', [prop('brows', 'rotation', -12, 12)]))
  out.push(range('noseSize', 'Nose size', 'nose', 80, 100, 130, '%', [prop('nose', 'width', 80, 130), prop('nose', 'height', 80, 130)]))
  out.push(range('mouthSize', 'Mouth size', 'mouth', 75, 100, 135, '%', [prop('mouth', 'width', 75, 135), prop('mouth', 'height', 75, 135)]))
  out.push(range('mouthCurve', 'Smile', 'mouth', -10, 0, 10, '', [prop('mouth', 'curve', -2, 2)]))
  out.push(range('earSize', 'Ear size', 'ears', 80, 100, 140, '%', [prop('ears', 'width', 80, 140), prop('ears', 'height', 80, 140)]))
  // the width of the shoulders widens the collarbones (the arms go out with them) and the chest's shoulders; the waist and the hips move the sides of the torso and the thighs
  out.push(range('shoulders', 'Shoulder width', 'torso', 85, 100, 120, '%', [
    drive({ kind: 'scale', target: 'group', id: 'shoulderL', axis: 'x', atMin: 85, atMax: 120 }),
    moves('chest', [[2, 4, -3], [3, 7, -5.3], [4, 8, -6], [5, 8, -6], [6, 7, -5], [7, 4.5, -3.4]], true),
  ]))
  out.push(range('waist', 'Waist width', 'torso', 80, 100, 125, '%', [
    moves('chest', [[9, 2, -2], [10, 7.5, -6], [11, 7.5, -6]], true), moves('pelvis', [[1, 7.5, -6], [2, 5, -4]], true),
  ]))
  out.push(range('hips', 'Hip width', 'torso', 80, 100, 125, '%', [
    moves('pelvis', [[2, 3, -2.5], [3, 8, -6.5], [4, 9, -7], [5, 8, -6.5], [6, 4, -3]], true), moves('legL', [[2, 8, -6.5], [3, 9, -7], [4, 6, -5], [5, 2, -1.5]]),
  ]))
  // the joints of the trunk (the hip tilt is added once the legs have twins: they turn against it, to stand)
  out.push(range('waistBend', 'Waist bend', 'waistJ', -25, 0, 25, '°', [turn('waistJ', 25, -25)], STILL))
  out.push(range('chestBend', 'Chest bend', 'chestJ', -20, 0, 20, '°', [turn('chestJ', 20, -20)], STILL))
  out.push(range('neckTilt', 'Neck tilt', 'neckJ', -25, 0, 25, '°', [turn('neckJ', 25, -25)], STILL))
  // the limbs: the elbow and the knee bend either way, and positive values keep the meaning they had
  out.push(range('shrug', 'Shoulder lift', 'shoulderL', -8, 0, 16, '°', [turn('shoulderL', 4, -8)], STILL))
  out.push(range('shoulder', 'Arm raise', 'armL', -20, 0, 180, '°', [turn('armL', 20, -180)], STILL))
  out.push(range('elbow', 'Elbow bend', 'foreL', -150, 0, 150, '°', [turn('foreL', 150, -150)], STILL))
  out.push(range('wrist', 'Wrist turn', 'handL', -70, 0, 70, '°', [turn('handL', 70, -70)], STILL))
  out.push(range('legSpread', 'Leg spread', 'legL', -10, 0, 45, '°', [turn('legL', 10, -45)], STILL))
  out.push(range('knee', 'Knee bend', 'shinL', -130, 0, 130, '°', [turn('shinL', 130, -130)], STILL))
  out.push(range('ankle', 'Ankle tilt', 'footL', -20, 0, 20, '°', [turn('footL', 20, -20)], STILL))
  out.push(range('legLength', 'Leg length', 'legL', 60, 100, 115, '%', [drive({ kind: 'scale', target: 'group', id: 'legL', axis: 'y', atMin: 60, atMax: 115 })]))
  return out
}

// The depth sliders of the limbs (each bone turned toward the viewer or away, so a limb can point at the viewer), as [slider, name, bone].
export const DEPTH_SLIDERS: Array<[string, string, string]> = [
  ['armDepth', 'Upper arm toward the viewer', 'b_arm'], ['foreDepth', 'Forearm toward the viewer', 'b_fore'],
  ['thighDepth', 'Thigh toward the viewer', 'b_thigh'], ['shinDepth', 'Shin toward the viewer', 'b_shin'],
]
// The sliders posed each side on its own once the twins are made: [the left one, the right one, the name].
export const SIDE_SLIDERS: Array<[string, string, string]> = [
  ['shrug', 'shrugR', 'Shoulder lift'], ['legSpread', 'legSpreadR', 'Leg spread'], ['knee', 'kneeR', 'Knee bend'], ['ankle', 'ankleR', 'Ankle tilt'],
  ['armDepth', 'armDepthR', 'Upper arm toward the viewer'], ['foreDepth', 'foreDepthR', 'Forearm toward the viewer'],
  ['thighDepth', 'thighDepthR', 'Thigh toward the viewer'], ['shinDepth', 'shinDepthR', 'Shin toward the viewer'],
]
