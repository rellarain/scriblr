import type { MapLevel, MapLibraryShape, MapShapePoint } from '../../../../api/types'
import { SYMBOL_BOX, SYMBOL_SETS, UNKNOWN_SYMBOL_PATH } from './mapMarkerArt'
import { kindName } from './mapLibrary'
import { templatePoints } from './mapTemplates'

// The default shapes that come with the app: land forms, space objects, building parts and the markers (the old symbols' silhouettes, from their SVG
// paths). `npm run map-shapes` writes them to backend/app/seed/map_shapes.json, which a new install publishes as the admin's first version and which the
// server turns old symbols into; the design system's pretend backend reads the same list. Pure: the same build gives the same list.

// How much of this list a catalog has seen (raise it when shapes are added: they join the admin's draft and published list once).
export const SEED_VERSION = 1

export const LAND_LEVELS: MapLevel[] = ['planetary', 'continental', 'national', 'regional', 'local']
export const SPACE_LEVELS: MapLevel[] = ['intergalactic', 'galactic']
export const BUILDING_LEVELS: MapLevel[] = ['local', 'architectural', 'interior']

interface XY { x: number; y: number }

// ---- SVG paths to rings ----

// The rings of an SVG path (M, L, H, V, C, S, Q, T, A, Z, absolute or relative), each curve cut into short straight pieces. A ring is a subpath.
export function svgRings(path: string): XY[][] {
  const tokens = path.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  const rings: XY[][] = []
  let ring: XY[] = []
  let i = 0, cmd = ''
  let x = 0, y = 0, sx = 0, sy = 0
  let lastC: XY | null = null, lastQ: XY | null = null
  const num = () => Number(tokens[i++])
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])
  const push = (p: XY) => { const last = ring[ring.length - 1]; if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) ring.push(p) }
  const close = () => { if (ring.length >= 3) rings.push(ring); ring = [] }
  const pieces = (len: number) => Math.max(3, Math.min(16, Math.ceil(len / 1.2)))
  const cubic = (p0: XY, p1: XY, p2: XY, p3: XY) => {
    const n = pieces(Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y))
    for (let k = 1; k <= n; k += 1) {
      const t = k / n, u = 1 - t
      push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y })
    }
  }
  const quad = (p0: XY, p1: XY, p2: XY) => cubic(p0, { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) }, { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) }, p2)
  // An elliptical arc (SVG's endpoint form) as short straight pieces.
  const arc = (x1: number, y1: number, rx: number, ry: number, angle: number, large: number, sweep: number, x2: number, y2: number) => {
    if (rx === 0 || ry === 0) { push({ x: x2, y: y2 }); return }
    rx = Math.abs(rx); ry = Math.abs(ry)
    const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi)
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
    const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
    if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
    const sign = large === sweep ? -1 : 1
    const num_ = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    const coef = sign * Math.sqrt(Math.max(0, num_ / (rx * rx * yp * yp + ry * ry * xp * xp)))
    const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if (!sweep && dt > 0) dt -= Math.PI * 2
    if (sweep && dt < 0) dt += Math.PI * 2
    const n = pieces(Math.abs(dt) * Math.max(rx, ry))
    for (let k = 1; k <= n; k += 1) {
      const t = t1 + (dt * k) / n
      push({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos })
    }
  }
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        close()
        x = ox + num(); y = oy + num(); sx = x; sy = y
        push({ x, y })
        cmd = rel ? 'l' : 'L'
        lastC = lastQ = null
        break
      }
      case 'L': x = ox + num(); y = oy + num(); push({ x, y }); lastC = lastQ = null; break
      case 'H': x = (rel ? x : 0) + num(); push({ x, y }); lastC = lastQ = null; break
      case 'V': y = (rel ? y : 0) + num(); push({ x, y }); lastC = lastQ = null; break
      case 'C': {
        const p1: XY = { x: ox + num(), y: oy + num() }, p2: XY = { x: ox + num(), y: oy + num() }, p3: XY = { x: ox + num(), y: oy + num() }
        cubic({ x, y }, p1, p2, p3); lastC = p2; lastQ = null; x = p3.x; y = p3.y
        break
      }
      case 'S': {
        const p1: XY = lastC ? { x: 2 * x - lastC.x, y: 2 * y - lastC.y } : { x, y }
        const p2: XY = { x: ox + num(), y: oy + num() }, p3: XY = { x: ox + num(), y: oy + num() }
        cubic({ x, y }, p1, p2, p3); lastC = p2; lastQ = null; x = p3.x; y = p3.y
        break
      }
      case 'Q': {
        const p1: XY = { x: ox + num(), y: oy + num() }, p2: XY = { x: ox + num(), y: oy + num() }
        quad({ x, y }, p1, p2); lastQ = p1; lastC = null; x = p2.x; y = p2.y
        break
      }
      case 'T': {
        const p1: XY = lastQ ? { x: 2 * x - lastQ.x, y: 2 * y - lastQ.y } : { x, y }
        const p2: XY = { x: ox + num(), y: oy + num() }
        quad({ x, y }, p1, p2); lastQ = p1; lastC = null; x = p2.x; y = p2.y
        break
      }
      case 'A': {
        const rx = num(), ry = num(), angle = num(), large = num(), sweep = num()
        const ex = ox + num(), ey = oy + num()
        arc(x, y, rx, ry, angle, large, sweep, ex, ey); x = ex; y = ey; lastC = lastQ = null
        break
      }
      case 'Z': x = sx; y = sy; close(); lastC = lastQ = null; break
      default: i += 1
    }
  }
  close()
  // A ring does not end on its first point (it closes by itself), and keeps no point that lies on the line between its neighbours.
  return rings.map(r => {
    const open = r.length > 1 && Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y) < 1e-6 ? r.slice(0, -1) : r
    return open.filter((p, k) => {
      const a = open[(k - 1 + open.length) % open.length], b = open[(k + 1) % open.length]
      return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) > 1e-6
    })
  }).filter(r => r.length >= 3)
}

// ---- building the list ----

const corner = (p: XY): MapShapePoint => ({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000, smooth: false, hx: null, hy: null })
const unitBox = { x0: 0, y0: 0, x1: 1, y1: 1 }

type Base = Omit<MapLibraryShape, 'id' | 'name' | 'category' | 'levels' | 'type' | 'w' | 'h' | 'points' | 'holes'>
const REGION: Base = { style: 'solid', color: null, width: 0.1, fill: null, opacity: 1, pattern: 'solid', biome: null, heightMode: 'none', height: 0, profile: 'plateau', slope: 0, rough: 0 }
const MARKER: Base = { ...REGION, style: 'halo', width: 0.05 }
const LAND: Base = { ...REGION, width: 0.25 }

function marker(id: string, name: string, path: string, levels: MapLevel[]): MapLibraryShape {
  const rings = svgRings(path).map(r => r.map(p => corner({ x: p.x / SYMBOL_BOX, y: p.y / SYMBOL_BOX })))
  return { ...MARKER, id: `marker:${id}`, name, category: 'marker', levels, type: 'region', w: 2, h: 2, points: rings[0], holes: rings.slice(1) }
}

const shape = (id: string, name: string, category: MapLibraryShape['category'], levels: MapLevel[], type: MapLibraryShape['type'], w: number, h: number,
  points: MapShapePoint[], holes: MapShapePoint[][], base: Base, more: Partial<MapLibraryShape> = {}): MapLibraryShape =>
  ({ ...base, id, name, category, levels, type, w, h, points, holes, ...more })

// A ring of smooth points round an ellipse in the unit box (centre and radii in the box), with each radius scaled by `wobble`.
function ellipseRing(cx: number, cy: number, rx: number, ry: number, n: number, wobble: number[] = []): MapShapePoint[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2, s = wobble[k % (wobble.length || 1)] ?? 1
    return { x: Math.round((cx + rx * s * Math.sin(a)) * 10000) / 10000, y: Math.round((cy - ry * s * Math.cos(a)) * 10000) / 10000, smooth: true, hx: null, hy: null }
  })
}
const rect = (x0: number, y0: number, x1: number, y1: number): MapShapePoint[] => [corner({ x: x0, y: y0 }), corner({ x: x1, y: y0 }), corner({ x: x1, y: y1 }), corner({ x: x0, y: y1 })]

export function starterShapes(): MapLibraryShape[] {
  const out: MapLibraryShape[] = []
  // Land forms.
  out.push(
    shape('land:island', 'Island', 'land', LAND_LEVELS, 'biome', 12, 8, ellipseRing(0.5, 0.5, 0.48, 0.47, 10, [1, 0.86, 0.97, 0.8, 0.95, 1, 0.84, 0.93, 0.78, 0.96]), [], LAND, { biome: 'plain', rough: 35 }),
    shape('land:continent', 'Continent', 'land', LAND_LEVELS, 'biome', 40, 28, ellipseRing(0.5, 0.5, 0.49, 0.48, 16, [1, 0.8, 0.95, 0.7, 0.88, 1, 0.92, 0.66, 0.85, 0.97, 0.75, 1, 0.9, 0.72, 0.94, 0.83]), [], LAND, { biome: 'plain', rough: 45 }),
    shape('land:archipelago', 'Archipelago', 'land', LAND_LEVELS, 'biome', 20, 12, ellipseRing(0.22, 0.32, 0.18, 0.26, 8, [1, 0.85, 0.95, 0.8]),
      [ellipseRing(0.55, 0.22, 0.12, 0.18, 7, [1, 0.8, 0.9]), ellipseRing(0.8, 0.45, 0.15, 0.22, 8, [0.9, 1, 0.8, 0.95]), ellipseRing(0.45, 0.72, 0.13, 0.2, 7, [1, 0.85, 0.92]), ellipseRing(0.78, 0.84, 0.08, 0.12, 6)],
      LAND, { biome: 'plain', rough: 30 }),
    shape('land:lake', 'Lake', 'land', LAND_LEVELS, 'biome', 6, 4, ellipseRing(0.5, 0.5, 0.48, 0.46, 8, [1, 0.9, 0.97, 0.85]), [], LAND, { biome: 'freshwater', rough: 20 }),
    shape('land:mountain-range', 'Mountain range', 'land', LAND_LEVELS, 'biome', 16, 5, templatePoints('ridge', unitBox, { seed: 11 }), [], LAND,
      { biome: 'rocky', heightMode: 'raise', height: 2500, profile: 'peak', rough: 25 }),
    shape('land:ridge', 'Ridge', 'land', LAND_LEVELS, 'biome', 12, 3, templatePoints('ridge', unitBox, { seed: 5 }), [], LAND,
      { heightMode: 'raise', height: 1200, profile: 'peak', rough: 20 }),
    shape('land:valley', 'Valley', 'land', LAND_LEVELS, 'biome', 14, 4, ellipseRing(0.5, 0.5, 0.49, 0.45, 10, [1, 0.7, 0.75, 0.8, 0.72, 1, 0.7, 0.78, 0.8, 0.74]), [], LAND,
      { heightMode: 'lower', height: 400, profile: 'basin', rough: 10 }),
    shape('land:delta', 'Delta', 'land', LAND_LEVELS, 'biome', 10, 8,
      [corner({ x: 0.5, y: 0 }), { x: 0.85, y: 0.55, smooth: true, hx: null, hy: null }, { x: 1, y: 1, smooth: false, hx: null, hy: null }, { x: 0.5, y: 0.92, smooth: true, hx: null, hy: null }, corner({ x: 0, y: 1 }), { x: 0.15, y: 0.55, smooth: true, hx: null, hy: null }],
      [], LAND, { biome: 'swamp', rough: 30 }),
    shape('land:plateau', 'Plateau', 'land', LAND_LEVELS, 'biome', 10, 8, ellipseRing(0.5, 0.5, 0.49, 0.48, 8, [1, 0.97, 1, 0.95]), [], LAND,
      { heightMode: 'raise', height: 800, profile: 'plateau', slope: 1.5, rough: 25 }),
  )
  // Space objects (more in the space slice).
  const SPACE: Base = { ...REGION, style: 'halo', width: 0.05 }
  out.push(
    shape('space:star', 'Star', 'space', SPACE_LEVELS, 'region', 2, 2, ellipseRing(0.5, 0.5, 0.5, 0.5, 8), [], SPACE, { fill: '#f5c542' }),
    shape('space:planet', 'Planet', 'space', SPACE_LEVELS, 'region', 1.5, 1.5, ellipseRing(0.5, 0.5, 0.5, 0.5, 8), [], SPACE, { fill: '#5b8fd1' }),
    shape('space:ring', 'Ring', 'space', SPACE_LEVELS, 'region', 6, 2, ellipseRing(0.5, 0.5, 0.5, 0.5, 10), [ellipseRing(0.5, 0.5, 0.36, 0.3, 10)], SPACE, { fill: '#c9b48a', opacity: 0.85 }),
    shape('space:asteroid-belt', 'Asteroid belt', 'space', SPACE_LEVELS, 'region', 20, 20, ellipseRing(0.5, 0.5, 0.5, 0.5, 12), [ellipseRing(0.5, 0.5, 0.42, 0.42, 12)],
      { ...REGION, style: 'dotted', color: '#8a8273', width: 0.08 }, { fill: '#8a8273', opacity: 0.35, pattern: 'dots', rough: 30 }),
    shape('space:nebula', 'Nebula', 'space', SPACE_LEVELS, 'region', 14, 10, templatePoints('blob', unitBox, { seed: 23 }), [], { ...REGION, style: 'dotted', color: '#b48ce0', width: 0.06 },
      { fill: '#9a5fd0', opacity: 0.3, rough: 60 }),
  )
  // Building parts.
  const ROOM: Base = { ...REGION, style: 'wall', width: 0.25, fill: '#e8dcc4', opacity: 0.55 }
  const THING: Base = { ...REGION, style: 'solid', color: '#5a3b22', width: 0.05 }
  out.push(
    shape('building:room', 'Rectangular room', 'building', BUILDING_LEVELS, 'region', 6, 4, rect(0, 0, 1, 1), [], ROOM),
    shape('building:l-room', 'L-shaped room', 'building', BUILDING_LEVELS, 'region', 6, 6,
      [corner({ x: 0, y: 0 }), corner({ x: 0.5, y: 0 }), corner({ x: 0.5, y: 0.5 }), corner({ x: 1, y: 0.5 }), corner({ x: 1, y: 1 }), corner({ x: 0, y: 1 })], [], ROOM),
    shape('building:round-room', 'Round room', 'building', BUILDING_LEVELS, 'region', 5, 5, ellipseRing(0.5, 0.5, 0.5, 0.5, 8), [], ROOM),
    shape('building:tower', 'Tower', 'building', BUILDING_LEVELS, 'region', 4, 4, ellipseRing(0.5, 0.5, 0.5, 0.5, 8), [], ROOM, { fill: '#9a948c', opacity: 0.7 }),
    shape('building:stair', 'Stair', 'building', BUILDING_LEVELS, 'region', 2, 4, rect(0, 0, 1, 1), [], { ...REGION, color: '#5d564c', width: 0.05 }, { fill: '#b5aea3', opacity: 0.8, pattern: 'hatch' }),
    shape('building:table', 'Table', 'building', BUILDING_LEVELS, 'region', 2, 1.2, rect(0, 0, 1, 1), [], THING, { fill: '#8b5e3c' }),
    shape('building:bed', 'Bed', 'building', BUILDING_LEVELS, 'region', 1.2, 2.2, rect(0, 0, 1, 1), [rect(0.12, 0.05, 0.88, 0.25)], THING, { fill: '#c7b8a3' }),
  )
  // Markers: the old symbols, and a diamond for a place of no kind.
  for (const set of SYMBOL_SETS) {
    const levels = set.id === 'interior' ? BUILDING_LEVELS : LAND_LEVELS
    for (const s of set.symbols) out.push(marker(s.id, s.name, s.path, levels))
  }
  out.push(marker('place', 'Place', UNKNOWN_SYMBOL_PATH, []))
  return out
}

// The names of the markers that come with the app, by id (for the legend of a map whose marker is not in a library at hand).
const NAMES = new Map<string, string>(SYMBOL_SETS.flatMap(set => set.symbols.map(s => [`marker:${s.id}`, s.name] as [string, string])))
export const markerName = (kind: string) => NAMES.get(kind) ?? (kind.startsWith('marker:') ? kindName(kind) : 'Marker')
