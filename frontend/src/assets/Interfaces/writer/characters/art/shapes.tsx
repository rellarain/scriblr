import type { ReactNode } from 'react'
import { clamp, lerp, num, rad, smoothPath, type V2 } from './space'

// Flat shapes with the modelling of a minimal fashion illustration: a limb or a garment is a contoured silhouette in one colour with one plane of shadow on the side away
// from the light (the light comes from the upper left of the picture), never an outline. The helpers here make the silhouette of a tapered, swelling limb and lay a plane
// of shadow over any outline.

export type Profile = (t: number) => number

// A swelling of a limb: `amt` (a fraction of its thickness) at `at` (0 to 1 along it), `wid` how wide it is.
export const bump = (at: number, amt: number, wid = 0.22): Profile => t => amt * Math.exp(-(((t - at) / wid) ** 2))

// The half thickness of a limb along it: `ra` at the start, `rb` at the end, with swellings (a calf, a muscle).
export function taper(ra: number, rb: number, ...bumps: Profile[]): Profile {
  return t => {
    const s = t * t * (3 - 2 * t)
    return lerp(ra, rb, s * 0.4 + t * 0.6) * (1 + bumps.reduce((sum, b) => sum + b(t), 0))
  }
}

export interface LimbGeometry {
  // The two sides (the one towards the light first), the line down the middle, the way across towards the shadow, and the way along.
  light: V2[]
  dark: V2[]
  centre: V2[]
  across: V2
  along: V2
  length: number
}

const STEPS = 8

export function limbGeometry(a: V2, b: V2, w: Profile, steps = STEPS): LimbGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const length = Math.hypot(dx, dy) || 1
  const along: V2 = [dx / length, dy / length]
  let across: V2 = [-along[1], along[0]]
  // The shadow is on the side that is to the right and below.
  if (across[0] + across[1] * 0.4 < 0) across = [-across[0], -across[1]]
  const light: V2[] = [], dark: V2[] = [], centre: V2[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const c: V2 = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
    const r = Math.max(0.5, w(t))
    centre.push(c)
    light.push([c[0] - across[0] * r, c[1] - across[1] * r])
    dark.push([c[0] + across[0] * r, c[1] + across[1] * r])
  }
  return { light, dark, centre, across, along, length }
}

// The round end of a limb: points round the end `p` (towards `dir`), from the light side to the dark side (`fromLight`) or back.
function cap(p: V2, dir: V2, across: V2, r: number, fromLight: boolean): V2[] {
  const sign = fromLight ? -1 : 1
  return [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6].map((phi): V2 => [
    p[0] + across[0] * sign * r * Math.cos(phi) + dir[0] * r * Math.sin(phi),
    p[1] + across[1] * sign * r * Math.cos(phi) + dir[1] * r * Math.sin(phi),
  ])
}

// The outline of a limb from `a` to `b` with the thickness `w(t)`, rounded at both ends.
export function limbOutline(g: LimbGeometry, w: Profile): V2[] {
  const rb = Math.max(0.5, w(1)), ra = Math.max(0.5, w(0))
  const end = g.centre[g.centre.length - 1], start = g.centre[0]
  const back: V2 = [-g.along[0], -g.along[1]]
  return [...g.light, ...cap(end, g.along, g.across, rb, true), ...g.dark.slice().reverse(), ...cap(start, back, g.across, ra, false)]
}

// A limb: its silhouette in the colour of the light side, and a plane of shadow down the side away from the light.
export function limbShape(a: V2, b: V2, w: Profile, color: string, dark: string, key: string, k = 0.9, share = 0.42): ReactNode {
  const g = limbGeometry(a, b, w)
  const outline = limbOutline(g, w)
  // The plane of shadow: the dark edge, then a line a little off the middle (`share` of the thickness is in shade).
  const inner = g.centre.map((c, i): V2 => {
    const r = Math.max(0.5, w(i / (g.centre.length - 1)))
    return [c[0] + g.across[0] * r * (1 - 2 * share), c[1] + g.across[1] * r * (1 - 2 * share)]
  })
  const tip: V2 = [g.centre[g.centre.length - 1][0] + g.along[0] * w(1) * 0.9 + g.across[0] * w(1) * 0.3, g.centre[g.centre.length - 1][1] + g.along[1] * w(1) * 0.9 + g.across[1] * w(1) * 0.3]
  const foot: V2 = [g.centre[0][0] - g.along[0] * w(0) * 0.9 + g.across[0] * w(0) * 0.3, g.centre[0][1] - g.along[1] * w(0) * 0.9 + g.across[1] * w(0) * 0.3]
  const band = [...g.dark, tip, ...inner.slice().reverse(), foot]
  return (
    <g key={key}>
      <path d={smoothPath(outline, true, k)} fill={color} />
      <path d={smoothPath(band, true, k)} fill={dark} />
    </g>
  )
}

// A plane of shadow over an outline: the shape in `color`, and the part of it that is right of a line near its middle (a little wavy) in `dark`, kept inside the shape by a
// clip path. `split` is where the line is across the shape (0 left edge, 1 right edge).
export function shadedShape(pts: V2[], k: number, color: string, dark: string, clipId: string, key: string, split = 0.62): ReactNode {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const d = smoothPath(pts, true, k)
  const cx = lerp(x0, x1, split)
  const hw = (x1 - x0) / 2
  const rows = 6
  const edge: V2[] = []
  for (let i = 0; i <= rows; i += 1) {
    const y = lerp(y0 - 2, y1 + 2, i / rows)
    edge.push([cx + Math.sin(i * 1.4) * hw * 0.05, y])
  }
  const region = [...edge, [x1 + 6, y1 + 2] as V2, [x1 + 6, y0 - 2] as V2]
  return (
    <g key={key}>
      <clipPath id={clipId}><path d={d} /></clipPath>
      <path d={d} fill={color} />
      <path d={smoothPath(region, true, 0.4)} fill={dark} clipPath={`url(#${clipId})`} />
    </g>
  )
}

// A fold of cloth: a short curved stroke in a darker tone of the garment.
export function foldLine(from: V2, to: V2, bend: number, color: string, width = 1.6, key: string): ReactNode {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2
  const dx = to[0] - from[0], dy = to[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const cx = mx + (-dy / len) * bend, cy = my + (dx / len) * bend
  return <path key={key} d={`M${num(from[0])} ${num(from[1])}Q${num(cx)} ${num(cy)} ${num(to[0])} ${num(to[1])}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
}

// The convex hull of points on the screen: the silhouette of a solid seen from any side (a foot, a hand).
export function hull(points: V2[]): V2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: V2[] = []
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: V2[] = []
  for (const q of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// A hand: a palm that widens to the knuckles and fingers that close to a rounded end, and a thumb on the side `thumb` (+1 or -1 across, 0 for none). Drawn from the
// wrist `w` towards `h`, `r` the half width of the wrist; the side away from the light is in shade.
export function handShape(w: V2, h: V2, r: number, thumb: number, color: string, dark: string, key: string): ReactNode {
  let dx = h[0] - w[0], dy = h[1] - w[1]
  let len = Math.hypot(dx, dy)
  if (len < 6) { dx = 0; dy = 1; len = 6 }
  const L = Math.max(len, r * 3.4)
  const u: V2 = [dx / len, dy / len]
  const v: V2 = [-u[1], u[0]]
  const at = (a: number, b: number): V2 => [w[0] + u[0] * a + v[0] * b, w[1] + u[1] * a + v[1] * b]
  const palm: V2[] = [
    at(-r * 0.2, -r * 0.92), at(L * 0.24, -r * 1.12), at(L * 0.52, -r * 1.22), at(L * 0.8, -r * 1.02), at(L * 1.04, -r * 0.62), at(L * 1.1, 0),
    at(L * 1.04, r * 0.62), at(L * 0.8, r * 1.02), at(L * 0.52, r * 1.22), at(L * 0.24, r * 1.12), at(-r * 0.2, r * 0.92),
  ]
  const sv = v[0] + v[1] * 0.4 >= 0 ? 1 : -1
  const shade: V2[] = sv > 0 ? [at(-r * 0.2, r * 0.3), at(L * 0.5, r * 0.35), palm[5], palm[6], palm[7], palm[8], palm[9], palm[10]] : [at(-r * 0.2, -r * 0.3), at(L * 0.5, -r * 0.35), palm[5], palm[4], palm[3], palm[2], palm[1], palm[0]]
  const fingers = [-0.44, 0, 0.44].map(f => {
    const a = at(L * 0.64, f * r * 1.6), b = at(L * 1.0, f * r * 1.5)
    return <path key={`f${f}`} d={`M${num(a[0])} ${num(a[1])}L${num(b[0])} ${num(b[1])}`} stroke={dark} strokeWidth={0.9} strokeLinecap="round" />
  })
  let thumbNode: ReactNode = null
  if (thumb !== 0) {
    const pts = [at(L * 0.1, thumb * r * 0.6), at(L * 0.22, thumb * r * 1.1), at(L * 0.44, thumb * r * 1.55), at(L * 0.66, thumb * r * 1.7), at(L * 0.7, thumb * r * 1.3), at(L * 0.5, thumb * r * 0.9)]
    thumbNode = <path d={smoothPath(pts, true, 1)} fill={thumb * sv > 0 ? dark : color} />
  }
  return (
    <g key={key}>
      <path d={smoothPath(palm, true, 1)} fill={color} />
      <path d={smoothPath(shade, true, 0.8)} fill={dark} />
      {thumbNode}
      {fingers}
    </g>
  )
}

export const tone = (v: number) => clamp(v, 0, 1)
export { rad }
