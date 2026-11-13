// The hair of the seed model: the mockup's sections of the head by plane (front, top, left side, right side, back, nape) and side (left, centre, right). Each section is its own
// object: a piece of hair (its roots on the scalp, its free edges weighted so that it hangs and lengthens), a cap of hair under it that covers its part of the scalp, a cut (its
// shape, as forms), a Length and a Texture slider and, for the pieces that hang, a shadow near the ends. A hairstyle is a preset of the sections: how long each is, how it is
// waved, its cut, and which are left off.
//
// Phase O7 rebuilt the pieces after the old portrait's hair (writer/characters/portrait/draw/hair.ts): they are offsets from the old portrait's skull (a superellipse, mapped
// onto the mannequin's head: the head of the old portrait is 92 units tall and the mannequin's 54), its hairline is the old default hairline and the cap stands off the skull
// as the old cap did. Together the caps cover the scalp from every side, so no skin shows between the sections; they are drawn just under their sections and are hidden with
// them (Bald, an undercut). Each piece overlaps its neighbours by 1.5 units. The texture of a section draws its free edges wavy, curly or coily (the engine's texture.ts) and
// makes it stand out further from the head, as curly and coily hair did in the old portrait; a section that hangs flares out a little as it grows.
import type { ModelDrive, ModelGroup, ModelMove, ModelObject, ModelPoint, ModelPreset, ModelRange, ModelShape } from '../../src/api/types'
import { r2 } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { drive, range } from './body'
import { CHIN_Y } from './outline'

const PLANE_NAMES: Record<string, string> = { front: 'Front', top: 'Top', left: 'Left side', right: 'Right side', back: 'Back', nape: 'Nape' }
const SIDE_NAMES: Record<string, string> = { left: 'left', center: 'centre', right: 'right' }
export const CELLS: Array<[string, string]> = [['front', 'center'], ['front', 'left'], ['front', 'right'], ['top', 'center'], ['top', 'left'], ['top', 'right'], ['left', 'center'], ['right', 'center'], ['back', 'center'], ['back', 'left'], ['back', 'right'], ['nape', 'center'], ['nape', 'left'], ['nape', 'right']]

// How long each plane is at rest (the default look: short hair), and the least and most its slider allows (a Length drive is at most 1000 percent of the rest).
const REST: Record<string, number> = { front: 55, top: 70, left: 14, right: 14, back: 28, nape: 18 }
const LEAST: Record<string, number> = { front: 10, top: 0, left: 0, right: 0, back: 10, nape: 10 }
const MOST: Record<string, number> = { front: 200, top: 300, left: 138, right: 138, back: 150, nape: 178 }
// How far each plane is drawn in the drawing order, in front and from behind (the front of the head in front of the face, the top, back and nape behind it; from behind the other
// way round).
const DEPTH: Record<string, [number, number]> = { front: [51, 5], top: [9.5, 53], left: [52, 50], right: [52, 50], back: [10, 52], nape: [9, 51] }

const cellId = (plane: string, side: string): string => `${plane}.${side}`
const objectId = (plane: string, side: string): string => `hair.${cellId(plane, side)}`
const shapeId = (plane: string, side: string): string => `hr_${plane}_${side}`
const shadeId = (plane: string, side: string): string => `hs_${plane}_${side}`
const capId = (plane: string, side: string): string => `hc_${plane}_${side}`
export const lengthId = (plane: string, side: string): string => `len_${plane}_${side}`
export const textureId = (plane: string, side: string): string => `tex_${plane}_${side}`
const titleOf = (plane: string, side: string): string => (plane === 'left' || plane === 'right' ? PLANE_NAMES[plane] : `${PLANE_NAMES[plane]}, ${SIDE_NAMES[side]}`)

// ---- the old portrait's skull and hairline, on the mannequin's head ----

// The skull is a superellipse (exponent 2.7: fuller at the crown than an egg) about the middle of the head; the old portrait's skull (rx 30.8, ry 47.84, its middle 47.84 below
// the crown) at 54/92 of its size, with its crown on the mannequin's (y -13).
const SK = { cx: 100, cy: 15.08, rx: 18.08, ry: 28.08 }
const APEX = 2.7
// A point `e` beyond the skull at an angle (0 at the side, on the picture's right; 90 at the crown).
const sk = (deg: number, e: number): [number, number] => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), n = 2 / APEX
  return [SK.cx + (SK.rx + e) * Math.sign(c) * Math.abs(c) ** n, SK.cy - (SK.ry + e) * Math.sign(s) * Math.abs(s) ** n]
}
// Half the width `e` beyond the skull at a height (below its widest it keeps the widest).
const halfAt = (y: number, e: number): number => (y >= SK.cy ? SK.rx + e : (SK.rx + e) * Math.pow(1 - Math.min(1, (SK.cy - y) / (SK.ry + e)) ** APEX, 1 / APEX))
// The angle `e` beyond the skull at a distance across from the middle, or at a height.
const angleAtX = (dx: number, e: number): number => (Math.acos(Math.min(1, Math.abs(dx) / (SK.rx + e)) ** (APEX / 2)) * 180) / Math.PI
const angleAtY = (y: number, e: number): number => (Math.asin(Math.min(1, Math.max(0, (SK.cy - y) / (SK.ry + e))) ** (APEX / 2)) * 180) / Math.PI
const crownY = (dx: number, e: number): number => sk(angleAtX(dx, e), e)[1]
// Points `e` beyond the skull from one angle to another.
const arc = (e: number, a0: number, a1: number, n: number): Array<[number, number]> => Array.from({ length: n }, (_, i) => sk(a0 + ((a1 - a0) * i) / (n - 1), e))

// The old portrait's default hairline (its right half, across from the middle), pulled inside the edge of the face.
const HAIRLINE: Array<[number, number]> = [[0, -2.9], [8.1, -3.6], [14.5, -3.0], [16.1, -0.1], [17.7, 7.6], [18.3, 10.5]]
const hairlineY = (dx: number): number => {
  const a = Math.abs(dx)
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [x0, y0] = HAIRLINE[i - 1], [x1, y1] = HAIRLINE[i]
    if (a <= x1) return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0)
  }
  return HAIRLINE[HAIRLINE.length - 1][1]
}

// Where the sections meet: the centre column is 7 units either side of the middle and each piece reaches 0.75 past its edge (an overlap of 1.5).
const XC = 7, OV = 0.75
const ROOT_E = 0.6   // the roots along the crown, just over the skull
const CAP_E = 2.2    // how far the cap stands off the skull (the old short cap: 2.5 at the crown, 2 at the sides)
const TOP_E = 3      // the top of the hair at rest, past the cap so that its edge is the outline of the crown

// A point of a piece: where it is, its weight (none: a root) and whether it is a sharp corner.
interface P { x: number; y: number; w?: number; sharp?: boolean }
const pt = (x: number, y: number, w?: number): P => ({ x: r2(x), y: r2(y), ...(w ? { w } : {}) })
const corner = (x: number, y: number): P => ({ x: r2(x), y: r2(y), sharp: true })
const toPoints = (list: P[]): ModelPoint[] => list.map(p => ({ x: p.x, y: p.y, m: p.sharp ? 's' : 'c', ...(p.w ? { w: p.w } : {}) }))
// The other side of a piece: mirrored across the middle, in the other order (so the outline runs the same way round), and its moves with it.
const mirrorPts = (list: P[]): P[] => [...list].reverse().map(p => ({ ...p, x: r2(200 - p.x) }))
const mirrorMoves = (moves: Move[], n: number): Move[] => moves.map(([i, dx, dy]) => [n - 1 - i, -dx, dy])

// [point, how far across, how far down] at the slider's maximum
type Move = [number, number, number]
interface Piece { pts: P[]; shade?: P[]; cap: P[]; grow?: Move[]; volume?: Move[] }

// Points moved straight out from the middle of the skull (the volume of curly and coily hair), by `amount` (a little less where a point barely hangs), so the crown grows round.
// (Below the widest point of the skull, straight out to the side.)
const outward = (list: P[], amount: number): Move[] =>
  list.flatMap((p, i): Move[] => {
    if (!p.w) return []
    const dx = p.x - SK.cx, dy = p.y - Math.max(p.y, SK.cy), len = Math.hypot(dx, dy) || 1
    const k = amount * Math.max(0.6, p.w)
    return [[i, r2((dx / len) * k), r2((dy / len) * k)]]
  })

// ---- the pieces at rest (the centre ones, and the left ones: the character's left, the picture's right) ----

function frontCenter(): Piece {
  const roots = [-7.25, -3.6, 0, 3.6, 7.25].map(dx => pt(100 + dx, crownY(dx, ROOT_E)))
  const line = [7.4, 3.7, 0, -3.7, -7.4].map(dx => pt(100 + dx, hairlineY(dx), 1))
  const pts = [...roots, pt(107.65, -8.6, 0.35), ...line, pt(92.35, -8.6, 0.35)]
  const top = [-7.75, -3.9, 0, 3.9, 7.75].map(dx => pt(100 + dx, crownY(dx, CAP_E)))
  const cap: P[] = [corner(top[0].x, top[0].y), top[1], top[2], top[3], corner(top[4].x, top[4].y), ...[7.75, 3.9, 0, -3.9, -7.75].map((dx, i, a) => (i === 0 || i === a.length - 1 ? corner(100 + dx, hairlineY(dx) - 0.15) : pt(100 + dx, hairlineY(dx) - 0.15)))]
  return { pts, cap }
}

function frontLeft(): Piece {
  const a0 = angleAtX(6.4, ROOT_E), a1 = angleAtY(-1.2, ROOT_E)
  const roots = arc(ROOT_E, a0, a1, 4).map(([x, y]) => pt(x, y))
  const pts = [...roots, pt(100 + halfAt(1.3, 2), 1.3, 0.5), pt(116.1, 0.1, 0.9), pt(114.5, -3, 1), pt(110.5, hairlineY(10.5), 1), pt(106.6, hairlineY(6.6), 1), pt(106.1, -8.2, 0.35)]
  const outer = arc(CAP_E, angleAtX(6.25, CAP_E), angleAtY(1.5, CAP_E), 6)
  const cap: P[] = [corner(outer[0][0], outer[0][1]), ...outer.slice(1, -1).map(([x, y]) => pt(x, y)), corner(outer[5][0], outer[5][1]), corner(116, -0.4), pt(114.5, -3.15), pt(110.5, hairlineY(10.5) - 0.15), corner(106.25, hairlineY(6.25) - 0.15)]
  return { pts, cap }
}

function topCenter(): Piece {
  const roots = [pt(92.75, -1.4), pt(96.4, -1.55), pt(100, -1.6), pt(103.6, -1.55), pt(107.25, -1.4)]
  const crown = [[7.6, 0.75], [5, 0.88], [2.5, 0.97], [0, 1], [-2.5, 0.97], [-5, 0.88], [-7.6, 0.75]].map(([dx, w]) => pt(100 + dx, crownY(dx, TOP_E), w))
  const pts = [...roots, pt(107.9, -4.5, 0.3), ...crown, pt(92.1, -4.5, 0.3)]
  const top = [7.75, 3.9, 0, -3.9, -7.75].map(dx => pt(100 + dx, crownY(dx, CAP_E)))
  const cap: P[] = [corner(92.25, -1), pt(100, -1.1), corner(107.75, -1), corner(top[0].x, top[0].y), top[1], top[2], top[3], corner(top[4].x, top[4].y)]
  return { pts, cap, volume: outward(pts, 4.5) }
}

function topLeft(): Piece {
  // its roots at the height of the top centre's and its weights falling away from the middle as the centre's do, so the two rise together and the crown stays round
  const roots = [pt(106.25, -1.4), pt(110.4, -1.4), pt(114.6, -1.4), pt(100 + halfAt(-1, 0), -1)]
  const dome = [[30, 2.8, 0.3], [45, TOP_E, 0.5], [58, TOP_E, 0.7], [70, TOP_E, 0.82]].map(([a, e, w]) => { const [x, y] = sk(a, e); return pt(x, y, w) })
  const end = sk(angleAtX(5.6, TOP_E), TOP_E)
  const pts = [...roots, pt(100 + halfAt(2.5, 2.3), 2.5, 0.12), ...dome, pt(end[0], end[1], 0.9), pt(105.6, -6, 0.4)]
  const outer = arc(CAP_E, angleAtX(6.25, CAP_E), angleAtY(-0.8, CAP_E), 6)
  const cap: P[] = [corner(outer[0][0], outer[0][1]), ...outer.slice(1, -1).map(([x, y]) => pt(x, y)), corner(outer[5][0], outer[5][1]), pt(112, -0.9), corner(106.25, -1)]
  return { pts, cap, volume: outward(pts, 6) }
}

function sideLeft(): Piece {
  const pts = [pt(115.6, -1.1), pt(116.9, -1.25), pt(118.2, -1), pt(100 + halfAt(4, 2.4), 4, 0.45), pt(100 + halfAt(8.5, 2.6), 8.5, 0.8), pt(120.4, 11, 1), pt(119.5, 11.5, 1), pt(118.6, 11.4, 1), pt(117.7, 7.6, 0.65), pt(116.8, 3.4, 0.3)]
  const shade = [pt(117, 2.6, 0.25), pt(117.9, 7.6, 0.65), pt(118.7, 11.3, 1), pt(119.5, 11.2, 1), pt(118.9, 7.5, 0.65), pt(118, 2.6, 0.25)]
  const cap: P[] = [corner(115.5, -1.4), pt(117.2, -1.6), corner(100 + halfAt(-1.4, CAP_E), -1.4), pt(100 + halfAt(3, 2), 3), pt(100 + halfAt(7, 2), 7), corner(100 + halfAt(10.8, 2), 10.8), pt(119.3, 11), corner(118.4, 10.6), pt(117.7, 7.6), pt(116.8, 3.4), pt(116.1, -0.1)]
  // a curtain flares out as it grows, and its inside comes in under the jaw; curly hair stands out from the face
  const grow: Move[] = [[3, 7, 0], [4, 10, 0], [5, 12, 0], [6, 9, 0], [7, 5, 0], [8, -1.5, 0]]
  const volume: Move[] = [[3, 3.2, 0], [4, 4.5, 0.5], [5, 4.5, 1.5], [6, 3, 1.5], [7, 1.2, 1]]
  return { pts, shade, cap, grow, volume }
}

function backCenter(): Piece {
  const pts = [pt(92.75, -2.5), pt(96.4, -2.5), pt(100, -2.5), pt(103.6, -2.5), pt(107.25, -2.5), pt(107.75, 7, 0.3), pt(107.75, 15.5, 0.7), pt(106.5, 21.6, 1), pt(103.2, 22.1, 1), pt(100, 22.3, 1), pt(96.8, 22.1, 1), pt(93.5, 21.6, 1), pt(92.25, 15.5, 0.7), pt(92.25, 7, 0.3)]
  const shade = [pt(93.2, 19.6, 0.85), pt(100, 20.3, 0.9), pt(106.8, 19.6, 0.85), pt(106.5, 21.6, 1), pt(100, 22.3, 1), pt(93.5, 21.6, 1)]
  const cap: P[] = [corner(92.25, -2.9), pt(100, -2.9), corner(107.75, -2.9), pt(107.75, 9.5), corner(107.75, 21.75), pt(100, 21.9), corner(92.25, 21.75), pt(92.25, 9.5)]
  return { pts, shade, cap, volume: [[9, 0, 2], [8, 0.6, 1.8], [10, -0.6, 1.8]] }
}

function backLeft(): Piece {
  const pts = [pt(106.25, -2.5), pt(109.8, -2.5), pt(113.3, -2.45), pt(100 + halfAt(-2.3, 0) + 0.2, -2.3), pt(100 + halfAt(2, 2.4), 2, 0.15), pt(100 + halfAt(8, 1.6), 8, 0.35), pt(118.9, 14.5, 0.65), pt(118.5, 20.2, 0.9), pt(116.8, 21.7, 1), pt(112.8, 22, 1), pt(108.8, 21.8, 1), pt(105.9, 21.4, 1), pt(105.75, 15, 0.7), pt(105.75, 7, 0.3)]
  const shade = [pt(106.1, 19.6, 0.85), pt(112.5, 20, 0.88), pt(118.4, 18.9, 0.85), pt(116.8, 21.7, 1), pt(112.8, 22, 1), pt(108.8, 21.8, 1)]
  const cap: P[] = [corner(106.25, -2.9), pt(111.5, -2.9), corner(100 + halfAt(-2.9, CAP_E), -2.9), pt(100 + halfAt(3, CAP_E), 3), pt(100 + halfAt(9, 1.4), 9), pt(119.1, 15), corner(118.3, 21.75), pt(113, 21.9), corner(106.25, 21.75), pt(106.25, 9.5)]
  // the hair behind the head spreads as it grows, and curly hair stands out
  const grow: Move[] = [[5, 2, 0], [6, 4, 0], [7, 6, 0], [8, 6, 0], [9, 3.5, 0], [10, 1, 0]]
  const volume: Move[] = [[4, 1.5, 0], [5, 3, 0], [6, 4, 0], [7, 4, 1], [8, 3, 1.5], [9, 1.5, 1.5]]
  return { pts, shade, cap, grow, volume }
}

function napeCenter(): Piece {
  const pts = [pt(93, 20.3), pt(96.5, 20.3), pt(100, 20.3), pt(103.5, 20.3), pt(107, 20.3), pt(107.75, 27, 0.5), pt(107.5, 33.4, 1), pt(103.8, 34.5, 1), pt(100, 35, 1), pt(96.2, 34.5, 1), pt(92.5, 33.4, 1), pt(92.25, 27, 0.5)]
  const shade = [pt(92.8, 32.2, 0.85), pt(100, 33.6, 0.9), pt(107.2, 32.2, 0.85), pt(103.8, 34.5, 1), pt(100, 35, 1), pt(96.2, 34.5, 1)]
  const cap: P[] = [corner(92.25, 20), pt(100, 20), corner(107.75, 20), pt(107.75, 27), corner(107.75, 33.6), pt(104, 34.7), pt(100, 35.2), pt(96, 34.7), corner(92.25, 33.6), pt(92.25, 27)]
  return { pts, shade, cap }
}

function napeLeft(): Piece {
  const pts = [pt(106.4, 20.3), pt(110.8, 20.3), pt(114.8, 20.3), pt(118.4, 20.3), pt(117.6, 23.6, 0.3), pt(116.3, 27.3, 0.6), pt(114.1, 30.7, 0.9), pt(111.5, 33, 1), pt(108.8, 34, 1), pt(106, 34.3, 1), pt(105.75, 27, 0.5)]
  const shade = [pt(106, 32.6, 0.85), pt(110.5, 31.8, 0.88), pt(113.8, 29.8, 0.85), pt(111.5, 33, 1), pt(108.8, 34, 1), pt(106, 34.3, 1)]
  const cap: P[] = [corner(106.25, 20), pt(113, 20), corner(118.7, 20), pt(117.8, 24), pt(116.5, 27.6), pt(114.3, 31), pt(111.6, 33.2), pt(108.8, 34.2), corner(106.25, 34.4), pt(106.25, 27)]
  return { pts, shade, cap, volume: [[4, 1.2, 0], [5, 2, 0.3], [6, 2, 0.8], [7, 1, 1]] }
}

const PIECES: Record<string, () => Piece> = {
  'front.center': frontCenter, 'front.left': frontLeft, 'top.center': topCenter, 'top.left': topLeft, 'left.center': sideLeft,
  'back.center': backCenter, 'back.left': backLeft, 'nape.center': napeCenter, 'nape.left': napeLeft,
}
// A piece of a cell: the left and centre ones as drawn, the right ones mirrored from the left.
function pieceOf(plane: string, side: string): Piece {
  const mirrored = side === 'right' || plane === 'right'
  const key = plane === 'right' ? 'left.center' : side === 'right' ? `${plane}.left` : cellId(plane, side)
  const p = PIECES[key]()
  if (!mirrored) return p
  const n = p.pts.length
  return { pts: mirrorPts(p.pts), cap: mirrorPts(p.cap), ...(p.shade ? { shade: mirrorPts(p.shade) } : {}), ...(p.grow ? { grow: mirrorMoves(p.grow, n) } : {}), ...(p.volume ? { volume: mirrorMoves(p.volume, n) } : {}) }
}

// ---- cuts ----

// The roots of a piece (the mean height of its points with no weight) and how far its ends hang from them at rest (negative: it stands up from them, as the top does).
const rootY = (pts: P[]): number => { const r = pts.filter(p => !p.w); return r.reduce((n, p) => n + p.y, 0) / Math.max(1, r.length) }
const tipY = (pts: P[]): number => { const t = pts.filter(p => (p.w ?? 0) >= 0.95); return t.reduce((n, p) => n + p.y, 0) / Math.max(1, t.length) }

// A cut of a piece: the same points (so the sliders that move points move them on every cut), with its ends shaped. Blunt is the piece as drawn; taper brings the ends to a
// point, round rounds them and layered staggers them.
function cut(pts: P[], kind: 'taper' | 'round' | 'layered', soft = 1): P[] {
  const hang = (tipY(pts) - rootY(pts)) * (kind === 'taper' ? 1 : soft), tips = pts.map((p, i) => ((p.w ?? 0) >= 0.95 ? i : -1)).filter(i => i >= 0)
  const m = tips.length
  return pts.map((p, i) => {
    const w = p.w ?? 0
    const j = tips.indexOf(i)
    if (j >= 0) {
      const u = m > 1 ? -1 + (2 * j) / (m - 1) : 0
      const dy = kind === 'taper' ? 0.22 * (1 - u * u) - 0.08 : kind === 'round' ? 0.1 * (1 - u * u) - 0.04 : (j % 2 === 0 ? 0.08 : -0.06)
      const dx = kind === 'round' && Math.abs(u) === 1 && m > 1 ? -u * 0.8 * Math.sign(pts[tips[m - 1]].x - pts[tips[0]].x) : 0
      return { ...p, x: r2(p.x + dx), y: r2(p.y + dy * hang) }
    }
    if (w >= 0.5) return { ...p, y: r2(p.y - (kind === 'taper' ? 0.05 : kind === 'layered' ? 0.08 : 0.02) * hang) }
    return p
  })
}

export interface Hair { shapes: ModelShape[]; objects: ModelObject[]; group: ModelGroup; ranges: ModelRange[]; presets: ModelPreset[] }

const points = (shape: string, list: Move[]): ModelDrive =>
  drive({ kind: 'points', shape, sym: false, moves: list.map(([i, dx, dy]): ModelMove => ({ i, dx, dy, dxMin: 0, dyMin: 0 })) })

export function hairParts(): Hair {
  const shapes: ModelShape[] = [], objects: ModelObject[] = [], ranges: ModelRange[] = []
  const fallDrives: ModelDrive[] = []
  for (const [plane, side] of CELLS) {
    const oid = objectId(plane, side), pid = shapeId(plane, side), sid = shadeId(plane, side), cid = capId(plane, side), title = titleOf(plane, side)
    const piece = pieceOf(plane, side), [z, zBack] = DEPTH[plane]
    const rest = REST[plane], least = LEAST[plane], most = MOST[plane]
    const base = { closed: true, op: 1, view: 'both' as const, half: 0, slot: 'k_hair' }
    // the cap first, so that the piece is drawn over it
    shapes.push({ ...base, id: cid, name: `Hair cap: ${title}`, z: z - 0.02, zBack: zBack - 0.02, pts: toPoints(piece.cap) })
    shapes.push({ ...base, id: pid, name: `Hair piece: ${title}`, z, zBack, pts: toPoints(piece.pts) })
    const ids = [cid, pid]
    if (piece.shade) {
      shapes.push({ ...base, id: sid, name: `Hair shade: ${title}`, z: z + 0.01, zBack: zBack + 0.01, op: 0.45, shade: { kind: 'shadow', t: 0.22 }, pts: toPoints(piece.shade) })
      ids.push(sid)
    }
    objects.push({
      id: oid, name: `Hair: ${title}`, layer: 'hair', shapes: ids,
      axes: [{
        id: 'cut', name: 'Cut', initial: 'blunt', roll: 0,
        options: [
          { id: 'blunt', name: 'Blunt', ovr: [] },
          ...(['taper', 'round', 'layered'] as const).map(k => ({ id: k, name: k === 'taper' ? 'Tapered' : k === 'round' ? 'Rounded' : 'Layered', ovr: [{ shape: pid, pts: toPoints(cut(piece.pts, k, plane === 'top' ? 0.4 : plane === 'front' ? 0.6 : 1)) }] })),
        ],
      }],
    })
    // Randomise leaves a section's length and texture where they are: a hairstyle sets them together, and rolled one by one they would make a different cut of every section
    const lengthDrives = [drive({ kind: 'prop', feature: 'object', id: oid, prop: 'length', atMin: r2((100 * least) / rest), atMax: r2((100 * most) / rest) })]
    if (piece.grow) lengthDrives.push(points(pid, piece.grow))
    ranges.push(range(lengthId(plane, side), 'Length', oid, least, rest, most, '%', lengthDrives, { rand: [rest, rest] }))
    const textureDrives = [drive({ kind: 'prop', feature: 'object', id: oid, prop: 'texture', atMin: 0, atMax: 99 })]
    if (piece.volume) textureDrives.push(points(pid, piece.volume))
    ranges.push(range(textureId(plane, side), 'Texture', oid, 0, 0, 99, '', textureDrives, { rand: [0, 0] }))
    if (plane === 'back' || plane === 'left' || plane === 'right') for (const id of [pid, ...(piece.shade ? [sid] : [])]) fallDrives.push(drive({ kind: 'fall', shape: id, atMin: 0, atMax: 100 }))
  }
  ranges.push(range('hairFall', 'Hair fall', 'hair', 0, 0, 100, '%', fallDrives))
  const group: ModelGroup = { id: 'hair', name: 'Hair', parent: 'head', objects: objects.map(o => o.id), pivot: [100, CHIN_Y], attach: null }
  return { shapes, objects, group, ranges, presets: hairStyles() }
}

// ---- hairstyles ----

// A style says where the ends of each plane (or one cell) come to, as a height on the figure (the top: where the crown of the hair is), and its texture, cut and the cells
// it leaves off; the slider values are worked out from the pieces at rest.
const CHIN = 41, SHOULDER = 64, CHEST = 96
interface Style { id: string; name: string; to: Record<string, number>; tex: number; cut: string; off?: string[] }
const SIDES_OF = (plane: string) => [cellId(plane, 'left'), cellId(plane, 'right')]
const ALL = CELLS.map(([p, s]) => cellId(p, s))
const STYLES: Style[] = [
  { id: 'short', name: 'Short', to: {}, tex: 0, cut: 'blunt' },
  { id: 'buzz', name: 'Buzzed', to: { front: -8, top: -10, left: 6, right: 6, back: 10, nape: 28 }, tex: 0, cut: 'blunt' },
  { id: 'pixie', name: 'Pixie', to: { front: 3, top: -19, left: 16, right: 16, back: 16, nape: 33 }, tex: 33, cut: 'layered' },
  { id: 'undercut', name: 'Undercut', to: { front: -1, top: -20 }, tex: 0, cut: 'blunt', off: ['left.center', 'right.center', ...SIDES_OF('back'), 'back.center', ...SIDES_OF('nape'), 'nape.center'] },
  { id: 'mohawk', name: 'Mohawk', to: { front: -4, top: -31, back: 30, nape: 42 }, tex: 0, cut: 'taper', off: ALL.filter(c => !c.endsWith('.center') || c === 'left.center' || c === 'right.center') },
  { id: 'shaved', name: 'Shaved on one side', to: { front: -3, top: -18, right: 60, back: 62, nape: 55 }, tex: 33, cut: 'blunt', off: ['left.center', 'front.left', 'top.left', 'back.left', 'nape.left'] },
  { id: 'bob', name: 'Bob', to: { front: 2.5, top: -17, left: CHIN - 3, right: CHIN - 3, back: CHIN - 3, nape: 35 }, tex: 0, cut: 'round' },
  { id: 'shoulder', name: 'Shoulder-length', to: { top: -17, left: SHOULDER, right: SHOULDER, back: SHOULDER + 2, nape: SHOULDER - 4 }, tex: 0, cut: 'blunt' },
  { id: 'long', name: 'Long and straight', to: { top: -17, left: CHEST, right: CHEST, back: CHEST + 6, nape: CHEST - 1 }, tex: 0, cut: 'blunt' },
  { id: 'wavy', name: 'Long and wavy', to: { top: -17.5, left: CHEST - 4, right: CHEST - 4, back: CHEST + 2, nape: CHEST - 6 }, tex: 33, cut: 'round' },
  { id: 'curls', name: 'Curls', to: { front: 1, top: -16.5, left: 46, right: 46, back: 50, nape: 45 }, tex: 66, cut: 'round' },
  { id: 'coils', name: 'Coils', to: { front: -1, top: -13.5, left: 27, right: 27, back: 30, nape: 36 }, tex: 99, cut: 'round' },
  { id: 'afro', name: 'Afro', to: { front: -1, top: -17.5, left: 33, right: 33, back: 36, nape: 40 }, tex: 99, cut: 'round' },
  { id: 'bald', name: 'Bald', to: {}, tex: 0, cut: 'blunt', off: ALL },
]

// The value of a cell's Length slider that brings the ends of its piece to a height (its roots stay; the slider stretches the ends from them).
function lengthTo(plane: string, side: string, y: number): number {
  const pts = pieceOf(plane, plane === 'top' ? 'center' : side).pts, root = rootY(pts), tip = tipY(pts), rest = REST[plane]
  const v = (rest * (y - root)) / (tip - root)
  return Math.round(Math.min(MOST[plane], Math.max(LEAST[plane], v)))
}

function hairStyles(): ModelPreset[] {
  return STYLES.map(st => {
    const values: Record<string, number> = {}, forms: Record<string, string> = {}
    for (const [plane, side] of CELLS) {
      const cell = cellId(plane, side)
      const to = st.to[cell] ?? st.to[plane]
      if (to != null) { const v = lengthTo(plane, side, to); if (Math.abs(v - REST[plane]) > 0.5) values[lengthId(plane, side)] = v }
      if (st.tex !== 0) values[textureId(plane, side)] = st.tex
      if (st.cut !== 'blunt') forms[`${objectId(plane, side)}.cut`] = st.cut
    }
    return { id: `hair_${st.id}`, name: st.name, kind: 'Hair style', values, hidden: (st.off ?? []).map(c => `hair.${c}`), forms }
  })
}
