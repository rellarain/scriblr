// The fantasy elements and the jewellery: ears that are not human, horns and antlers, extra eyes, a crown, a hood, a necklace, and a hand raised at the shoulder holding something.
// Like the rest of the portrait they are filled shapes (no outlines), in the colours the author chose with one darker tone for the shade.

import { Shapes, band, clamp, ell, lerp, mirror, PI, poly, sample, spline, sym, type Pt } from '../paths'
import { fromHsl, mix, shade, toHsl } from '../colour'
import { fitHair, pick, TOPS } from '../library'
import { CROWNS, EYE_COUNTS, FANTASY_EARS, HOODED, HOODS, HORNS, ITEMS, NECKLACES } from '../fantasyLibrary'
import { faceX, headOutline, skull, type Rig } from '../rig'
import { type Drawn } from '../types'
import type { Expression } from '../library'
import { drawEyes } from './features'
import { crownVol, hairModel } from './hair'

// ---------- helpers ----------

// A gem's colour: a hue across the wheel from the metal it is set in, so a gold setting holds a blue-green stone.
export function gemOf(hex: string): string {
  const [h, s, l] = toHsl(hex)
  return fromHsl((h + 0.45) % 1, clamp(Math.max(s, 0.5), 0, 0.75), clamp(l * 0.8, 0.38, 0.5))
}
const light = (hex: string, t = 0.5) => mix(hex, '#ffffff', t)

// A smooth open curve through points (Catmull-Rom), `per` points to each stretch.
export function through(pts: Pt[], per = 6): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)))
    }
  }
  const last = pts[pts.length - 1]
  out.push([last[0], last[1]])
  return out
}

function rot(pts: Pt[], cx: number, cy: number, deg: number): Pt[] {
  const a = deg * PI / 180, c = Math.cos(a), s = Math.sin(a)
  return pts.map(q => [cx + (q[0] - cx) * c - (q[1] - cy) * s, cy + (q[0] - cx) * s + (q[1] - cy) * c, ...(q.length > 2 ? [q[2]] : [])])
}
// A rectangle with its corners cut.
function rrect(cx: number, cy: number, w: number, h: number, r: number): Pt[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2
  return [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]]
}
// A point at the fraction t along a curve.
function along(curve: Pt[], t: number): Pt {
  const f = clamp(t, 0, 1) * (curve.length - 1), i = Math.min(curve.length - 2, Math.floor(f)), u = f - i
  return [lerp(curve[i][0], curve[i + 1][0], u), lerp(curve[i][1], curve[i + 1][1], u)]
}
// A four-point sparkle.
function sparkle(cx: number, cy: number, r: number): string {
  return poly([[cx, cy - r], [cx + r * 0.22, cy - r * 0.22], [cx + r, cy], [cx + r * 0.22, cy + r * 0.22], [cx, cy + r], [cx - r * 0.22, cy + r * 0.22], [cx - r, cy], [cx - r * 0.22, cy - r * 0.22]])
}
// A flame: a teardrop of the given height whose tip leans.
function flame(out: Shapes, cx: number, base: number, h: number, w: number, lean: number): void {
  const shape = (k: number): string => spline([[cx, base], [cx - w * k, base - h * 0.28 * k], [cx - w * 0.5 * k + lean * 0.3, base - h * 0.66 * k], [cx + lean * k, base - h * k, 1], [cx + w * 0.5 * k + lean * 0.3, base - h * 0.66 * k], [cx + w * k, base - h * 0.28 * k]], true)
  out.add(ell(cx, base - h * 0.4, w * 2.6, h * 0.8), '#ffb347', 0.16)
  out.add(shape(1), '#f08a24')
  out.add(shape(0.68), '#ffd34d')
  out.add(shape(0.34), '#fff6c8')
}

// ---------- ears that are not human ----------

export function drawFantasyEars(out: Shapes, g: Rig, p: Drawn): void {
  const e = pick(FANTASY_EARS, p.fantasyEars), skin = p.skin
  const y0 = g.browY - 1, y1 = g.noseY + 1.5, h = (y1 - y0) * e.h, t = (y0 + y1) / 2 - h / 2
  const w = g.H * 0.1 * e.w * (g.child ? 0.95 : 1), x = 100 + g.cheek * 0.94
  const tipX = x + w * e.tipX, tipY = t + h * e.tipY
  let pts: Pt[], inner: Pt[]
  if (e.fin) {
    // A fan of three points with ribs between.
    pts = [[x - 3, t + h * 0.15], [x + w * 0.55, t - h * 0.02], [x + w * 1.0, t - h * 0.3, 1], [x + w * 0.6, t + h * 0.2], [x + w * 1.15, t + h * 0.36, 1], [x + w * 0.62, t + h * 0.58], [x + w * 0.9, t + h * 0.9, 1], [x + w * 0.3, t + h * 0.78], [x - 2, t + h * 0.85]]
    inner = []
  } else {
    pts = [[x - 3, t + h * 0.26], [x + w * 0.5, lerp(t + h * 0.26, tipY, 0.5)], [tipX, tipY, 1], [x + w * 0.7, lerp(tipY, t + h * 0.6, 0.55)], [x + w * 0.34, t + h * 0.9 + e.lobe * 1.5], [x - 2, t + h * 0.84]]
    const cx = x + w * 0.42, cy = lerp(t + h * 0.5, tipY, 0.3)
    inner = [[x + 0.5, t + h * 0.32], ...pts.slice(1, 4).map(q => [lerp(q[0], cx, 0.4), lerp(q[1], cy, 0.4)]), [x + 0.5, t + h * 0.72]]
  }
  out.add(spline(pts, true), skin)
  out.add(spline(pts.map(mirror), true), skin)
  if (inner.length > 0) {
    out.add(spline(inner, true), shade(skin, 0.18))
    out.add(spline(inner.map(mirror), true), shade(skin, 0.12))
  } else {
    ;[[0.3, -0.12], [0.45, 0.2], [0.35, 0.55]].forEach(([a, b]) => {
      const rib = [[x + 0.5, t + h * 0.45], [x + w * 0.6, t + h * (a + b) * 0.5], [x + w * 0.95, t + h * (b + 0.1)]]
      out.add(band(through(rib, 4), 0.5, 0.2), shade(skin, 0.22), 0.8)
      out.add(band(through(rib.map(mirror), 4), 0.5, 0.2), shade(skin, 0.22), 0.8)
    })
  }
}

// ---------- extra eyes ----------

// The eyes as the portrait says: the two of everyone, or one great one, with the extra ones drawn smaller where they lie.
export function drawEyeSet(out: Shapes, g: Rig, p: Drawn, ex: Expression): void {
  const n = pick(EYE_COUNTS, p.eyeCount).id
  if (n === 'one') {
    drawEyes(out, { ...g, eyeCX: 0, eyeHW: g.eyeHW * 1.55 }, p, ex, { sides: [1] })
    return
  }
  drawEyes(out, g, p, ex)
  if (n === 'two') return
  const q = { ...p, eyeTilt: 0 }
  const extra = (y: number, scale: number, cx: number, sides: number[]) => drawEyes(out, { ...g, eyeY: y, eyeHW: g.eyeHW * scale, eyeCX: cx }, q, ex, { mini: true, sides })
  const brow = (g.hairY + g.browY) / 2 + 1
  if (n === 'third') extra(brow, 0.64, 0, [1])
  if (n === 'four' || n === 'six') extra(brow, 0.6, g.eyeCX * 0.82, [1, -1])
  if (n === 'cheeks' || n === 'six') extra(g.eyeY + g.H * 0.125, 0.58, g.eyeCX * 1.16, [1, -1])
  if (n === 'temples') extra(g.eyeY - g.H * 0.06, 0.5, g.cheek * 0.84, [1, -1])
}

// ---------- horns and antlers ----------

// A horn along `curve`: a body tapering from `w0` to `w1`, a shade down one flank, a darker tip, and rings across it.
function horn(out: Shapes, curve: Pt[], w0: number, w1: number, col: string, rings = 0): void {
  const n = curve.length, dark = shade(col, 0.3)
  out.add(band(curve, w0, w1), col)
  out.add(band(curve, w0 * 0.5, w1 * 0.45, undefined, -0.75), dark, 0.5)
  const k = Math.floor((n - 1) * 0.66)
  out.add(band(curve.slice(k), lerp(w0, w1, k / (n - 1)) * 0.98, w1), mix(col, '#2b2622', 0.35))
  for (let i = 1; i <= rings; i++) {
    const idx = Math.round((i / (rings + 1)) * (n - 1) * 0.85), a = curve[Math.max(0, idx - 1)], b = curve[Math.min(n - 1, idx + 1)], q = curve[idx]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, wd = lerp(w0, w1, idx / (n - 1)) * 0.5
    out.add(band([[q[0] - (-dy / len) * wd, q[1] - (dx / len) * wd], [q[0] + (-dy / len) * wd, q[1] + (dx / len) * wd]], 0.8, 0.8), dark, 0.55)
  }
  // The base ring where it grows from the head.
  out.add(band(curve.slice(0, 3), w0 * 1.1, w0 * 0.95), shade(col, 0.15))
}

// How much a set of curves (in units of the head, from `root`) must shrink so that the highest of them stays inside the tile.
function fitScale(root: Pt, lists: number[][][], u: number): number {
  let rise = 0
  lists.forEach(l => l.forEach(c => { rise = Math.max(rise, -c[1] * u) }))
  const room = root[1] + 0 - 5
  return rise > room && rise > 0 ? Math.max(0.3, room / rise) : 1
}

export function drawHorns(out: Shapes, g: Rig, p: Drawn): void {
  const id = pick(HORNS, p.horns).id
  if (id === 'none') return
  const col = p.hornColor, u0 = g.H / 92
  // Points are in units of a head's height, from the root, to the picture's right; the left horn is the mirror. A horn that would rise out of the tile is made smaller.
  const pair = (root: Pt, parts: Array<{ pts: number[][]; w0: number; w1: number; rings?: number }>, per = 6, sym2 = true) => {
    const u = u0 * fitScale(root, parts.map(q => q.pts), u0)
    parts.forEach(q => {
      const curve = through(q.pts.map(c => [root[0] + c[0] * u, root[1] + c[1] * u]), per)
      horn(out, curve, q.w0 * u, q.w1 * u, col, q.rings || 0)
      if (sym2) horn(out, curve.map(mirror), q.w0 * u, q.w1 * u, col, q.rings || 0)
    })
  }
  const one = (deg: number, pts: number[][], w0: number, w1: number, rings = 0, e = -1.5) => pair(skull(g, deg, e), [{ pts, w0, w1, rings }])
  switch (id) {
    case 'nubs': one(66, [[0, 1], [2, -4], [5, -11]], 9, 2); break
    case 'devil': one(62, [[0, 1], [3, -9], [9, -18], [17, -24], [22, -22]], 9.5, 1.4, 2); break
    case 'bull': one(40, [[0, 0], [8, -1], [16, -3], [23, -8], [27, -16], [28, -23]], 10, 1.5, 2); break
    case 'long': one(70, [[0, 1], [3, -9], [7, -19], [13, -29], [21, -37], [30, -41]], 9.5, 1.2, 3); break
    case 'ram': {
      // A spiral from the temple, up and out, round and back in.
      const root = skull(g, 44, -1.5), u = u0 * 1.12, R = 15 * u, c: Pt = [root[0] + 13.5 * u, root[1] + 5.5 * u]
      const a0 = Math.atan2(root[1] - c[1], root[0] - c[0])
      const curve = sample(t => { const a = a0 + PI * 1.95 * t, r = R * (1 - 0.6 * t); return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] }, 22)
      horn(out, curve, 10 * u, 2 * u, col, 4)
      horn(out, curve.map(mirror), 10 * u, 2 * u, col, 4)
      break
    }
    case 'unicorn': {
      const root = skull(g, 90, -1.2), u = u0 * fitScale(root, [[[0, 0], [4, -32]]], u0)
      const curve = through([[root[0], root[1] + 2 * u], [root[0] + 1 * u, root[1] - 10 * u], [root[0] + 2.2 * u, root[1] - 21 * u], [root[0] + 3.4 * u, root[1] - 32 * u]], 6)
      horn(out, curve, 11 * u, 0.6 * u, col, 0)
      // the spiral of the horn: slanted ridges
      for (let i = 1; i <= 7; i++) {
        const q = along(curve, i / 8), wd = lerp(11, 0.6, i / 8) * u * 0.5
        out.add(band([[q[0] - wd, q[1] + 1.5 * u], [q[0] + wd, q[1] - 1.5 * u]], 0.8, 0.8), shade(col, 0.32), 0.6)
      }
      break
    }
    case 'antlers':
      pair(skull(g, 72, -1.5), [
        { pts: [[0, 1], [2, -8], [5, -15], [10, -21]], w0: 5.6, w1: 2 },
        { pts: [[2, -8], [8, -11], [13, -12]], w0: 3.4, w1: 1 },
        { pts: [[5, -15], [11, -19], [16, -20]], w0: 3.4, w1: 1 },
      ], 5)
      break
    case 'stag':
      pair(skull(g, 74, -1.5), [
        { pts: [[0, 1], [2, -8], [4, -17], [8, -26], [13, -35], [18, -43]], w0: 6.4, w1: 2 },
        { pts: [[2, -8], [10, -12], [17, -13]], w0: 3.6, w1: 1 },
        { pts: [[4, -17], [12, -22], [20, -24]], w0: 3.6, w1: 1 },
        { pts: [[8, -26], [16, -33], [23, -37]], w0: 3.6, w1: 1 },
        { pts: [[13, -35], [18, -40], [20, -46]], w0: 3.4, w1: 1 },
      ], 5)
      break
    case 'brow': {
      // A row of short spikes over the brow, the middle one the tallest.
      ;[150, 125, 100, 80, 55, 30].forEach((a, i) => {
        const rise = [6, 9, 13, 13, 9, 6][i] * u0
        const a0 = skull(g, a - 5, -1.2), a1 = skull(g, a + 5, -1.2), tip = skull(g, a, rise)
        out.add(spline([a0, [lerp(a0[0], tip[0], 0.55), lerp(a0[1], tip[1], 0.55) + 1], [tip[0], tip[1], 1], [lerp(a1[0], tip[0], 0.55), lerp(a1[1], tip[1], 0.55) + 1], a1], true), col)
        out.add(spline([a0, [lerp(a0[0], tip[0], 0.6), lerp(a0[1], tip[1], 0.6)], [tip[0], tip[1], 1]], true), shade(col, 0.3), 0.45)
      })
      break
    }
  }
}

// ---------- crowns and circlets ----------

// The line a circlet follows across the forehead: its half width, the height of its middle, and how far it sags toward the temples.
function crownLine(g: Rig) {
  const yc = g.hairY - 1.5
  const hw = faceX(g, yc + 6) + 2.4, sag = 5.5
  return { yc, hw, sag, at: (x: number) => yc + sag * Math.pow(x / hw, 2) }
}

export function drawCrown(out: Shapes, g: Rig, p: Drawn): void {
  const id = pick(CROWNS, p.crown).id
  if (id === 'none') return
  const col = p.crownColor, dark = shade(col, 0.3), gem = gemOf(col), u = g.H / 92
  const { hw, at } = crownLine(g)
  const curve = (w: number, off = 0) => sample(t => { const x = lerp(-hw, hw, t); return [100 + x, at(x) + off] }, 18)
  const bandAt = (th: number, off = 0) => {
    out.add(band(curve(th), th, th, th, 0), col)
    out.add(band(curve(th * 0.3, off - th * 0.22), th * 0.3, th * 0.3, th * 0.3), light(col, 0.45), 0.8)
  }
  switch (id) {
    case 'circlet': bandAt(3.2 * u); break
    case 'gem':
      bandAt(3 * u)
      out.add(spline([[100, at(0) + 1.5 * u], [100 + 3.6 * u, at(0) + 5 * u], [100, at(0) + 11 * u, 1], [100 - 3.6 * u, at(0) + 5 * u]], true), col)
      out.add(spline([[100, at(0) + 3 * u], [100 + 2.3 * u, at(0) + 5.4 * u], [100, at(0) + 9 * u, 1], [100 - 2.3 * u, at(0) + 5.4 * u]], true), gem)
      out.add(ell(100 - 0.7 * u, at(0) + 5 * u, 0.7 * u, 1.3 * u), light(gem, 0.6), 0.9)
      break
    case 'diadem': {
      bandAt(2.8 * u)
      const peak = (cx: number, w: number, h: number) => {
        const y = at(cx - 100)
        out.add(spline([[cx - w, y + 1], [cx - w * 0.7, y - h * 0.55], [cx, y - h, 1], [cx + w * 0.7, y - h * 0.55], [cx + w, y + 1]], true), col)
        out.add(ell(cx, y - h * 0.38, 1.1 * u, 1.1 * u), gem)
      }
      peak(100, 11 * u, 9 * u)
      peak(100 - hw * 0.5, 6 * u, 5 * u)
      peak(100 + hw * 0.5, 6 * u, 5 * u)
      break
    }
    case 'tiara': {
      bandAt(2.6 * u)
      ;[-0.72, -0.36, 0, 0.36, 0.72].forEach((f, i) => {
        const x = f * hw, y = at(x), h = [7, 11, 16, 11, 7][i] * u
        out.add(poly([[100 + x - 3.2 * u, y + 0.8], [100 + x, y - h, 1], [100 + x + 3.2 * u, y + 0.8]]), col)
        out.add(ell(100 + x, y - h - 0.6 * u, 1.5 * u, 1.5 * u), i === 2 ? gem : light(col, 0.5))
      })
      break
    }
    case 'spikes':
    case 'royal': {
      const royal = id === 'royal', th = (royal ? 6.5 : 5) * u
      const raise = (royal ? 0 : 0)
      out.add(band(curve(th), th, th, th), col)
      out.add(band(curve(th * 0.25, -th * 0.28), th * 0.25, th * 0.25, th * 0.25), light(col, 0.4), 0.8)
      const n = royal ? 5 : 7
      for (let i = 0; i < n; i++) {
        const f = lerp(-0.86, 0.86, i / (n - 1)), x = f * hw, y = at(x) - th * 0.3 + raise
        const h = (royal ? [11, 15, 19, 15, 11] : [8, 12, 15, 18, 15, 12, 8])[i] * u * (1 - Math.abs(f) * 0.05)
        const wd = (royal ? 4.2 : 3.4) * u
        out.add(poly([[100 + x - wd, y], [100 + x, y - h, 1], [100 + x + wd, y]]), col)
        out.add(poly([[100 + x - wd * 0.3, y - h * 0.35], [100 + x, y - h, 1], [100 + x + wd * 0.9, y]]), shade(col, 0.16), 0.5)
        if (royal) out.add(ell(100 + x, y - h - 1.2 * u, 1.9 * u, 1.9 * u), i === 2 ? gem : light(col, 0.45))
      }
      if (royal) [-0.5, 0, 0.5].forEach(f => out.add(ell(100 + f * hw, at(f * hw) - th * 0.05, 1.5 * u, 1.5 * u), f === 0 ? gem : mix(gem, '#b02a4a', 0.5)))
      break
    }
    case 'laurel': {
      // Leaves along the line, a row on each side, pointing toward the middle and a little up (the outer row) or down (the inner).
      ;[1, -1].forEach(k => {
        for (let i = 0; i < 6; i++) {
          const f = lerp(0.96, 0.12, i / 5), x = k * f * hw, y = at(x), len = 9.5 * u, wd = 3.4 * u
          ;[-1, 1].forEach(row => {
            const cx = 100 + x, cy = y + row * 0.6 * u - 0.4, ang = row < 0 ? -1.0 : 0.85
            const dx = -k * Math.cos(ang), dy = Math.sin(ang), tip: Pt = [cx + dx * len, cy + dy * len]
            const mid: Pt = [(cx + tip[0]) / 2, (cy + tip[1]) / 2], nx = -dy * wd, ny = dx * wd
            out.add(spline([[cx, cy], [mid[0] + nx, mid[1] + ny], [tip[0], tip[1], 1], [mid[0] - nx, mid[1] - ny]], true), row < 0 ? col : shade(col, 0.18))
          })
        }
      })
      out.add(band(curve(1), 0.9, 0.9, 0.9), dark)
      break
    }
    case 'flowers': {
      const petal = col, petal2 = fromHsl((toHsl(col)[0] + 0.08) % 1, Math.max(0.5, toHsl(col)[1]), clamp(toHsl(col)[2], 0.5, 0.72))
      out.add(band(curve(1.4), 1.4, 1.4, 1.4), '#4f7a3a')
      for (let i = 0; i < 8; i++) {
        const f = lerp(-0.9, 0.9, i / 7), x = f * hw, y = at(x)
        // a leaf between the flowers
        if (i < 7) {
          const lx = lerp(x, lerp(-0.9, 0.9, (i + 1) / 7) * hw, 0.5), ly = at(lx)
          out.add(ell(100 + lx, ly - 2.2 * u, 3.2 * u, 1.3 * u), '#5f8a3e')
        }
        const r = (i % 2 ? 3.6 : 4.6) * u, c = i % 2 ? petal2 : petal
        for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2 - PI / 2; out.add(ell(100 + x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, r * 0.52, r * 0.52), c) }
        out.add(ell(100 + x, y, r * 0.42, r * 0.42), '#f3d27a')
      }
      break
    }
  }
}

// ---------- hoods ----------

// How much room the hair takes at the crown (a hood is made large enough to cover it).
function hairVolume(g: Rig, p: Drawn): number {
  const q = fitHair(p), m = hairModel(g, q)
  if (m.len.id === 'bald') return 0
  return Math.max(m.V, m.hang ? crownVol(m) : 0)
}

// The hood behind the neck, when it is down: a roll of cloth on the shoulders, seen beside the neck.
export function drawHoodDown(out: Shapes, g: Rig, p: Drawn): void {
  if (pick(HOODS, p.hood).id !== 'down') return
  const N = g.neck, nb = g.neckBase, sy = g.shoulderY, S = g.S, col = p.hoodColor
  const right: Pt[] = [[100 + N - 1, g.chin - 6], [100 + N + 11, g.chin + 2], [100 + N + 24, nb - 12], [100 + N + 36, sy - 8], [100 + S * 0.78, sy + 4], [100 + N + 24, nb + 16], [100 + N + 6, nb + 9]]
  out.add(spline(sym(right), true), col)
  ;[1, -1].forEach(k => {
    out.add(band(through([[100 + k * (N + 11), g.chin + 4], [100 + k * (N + 22), nb - 8], [100 + k * (N + 33), sy - 5]], 4), 0.6, 1.6, 2), shade(col, 0.3), 0.55)
    out.add(band(through([[100 + k * (N + 6), nb - 2], [100 + k * (N + 18), nb + 8], [100 + k * (N + 28), sy + 3]], 4), 0.6, 1.4, 1.7), shade(col, 0.22), 0.45)
  })
}

// The hood up: a band of cloth round the head and over the shoulders, open at the face and down the front. `narrow` is how far it comes in over the face.
export function drawHood(out: Shapes, g: Rig, p: Drawn): void {
  const kind = pick(HOODS, p.hood).id
  if (!HOODED.includes(kind)) return
  const N = g.neck, nb = g.neckBase, sy = g.shoulderY, S = g.S, top = g.top, cy = g.sk.cy, rx = g.sk.rx, col = p.hoodColor
  const base = kind === 'cowl' ? 11 : kind === 'deep' ? 9 : 8
  const e = clamp(Math.max(base, hairVolume(g, p) + 4.5), base, 24)
  const loose = kind === 'cowl' ? 1 : 0
  const narrow = kind === 'deep' ? 3.4 : kind === 'cowl' ? -1 : 0

  // The outer edge on the right, from the crown down to the chest.
  const ro: Pt[] = []
  if (kind === 'pointed') {
    const up = 27 + e * 0.4
    ro.push([100 + 8, top - up, 1], [100 + (rx + e) * 0.42 + 5, top - up * 0.34], [100 + (rx + e) * 0.78, top + g.H * 0.08], [100 + rx + e - 1, cy - g.H * 0.2], [100 + rx + e, cy + 4])
  } else {
    ro.push([100, top - e])
    ;[74, 58, 42, 26, 10].forEach(a => ro.push(skull(g, a, e)))
  }
  ro.push(
    [100 + rx + e + 1 + loose * 2, g.chin - 8], [100 + lerp(rx + e, S * 0.9, 0.55) + loose * 2, lerp(g.chin, sy, 0.6)],
    [100 + S * 0.93 + loose * 3, sy + 2 + loose * 4], [100 + S * 0.8, sy + 14 + loose * 8], [100 + S * 0.56, nb + 24 + loose * 10], [100 + N + 13, nb + 30 + loose * 10],
    [100 + N + 6.5, nb + 26 + loose * 6, 1],
  )

  // The opening on the right, from the chest up: along the neck, round the jaw and the cheek, and over the brow to the middle.
  const outline = headOutline(g)
  const ri: Pt[] = [[100 + N - 0.2, nb - 5]]
  const jawPts: Pt[] = []
  for (let i = outline.length - 2; i >= 4; i--) {
    const q = outline[i]
    if (q[0] - 100 < N + 0.3 && jawPts.length === 0) { ri.push([100 + N - 0.2, q[1]]); continue }
    jawPts.push([q[0] - narrow * 0.4 * (i <= 5 ? 1 : 0.4), q[1]])
  }
  ri.push(...jawPts)
  const a0y = kind === 'deep' ? lerp(g.hairY, g.browY, 0.58) : g.hairY - 1
  ri.push(
    [100 + g.fore * 0.99 - narrow, a0y + (cy - a0y) * 0.7], [100 + g.fore * 0.88 - narrow * 0.6, a0y + (cy - a0y) * 0.34], [100 + g.fore * 0.55, a0y + 1.4], [100, a0y],
  )

  const mir = (list: Pt[]) => list.map(mirror)
  const poly1: Pt[] = [...ro, ...ri, ...mir(ri.slice(0, -1)).reverse(), ...mir(ro.slice(1)).reverse()]
  out.add(spline(poly1, true), col)

  // Shade: under the rim of the drape, and the lining along the opening.
  const lower = [ro[ro.length - 4], ro[ro.length - 3], ro[ro.length - 2], ro[ro.length - 1]]
  ;[false, true].forEach(m => {
    const lw = lower.map(q => (m ? mirror(q) : q))
    out.add(band(through(lw, 4), 3.2, 2.2, 3.2, -0.9), shade(col, 0.22), 0.55)
  })
  const opening: Pt[] = [...ri, ...mir(ri.slice(0, -1)).reverse()]
  out.add(band(through(opening, 3), 1.9, 1.9, 2.2, 0.92), shade(col, 0.26))
  out.add(band(through(opening, 3), 0.6, 0.6, 0.7, 0.0), light(col, 0.12), 0.3)
  // Seams and folds.
  const seamTop = kind === 'pointed' ? [100 + 8, top - (27 + e * 0.4) + 3] : [100, top - e + 2.5]
  out.add(band(through([seamTop, [100 + 1, lerp(seamTop[1], a0y, 0.5)], [100, a0y - 2]], 4), 0.5, 1.4, 1.7), shade(col, 0.3), 0.55)
  ;[1, -1].forEach(k => {
    out.add(band(through([[100 + k * (rx + e) * 0.62, top + g.H * 0.05], [100 + k * (rx + e - 3.4), cy], [100 + k * (rx + e - 1.5 + loose * 2), g.chin - 3], [100 + k * (S * 0.66), sy + 3]], 4), 0.5, 1.6, 2), shade(col, 0.24), 0.5)
  })
  // The face in the shade of a deep hood.
  if (kind === 'deep') {
    const arch: Pt[] = ri.slice(-4)
    ;[[g.eyeY - g.H * 0.04, 0.26], [g.browY - g.H * 0.02, 0.22]].forEach(([yb, a]) => {
      const edge = [...arch, ...mir(arch.slice(0, -1)).reverse()]
      const w = (arch[0][0] - 100) * 0.98
      out.add(spline([...edge, [100 - w, yb], [100, yb + 3], [100 + w, yb]], true), shade(p.skin, 0.55), a)
    })
  }
}

// ---------- necklaces ----------

export function drawNecklace(out: Shapes, g: Rig, p: Drawn): void {
  const id = pick(NECKLACES, p.necklace).id
  if (id === 'none') return
  const col = p.necklaceColor, dark = shade(col, 0.32), N = g.neck, nb = g.neckBase, sc = clamp(g.S / 86, 0.7, 1.2)
  const y0 = lerp(g.chin, nb, 0.66), dep = (id === 'chain' || id === 'beads' || id === 'pearls' ? 15 : 18) * sc
  const reach = N + 1.4
  const u = (x: number) => y0 + dep * (1 - Math.pow(x / reach, 2))
  const hang = sample(t => { const x = lerp(-reach, reach, t); return [100 + x, u(x)] }, 20)
  const tail = u(0)
  const pendant = (shape: () => void) => { out.add(band([[100, tail - 1], [100, tail + 2]], 1.2, 1.2), col); shape() }
  switch (id) {
    case 'chain': out.add(band(hang, 1.4, 1.4, 1.4), col); out.add(band(hang.map(q => [q[0], q[1] - 0.5]), 0.4, 0.4, 0.4), light(col, 0.5), 0.8); break
    case 'choker': {
      const yc = lerp(g.chin, nb, 0.56), c = sample(t => { const x = lerp(-N - 0.4, N + 0.4, t); return [100 + x, yc + 4 * (1 - Math.pow(x / (N + 0.4), 2))] }, 14)
      out.add(band(c, 3.4, 3.4, 3.4), col)
      out.add(band(c.map(q => [q[0], q[1] - 0.8]), 0.7, 0.7, 0.7), light(col, 0.45), 0.7)
      out.add(ell(100, yc + 4.4, 1.9, 1.9), gemOf(col))
      break
    }
    case 'beads': case 'pearls': {
      const n = 17, r = id === 'pearls' ? 2.3 : 1.9, c = id === 'pearls' ? mix(col, '#f4efe6', 0.72) : col
      out.add(band(hang, 0.5, 0.5, 0.5), dark, 0.7)
      for (let i = 0; i < n; i++) {
        const q = along(hang, (i + 0.5) / n), cc = id === 'beads' && i % 4 === 2 ? shade(col, 0.22) : c
        out.add(ell(q[0], q[1], r, r), cc)
        out.add(ell(q[0] - r * 0.3, q[1] - r * 0.3, r * 0.3, r * 0.3), '#ffffff', 0.75)
      }
      break
    }
    case 'pendant': out.add(band(hang, 1.4, 1.4, 1.4), col); pendant(() => { out.add(ell(100, tail + 6, 4.6, 4.6), col); out.add(ell(100, tail + 6, 2.9, 2.9), dark, 0.6); out.add(ell(99, tail + 5, 0.9, 0.9), light(col, 0.6)) }); break
    case 'amulet': out.add(band(hang, 1.4, 1.4, 1.4), col); pendant(() => {
      out.add(spline([[100, tail + 1], [100 + 5.4, tail + 7], [100, tail + 16, 1], [100 - 5.4, tail + 7]], true), col)
      out.add(spline([[100, tail + 3.2], [100 + 3.6, tail + 7.2], [100, tail + 13, 1], [100 - 3.6, tail + 7.2]], true), gemOf(col))
      out.add(ell(99, tail + 6.5, 0.8, 1.6), light(gemOf(col), 0.6), 0.9)
    }); break
    case 'locket': out.add(band(hang, 1.4, 1.4, 1.4), col); pendant(() => { out.add(ell(100, tail + 7, 4.4, 5.6), col); out.add(ell(100, tail + 7, 3.1, 4.2), shade(col, 0.1)); out.add(band([[100, tail + 3], [100, tail + 11]], 0.5, 0.5), dark, 0.6); out.add(ell(99, tail + 5, 0.9, 1.1), light(col, 0.6)) }); break
    case 'medallion': out.add(band(hang, 1.4, 1.4, 1.4), col); pendant(() => {
      out.add(ell(100, tail + 8, 7, 7), col); out.add(ell(100, tail + 8, 5.4, 5.4), dark, 0.55); out.add(ell(100, tail + 8, 4.6, 4.6), col)
      out.add(sparkle(100, tail + 8, 3.4), dark, 0.8)
    }); break
    case 'torc': {
      const yc = lerp(g.chin, nb, 0.62), reachT = N + 2.2
      ;[1, -1].forEach(k => {
        const c = sample(t => { const x = k * lerp(2.8, reachT, t); return [100 + x, yc + 5.5 * (1 - Math.pow(x / reachT, 2))] }, 10)
        out.add(band(c, 3.6, 3.6, 3.6), col)
        out.add(band(c.map(q => [q[0], q[1] - 0.9]), 0.7, 0.7, 0.7), light(col, 0.45), 0.7)
        out.add(ell(100 + k * 3.2, yc + 5.5, 2.5, 2.5), shade(col, 0.1))
      })
      break
    }
  }
}

// ---------- a hand raised at the shoulder, holding something ----------

interface Hand { x: number; y: number; k: number; sc: number; col: string; skin: string }

function hand(out: Shapes, h: Hand): void {
  const { x, y, k, sc, skin } = h
  const dark = shade(skin, 0.3)
  out.add(ell(x, y, 7.4 * sc, 6.6 * sc), skin)
  out.add(ell(x - k * 5.6 * sc, y - 1.6 * sc, 2.6 * sc, 3.4 * sc), skin)
  ;[-2.4, 0, 2.4].forEach(dy => out.add(band([[x - 5.6 * sc, y + dy * sc], [x + 5.6 * sc, y + dy * sc]], 0.5, 0.5), dark, 0.55))
  out.add(band([[x - k * 4 * sc, y - 4 * sc], [x - k * 7 * sc, y + 1 * sc]], 0.6, 0.6), dark, 0.5)
}

function sleeve(out: Shapes, p: Drawn, h: Hand): void {
  const { x, y, k, sc } = h
  const strapless = pick(TOPS, p.top).shape === 'strapless'
  const cloth = strapless ? p.skin : p.topColor, dark = shade(cloth, 0.2)
  const curve = through([[x + k * 7, 216], [x + k * 3.5, lerp(216, y, 0.55)], [x, y + 5 * sc]], 6)
  out.add(band(curve, 19 * sc, 14.5 * sc), cloth)
  out.add(band(curve, 9 * sc, 6 * sc, undefined, -0.8), dark, 0.55)
  if (!strapless) {
    out.add(band([[x - 8 * sc, y + 6.5 * sc], [x + 8 * sc, y + 6.5 * sc]], 3.4 * sc, 3.4 * sc), shade(cloth, 0.28))
    out.add(band([[x - 8 * sc, y + 4.6 * sc], [x + 8 * sc, y + 4.6 * sc]], 0.6, 0.6), mix(cloth, '#ffffff', 0.2), 0.6)
  }
}

export function drawHeldItem(out: Shapes, g: Rig, p: Drawn): void {
  const id = pick(ITEMS, p.heldItem).id
  if (id === 'none') return
  const k = p.heldSide === 'left' ? -1 : 1, sc = clamp(g.S / 86, 0.72, 1.18), col = p.itemColor
  const hx = 100 + k * g.S * 0.72
  // Some things are held high (a lantern hangs from the hand, a flower and a candle are shown up), the rest at the shoulder.
  const lift: Record<string, number> = { lantern: 40, candle: 14, goblet: 6, flower: 4, book: 4, openbook: 8, scroll: 2, quill: 4 }
  const hy = g.shoulderY - 6 - (lift[id] || 0)
  const h: Hand = { x: hx, y: hy, k, sc, col, skin: p.skin }
  const dark = shade(col, 0.3), gem = gemOf(col)
  const pole = (topY: number, w: number) => {
    const c = through([[hx, topY], [hx + k * 0.4, (topY + 214) / 2], [hx, 214]], 4)
    out.add(band(c, w, w * 1.1), col)
    out.add(band(c.map(q => [q[0] - 0.9, q[1]]), w * 0.25, w * 0.25), light(col, 0.4), 0.7)
    out.add(band(c, w * 0.4, w * 0.45, undefined, -0.8), dark, 0.5)
  }

  switch (id) {
    case 'staff': {
      const top = 36
      pole(top, 4.6)
      ;[-1, 0, 1].forEach(i => out.add(band(through([[hx + i * 1.2, top + 2], [hx + i * 6.6, top - 8], [hx + i * 3.6, top - 14]], 4), 2.2, 1.3), col))
      out.add(ell(hx, top - 8, 6.2, 6.2), gem)
      out.add(ell(hx - 1.8, top - 10, 1.8, 1.8), light(gem, 0.6), 0.9)
      break
    }
    case 'crook': {
      const top = 44
      pole(top, 4.6)
      const hook = sample(t => { const a = lerp(0, 1.25 * PI, t); return [hx - k * (7 - Math.cos(a) * 7), top - 1 - Math.sin(a) * 8.5] }, 12)
      out.add(band(hook, 4.6, 2.6), col)
      out.add(band(hook, 2, 1.1, undefined, -0.8), dark, 0.5)
      break
    }
    case 'crystal': {
      const top = 46
      pole(top, 4.4)
      out.add(ell(hx, top - 15, 13, 17), gem, 0.16)
      ;[-1, 1].forEach(m => out.add(band(through([[hx + m * 0.8, top + 2], [hx + m * 5.6, top - 6], [hx + m * 4.4, top - 12]], 4), 2, 1.2), col))
      out.add(poly([[hx, top - 31, 1], [hx + 6.2, top - 18], [hx + 4.4, top - 5], [hx - 4.4, top - 5], [hx - 6.2, top - 18]]), gem)
      out.add(poly([[hx, top - 31, 1], [hx + 6.2, top - 18], [hx + 1, top - 17]]), light(gem, 0.4), 0.85)
      out.add(poly([[hx, top - 31, 1], [hx - 6.2, top - 18], [hx - 1, top - 17]]), shade(gem, 0.2), 0.7)
      break
    }
    case 'wand': {
      const a: Pt = [hx - k * 3, hy + 9], b: Pt = [hx + k * 22, hy - 56]
      out.add(band([a, b], 4, 2), col)
      out.add(band([a, along([a, b], 0.3)], 4.6, 4.2), dark)
      out.add(ell(b[0], b[1], 16, 16), '#fff3b0', 0.2)
      out.add(sparkle(b[0], b[1], 7), '#fff6c4', 0.95)
      out.add(sparkle(b[0] + k * 8, b[1] + 8, 2.8), '#fff6c4', 0.8)
      break
    }
    case 'book': {
      const cx = hx - k * 2, cy = hy - 24, tilt = k * 5
      out.add(poly(rot(rrect(cx + k * 1.5, cy + 1.5, 31, 42, 3), cx, cy, tilt)), '#f2ead6')
      out.add(poly(rot(rrect(cx, cy, 31, 42, 3), cx, cy, tilt)), col)
      out.add(poly(rot(rrect(cx - k * 13, cy, 5.4, 42, 2), cx, cy, tilt)), dark)
      out.add(poly(rot(rrect(cx + k * 2, cy, 21, 31, 2), cx, cy, tilt)), mix(col, '#d9b04a', 0.35), 0.5)
      out.add(poly(rot(rrect(cx + k * 2, cy, 19, 29, 1.6), cx, cy, tilt)), col)
      out.add(ell(cx + k * 2, cy, 4.2, 4.2), '#d9b04a')
      out.add(ell(cx + k * 2, cy, 2.2, 2.2), gem)
      break
    }
    case 'openbook': {
      const cx = hx, cy = hy - 20
      out.add(poly(rrect(cx, cy + 1, 58, 38, 3)), col)
      out.add(spline([[cx - 27, cy - 16], [cx - 14, cy - 17.5], [cx - 1, cy - 14], [cx - 1, cy + 15], [cx - 14, cy + 17.5], [cx - 27, cy + 16]], true), '#f2ead6')
      out.add(spline([[cx + 27, cy - 16], [cx + 14, cy - 17.5], [cx + 1, cy - 14], [cx + 1, cy + 15], [cx + 14, cy + 17.5], [cx + 27, cy + 16]], true), '#e9dfc6')
      out.add(band([[cx, cy - 14], [cx, cy + 15]], 1.6, 1.6), shade('#e9dfc6', 0.25))
      ;[-1, 1].forEach(m => {
        for (let i = 0; i < 5; i++) out.add(band([[cx + m * 4, cy - 10 + i * 5.2], [cx + m * (20 - (i === 4 ? 6 : 0)), cy - 10.4 + i * 5.2]], 0.7, 0.7), '#8a7a5a', 0.55)
      })
      break
    }
    case 'scroll': {
      const cx = hx, cy = hy - 20, tilt = k * 14, parch = '#e8dcc0'
      const R = (pts: Pt[]) => rot(pts, cx, cy, tilt)
      out.add(poly(R(rrect(cx, cy, 6.4, 62, 1.4))), col)
      out.add(poly(R(rrect(cx, cy, 13.6, 46, 1.8))), parch)
      out.add(poly(R(rrect(cx + 3.4, cy, 6.4, 46, 1.4))), shade(parch, 0.14))
      ;[-23, 23].forEach(dy => { out.add(ell(R([[cx, cy + dy]])[0][0], R([[cx, cy + dy]])[0][1], 6.8, 2.2), shade(parch, 0.12)); out.add(ell(R([[cx, cy + dy]])[0][0], R([[cx, cy + dy]])[0][1], 3.2, 1.1), '#8a7a5a', 0.6) })
      out.add(poly(R(rrect(cx, cy, 14.6, 4.4, 1))), col)
      out.add(band(R([[cx + k * 2, cy + 1], [cx + k * 3, cy + 7]]), 1.6, 1.2), col)
      break
    }
    case 'lantern': {
      sleeve(out, p, h)
      const top = hy + 4, body = 29
      // the ring and handle
      out.add(band(sample(t => { const a = PI * (1 + t); return [hx + Math.cos(a) * 7, top + 5 + Math.sin(a) * 8] }, 12), 1.6, 1.6), col)
      out.add(poly([[hx - 7, top + 8], [hx + 7, top + 8], [hx + 9.5, top + 12], [hx - 9.5, top + 12]]), col)
      out.add(ell(hx, top + 26, 16, 18), '#ffd98a', 0.18)
      out.add(poly(rrect(hx, top + 12 + body / 2, 15, body, 2.4)), '#ffd98a')
      out.add(poly(rrect(hx, top + 12 + body / 2, 9, body - 4, 2)), '#fff3c8', 0.9)
      ;[-7.4, 7.4].forEach(dx => out.add(band([[hx + dx, top + 12], [hx + dx, top + 12 + body]], 1.6, 1.6), col))
      out.add(band([[hx, top + 12], [hx, top + 12 + body]], 1, 1), col, 0.8)
      out.add(poly([[hx - 10, top + 12 + body], [hx + 10, top + 12 + body], [hx + 8, top + 17 + body], [hx - 8, top + 17 + body]]), col)
      break
    }
    case 'torch': {
      const top = hy - 38
      const c = through([[hx, top], [hx + k * 0.3, hy], [hx, 214]], 4)
      out.add(band(c, 4.2, 4.8), '#6b4a2a')
      out.add(band(c, 1.8, 2, undefined, -0.8), '#4a3220', 0.5)
      out.add(poly([[hx - 5, top + 3], [hx + 5, top + 3], [hx + 7, top - 9], [hx, top - 12, 1], [hx - 7, top - 9]]), '#3a2a20')
      ;[-3, 0, 3].forEach(d => out.add(band([[hx - 6, top + d], [hx + 6, top + d - 1]], 0.7, 0.7), '#241810', 0.7))
      flame(out, hx, top - 9, 27, 7.4, k * 2)
      break
    }
    case 'candle': {
      const dish = hy - 5
      out.add(ell(hx, dish + 1, 11, 3.2), col)
      out.add(ell(hx, dish - 0.4, 8.2, 2), shade(col, 0.18))
      out.add(poly(rrect(hx, dish - 12, 7, 21, 1.4)), '#f1e8d0')
      out.add(poly(rrect(hx + 2, dish - 12, 3, 21, 1)), shade('#f1e8d0', 0.12), 0.7)
      out.add(ell(hx, dish - 22.5, 3.5, 1.2), '#faf4e2')
      flame(out, hx, dish - 22.5, 15, 3.6, k * 0.8)
      out.add(band([[hx + k * 4, dish + 2], [hx + k * 12, dish - 1]], 1.6, 1.6), col)
      break
    }
    case 'goblet': {
      const base = hy + 5
      out.add(ell(hx, base, 8.6, 2.2), col)
      out.add(band([[hx, base], [hx, hy - 15]], 3.4, 2.6), col)
      out.add(ell(hx, hy - 11, 4.4, 2.6), col)
      const bowl = spline([[hx - 12, hy - 34], [hx + 12, hy - 34], [hx + 11.4, hy - 25], [hx + 6.6, hy - 17], [hx, hy - 15], [hx - 6.6, hy - 17], [hx - 11.4, hy - 25]], true)
      out.add(bowl, col)
      out.add(spline([[hx - 12, hy - 34], [hx + 12, hy - 34], [hx + 11.4, hy - 30], [hx - 11.4, hy - 30]], true), '#7a1f2e')
      out.add(ell(hx, hy - 34, 12, 2.4), shade('#7a1f2e', 0.2))
      out.add(ell(hx, hy - 33.6, 10.4, 1.6), '#9c2a3d')
      out.add(band(through([[hx - 8, hy - 28], [hx - 6.4, hy - 22], [hx - 3.4, hy - 18.6]], 3), 1.2, 1.2), light(col, 0.5), 0.75)
      out.add(band(through([[hx + 10, hy - 28], [hx + 8, hy - 21], [hx + 4, hy - 17.6]], 3), 1.4, 1), dark, 0.45)
      break
    }
    case 'flower': {
      const stem = through([[hx, hy + 14], [hx + k * 1.2, hy - 10], [hx - k * 0.6, hy - 30]], 5)
      out.add(band(stem, 2.4, 2), '#4f7a3a')
      out.add(spline([[hx, hy - 10], [hx + k * 8, hy - 18], [hx + k * 13, hy - 16, 1], [hx + k * 8, hy - 10]], true), '#5f8a3e')
      out.add(spline([[hx, hy - 14], [hx - k * 7, hy - 21], [hx - k * 11, hy - 20, 1], [hx - k * 7, hy - 14]], true), '#4f7a3a')
      const c: Pt = [hx - k * 0.6, hy - 36]
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 - PI / 2; out.add(ell(c[0] + Math.cos(a) * 5.4, c[1] + Math.sin(a) * 5.4, 4.2, 4.2), col) }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 - PI / 2 + PI / 6; out.add(ell(c[0] + Math.cos(a) * 3, c[1] + Math.sin(a) * 3, 2.6, 2.6), shade(col, 0.1)) }
      out.add(ell(c[0], c[1], 3, 3), '#f3d27a')
      break
    }
    case 'quill': {
      const a: Pt = [hx - k * 3, hy + 10], b: Pt = [hx + k * 20, hy - 58]
      out.add(band(through([a, [hx + k * 8, hy - 20], b], 6), 1.8, 0.6), shade(col, 0.1))
      const vane = through([along([a, b], 0.2), [hx + k * 11, hy - 24], [hx + k * 17, hy - 46], b], 6)
      out.add(band(vane, 1, 1, 10, 0.1), col)
      out.add(band(vane.map(q => [q[0] - k * 1.4, q[1]]), 0.6, 0.6, 3.2), light(col, 0.3), 0.55)
      out.add(band(through([a, [hx + k * 8, hy - 20], b], 6), 0.7, 0.4), light(col, 0.5), 0.8)
      out.add(poly([[a[0] - 1, a[1]], [a[0] + 1, a[1]], [a[0], a[1] + 4]]), '#2a2118')
      break
    }
  }
  if (id !== 'lantern') sleeve(out, p, h)
  hand(out, h)
}
