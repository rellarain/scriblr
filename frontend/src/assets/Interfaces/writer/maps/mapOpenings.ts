import type { MapOpening, MapOpeningKind, MapShape } from '../../../../api/types'
import { bezierAt, nearestOnShape, segmentsOf } from './mapShapes'

// Doors, windows and arches in a wall, pure: a wall is a line drawn in the wall style; an opening sits on one piece of it (from point `seg` to the next),
// at `t` along it (its middle, 0-1), `width` cells wide. It stays on its piece when the wall is moved or a point of it is dragged, and moves to the right
// piece when a point is put in or taken away.

export const OPENING_KINDS: Array<{ id: MapOpeningKind; name: string }> = [{ id: 'door', name: 'Door' }, { id: 'window', name: 'Window' }, { id: 'arch', name: 'Arch' }]
export const OPENING_WIDTH = { min: 0.25, max: 8 } as const
export const MAX_OPENINGS = 64

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const r3 = (n: number) => Math.round(n * 1000) / 1000

// Whether a shape is a wall (openings can be put in it).
export const isWall = (shape: Pick<MapShape, 'type' | 'style'>) => shape.type === 'line' && shape.style === 'wall'

// How long each piece of a line is (in cells), measured along its curve.
export function pieceLengths(shape: Pick<MapShape, 'type' | 'points'>): number[] {
  return segmentsOf(shape).map(s => {
    if (s.straight) return Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    let len = 0, [px, py] = s.a
    for (let k = 1; k <= 16; k += 1) { const [x, y] = bezierAt(s, k / 16); len += Math.hypot(x - px, y - py); px = x; py = y }
    return len
  })
}

// Where an opening goes for a point near a wall: the piece nearest it and how far along (its middle, kept so the opening fits in the piece).
export function openingPlace(shape: MapShape, x: number, y: number, width: number): { seg: number; t: number } | null {
  const near = nearestOnShape(shape, x, y)
  if (!near) return null
  const len = pieceLengths(shape)[near.seg] ?? 0
  if (len <= 0) return null
  const half = Math.min(0.5, width / 2 / len)
  return { seg: near.seg, t: r3(clamp(near.t, half, 1 - half)) }
}

// A wall with a new opening at the point nearest (x, y): none when it is not a wall, is full, or the point is on no piece of it.
export function withOpening(shape: MapShape, x: number, y: number, kind: MapOpeningKind, width: number, id: string): MapShape | null {
  if (!isWall(shape) || (shape.openings?.length ?? 0) >= MAX_OPENINGS) return null
  const w = clamp(width, OPENING_WIDTH.min, OPENING_WIDTH.max)
  const at = openingPlace(shape, x, y, w)
  if (!at) return null
  return { ...shape, openings: [...(shape.openings ?? []), { id, seg: at.seg, t: at.t, width: w, kind, flip: false }] }
}

// An opening changed (its kind, width, place along its piece, the side a door swings to), held to its range.
export function editOpening(shape: MapShape, id: string, patch: Partial<Pick<MapOpening, 'kind' | 'width' | 't' | 'flip'>>): MapShape | null {
  const old = shape.openings?.find(o => o.id === id)
  if (!old) return null
  const next: MapOpening = {
    ...old,
    kind: patch.kind ?? old.kind,
    width: patch.width === undefined || !Number.isFinite(patch.width) ? old.width : r3(clamp(patch.width, OPENING_WIDTH.min, OPENING_WIDTH.max)),
    t: patch.t === undefined || !Number.isFinite(patch.t) ? old.t : r3(clamp(patch.t, 0, 1)),
    flip: patch.flip ?? old.flip,
  }
  if (JSON.stringify(next) === JSON.stringify(old)) return null
  return { ...shape, openings: shape.openings!.map(o => (o.id === id ? next : o)) }
}

export const withoutOpening = (shape: MapShape, id: string): MapShape => ({ ...shape, openings: (shape.openings ?? []).filter(o => o.id !== id) })

// The openings after a point was put in after point `seg` at `t` along that piece: the openings on that piece go to whichever half holds them.
export function openingsAfterInsert(openings: MapOpening[] | undefined, seg: number, t: number): MapOpening[] | undefined {
  if (!openings) return openings
  return openings.map(o => {
    if (o.seg < seg) return o
    if (o.seg > seg) return { ...o, seg: o.seg + 1 }
    return o.t <= t ? { ...o, t: r3(t > 0 ? o.t / t : 0.5) } : { ...o, seg: seg + 1, t: r3(t < 1 ? (o.t - t) / (1 - t) : 0.5) }
  })
}

// The openings after point `i` was taken away: the two pieces round it become one (an opening on either goes on the joined piece, about where it was);
// at an end of the line, the piece that went takes its openings with it.
export function openingsAfterRemove(openings: MapOpening[] | undefined, i: number, pieces: number): MapOpening[] | undefined {
  if (!openings) return openings
  const out: MapOpening[] = []
  for (const o of openings) {
    if (i === 0) { if (o.seg > 0) out.push({ ...o, seg: o.seg - 1 }); continue }
    if (i >= pieces) { if (o.seg < pieces - 1) out.push(o); continue }
    if (o.seg < i - 1) out.push(o)
    else if (o.seg === i - 1) out.push({ ...o, t: r3(o.t / 2) })
    else if (o.seg === i) out.push({ ...o, seg: i - 1, t: r3(0.5 + o.t / 2) })
    else out.push({ ...o, seg: o.seg - 1 })
  }
  return out
}

// The stretches of a wall that are open (for drawing it with gaps): per piece, the parts from..to (0-1 along it) that are openings.
export function gapsOf(shape: MapShape): Map<number, Array<{ from: number; to: number; opening: MapOpening }>> {
  const out = new Map<number, Array<{ from: number; to: number; opening: MapOpening }>>()
  const lengths = pieceLengths(shape)
  for (const o of shape.openings ?? []) {
    const len = lengths[o.seg]
    if (!len) continue
    const half = o.width / 2 / len
    const from = clamp(o.t - half, 0, 1), to = clamp(o.t + half, 0, 1)
    out.set(o.seg, [...(out.get(o.seg) ?? []), { from, to, opening: o }].sort((a, b) => a.from - b.from))
  }
  return out
}
