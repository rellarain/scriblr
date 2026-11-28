// Builds the body templates (WUI slice 9a): the six bodies of the approved character designer mockup as models a new model can start from, written to
// backend/app/seed/body_templates.json. The figure's own code (figure/*.py) gives each part as a dense outline; here each is fitted as a few curve points, given
// the edges that have an outline (the figure's silhouette and the mockup's dark lines, not the joins inside the body), put in a group of the rig with its pivot,
// and the right side made as twins of the left, so a change to one side shows on both.
// Usage: npx vite-node scripts/body-templates/build.ts [out-file]
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModelBind, ModelContent, ModelGroup, ModelJointKind, ModelLimitsFor, ModelPoint, ModelShape, ModelView } from '../../src/api/types'
import { build, inPolygon, flatten, reflectList, type BuiltPoint } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { edgeFlags, reverseFlags, tagEdges } from '../../src/assets/Interfaces/admin/characters/engine/edges'
import { LIMITS, copyBytes } from '../../src/assets/Interfaces/admin/characters/engine/limits'
import { NO_COLOURING } from '../../src/assets/Interfaces/admin/characters/engine/colour'
import { OUTLINE_INK, drawable, paintShapes } from '../../src/assets/Interfaces/admin/characters/engine/paint'
import { defaultValues, solve } from '../../src/assets/Interfaces/admin/characters/engine/rig'
import { makeTwin } from '../../src/assets/Interfaces/admin/characters/engine/pairEdit'
import { limitsOf } from '../../src/assets/Interfaces/admin/characters/engine/jointLimits'
import { addFreeAnchor, addFreePosable, renameMark } from '../../src/assets/Interfaces/admin/characters/engine/anchors'
import { addGroup, addObject, addShape, normalizeContent, publishFaults, starterContent } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { mirrorGap, refit } from '../seed-model/outline'

type V = [number, number]
interface RawPart { kind: string; side: number; layer: string | null; union: boolean; outline: number | null; fill: string; rule: string; view: ModelView; pts: V[]; lines: V[][] }
interface RawBody { id: string; name: string; note: string; heads: number; levels: Record<string, number>; joints: Record<string, V | number>; parts: RawPart[] }
interface Raw { unit: number; top: number; bodies: RawBody[] }

const here = dirname(fileURLToPath(import.meta.url))
const outFile = process.argv[2] ?? resolve(here, '../../../backend/app/seed/body_templates.json')

function exportBodies(): Raw {
  const run = spawnSync(process.env.PYTHON ?? 'python', [join(here, 'figure', 'export.py')], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`figure/export.py failed: ${run.stderr}`)
  return JSON.parse(run.stdout) as Raw
}

// ---- names, colours and outline widths ----

const NAMES: Record<string, string> = {
  neck: 'Neck', chest: 'Chest', traps: 'Trapezius', ribcage: 'Ribcage', chest_side: 'Side of the chest', abdomen: 'Upper abdomen', lowab: 'Lower abdomen', pelvis: 'Pelvis',
  hip: 'Hip', thigh: 'Thigh', shin: 'Shin', ankle: 'Ankle', heel: 'Heel', plantar: 'Foot', upperarm: 'Upper arm', deltoid: 'Shoulder', biceps: 'Biceps',
  triceps: 'Triceps', forearm: 'Forearm', palm: 'Palm', pec: 'Pectoral', breast: 'Breast', helix: 'Ear', lobe: 'Earlobe', concha: 'Ear bowl', antihelix: 'Antihelix',
  head: 'Cranium', forehead: 'Forehead', temple: 'Temple', browridge: 'Brow ridge', eyesocket: 'Eye socket', cheekbone: 'Cheekbone', cheek: 'Cheek', upperjaw: 'Upper jaw',
  mandible: 'Jaw', chin: 'Chin', sclera: 'Eye white', iris: 'Iris', pupil: 'Pupil', tear_duct: 'Tear duct', lid_low: 'Lower lid', lid_up: 'Upper lid', brow: 'Eyebrow',
  bridge: 'Bridge of the nose', cartilage: 'Nose cartilage', nostril: 'Wing of the nose', tip: 'Tip of the nose', septum: 'Septum', nose_hole: 'Nostril',
  lipU_c: 'Upper lip', lipU_s: 'Upper lip, side', lipL_c: 'Lower lip', lipL_s: 'Lower lip, side', scapula: 'Shoulder blade', buttock: 'Buttock',
}
const FINGERS = ['Little finger', 'Ring finger', 'Middle finger', 'Index finger']
const TOES = ['Big toe', 'Second toe', 'Third toe', 'Fourth toe', 'Little toe']
const PHALANX = ['base', 'middle', 'tip']

// the colour slot (or a fixed gray) each fill of the mockup is painted from
function paintOf(p: RawPart): Partial<ModelShape> {
  if (p.kind === 'brow') return { slot: 'k_hair', gray: null }
  switch (p.fill) {
    case 'lip': return { slot: 'k_lip', gray: null }
    case 'iris': return { slot: 'k_eye', gray: null }
    case 'sclera': return { slot: null, gray: 92 }
    case 'dark': return { slot: null, gray: 12 }
    case 'concha': return { slot: 'k_skin', gray: null, tone: -1 }
    default: return { slot: 'k_skin', gray: null }
  }
}

// The outline widths, in the model's units (the mockup drew 2.4 px lines at 108 px a head; a head is 56 units here)
const W = { body: 1.2, inner: 0.6, ear: 0.4, face: 0.4, eye: 0.45, lip: 0.5, toe: 0.4, dark: 0.3 }
const HEAD_LAYER = 'head', FACE = 'face'

// ---- fitting ----

const r2 = (v: number) => Math.round(v * 100) / 100
function fitOutline(pts: V[]): ModelPoint[] {
  const clean: V[] = []
  for (const p of pts) { const q = clean[clean.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) clean.push(p) }
  if (clean.length > 2 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) < 0.02) clean.pop()
  const list: ModelPoint[] = clean.map(([x, y]) => ({ x: r2(x), y: r2(y), m: 's', hi: null, ho: null }))
  let tol = 0.04, out = refit(list, tol)
  while (out.length > LIMITS.pointsWarn && tol < 3) { tol *= 1.4; out = refit(list, tol) }
  return out
}

// ---- which edges have the outline ----

const bez = (a: BuiltPoint, b: BuiltPoint, t: number): V => {
  const o = a.m === 'c' || a.m === 'sc', i = b.m === 'c' || b.m === 'cs'
  const c1: V = o ? [a.hox, a.hoy] : [a.x, a.y], c2: V = i ? [b.hix, b.hiy] : [b.x, b.y], u = 1 - t
  return [u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y]
}
const segDist = (p: V, a: V, b: V): number => {
  const ab: V = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}
const nearLine = (p: V, line: V[], within: number) => line.some((a, k) => k > 0 && segDist(p, line[k - 1], a) <= within)

interface Fitted { raw: RawPart; pts: ModelPoint[]; poly: V[]; index: number; digit: number }
const OUT = 0.45

// Which stretches of the outline have the outline drawn: an edge loses it where the shapes that cover it lie against it (just outside the edge is inside one of
// them), and keeps it wherever it runs along one of the part's own dark lines in the mockup. An edge that is only partly covered is split where the cover begins or
// ends (the curve is cut in two there, so the outline is unchanged), so a line stops exactly at a join instead of running on into it.
type Rule = Fitted[] | 'all' | 'none'
interface Node { x: number; y: number; hin: V | null; hout: V | null }
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const STEPS = 24

function nodesOf(pts: ModelPoint[]): Node[] {
  return build(pts, true).map(b => ({ x: b.x, y: b.y, hin: b.m === 'c' || b.m === 'cs' ? [b.hix, b.hiy] : null, hout: b.m === 'c' || b.m === 'sc' ? [b.hox, b.hoy] : null }))
}
function pointsOf(nodes: Node[]): ModelPoint[] {
  return nodes.map(n => {
    const hi: [number, number] | null = n.hin ? [r2(n.hin[0] - n.x), r2(n.hin[1] - n.y)] : null, ho: [number, number] | null = n.hout ? [r2(n.hout[0] - n.x), r2(n.hout[1] - n.y)] : null
    return { x: r2(n.x), y: r2(n.y), m: hi && ho ? 'c' : hi ? 'cs' : ho ? 'sc' : 's', hi, ho }
  })
}
// the cubic of the edge from node a to node b
const cubic = (a: Node, b: Node): [V, V, V, V] => [[a.x, a.y], a.hout ?? [a.x, a.y], b.hin ?? [b.x, b.y], [b.x, b.y]]
const at = (c: [V, V, V, V], t: number): V => { const q0 = lerp(c[0], c[1], t), q1 = lerp(c[1], c[2], t), q2 = lerp(c[2], c[3], t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t); return lerp(r0, r1, t) }

function outlineEdges(f: Fitted, rule: Rule): { pts: ModelPoint[]; lined: boolean[]; silhouette: boolean } {
  const nodes = nodesOf(f.pts), n = nodes.length
  let silhouette = false
  // whether the outline shows at a spot of the edge: along a dark line, or (with shapes that cover it) not against them
  const shows = (c: [V, V, V, V], t: number): boolean => {
    if (rule === 'all') return true
    const p = at(c, t)
    if (f.raw.lines.some(line => nearLine(p, line, 0.9))) return true
    if (rule === 'none') return false
    const p2 = at(c, Math.min(1, t + 0.01)), p1 = at(c, Math.max(0, t - 0.01)), tx = p2[0] - p1[0], ty = p2[1] - p1[1], l = Math.hypot(tx, ty) || 1
    const plus: V = [p[0] + (ty / l) * OUT, p[1] - (tx / l) * OUT], minus: V = [p[0] - (ty / l) * OUT, p[1] + (tx / l) * OUT]
    const inPlus = inPolygon(f.poly, plus[0], plus[1]), inMinus = inPolygon(f.poly, minus[0], minus[1])
    const out = inPlus && !inMinus ? minus : !inPlus && inMinus ? plus : null
    const free = !out || !rule.some(g => inPolygon(g.poly, out[0], out[1]))
    if (free) silhouette = true
    return free
  }
  // each node is shared by the edge before it and the edge after it, so a cut that shortens a handle at an end is seen by both
  const work = nodes.map(nd => ({ ...nd })), outNodes: Node[] = [], lined: boolean[] = []
  for (let e = 0; e < n; e++) {
    const a = work[e], b = work[(e + 1) % n], c = cubic(a, b)
    const marks = Array.from({ length: STEPS }, (_, k) => shows(c, (k + 0.5) / STEPS))
    // a lone spot that disagrees with both neighbours is a slip
    for (let k = 1; k < STEPS - 1; k++) if (marks[k - 1] === marks[k + 1] && marks[k] !== marks[k - 1]) marks[k] = marks[k - 1]
    const cuts: number[] = []
    for (let k = 1; k < STEPS; k++) if (marks[k] !== marks[k - 1]) cuts.push(k / STEPS)
    outNodes.push(a)
    let cur = c, from = 0, flag = marks[0], last: Node = a
    const curved = !!(a.hout || b.hin)
    for (const t of cuts) {
      const u = (t - from) / (1 - from)
      const q0 = lerp(cur[0], cur[1], u), q1 = lerp(cur[1], cur[2], u), q2 = lerp(cur[2], cur[3], u), r0 = lerp(q0, q1, u), r1 = lerp(q1, q2, u), m = lerp(r0, r1, u)
      if (last.hout) last.hout = q0
      const mid: Node = { x: m[0], y: m[1], hin: curved ? r0 : null, hout: curved ? r1 : null }
      lined.push(flag)
      outNodes.push(mid)
      last = mid; cur = [m, r1, q2, cur[3]]; from = t; flag = !flag
    }
    if (cuts.length && b.hin) b.hin = cur[2]
    lined.push(flag)
  }
  return { pts: pointsOf(outNodes), lined, silhouette }
}

const seesWith = (a: ModelView, b: ModelView) => b === 'both' || a === b

// the shapes whose fill covers a part's edges (they are drawn as one with it)
function coverersOf(f: Fitted, all: Fitted[]): Fitted[] | 'all' | 'none' {
  const k = f.raw.kind, same = (g: Fitted) => g !== f && g.raw.side === f.raw.side && seesWith(f.raw.view, g.raw.view)
  const isDigit = (g: Fitted) => g.raw.layer === 'hand'
  // these show by the mockup's dark lines along them only (the lids by their lash lines)
  if (k === 'bridge' || k === 'cartilage' || k === 'chest_side' || k === 'pec' || k === 'breast' || k === 'lid_up' || k === 'lid_low') return 'none'
  if (f.raw.layer === 'toe' || k === 'concha' || k === 'antihelix') return 'all'
  if (f.raw.layer === FACE) {
    if (k.startsWith('lipU') || k.startsWith('lipL')) return all.filter(g => g !== f && g.raw.kind.slice(0, 4) === k.slice(0, 4))
    if (k === 'tip') return all.filter(g => g.raw.kind === 'bridge')
    if (k === 'nostril') return all.filter(g => g.raw.kind === 'tip')
    if (k === 'septum') return all.filter(g => g.raw.kind === 'tip' || g.raw.kind === 'nostril')
    return 'all'
  }
  if (k === 'helix' || k === 'lobe') return all.filter(g => same(g) && (g.raw.kind === 'helix' || g.raw.kind === 'lobe'))
  if (f.raw.layer === HEAD_LAYER) return all.filter(g => g !== f && g.raw.layer === HEAD_LAYER && seesWith(f.raw.view, g.raw.view))
  if (k === 'palm') return all.filter(g => same(g) && (g.raw.kind === 'forearm' || isDigit(g)))
  if (isDigit(f)) return all.filter(g => same(g) && (g.raw.kind === 'palm' || (isDigit(g) && g.digit === f.digit)))
  // the body: every part inside its one outline, and the palms (the wrist)
  return all.filter(g => g !== f && seesWith(f.raw.view, g.raw.view) && ((g.raw.union && g.raw.layer !== 'hand' && g.raw.kind !== 'palm') || (g.raw.kind === 'palm' && g.raw.side === f.raw.side)))
}

function widthOf(f: Fitted, lined: boolean[], silhouette: boolean): number | null {
  if (!lined.some(Boolean)) return null
  const k = f.raw.kind
  if (f.raw.layer === 'toe') return W.toe
  if (k === 'sclera') return W.eye
  if (k.startsWith('lip')) return W.lip
  if (k === 'pupil' || k === 'nose_hole' || k === 'brow') return W.dark
  if (f.raw.layer === FACE || k === 'concha' || k === 'antihelix') return W.face
  if (k === 'helix' || k === 'lobe') return W.ear
  return silhouette ? W.body : W.inner
}

// ---- the rig ----

interface Place { group: string; object: string }
// where each part goes: the group of the rig it turns with and its object (the left side; the right is its twin)
function placeOf(p: RawPart): Place {
  const k = p.kind
  if (['pelvis', 'lowab', 'hip', 'buttock'].includes(k)) return { group: 'pelvis', object: 'o_pelvis' }
  if (['chest', 'abdomen', 'ribcage', 'traps', 'pec', 'breast', 'chest_side', 'scapula'].includes(k)) return { group: 'chest', object: 'o_torso' }
  if (k === 'neck') return { group: 'neck', object: 'o_neck' }
  if (['upperarm', 'deltoid', 'biceps', 'triceps'].includes(k)) return { group: 'upperarmL', object: 'o_upperarmL' }
  if (k === 'forearm') return { group: 'forearmL', object: 'o_forearmL' }
  if (k === 'palm' || p.layer === 'hand') return { group: 'handL', object: 'o_handL' }
  if (k === 'thigh') return { group: 'thighL', object: 'o_thighL' }
  if (k === 'shin') return { group: 'shinL', object: 'o_shinL' }
  if (['ankle', 'heel', 'plantar', 'toes'].includes(k)) return { group: 'footL', object: 'o_footL' }
  if (p.layer === 'ear') return { group: 'head', object: 'o_ears' }
  if (['sclera', 'iris', 'pupil', 'tear_duct', 'lid_low', 'lid_up'].includes(k)) return { group: 'head', object: 'o_eyes' }
  if (k === 'brow') return { group: 'head', object: 'o_brows' }
  if (['bridge', 'cartilage', 'nostril', 'tip', 'septum', 'nose_hole'].includes(k)) return { group: 'head', object: 'o_nose' }
  if (k.startsWith('lip')) return { group: 'head', object: 'o_mouth' }
  return { group: 'head', object: 'o_head' }
}
const GROUPS: Array<[id: string, name: string, parent: string | null, objects: Array<[string, string]>]> = [
  ['pelvis', 'Pelvis', null, [['o_pelvis', 'Pelvis']]],
  ['chest', 'Chest', 'pelvis', [['o_torso', 'Torso']]],
  ['neck', 'Neck', 'chest', [['o_neck', 'Neck']]],
  ['head', 'Head', 'neck', [['o_head', 'Head'], ['o_ears', 'Ears'], ['o_eyes', 'Eyes'], ['o_brows', 'Eyebrows'], ['o_nose', 'Nose'], ['o_mouth', 'Mouth']]],
  ['upperarmL', 'Upper arm (left)', 'chest', [['o_upperarmL', 'Upper arm (left)']]],
  ['forearmL', 'Forearm (left)', 'upperarmL', [['o_forearmL', 'Forearm (left)']]],
  ['handL', 'Hand (left)', 'forearmL', [['o_handL', 'Hand (left)']]],
  ['thighL', 'Thigh (left)', 'pelvis', [['o_thighL', 'Thigh (left)']]],
  ['shinL', 'Shin (left)', 'thighL', [['o_shinL', 'Shin (left)']]],
  ['footL', 'Foot (left)', 'shinL', [['o_footL', 'Foot (left)']]],
]
const SIDED_GROUPS = ['upperarmL', 'thighL']
// the joints a limb turns a long way at, with a joint cap: the elbows and the knees
const CAPPED = new Set(['forearmL', 'shinL'])
const CAP = 1.05

// The shape editor's joints (slice 9d): each part's object joined to the one it hangs from by a pivot point that turns at the group's pivot (the link's own point stays where
// it is drawn), the joints of the body with their measured limits for the template's body, the face's parts held fast to the head; the pelvis anchored, and the head, the
// hands, the elbows, the knees and the feet posable. The right side takes the left side's joints and marks as twins.
type JointSpec = [child: string, parent: string, pivot: string, name: string, kind: ModelJointKind | null, range?: [number, number]]
const JOINTS: JointSpec[] = [
  ['o_torso', 'o_pelvis', 'chest', 'Waist', null, [-30, 30]],
  ['o_neck', 'o_torso', 'neck', 'Neck', 'neck'],
  ['o_head', 'o_neck', 'head', 'Head', null, [-20, 20]],
  ...(['o_ears', 'o_eyes', 'o_brows', 'o_nose', 'o_mouth'] as const).map((o): JointSpec => [o, 'o_head', 'head', '', null, [0, 0]]),
  ['o_upperarmL', 'o_torso', 'upperarmL', 'Shoulder (left)', 'shoulder'],
  ['o_forearmL', 'o_upperarmL', 'forearmL', 'Elbow (left)', 'elbow'],
  ['o_handL', 'o_forearmL', 'handL', 'Wrist (left)', 'wrist'],
  ['o_thighL', 'o_pelvis', 'thighL', 'Hip (left)', 'hip'],
  ['o_shinL', 'o_thighL', 'shinL', 'Knee (left)', 'knee'],
  ['o_footL', 'o_shinL', 'footL', 'Ankle (left)', 'ankle'],
]
// the body each template's limits are for
const LIMITS_FOR: Record<string, ModelLimitsFor> = {
  woman: { sex: 'women', age: 'adult', hyper: false }, heavywoman: { sex: 'women', age: 'adult', hyper: false }, elder: { sex: 'women', age: 'elder', hyper: false },
}
function rigged(c: ModelContent, pivots: Record<string, V>, bodyId: string): ModelContent {
  const f = LIMITS_FOR[bodyId] ?? { sex: 'men', age: 'adult', hyper: false }
  let shapes = c.shapes
  const own = (oid: string) => (c.objects.find(o => o.id === oid)?.shapes ?? []).map(id => shapes.find(s => s.id === id)).filter((s): s is ModelShape => !!s && !s.mirrorOf && s.pts.length >= 3)
  // the point of an object's shapes nearest a place (not one that is linked already)
  const nearest = (oid: string, [x, y]: V) => {
    let best: { shape: ModelShape; i: number; d: number } | null = null
    for (const s of own(oid)) s.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (!p.bind && (!best || d < best.d)) best = { shape: s, i, d } })
    if (!best) throw new Error(`${bodyId}: no point in ${oid} to join`)
    return best as { shape: ModelShape; i: number; d: number }
  }
  for (const [child, parent, pv, name, kind, range] of JOINTS) {
    const at = pivots[pv], a = nearest(child, at), b = nearest(parent, at)
    const { lo, hi } = kind ? limitsOf(kind, f) : { lo: range![0], hi: range![1] }
    const P = a.shape.pts[a.i], Q = b.shape.pts[b.i]
    const bind: ModelBind = {
      kind: 'point', s: b.shape.id, i: b.i, d: [r2(P.x - Q.x), r2(P.y - Q.y)], e: 0, t: 0, o: 0,
      pivot: { turn: 0, lo, hi, ...(name ? { name } : {}), ...(kind ? { kind } : {}), at: [r2(at[0]), r2(at[1])] },
    }
    shapes = shapes.map(s => (s.id === a.shape.id ? { ...s, pts: s.pts.map((p, k) => (k === a.i ? { ...p, bind } : p)) } : s))
  }
  // a mark on a shape, named
  const mark = (id: string, add: typeof addFreeAnchor, [x, y]: V, name: string) => {
    shapes = shapes.map(s => {
      if (s.id !== id) return s
      const r = add(s, r2(x), r2(y))
      if (!r.ok) throw new Error(`${bodyId}: ${name}: ${r.reason}`)
      return renameMark(r.shape, r.shape.marks!.at(-1)!.id, name)
    })
  }
  const middle = (id: string): V => { const s = shapes.find(x => x.id === id)!; return centre(flatten(build(s.pts, true), true) as V[]) }
  mark('pelvis', addFreeAnchor, pivots.pelvis, 'Pelvis')
  mark('head', addFreePosable, middle('head'), 'Head')
  mark('palmL', addFreePosable, middle('palmL'), 'Hand (left)')
  mark('forearmL', addFreePosable, pivots.forearmL, 'Elbow (left)')
  mark('shinL', addFreePosable, pivots.shinL, 'Knee (left)')
  mark('plantarL', addFreePosable, middle('plantarL'), 'Foot (left)')
  return { ...c, shapes, limitsFor: f }
}

// The join set a part is drawn in (slice 9c): the body's plain parts in one outline round the figure, the arms in one of their own (so an arm posed in front of the body
// still shows its outline there; slice 9d), the head's planes in one round the head. A part with dark lines of its own inside the body (a buttock's fold) and the hands keep
// their own outlines; from behind, the face's planes are under the neck, so the cranium keeps its line over it.
const ARM_PARTS = new Set(['upperarm', 'deltoid', 'biceps', 'triceps', 'forearm'])
function joinOfPart(p: RawPart): Partial<ModelShape> {
  if (p.lines.length > 0) return {}
  if (p.union && p.layer !== 'hand' && p.kind !== 'palm') return { join: ARM_PARTS.has(p.kind) ? 'Arms' : 'Body' }
  if (p.layer === HEAD_LAYER) return p.kind === 'head' ? { join: 'Head' } : { join: 'Head', joinBack: '' }
  return {}
}

// the middle of an outline's cut across at height y (null when it does not reach that height)
function across(poly: V[], y: number): number | null {
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
  }
  return xs.length >= 2 ? (Math.min(...xs) + Math.max(...xs)) / 2 : null
}
// the middle of an outline's box
const centre = (poly: V[]): V => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] }

// ---- one body ----

interface Report { id: string; shapes: number; twins: number; points: number; worstMirror: number; kb: number; faults: string[] }

function bodyModel(body: RawBody): { content: ModelContent; report: Report } {
  // the parts in the order the mockup draws them from the front: the body inside its one outline, the toes, the arms over the chest's sides, the chest, the hands,
  // the ears, the head and the face
  const parts = body.parts
  const armFill = new Set(['upperarm', 'forearm', 'deltoid', 'biceps', 'triceps'])
  const tier = (p: RawPart): number => {
    if (p.layer === FACE) return 9
    if (p.layer === HEAD_LAYER) return 8
    if (p.layer === 'ear') return 7
    if (p.layer === 'hand' || p.kind === 'palm') return 6
    if (p.layer === 'chest') return 5
    if (p.layer === 'overlay') return 4
    if (armFill.has(p.kind)) return 3
    if (p.layer === 'toe') return 2
    return 1
  }
  // from the back: the face's planes under the neck, the body, the arms over the back, the hands, the ears, the cranium over all
  const tierBack = (p: RawPart): number => {
    if (p.kind === 'head') return 9
    if (p.layer === 'ear') return 7
    if (p.layer === 'hand' || p.kind === 'palm') return 6
    if (armFill.has(p.kind)) return 5
    if (p.layer === HEAD_LAYER) return 0
    return 2
  }
  const order = parts.map((p, i) => ({ p, i })).sort((a, b) => tier(a.p) - tier(b.p) || a.i - b.i).map(x => x.i)
  const orderBack = parts.map((p, i) => ({ p, i })).sort((a, b) => tierBack(a.p) - tierBack(b.p) || a.i - b.i).map(x => x.i)
  const zOf = new Map(order.map((i, k) => [i, r2(2 + (k * 92) / parts.length)]))
  const zBackOf = new Map(orderBack.map((i, k) => [i, r2(2 + (k * 92) / parts.length)]))

  // fit every part; the digits are numbered in the order they come (finger1 or thumb1 starts one)
  let digit = -1
  const fitted: Fitted[] = parts.map((raw, index) => {
    if (raw.kind === 'finger1' || raw.kind === 'thumb1') digit++
    const pts = fitOutline(raw.pts)
    return { raw, pts, poly: flatten(build(pts, true), true) as V[], index, digit: raw.layer === 'hand' ? digit : -1 }
  })
  // the left side (x > 100: the picture's right) is drawn; the right is its twin
  const left = (f: Fitted) => f.raw.side !== 0 && centre(f.poly)[0] > 100
  const right = (f: Fitted) => f.raw.side !== 0 && !left(f)
  const counts = new Map<string, number>()

  let c: ModelContent = { ...starterContent(body.name), description: body.note }
  const J = body.joints as Record<string, V> & { hip: number; knee: number }
  const thigh = fitted.find(f => f.raw.kind === 'thigh' && left(f))!, shin = fitted.find(f => f.raw.kind === 'shin' && left(f))!
  const ankle = fitted.find(f => f.raw.kind === 'ankle' && left(f))!
  const hipY = J.hip, kneeY = J.knee
  const pivots: Record<string, V> = {
    pelvis: [100, hipY], chest: J.waist, neck: J.neck, head: J.head, upperarmL: J.shoulder, forearmL: J.elbow, handL: J.wrist,
    // the hip joint at the hip's height, across at the thigh's middle where it leaves the crotch (at the hip's height the outline bulges out over the hip bone)
    thighL: [across(thigh.poly, body.levels.crotch) ?? centre(thigh.poly)[0], hipY], shinL: [across(thigh.poly, kneeY) ?? across(shin.poly, kneeY) ?? centre(shin.poly)[0], kneeY],
    footL: centre(ankle.poly),
  }
  for (const [id, name, parent, objects] of GROUPS) {
    const g: ModelGroup = { id, name, parent, objects: [], pivot: [r2(pivots[id][0]), r2(pivots[id][1])], attach: null, ...(CAPPED.has(id) ? { cap: CAP } : {}) }
    c = addGroup(c, g)
    for (const [oid, oname] of objects) c = addObject(c, id, { id: oid, name: oname, layer: 'body', shapes: [] })
  }

  let worstMirror = 0, points = 0
  const leftIds: string[] = []
  const usedIds = new Set<string>()
  for (const f of fitted) {
    if (right(f)) {
      const mate = fitted.find(g => left(g) && g.raw.kind === f.raw.kind && Math.abs(centre(g.poly)[1] - centre(f.poly)[1]) < 1 && Math.abs(200 - centre(g.poly)[0] - centre(f.poly)[0]) < 1)
      if (mate) worstMirror = Math.max(worstMirror, mirrorGap(mate.pts, f.pts))
      else throw new Error(`${body.id}: no left part mirrors ${f.raw.kind} at ${centre(f.poly).map(v => v.toFixed(1))}`)
      continue
    }
    const raw = f.raw, k = raw.kind
    const n = (counts.get(k) ?? 0) + 1
    counts.set(k, n)
    let name = NAMES[k] ?? k
    if (raw.layer === 'hand') {
      const which = k.startsWith('thumb') ? 'Thumb' : FINGERS[f.digit] ?? 'Finger'
      name = `${which}, ${PHALANX[Number(k.slice(-1)) - 1]}`
    }
    if (raw.layer === 'toe') name = TOES[n - 1] ?? 'Toe'
    if (left(f)) name += ' (left)'
    // every edge, the edges along the part's dark lines only, or the stretches no covering shape lies against (and those along its dark lines)
    const edges = outlineEdges(f, coverersOf(f, fitted))
    const outline = widthOf(f, edges.lined, edges.silhouette)
    const pts = outline === null ? f.pts : edges.pts.map((p, e) => (edges.lined[e] ? p : { ...p, line: false as const }))
    let id = `${k.replace(/_/g, '')}${raw.side ? 'L' : ''}${n > 1 || ['toes', 'finger1', 'finger2', 'finger3', 'thumb1', 'thumb2', 'thumb3'].includes(k) ? n : ''}`
    while (usedIds.has(id)) id += 'x'
    usedIds.add(id)
    const shape: ModelShape = {
      id, name, closed: true, z: zOf.get(f.index)!, zBack: zBackOf.get(f.index)!, op: 1, view: raw.view, half: 0, template: null, pts, outline, ...paintOf(raw), ...joinOfPart(raw),
    }
    points += pts.length
    c = addShape(c, placeOf(raw).object, shape)
    if (left(f)) leftIds.push(id)
  }
  // the right side: twins of the sided groups (an arm, a leg, with everything under them), and of each left shape in a middle group
  let seq = 0
  const make = (prefix: string) => `${prefix}R${++seq}`
  for (const g of SIDED_GROUPS) {
    const e = makeTwin(c, 'group', g, make)
    if (!e.ok) throw new Error(`${body.id}: twin of ${g}: ${e.reason}`)
    c = e.content
  }
  const inSided = new Set(c.groups.filter(g => !g.mirrorOf && g.id.endsWith('L')).flatMap(g => g.objects).flatMap(oid => c.objects.find(o => o.id === oid)?.shapes ?? []))
  for (const id of leftIds) {
    if (inSided.has(id)) continue
    const e = makeTwin(c, 'shape', id, make)
    if (!e.ok) throw new Error(`${body.id}: twin of ${id}: ${e.reason}`)
    c = e.content
  }
  // a twin is named for its side
  const side = (name: string) => name.replace(/ \(left\) \(twin\)$/, ' (right)').replace(/ \(twin\)$/, '')
  c = { ...c, shapes: c.shapes.map(s => (s.mirrorOf ? { ...s, name: side(s.name) } : s)), objects: c.objects.map(o => (o.mirrorOf ? { ...o, name: side(o.name) } : o)), groups: c.groups.map(g => (g.mirrorOf ? { ...g, name: side(g.name) } : g)) }
  c = rigged(c, pivots, body.id)
  c = normalizeContent({ ...c, joins: true })
  const twins = c.shapes.filter(s => s.mirrorOf).length
  return { content: c, report: { id: body.id, shapes: c.shapes.length, twins, points, worstMirror: r2(worstMirror), kb: Math.round(copyBytes(c) / 1024), faults: publishFaults(c) } }
}

// The proportion guide each template starts with: the crown, a head's height, and the lines at the chin, the chest, the waist, the crotch, the knees and the soles.
function guideOf(raw: Raw, body: RawBody) {
  const L = body.levels
  return { top: raw.top, head: raw.unit, lines: [['Chin', L.chin], ['Chest', L.chest], ['Waist', L.waist], ['Crotch', L.crotch], ['Knees', L.knees], ['Soles', L.soles]].map(([name, y]) => ({ name, y: r2(y as number) })) }
}

// A small picture of the body from the front for the New model chooser: an SVG of its fills and outlines, the numbers to a whole unit.
function thumbOf(c: ModelContent): string {
  const whole = (d: string) => d.replace(/-?\d+\.\d+/g, v => String(Math.round(Number(v))))
  // at the picture's size the eyes, nose, mouth and fingers are a few pixels: the shapes smaller than four units across are left out
  const solved = solve(c, defaultValues(c), 'front')
  const items = drawable(paintShapes(c, solved, NO_COLOURING)).filter(i => { if (i.role) return true; const b = solved.shapes[i.id]?.box; return !!b && Math.max(b.w, b.h) >= 4 })
  const body = items.map(i => {
    const line = i.line ? (i.lineD ?? i.d) : ''
    // a join set's outline (a halo) has no fill of its own
    return (i.opacity > 0 ? `<path d="${whole(i.d)}" fill="${i.fill}"/>` : '') + (line ? `<path d="${whole(line)}" fill="none" stroke="${OUTLINE_INK}" stroke-width="${i.line!.w}" stroke-linejoin="round"/>` : '')
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 4 184 432">${body}</svg>`
}

const raw = exportBodies()
const templates = raw.bodies.map(body => {
  const { content, report } = bodyModel(body)
  console.log(`${report.id}: ${report.shapes} shapes (${report.twins} twins), ${report.points} points, ${report.kb} KB, the sides within ${report.worstMirror} of mirror images${report.faults.length ? `; faults: ${report.faults.join(' ')}` : ''}`)
  const guide = guideOf(raw, body)
  return { id: body.id, name: body.name, note: body.note, heads: body.heads, thumb: thumbOf(content), guide, content: { ...content, guide } }
})
// ---- the body parts (the Body part menu): parts of the average body, each a list of shapes with their own points (a twin's are its original's, mirrored) ----

interface BodyPart { id: string; name: string; hint: string; shapes: ModelShape[] }
const PARTS: Array<[id: string, name: string, hint: string, objects: string[], leftOnly?: boolean]> = [
  ['head', 'Head', '1 head', ['o_head']],
  ['torso', 'Torso', 'chin to hips', ['o_neck', 'o_torso', 'o_pelvis']],
  ['arm', 'Arm', '3 parts', ['o_upperarmL', 'o_forearmL', 'o_handL']],
  ['hand', 'Hand', 'palm, 5 fingers', ['o_handL']],
  ['leg', 'Leg', '3 parts', ['o_thighL', 'o_shinL', 'o_footL']],
  ['foot', 'Foot', 'with its toes', ['o_footL']],
  ['eye', 'Eye', 'lids, iris', ['o_eyes', 'o_brows'], true],
  ['ear', 'Ear', '', ['o_ears'], true],
  ['nose', 'Nose', '', ['o_nose']],
  ['mouth', 'Mouth', 'lips', ['o_mouth']],
]
function partsOf(c: ModelContent): BodyPart[] {
  const byId = new Map(c.shapes.map(s => [s.id, s]))
  // a part is drawn shapes only: the template's joints and marks join it to parts it does not have
  const loose = (s: ModelShape): ModelShape => ({ ...s, marks: [], pts: s.pts.map(p => { const { bind: _b, ...rest } = p; return rest }) })
  const own = (s: ModelShape): ModelShape => loose(ownShape(s))
  const ownShape = (s: ModelShape): ModelShape => {
    const orig = s.mirrorOf ? byId.get(s.mirrorOf) : undefined
    if (!orig) return { ...s, mirrorOf: null }
    // a twin's own points: its original's mirrored about the middle, its edges' outlines the other way round
    const flags = reverseFlags(edgeFlags(orig.pts))
    const pts = reflectList(orig.pts.map(p => { const { line: _l, ...rest } = p; return rest }), c.axis ?? 100)
    return { ...orig, id: s.id, name: s.name, mirrorOf: null, pts: flags ? tagEdges(pts, flags) : pts }
  }
  const parts: BodyPart[] = PARTS.map(([id, name, hint, objects, leftOnly]) => {
    const ids = objects.flatMap(oid => c.objects.find(o => o.id === oid)?.shapes ?? [])
    const shapes = ids.map(sid => byId.get(sid)!).filter(s => !leftOnly || (!s.mirrorOf && / \(left\)$/.test(s.name))).map(own)
    return { id, name, hint, shapes }
  })
  // a lock of hair: a tuft that tapers to a point and curls, from the hairline over the temple, in the hair's colour
  const lock: Array<[number, number]> = [[101, 14], [112, 12.5], [120.5, 17], [123, 26], [121.5, 36], [118, 44], [119.5, 37], [118.5, 29], [114.5, 22.5], [107.5, 19.5]]
  parts.push({ id: 'hair', name: 'Lock of hair', hint: '', shapes: [{
    id: 'lock', name: 'Lock of hair', closed: true, z: 97, op: 1, view: 'both', half: 0, template: null, outline: 0.6, slot: 'k_hair', gray: null,
    pts: lock.map(([x, y], i) => ({ x, y, m: i === 6 ? 's' as const : 'c' as const, hi: null, ho: null })),
  }] })
  return parts
}
const parts = partsOf(templates.find(t => t.id === 'man')!.content as ModelContent)
console.log(`body parts: ${parts.map(p => `${p.name} (${p.shapes.length})`).join(', ')}`)

writeFileSync(outFile, JSON.stringify({ version: 1, templates, parts }))
console.log(`wrote ${outFile}`)
