// The body of the seed model: the mockup's bare mannequin (neck, torso, arms, hands, legs, feet and the bridges of skin between the parts), grouped and rigged for the app's model
// format. The outlines are the mockup's own (the same points, handles and edge locks); the left side is built and then given a twin.
import type { ModelAttach, ModelBind, ModelContent, ModelDrive, ModelGroup, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../src/api/types'
import { makeTwin } from '../../src/assets/Interfaces/admin/characters/engine/pairEdit'
import type { MakeId } from '../../src/assets/Interfaces/admin/characters/modelContent'

const r2 = (v: number): number => Math.round(v * 100) / 100

function bindOf(b: any): ModelBind {
  if (b.e !== undefined) return { kind: 'edge', s: b.s, i: 0, d: [0, 0], e: b.e, t: r2(b.t), o: r2(b.o), ...(b.tan ? { tan: true } : {}) }
  return { kind: 'point', s: b.s, i: b.i, d: [r2(b.d[0]), r2(b.d[1])], e: 0, t: 0, o: 0 }
}
function pointOf(p: any): ModelPoint {
  const q: ModelPoint = { x: r2(p.x), y: r2(p.y), m: p.m, hi: p.hi ? [r2(p.hi[0]), r2(p.hi[1])] : null, ho: p.ho ? [r2(p.ho[0]), r2(p.ho[1])] : null }
  if (p.w) q.w = p.w
  if (p.bind) q.bind = bindOf(p.bind)
  return q
}

// A shape of the mockup's model as the app's shape. `z` may be moved.
export function shapeOf(mock: any, id: string, over: Partial<ModelShape> = {}): ModelShape {
  const s = mock.shapes[id]
  if (!s) throw new Error(`the mockup has no shape ${id}`)
  return {
    id, name: s.name, closed: true, z: s.z, op: s.op ?? 1, view: 'both', pts: s.pts.map(pointOf), half: s.half ?? 0, slot: 'k_skin', ...(s.tone ? { tone: s.tone } : {}), ...over,
  }
}

const obj = (id: string, name: string, shapes: string[]): ModelObject => ({ id, name, layer: 'body', shapes })
const grp = (id: string, name: string, parent: string | null, objects: string[], pivot: [number, number] | null, attach: ModelAttach | null = null): ModelGroup => ({ id, name, parent, objects, pivot, attach })
const att = (shape: string, kind: ModelAttach['kind'], i: number, rx = 0.5, ry = 0): ModelAttach => ({ shape, kind, i, t: kind === 'point' ? 1 : 0, slider: null, rx, ry })

export interface Body { shapes: ModelShape[]; objects: ModelObject[]; groups: ModelGroup[]; twinGroups: string[]; twinShapes: string[] }

export function bodyParts(mock: any): Body {
  const S = (id: string, over?: Partial<ModelShape>) => shapeOf(mock, id, over)
  const shapes: ModelShape[] = [
    S('neck'), S('chest'), S('abdomen'), S('pelvis'), S('trapL'), S('trapR'), S('oblL'), S('oblR'), S('hipL'), S('hipR'),
    S('shoulderL'), S('uarmL'), S('deltL'), S('elbowL'), S('foreL'), S('elbL'), S('handL'), S('thumbL'), S('wriL'),
    S('legL'), S('thiL'), S('ankleL'), S('instepL'), S('ballL'), S('toesL'),
  ]
  // the right-hand bridges of the torso are shapes of the same object (twins of the left ones, made below); the mockup's own right-hand shapes are not used
  const keep = shapes.filter(s => !['trapR', 'oblR', 'hipR'].includes(s.id))
  const objects: ModelObject[] = [
    obj('neck', 'Neck', ['neck']),
    obj('chest', 'Chest', ['chest', 'trapL']),
    obj('abdomen', 'Abdomen', ['abdomen', 'oblL']),
    obj('pelvis', 'Pelvis', ['pelvis', 'hipL']),
    obj('shoulder', 'Shoulder joint', ['shoulderL']),
    obj('uarm', 'Upper arm', ['uarmL', 'deltL']),
    obj('elbow', 'Elbow', ['elbowL']),
    obj('forearm', 'Forearm', ['foreL', 'elbL']),
    obj('hand', 'Hand', ['handL', 'thumbL', 'wriL']),
    obj('leg', 'Leg', ['legL', 'thiL']),
    obj('ankle', 'Ankle', ['ankleL']),
    obj('foot', 'Foot', ['instepL']),
    obj('ball', 'Ball of the foot', ['ballL']),
    obj('toes', 'Toes', ['toesL']),
  ]
  const groups: ModelGroup[] = [
    grp('torso', 'Torso', null, ['neck', 'chest', 'abdomen', 'pelvis'], [100, 150]),
    grp('shoulderL', 'Shoulder joint', 'torso', ['shoulder'], [147, 89], att('chest', 'point', 3)),
    grp('armL', 'Upper arm', 'shoulderL', ['uarm'], [147, 89]),
    grp('foreL', 'Elbow and forearm', 'armL', ['elbow', 'forearm'], [149, 143]),
    grp('handL', 'Hand', 'foreL', ['hand'], [148.8, 198]),
    grp('legL', 'Leg', 'torso', ['leg'], [121, 186], att('pelvis', 'inside', 0, 0.7625, 0.6842)),
    grp('shinL', 'Lower leg', 'legL', [], [115, 264]),
    grp('footL', 'Foot', 'shinL', ['ankle', 'foot', 'ball', 'toes'], [114.5, 356]),
  ]
  return { shapes: keep, objects, groups, twinGroups: ['shoulderL', 'legL'], twinShapes: ['trapL', 'oblL', 'hipL'] }
}

// The twins of the body: the right arm and leg (groups, with everything in and under them) and the right-hand bridges of the torso.
export function twinBody(c: ModelContent, body: Body, make: MakeId): ModelContent {
  let next = c
  for (const id of body.twinShapes) {
    const e = makeTwin(next, 'shape', id, make)
    if (!e.ok) throw new Error(`${id}: ${e.reason}`)
    next = e.content
  }
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

// What the mockup's `point` operations of a slider do to the points of a shape: how far each moves at the slider's ends (the mockup moved a point by `dx` for each unit the slider
// is away from its resting value; the app records the move at the two ends).
export function pointDrives(mock: any, sliderId: string, min: number, rest: number, max: number): ModelDrive[] {
  const r = mock.ranges.find((x: any) => x.id === sliderId)
  if (!r) throw new Error(`the mockup has no slider ${sliderId}`)
  const byShape = new Map<string, ModelDrive>()
  for (const op of r.ops) {
    if (op.op !== 'point') continue
    for (const sid of op.shapes) {
      let d = byShape.get(sid)
      if (!d) { d = drive({ kind: 'points', shape: sid, sym: !!op.sym }); byShape.set(sid, d) }
      d.moves.push({ i: op.idx, dx: r2((op.dx ?? 0) * (max - rest)), dy: r2((op.dy ?? 0) * (max - rest)), dxMin: r2((op.dx ?? 0) * (min - rest)), dyMin: r2((op.dy ?? 0) * (min - rest)) })
    }
  }
  return [...byShape.values()]
}

const turn = (group: string, atMin: number, atMax: number): ModelDrive => drive({ kind: 'turn', group, atMin, atMax })
const prop = (object: string, p: string, atMin: number, atMax: number): ModelDrive => drive({ kind: 'prop', feature: 'object', id: object, prop: p, atMin, atMax })

export function bodyRanges(mock: any): ModelRange[] {
  const out: ModelRange[] = []
  out.push(range('height', 'Height', null, 35, 100, 110, '%', [drive({ kind: 'scale', target: 'model', atMin: 35, atMax: 110 })], { rand: [92, 108] }))
  out.push(range('headSize', 'Head size', 'head', 85, 100, 160, '%', [drive({ kind: 'scale', target: 'group', id: 'head', atMin: 85, atMax: 160 })], { rand: [96, 106] }))
  out.push(range('headTilt', 'Head tilt', 'head', -20, 0, 20, '°', [turn('head', -12, 12)]))
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
  out.push(range('shoulders', 'Shoulder width', 'torso', 85, 100, 120, '%', pointDrives(mock, 'shoulders', 85, 100, 120)))
  out.push(range('waist', 'Waist width', 'torso', 80, 100, 125, '%', pointDrives(mock, 'waist', 80, 100, 125)))
  out.push(range('hips', 'Hip width', 'torso', 80, 100, 125, '%', pointDrives(mock, 'hips', 80, 100, 125)))
  out.push(range('shrug', 'Shoulder lift', 'shoulderL', -8, 0, 16, '°', [turn('shoulderL', 4, -8)]))
  out.push(range('shoulder', 'Arm raise', 'armL', -10, 0, 95, '°', [turn('armL', 10, -95)]))
  out.push(range('elbow', 'Elbow bend', 'foreL', 0, 0, 130, '°', [turn('foreL', 0, -130)]))
  out.push(range('wrist', 'Wrist turn', 'handL', -40, 0, 40, '°', [turn('handL', 40, -40)]))
  out.push(range('legSpread', 'Leg spread', 'legL', 0, 0, 25, '°', [turn('legL', 0, -25)]))
  out.push(range('knee', 'Knee bend', 'legL', 0, 0, 75, '°', [turn('shinL', 0, -75), drive({ kind: 'bend', shape: 'legL', pivot: [115, 264], y0: 244, y1: 286, atMin: 0, atMax: -75 })]))
  out.push(range('ankle', 'Ankle tilt', 'footL', -20, 0, 20, '°', [turn('footL', 20, -20)]))
  out.push(range('legLength', 'Leg length', 'legL', 60, 100, 115, '%', [drive({ kind: 'scale', target: 'group', id: 'legL', axis: 'y', atMin: 60, atMax: 115 })]))
  return out
}
