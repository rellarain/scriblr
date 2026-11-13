import type { MapEllipse, MapShape } from '../../../../api/types'
import { ellipseAt } from './mapOutline'
import { isClosed, shapeBounds, translateShape } from './mapShapes'

// Orbits on a space map, pure: an orbit is a shape of its own type with an ellipse (a centre, two radii, a turn); a planet, a moon or a station dropped
// near one goes round on it (`orbit`: the orbit's id and the angle along it) and keeps to it when it is dragged; moving, growing or turning the orbit
// takes its bodies with it, and deleting it lets them go where they are.

export const ORBIT_RADIUS = { min: 0.5, max: 512 } as const
export const ORBIT_TURN = { min: -180, max: 180 } as const
// How near its path (in cells) a body's middle must be dropped to be caught by an orbit: this much, or half the body's size if that is more.
export const SNAP_CELLS = 0.6

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round2 = (n: number) => Math.round(n * 100) / 100

// The middle of a shape and its size (the longer side of what is drawn).
export function middleOf(shape: MapShape): { x: number; y: number; size: number } {
  const b = shapeBounds({ ...shape, width: 0 })
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, size: Math.max(b.x1 - b.x0, b.y1 - b.y0) }
}

// The angle (degrees, 0 to 360) of the point of an ellipse nearest a point: a search by degrees, then by hundredths round the best.
export function nearestAngle(e: MapEllipse, x: number, y: number): number {
  const d = (a: number) => { const p = ellipseAt(e, a); return (p.x - x) ** 2 + (p.y - y) ** 2 }
  let best = 0, bestD = Infinity
  for (let a = 0; a < 360; a += 1) { const v = d(a); if (v < bestD) { bestD = v; best = a } }
  for (let a = best - 1; a <= best + 1; a += 0.01) { const v = d(a); if (v < bestD) { bestD = v; best = a } }
  return ((round2(best) % 360) + 360) % 360
}

// How far a point is from the path of an ellipse, in cells.
export function distanceToPath(e: MapEllipse, x: number, y: number): number {
  const p = ellipseAt(e, nearestAngle(e, x, y))
  return Math.hypot(p.x - x, p.y - y)
}

// Whether a shape can go round on an orbit: a filled shape (a planet, a moon, a station, a star) that is not a political area.
export const isBody = (shape: MapShape) => isClosed(shape) && !shape.political

const orbitsOf = (shapes: MapShape[]) => shapes.filter((s): s is MapShape & { ellipse: MapEllipse } => s.type === 'orbit' && !!s.ellipse)

// A body put on an orbit at an angle: its middle on the path (held to the map), and the orbit and angle kept on it.
export function placeOn(body: MapShape, orbit: MapShape & { ellipse: MapEllipse }, angle: number, width: number, height: number): MapShape {
  const p = ellipseAt(orbit.ellipse, angle)
  const m = middleOf(body)
  const moved = translateShape(body, p.x - m.x, p.y - m.y, width, height)
  return { ...moved, orbit: { id: orbit.id, angle: round2(((angle % 360) + 360) % 360) } }
}

// Where a body that was moved or placed sits: on its orbit, at the point nearest where it was dropped (it keeps to the orbit), or on an orbit it was
// dropped near (one it fits inside: its size under the orbit's smaller radius), or where it is. An orbit that is gone lets it go.
export function settleBody(shapes: MapShape[], body: MapShape, width: number, height: number): MapShape {
  if (!isBody(body)) return body
  const orbits = orbitsOf(shapes).filter(o => o.id !== body.id)
  const m = middleOf(body)
  if (body.orbit) {
    const own = orbits.find(o => o.id === body.orbit!.id)
    if (!own) return { ...body, orbit: null }
    return placeOn(body, own, nearestAngle(own.ellipse, m.x, m.y), width, height)
  }
  let best: { orbit: MapShape & { ellipse: MapEllipse }; d: number } | null = null
  for (const o of orbits) {
    if (Math.min(o.ellipse.rx, o.ellipse.ry) <= m.size * 0.75) continue
    const d = distanceToPath(o.ellipse, m.x, m.y)
    if (d <= Math.max(SNAP_CELLS, m.size / 2) && (!best || d < best.d)) best = { orbit: o, d }
  }
  return best ? placeOn(body, best.orbit, nearestAngle(best.orbit.ellipse, m.x, m.y), width, height) : body
}

// The shapes with the bodies of an orbit put back on it (after the orbit moved, grew or turned), each at its own angle.
export function followOrbit(shapes: MapShape[], orbit: MapShape, width: number, height: number): MapShape[] {
  if (orbit.type !== 'orbit' || !orbit.ellipse) return shapes
  const o = orbit as MapShape & { ellipse: MapEllipse }
  return shapes.map(s => (s.orbit?.id === o.id ? placeOn(s, o, s.orbit.angle, width, height) : s))
}

// The shapes with the bodies of an orbit let go where they are (the orbit is deleted).
export const letGo = (shapes: MapShape[], orbitId: string): MapShape[] => shapes.map(s => (s.orbit?.id === orbitId ? { ...s, orbit: null } : s))

// The bodies that lie on a new orbit's path (and are on no orbit) caught by it.
export function catchBodies(shapes: MapShape[], orbit: MapShape, width: number, height: number): MapShape[] {
  if (orbit.type !== 'orbit' || !orbit.ellipse) return shapes
  return shapes.map(s => (s.id !== orbit.id && !s.orbit && isBody(s) ? settleBody([orbit], s, width, height) : s))
}

// A new orbit: a circle round a centre, a dashed path in the map's ink.
export function makeOrbit(id: string, layerId: string, cx: number, cy: number, radius: number): MapShape {
  const r = round2(clamp(radius, ORBIT_RADIUS.min, ORBIT_RADIUS.max))
  return {
    id, layerId, type: 'orbit', points: [], ellipse: { cx: round2(cx), cy: round2(cy), rx: r, ry: r, turn: 0 },
    style: 'dashed', color: null, width: 0.06, fill: null, opacity: 1, pattern: 'solid',
  }
}

// An orbit's path changed: radii held to their range, the turn to -180..180 (wrapped), the centre to the map.
export function withEllipse(orbit: MapShape, patch: Partial<MapEllipse>, width: number, height: number): MapShape {
  const e = orbit.ellipse
  if (orbit.type !== 'orbit' || !e) return orbit
  const turn = patch.turn === undefined || !Number.isFinite(patch.turn) ? e.turn : ((((patch.turn + 180) % 360) + 360) % 360) - 180
  const r = (v: number | undefined, old: number) => (v === undefined || !Number.isFinite(v) ? old : round2(clamp(v, ORBIT_RADIUS.min, ORBIT_RADIUS.max)))
  const c = (v: number | undefined, old: number, hi: number) => (v === undefined || !Number.isFinite(v) ? old : round2(clamp(v, 0, hi)))
  return { ...orbit, ellipse: { cx: c(patch.cx, e.cx, width), cy: c(patch.cy, e.cy, height), rx: r(patch.rx, e.rx), ry: r(patch.ry, e.ry), turn: round2(turn) } }
}
