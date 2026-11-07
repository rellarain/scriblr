// Hair. It is a length, a texture and a style, with a front (a parting or a fringe), a hairline (its shape and its height) and its edges. The hair is drawn in two layers: the
// back (what lies behind the head and the shoulders) and the front (the cap over the skull, the curtains beside the face, braids, buns and tails). A texture gives the edge of
// every shape its waves, curls or coils; a length that is stretched is shortened by the texture (a curl draws shorter than the hair measures).

import { Shapes, band, bumpy, clamp, ell, evenly, lerp, mirror, pt, PI, sample, smoothDense, spline, sym, type Pt } from '../paths'
import { mix, shade } from '../colour'
import { FRONTS, HAIRLINE_HEIGHTS, LENGTHS, STYLES, TEXTURES, pick, fitHair, type Front, type Length, type Style, type Texture } from '../library'
import { capOuter, faceX, hug, skull, type Rig } from '../rig'
import { type Drawn } from '../types'

// What one portrait's hair is, worked out from its settings: the entries they name, the length in units, where the hair ends, how full it is, whether it hangs.
export interface HairModel { p: Drawn; len: Length; tex: Texture; sty: Style; front: Front; L: number; end: number; V: number; coily: boolean; hang: boolean; sideY: number }
// The cap over the skull: how far its top (vol) and its sides (side) stand off the skull, where its sides end (low), its front edge, and a lift of the crown.
export interface CapOpts { vol: number; side: number; low: number; front: Pt[]; lift?: number; liftX?: number }
export interface CurtainOpts { only?: number; flare?: boolean }

export function lock(g: Rig, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, wave: number): string {
  let c = sample(function (t) { return [lerp(x0, x1, t) + (wave ? Math.sin(t * PI * 2.5) * wave : 0), lerp(y0, y1, t)]; }, 10);
  return band(c, w0, w1, (w0 + w1) / 2 * 1.08);
}

export function chain(out: Shapes, x0: number, y0: number, x1: number, y1: number, w: number, n: number, fill: string, dark: string): void {
  for (let i = 0; i < n; i++) {
    let t0 = i / n, t1 = (i + 1) / n, ax = lerp(x0, x1, t0), ay = lerp(y0, y1, t0), bx = lerp(x0, x1, t1), by = lerp(y0, y1, t1), mx = (ax + bx) / 2, my = (ay + by) / 2;
    let dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    out.add(spline([[ax, ay], [mx + nx, my + ny], [bx, by], [mx - nx, my - ny]], true), i % 2 ? fill : mix(fill, dark, 0.35));
  }
}

export function hairModel(g: Rig, p: Drawn): HairModel {
  let len = pick(LENGTHS, p.hairLength, 'short'), tex = pick(TEXTURES, p.hairTexture, '1B'), sty = pick(STYLES, p.hairStyle), front = pick(FRONTS, p.hairFront);
  let L = len.L * g.H;
  // Braids and locs keep most of their length whatever the texture; loose curls and coils shrink.
  let keep = ({ boxbraids: 0.95, trianglebraids: 0.95, locs: 0.9, twists: 0.8, onebraid: 0.85, twobraids: 0.85, cornrows: 0.9 } as Record<string, number>)[sty.id];
  let shrink = keep ? Math.max(tex.shrink, keep) : tex.shrink;
  let springy = tex.kind === 'curly' || tex.kind === 'coily';
  let grow = springy && !keep ? Math.min(24, (1 - tex.shrink) * L * 0.12) : 0;
  let V = (4.5 * tex.vol + grow) * g.hairK;
  let end = g.top + L * shrink;
  let coily = tex.kind === 'coily';
  let hang = !coily && end > g.browY + 6;
  return { p: p, len: len, tex: tex, sty: sty, front: front, L: L, end: end, V: V, coily: coily, hang: hang, sideY: hang ? g.eyeY : g.browY + 1 };
}

// How thick hair that hangs is: how far its outer edge stands off the skull beside the face. The cap over the skull, the curtains beside the face and the mass behind the head all
// use it, so the crown is as full as the length is wide (a thin cap over a thick fall of hair looks like a buzz cut). It grows with the length and with the fullness of the texture.
export function hangW(m: HairModel): number {
  return Math.max(6.5, m.V * 0.9) + clamp((m.len.i - 4) * 1.5, 0, 10);
}
// How far the crown stands off the skull: a little less than the sides, and fuller the longer the hair.
export function crownVol(m: HairModel): number {
  return hangW(m) * (0.62 + 0.04 * clamp(m.len.i - 3, 0, 6)) + 0.8;
}

export function texPath(pts: Pt[], tex: Texture | null, cx: number, cy: number): string {
  const amp = tex?.amp ?? 0
  if (!tex || tex.kind === 'straight' || !amp) return spline(pts, true);
  const sp = tex.sp ?? 8
  let dense = smoothDense(pts);
  if (tex.kind === 'wavy') {
    dense = evenly(dense, sp / 4);
    let s = 0;
    let waved = dense.map(function (q, i) {
      if (i > 0) s += Math.hypot(q[0] - dense[i - 1][0], q[1] - dense[i - 1][1]);
      let ox = q[0] - cx, oy = q[1] - cy, ol = Math.hypot(ox, oy) || 1, w = (0.5 + 0.5 * Math.sin(s / sp * PI)) * amp;
      return [q[0] + ox / ol * w, q[1] + oy / ol * w];
    });
    return spline(waved, true);
  }
  dense = evenly(dense, sp);
  if (tex.zig) {
    let d = 'M' + pt(dense[0]);
    for (let i = 0; i < dense.length; i++) {
      let a = dense[i], b = dense[(i + 1) % dense.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy) || 1;
      d += 'L' + pt([mx + ox / ol * amp * 1.5, my + oy / ol * amp * 1.5]) + 'L' + pt(b);
    }
    return d + 'Z';
  }
  return bumpy(dense, amp, cx, cy);
}

// A strand or tail along a curve, w0 wide at its start and w1 at its end, with the texture's edge.
export function tube(curve: Pt[], w0: number, w1: number, tex: Texture | null): string {
  let top = [], bot = [], n = curve.length;
  for (let i = 0; i < n; i++) {
    let a = curve[Math.max(0, i - 1)], b = curve[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    let t = i / (n - 1), w = lerp(w0, w1, t) / 2 * (0.85 + 0.15 * Math.sin(t * PI));
    top.push([curve[i][0] + nx * w, curve[i][1] + ny * w]); bot.push([curve[i][0] - nx * w, curve[i][1] - ny * w]);
  }
  let pts = top.concat(bot.reverse()), c = curve[Math.floor(n / 2)];
  return tex && (tex.kind === 'curly' || tex.kind === 'coily') ? texPath(pts, tex, c[0], c[1]) : spline(pts, true);
}

// The hairline: its right half from the side (at the top of the ear, or the eye line when the hair hangs) to the middle of the forehead.
export function hairlineRight(g: Rig, m: HairModel): Pt[] {
  let fx = g.fore, H = g.H, hy = g.hairY + pick(HAIRLINE_HEIGHTS, m.p.hairlineHeight).dy * H, s = m.sideY, r: Pt[];
  switch (m.p.hairline) {
    case 'straight': r = [[fx + 0.5, s], [fx * 0.985, s - 5], [fx * 0.95, hy + 0.05 * H], [fx * 0.86, hy + 0.004 * H], [fx * 0.4, hy], [0, hy]]; break;
    case 'widow': r = [[fx + 0.5, s], [fx * 0.985, s - 5], [fx * 0.9, hy + 0.05 * H], [fx * 0.62, hy - 0.006 * H], [fx * 0.25, hy + 0.014 * H], [0, hy + 0.055 * H, 1]]; break;
    case 'mshape': r = [[fx + 0.5, s], [fx * 0.98, s - 6], [fx * 0.86, hy + 0.02 * H], [fx * 0.7, hy - 0.03 * H], [fx * 0.42, hy + 0.012 * H], [fx * 0.15, hy + 0.022 * H], [0, hy + 0.028 * H]]; break;
    case 'mature': r = [[fx + 0.5, s], [fx * 0.98, s - 6], [fx * 0.88, hy + 0.02 * H], [fx * 0.72, hy - 0.022 * H], [fx * 0.45, hy + 0.004 * H], [0, hy + 0.016 * H]]; break;
    case 'receding': r = [[fx + 0.5, s], [fx * 0.97, s - 7], [fx * 0.84, hy - 0.035 * H], [fx * 0.62, hy - 0.085 * H], [fx * 0.3, hy - 0.025 * H], [0, hy - 0.008 * H]]; break;
    case 'deep': r = [[fx + 0.5, s], [fx * 0.96, s - 9], [fx * 0.8, hy - 0.09 * H], [fx * 0.52, hy - 0.15 * H], [fx * 0.22, hy - 0.115 * H], [0, hy - 0.1 * H]]; break;
    default: r = [[fx + 0.5, s], [fx * 0.985, s - 5], [fx * 0.93, hy + 0.068 * H], [fx * 0.8, hy + 0.014 * H], [fx * 0.45, hy + 0.004 * H], [0, hy + 0.016 * H]];
  }
  return r.map(function (q) { return [100 + q[0], q[1], q[2]]; });
}

// The whole hairline, right side to left side (an uneven one sits higher on the left).
export function hairlineFull(g: Rig, m: HairModel): Pt[] {
  let right = hairlineRight(g, m), left = right.slice(0, -1).reverse().map(mirror);
  if (m.p.hairline === 'uneven') left = left.map(function (q) { let u = clamp(1 - Math.abs(q[0] - 100) / g.fore, 0, 1); return [q[0], q[1] - g.H * 0.04 * Math.sin(u * PI * 0.9 + 0.3), q[2]]; });
  return right.concat(left);
}

export function yAt(pts: Pt[], x: number): number {
  for (let i = 1; i < pts.length; i++) { let a = pts[i - 1], b = pts[i]; if ((x - a[0]) * (x - b[0]) <= 0) return lerp(a[1], b[1], (x - a[0]) / ((b[0] - a[0]) || 1)); }
  return pts[pts.length - 1][1];
}

export function notch(pts: Pt[], x: number): Pt[] {
  let y = yAt(pts, x), out = [], done = false;
  for (let i = 0; i < pts.length; i++) {
    if (!done && pts[i][0] < x) { out.push([x + 4, y + 0.6], [x, y - 3.6, 1], [x - 4, y + 0.6]); done = true; }
    if (Math.abs(pts[i][0] - x) > 4) out.push(pts[i]);
  }
  return out;
}

// The front edge of the cap: the hairline (with the notch of a part), or a fringe.
export function frontEdge(g: Rig, m: HairModel): Pt[] {
  let f = m.front.id, fx = g.fore, s = m.sideY, by = g.browY, full = hairlineFull(g, m), hy = yAt(full, 100);
  if (f === 'bangs') { let fy = m.len.i <= 2 ? lerp(hy, by, 0.65) : by - 3.5; return [[100 + fx + 2, s], [100 + fx, fy + 2], [100 + fx * 0.6, fy + 0.5], [100, fy], [100 - fx * 0.6, fy + 0.5], [100 - fx, fy + 2], [100 - fx - 2, s]]; }
  if (f === 'curtain') return [[100 + fx + 2, s], [100 + fx, by + 2], [100 + fx * 0.55, by - 3], [104, hy + 3], [100, hy + 1.5, 1], [96, hy + 3], [100 - fx * 0.55, by - 3], [100 - fx, by + 2], [100 - fx - 2, s]];
  if (f === 'sidebangs') return [[100 + fx + 1, s], [100 + fx * 0.95, hy + 0.06 * g.H], [100 + fx * 0.5, hy + 2], [100, hy + 5], [100 - fx * 0.5, by - 6], [100 - fx * 0.92, by - 1], [100 - fx - 1, s]];
  if (f === 'centre') return notch(full, 100);
  if (f === 'side') return notch(full, 100 - fx * 0.42);
  return full;
}

// The cap of hair over the skull, its front edge given whole from the right side to the left.
export function capT(g: Rig, o: CapOpts, tex?: Texture | null): string {
  let outerR = capOuter(g, o, o.low), outerL = outerR.map(mirror);
  const lift = o.lift ?? 0
  if (lift) outerR.concat(outerL).forEach(function (q) { let u = 1 - Math.min(1, Math.abs(q[0] - (100 + (o.liftX || 0))) / (g.sk.rx * 0.7)); if (u > 0) q[1] -= lift * u * u; });
  let path = outerR.slice().reverse().concat(hug(g, o.front)).concat(outerL.slice(0, -1));
  return tex && tex.kind !== 'straight' ? texPath(path, tex, 100, g.sk.cy) : spline(path, true);
}

// The hair behind the head and shoulders, down to `len`.
export function backMassT(g: Rig, m: HairModel, len: number, flare: boolean, plain = false): string {
  let V = m.V, side = V * 0.85, right = [];
  for (let a = 90; a >= 0; a -= 15) right.push(skull(g, a, side + (V - side) * (a / 90), V));
  let wid = g.sk.rx + Math.max(side + 4, hangW(m) * 0.9) + (m.end > g.shoulderY ? 6 : 2) + clamp((m.len.i - 4) * 1.3, 0, 8) + (flare ? (len - g.eyeY) * 0.3 : 0);
  for (let i = 1; i <= 6; i++) { let t = i / 6; right.push([100 + lerp(g.sk.rx + side, wid, flare ? t : Math.sin(t * PI / 2)), lerp(g.sk.cy, len, t)]); }
  right.push([100 + wid - 3, len + 1.5]); right.push([100, len + 2.5]);
  return texPath(sym(right), plain ? null : m.tex, 100, (g.sk.cy + len) / 2);
}

// Coily hair standing out round the head.
export function coilMass(out: Shapes, g: Rig, m: HairModel, c: string, dark: string): void {
  let V = m.V, bottom = Math.min(Math.max(m.end, g.browY + 2) + V * 0.35, g.chin + 4), topY = g.top - V, rx = g.sk.rx + V * 0.95, ry = (bottom - topY) / 2, cy = topY + ry;
  let pts = sample(function (t) { let a = t * PI * 2; return [100 + Math.cos(a) * rx, cy + Math.sin(a) * ry]; }, 40).slice(0, -1);
  out.add(texPath(pts, m.tex, 100, cy), c);
  for (let i = 0; i < 16; i++) {
    let a = (i / 16) * PI * 2 + 0.3, x = 100 + Math.cos(a) * rx * 0.8, y = cy + Math.sin(a) * ry * 0.8;
    out.add(band(sample(function (t) { let b = lerp(0.1, 1.5, t) * PI; return [x + Math.cos(b) * 2, y + Math.sin(b) * 2]; }, 6), 0.3, 0.3, 0.8), dark, 0.4);
  }
}

// A ringlet: a small open ring in the shade colour, the mark of a curl.
export function ring(out: Shapes, cx: number, cy: number, r: number, dark: string, a0: number): void {
  out.add(band(sample(function (t) { let a = (a0 + t * 1.65) * PI; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }, 8), 0.3, 0.5, 0.95), dark, 0.45);
}

// Curtains beside the face: the inner edge just over the edge of the face down to the jaw, then beside the neck and over the shoulders.
export function curtains(out: Shapes, g: Rig, p: Drawn, m: HairModel, c: string, dark: string, hi: string | null, opts: CurtainOpts): void {
  let E = Math.min(m.end, 214), nb = g.neckBase, sy = g.shoulderY, short = m.end <= g.chin + 4, jawX = faceX(g, g.jawY) - 2.2, by = g.browY;
  let outerW = g.sk.rx + hangW(m);
  [1, -1].forEach(function (k) {
    if (opts.only && opts.only !== k) return;
    let inner = sample(function (t) {
      let y = lerp(by - 4, E, t), x;
      if (y <= g.jawY) x = faceX(g, y) - 2.2;
      else if (short) x = lerp(jawX, g.chinW + 4, clamp((y - g.jawY) / Math.max(1, E - g.jawY), 0, 1));
      else x = lerp(jawX, g.neck + 4, clamp((y - g.jawY) / Math.max(1, nb - g.jawY), 0, 1)) + (y > nb ? (y - nb) * 0.18 : 0);
      return [100 + k * x, y];
    }, 14);
    let outer = sample(function (t) {
      let y = lerp(g.eyeY - 8, E, t), flare = opts.flare ? t * (E - g.eyeY) * 0.3 : (m.end > sy ? Math.sin(Math.min(1, t * 1.5) * PI / 2) * 8 : Math.sin(t * PI / 2) * 3);
      return [100 + k * (outerW + flare), y];
    }, 14);
    let pts = inner.concat([[lerp(inner[14][0], outer[14][0], 0.5), E + 1.5]]).concat(outer.slice().reverse());
    out.add(texPath(pts, m.tex, 100, (g.eyeY + E) / 2), c);
    if (m.tex.kind === 'curly') {
      for (let ri = 2; ri <= 13; ri++) [0.28, 0.72].forEach(function (u, ui) {
        ring(out, lerp(inner[ri][0], outer[ri][0], u), inner[ri][1] + (ui ? 3 : 0), (m.tex.sp ?? 8) * 0.36, dark, (ri + ui * 3) % 4 * 0.5);
      });
    } else if (m.tex.kind === 'wavy') {
      let wl = (m.tex.sp ?? 8) * 2.4, wa = (m.tex.amp ?? 0) * 0.7;
      [0.28, 0.62].forEach(function (u) {
        out.add(band(sample(function (t) { let y = lerp(by + 4, E - 4, t); return [lerp(inner[3][0], outer[3][0], u) + k * (t * 2) + Math.sin((y - by) / wl * PI * 2 + u * 3) * wa, y]; }, Math.max(8, Math.round((E - by) / 5))), 0.3, 0.4, 1.3), dark, 0.42);
      });
    } else if (m.tex.kind === 'straight') out.add(band(sample(function (t) { return [lerp(inner[3][0], inner[13][0], t) + k * 2.6, lerp(inner[3][1], E - 4, t)]; }, 8), 0.3, 0.5, 1.6), dark, 0.5);
    if (hi && k > 0) out.add(band(sample(function (t) { return [lerp(inner[2][0], inner[13][0], t) + k * 4.6, lerp(inner[2][1], E - 6, t)]; }, 8), 0.8, 0.6, 2.8), hi, 0.95);
  });
}

// Lines of shade on the cap that show which way the hair is combed: they run from the crown to just inside the hairline, never onto the forehead.
export function capStrands(out: Shapes, g: Rig, m: HairModel, dark: string): void {
  if (m.tex.kind === 'curly') { [28, 52, 76, 100, 124, 148].forEach(function (a, i) { let q = skull(g, a, 1.5 + m.V * 0.5); ring(out, q[0], q[1], (m.tex.sp ?? 8) * 0.34, dark, (i % 4) * 0.5); }); return; }
  if (m.coily) return;
  let f = m.front.id, fx = g.fore, full = hug(g, hairlineFull(g, m));
  function edgeY(x: number): number { return yAt(full, x) - 1.6; }
  function strand(x0: number, y0: number, x1: number, bend: number, w: number): void {
    let y1 = edgeY(x1);
    out.add(band(sample(function (t) { return [lerp(x0, x1, t), lerp(y0, y1, t) - Math.sin(t * PI) * bend]; }, 10), 0.3, w, 1.1), dark, 0.45);
  }
  if (f === 'back') { for (let k = -2; k <= 2; k++) { let xe = 100 + k * fx * 0.28; strand(100 + k * fx * 0.12, g.top + 2, xe, 0, 0.5); } return; }
  if (f === 'centre') { [1, -1].forEach(function (k) { [0, 1, 2].forEach(function (j) { strand(100 + k * 3, g.top + 3 + j * 3, 100 + k * fx * (0.42 + 0.2 * j), 3 + j, 0.45); }); }); return; }
  if (f === 'side') { let xp = 100 - fx * 0.42; [0, 1, 2].forEach(function (j) { strand(xp + 2, g.top + 3 + j * 3, 100 + fx * (0.5 + 0.16 * j), 3 + j, 0.5); }); strand(xp - 2, g.top + 4, 100 - fx * 0.8, 2, 0.4); return; }
  if (f === 'none' && m.len.i >= 2) out.add(band(sample(function (t) { return skull(g, lerp(150, 60, t), 2.2); }, 10), 0.4, 0.6, 2.4), dark, 0.45);
}

export function partLine(out: Shapes, g: Rig, p: Drawn, m: HairModel, c: string): void {
  let f = m.front.id;
  if ((f !== 'centre' && f !== 'side') || m.coily) return;
  let full = hairlineFull(g, m), x0 = f === 'centre' ? 100 : 100 - g.fore * 0.42, y0 = yAt(full, x0) - 3.2;
  out.add(band(sample(function (t) { return [lerp(x0, f === 'centre' ? 100 : 100 - g.fore * 0.3, t), lerp(y0, g.top + 3, t)]; }, 8), 0.9, 0.3, 0.8), mix(p.skin, c, 0.3), 0.9);
}

export function thinning(out: Shapes, g: Rig, p: Drawn, m: HairModel): void {
  if (p.hairline !== 'thinning' || m.len.i < 2) return;
  out.add(ell(100, g.top + g.H * 0.085, g.fore * 0.5, g.H * 0.06), mix(p.skin, p.hairColor, 0.35), 0.85);
}

export function edgeHairs(out: Shapes, g: Rig, p: Drawn, m: HairModel, c: string): void {
  let e = p.hairEdges, f = m.front.id;
  if (!e || e === 'none' || f === 'bangs' || f === 'curtain' || f === 'sidebangs') return;
  let full = hug(g, hairlineFull(g, m));
  if (e === 'baby') for (let x = -0.84; x <= 0.85; x += 0.12) {
    let px = 100 + x * g.fore, py = yAt(full, px), k = x < 0 ? -1 : 1;
    out.add(band([[px, py - 0.6], [px + k * 0.5, py + 1.2], [px + k * 1.7, py + 2.1]], 0.5, 0.15, 0.55), c, 0.9);
  }
  if (e === 'laid') [1, -1].forEach(function (k) {
    let px = 100 + k * g.fore * 0.84, py = yAt(full, px);
    [0, 1].forEach(function (j) { out.add(band(sample(function (t) { return [px - k * (t * 8 - j * 2.5), py + 0.6 + j * 2.2 + Math.sin(t * PI * 2) * 1.5 + t * 2]; }, 12), 1, 0.25, 1.2), c, 0.95); });
  });
}

export function bunAt(out: Shapes, cx: number, cy: number, r: number, c: string, dark: string, tex: Texture | null): void {
  let pts = sample(function (t) { let a = t * PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9]; }, 14).slice(0, -1);
  out.add(tex && (tex.kind === 'curly' || tex.kind === 'coily') ? texPath(pts, tex, cx, cy) : spline(pts, true), c);
  out.add(band(sample(function (t) { let a = lerp(0.2, 1.7, t) * PI; return [cx + Math.cos(a) * r * (0.7 - t * 0.35), cy + Math.sin(a) * r * 0.6 * (0.7 - t * 0.35)]; }, 10), 0.4, 0.3, 0.9), dark, 0.5);
}

export function drawHair(out: Shapes, g: Rig, p0: Drawn, layer: 'back' | 'front'): void {
  let p = fitHair(p0), m = hairModel(g, p), c = p.hairColor, dark = shade(c, 0.22), hi = p.highlightColor;
  if (m.len.id === 'bald') return;
  let backC = shade(c, m.tex.kind === 'straight' ? 0.16 : m.tex.kind === 'wavy' ? 0.13 : 0.06);
  let skinMix = mix(c, p.skin, 0.42);
  let id = m.sty.id, E = Math.min(m.end, 216), L = m.L, fx = g.fore, by = g.browY, nb = g.neckBase, sy = g.shoulderY, S = g.S;
  let tailEnd = function (from: number): number { return Math.min(214, from + Math.max(10, m.end - g.top - (from - g.top) * 0.6)); };

  if (layer === 'back') {
    if (m.len.i <= 1) return;
    if (['plain', 'halfup', 'shavedside', 'slicked', 'triangle', 'undercut', 'quiff'].indexOf(id) >= 0) {
      if (id === 'triangle') out.add(backMassT(g, m, Math.max(E, g.chin + 8), true), backC);
      else if (m.coily && (id === 'plain' || id === 'halfup')) coilMass(out, g, m, c, dark);
      else if (m.end > g.chin - 6 && id !== 'undercut' && id !== 'quiff') out.add(backMassT(g, m, E, false), backC);
      if (id === 'halfup') bunAt(out, 100, g.top - 1, 5 + Math.min(3, L * 0.01), c, dark, m.tex);
      return;
    }
    if (id === 'boxbraids' || id === 'trianglebraids' || id === 'locs' || id === 'twists') {
      let wid = 14 + m.tex.vol * 2;
      out.add(backMassT(g, { ...m, V: 4.5 }, E, false, true), shade(c, 0.28));
      let n = id === 'locs' ? 7 : 9;
      for (let i = 0; i < n; i++) {
        let xx = lerp(-(g.sk.rx + wid - 4), g.sk.rx + wid - 4, i / (n - 1));
        if (Math.abs(xx) < g.neck + 4) continue;
        let e2 = E - (id === 'locs' ? (i % 3) * 6 : 0);
        if (id === 'locs') out.add(lock(g, 100 + xx * 0.85, g.eyeY, 100 + xx, e2, 6.4, 5.6, 0.8), i % 2 ? c : mix(c, dark, 0.4));
        else chain(out, 100 + xx * 0.8, g.eyeY, 100 + xx, e2, id === 'twists' ? 4.6 : 5.4, Math.max(4, Math.round((e2 - g.eyeY) / 7)), c, dark);
      }
      return;
    }
    if (id === 'cornrows' && m.end > sy) [1, -1].forEach(function (k) { chain(out, 100 + k * (g.neck + 3), g.chin, 100 + k * (g.neck + 7), E, 4.6, Math.max(4, Math.round((E - g.chin) / 7)), c, dark); });
    if (id === 'puff') { let rp = 9 + Math.min(16, L * 0.045); bunAt(out, 100, g.top - rp * 0.45, rp, c, dark, m.coily || m.tex.kind === 'curly' ? m.tex : null); }
    if (id === 'topbun') bunAt(out, 100, g.top - (7 + Math.min(9, L * 0.028)) * 0.55, 7 + Math.min(9, L * 0.028), c, dark, m.tex);
    if (id === 'topknot') bunAt(out, 100, g.top - (4.5 + Math.min(4, L * 0.014)) * 0.5, 4.5 + Math.min(4, L * 0.014), c, dark, m.tex);
    if (id === 'spacebuns') [1, -1].forEach(function (k) { bunAt(out, 100 + k * fx * 0.62, g.top + 1, 5.5 + Math.min(6, L * 0.02), c, dark, m.tex); });
    if (id === 'lowbun') { let rl = 6 + Math.min(6, L * 0.02); out.add(ell(100, g.chin - 3, g.neck + rl, rl * 0.9), c); }
    if (id === 'highpony') {
      let curve = [[100 + fx * 0.3, g.top + 3], [100 + g.sk.rx + 6, g.top + g.H * 0.18], [100 + g.sk.rx + 12, g.eyeY + 4], [100 + g.sk.rx + 13, tailEnd(g.top)]];
      out.add(tube(sample(function (t) { let i = Math.min(2, Math.floor(t * 3)), u = t * 3 - i; return [lerp(curve[i][0], curve[i + 1][0], u), lerp(curve[i][1], curve[i + 1][1], u)]; }, 12), 11 + m.V * 0.5, 6, m.tex), backC);
    }
    return;
  }

  // ---- front layer ----
  let front = frontEdge(g, m);
  if (m.len.i <= 1 || id === 'fade' || id === 'undercut' || id === 'mohawk' || id === 'shavedside') {
    out.add(capT(g, { vol: m.coily ? 1.7 : 1.3, side: 0.6, low: by + 1, front: hairlineFull(g, Object.assign({}, m, { sideY: by + 1 })) }), skinMix);
    if (m.len.i <= 1 && id !== 'fade') { edgeHairs(out, g, p, m, c); return; }
  }
  let tex = m.tex, V = m.V;
  switch (id) {
    case 'fade':
      out.add(capT(g, { vol: Math.max(3, V * 0.7), side: -fx * 0.12, low: g.hairY + 4, front: [[100 + fx * 0.92, g.hairY + 4]].concat(front.filter(function (q) { return Math.abs(q[0] - 100) < fx * 0.85 && q[1] < by - 2; })).concat([[100 - fx * 0.92, g.hairY + 4]]) }, tex), c);
      capStrands(out, g, m, dark); break;
    case 'undercut':
      out.add(capT(g, { vol: 6 + Math.min(8, L * 0.04), side: 1, low: g.hairY + 5, lift: 4, liftX: fx * 0.2, front: [[100 + fx * 0.97, g.hairY + 5], [100 + fx * 0.9, g.hairY + 6.5], [100 + fx * 0.3, g.hairY + 2], [100 - fx * 0.3, g.hairY + 5], [100 - fx * 0.78, g.hairY + 10 + Math.min(8, L * 0.05)], [100 - fx * 0.97, g.hairY + 5]] }, tex), c);
      break;
    case 'mohawk': {
      let h = 8 + Math.min(20, L * 0.1), w = fx * 0.24;
      let crest = [[100 - fx * 0.2, g.hairY + 1], [100 - w, g.top + 3], [100 - w * 0.5, g.top - h * 0.7], [100, g.top - h], [100 + w * 0.5, g.top - h * 0.7], [100 + w, g.top + 3], [100 + fx * 0.2, g.hairY + 1], [100, g.hairY - 1]];
      out.add(tex.kind === 'straight' ? spline(crest, true) : texPath(crest, tex, 100, g.top - h * 0.3), c);
      break;
    }
    case 'quiff':
      out.add(capT(g, { vol: V, side: V * 0.5, low: by + 1, lift: 8 + Math.min(6, L * 0.03), liftX: fx * 0.1, front: front }, tex), c);
      capStrands(out, g, m, dark); break;
    case 'slicked':
      out.add(capT(g, { vol: Math.max(3, V * 0.7), side: Math.max(1.4, V * 0.4), low: by + 1, front: hairlineFull(g, Object.assign({}, m, { sideY: by + 1 })) }), c);
      capStrands(out, g, m, dark); break;
    case 'cornrows': {
      out.add(capT(g, { vol: 2.4, side: 1.4, low: by + 1, front: hairlineFull(g, Object.assign({}, m, { sideY: by + 1 })) }), c);
      let hy = yAt(hairlineFull(g, m), 100);
      for (let j = -3.5; j <= 3.5; j += 1) {
        let jx = j;
        out.add(band(sample(function (t) { return [lerp(100 + jx * fx * 0.25, 100 + jx * fx * 0.1, t), lerp(yAt(hairlineFull(g, m), 100 + jx * fx * 0.25) + 1, g.top + 1, t)]; }, 8), 1.1, 0.7, 1.2), mix(p.skin, c, 0.28), 0.9);
      }
      break;
    }
    case 'bantu': {
      out.add(capT(g, { vol: 2.2, side: 1.4, low: by + 1, front: front }), c);
      partLine(out, g, p, m, c);
      [26, 58, 90, 122, 154].forEach(function (a) { let q = skull(g, a, 3); bunAt(out, q[0], q[1], 4.4 + tex.vol * 0.7, c, dark, null); });
      break;
    }
    case 'onebraid': case 'twobraids': case 'boxbraids': case 'trianglebraids': case 'locs': case 'twists': {
      out.add(capT(g, { vol: 3.2 + tex.vol, side: 2.4, low: by + 1, front: front.map(function (q) { return [q[0], Math.min(q[1], q === front[0] || q === front[front.length - 1] ? by + 1 : q[1])]; }) }), c);
      partLine(out, g, p, m, c);
      if (id === 'boxbraids' || id === 'trianglebraids' || id === 'twists') {
        // the parts of the braids on the scalp
        for (let r2 = 1; r2 <= 2; r2++) out.add(band(sample(function (t) { return skull(g, lerp(160, 20, t), -4 - r2 * 5); }, 12), 0.5, 0.5, 0.6), dark, 0.6);
        if (id === 'trianglebraids') for (let z = 0; z < 7; z++) { let a1 = lerp(150, 30, z / 6); out.add(band([skull(g, a1, -14), skull(g, a1 + 9, -4), skull(g, a1 - 9, -4)], 0.5, 0.5), dark, 0.6); }
        else for (let v = -3; v <= 3; v++) out.add(band(sample(function (t) { return [100 + v * fx * 0.22 * (1 - t * 0.3), lerp(g.hairY + 1, g.top + 3, t)]; }, 5), 0.4, 0.4, 0.5), dark, 0.5);
      }
      let sides = id === 'onebraid' ? [1] : [1, -1];
      sides.forEach(function (k) {
        if (id === 'onebraid' || id === 'twobraids') {
          let y0 = g.eyeY + 2, x0 = 100 + k * g.sk.rx * 0.92, x1 = 100 + k * (g.S * 0.36), yb = Math.min(214, m.end);
          chain(out, x0, y0, x1, yb, 5.5 + tex.vol * 1.4, Math.max(4, Math.round((yb - y0) / 6.5)), c, dark);
          if (m.end < 212) { out.add(ell(x1, yb + 1, 2.6, 1.4), dark); out.add(lock(g, x1, yb + 1.5, x1 + k, yb + 7, 4, 1.5, 0), c); }
          if (hi) out.add(band(sample(function (t) { return [lerp(x0, x1, t) + k * 1.2, lerp(y0, yb, t)]; }, 8), 1, 0.8, 1.4), hi, 0.85);
        } else {
          for (let mm = 0; mm < 2; mm++) {
            let bx0 = 100 + k * (fx - 1 + mm * 4.2), bx1 = 100 + k * (fx + 3 + mm * 7), col = hi && mm === 1 ? hi : c, be = Math.min(214, m.end - mm * 6);
            if (id === 'locs') out.add(lock(g, bx0, by + 2, bx1, be, 6, 5.4, 0.6), mm ? col : mix(c, dark, 0.3));
            else chain(out, bx0, by + 2, bx1, be, id === 'twists' ? 4.4 : 5, Math.max(4, Math.round((be - by) / 7)), col, dark);
          }
        }
      });
      break;
    }
    case 'topbun': case 'lowbun': case 'spacebuns': case 'topknot': case 'puff': case 'highpony': case 'lowpony': case 'pigtails': {
      let tight = Math.min(V, 3.4 + tex.vol);
      out.add(capT(g, { vol: tight, side: tight * 0.6, low: by + 1, front: m.front.id === 'curtain' ? front : front.map(function (q, i) { return i === 0 || i === front.length - 1 ? [q[0], by + 1] : q; }) }, tex.kind === 'straight' ? null : tex), c);
      partLine(out, g, p, m, c); capStrands(out, g, m, dark);
      if (m.front.id === 'curtain') curtains(out, g, p, Object.assign({}, m, { end: Math.min(m.end, g.chin) }), c, dark, null, {});
      if (id === 'lowpony') out.add(tube(sample(function (t) { return [lerp(100 + g.neck + 1, 100 + g.neck + 10, t) + Math.sin(t * PI) * 3, lerp(g.chin - 2, tailEnd(g.chin), t)]; }, 12), 7 + V * 0.3, 4, tex), c);
      if (id === 'pigtails') [1, -1].forEach(function (k) {
        let y0 = g.eyeY + 3;
        out.add(tube(sample(function (t) { return [100 + k * (g.sk.rx + 1 + t * 9 + Math.sin(t * PI) * 2), lerp(y0, tailEnd(y0), t)]; }, 12), 9 + V * 0.3, 5, tex), c);
        out.add(ell(100 + k * (g.sk.rx + 1.5), y0 + 1, 3, 2), dark);
      });
      break;
    }
    case 'shavedside': {
      let hyS = yAt(hairlineFull(g, m), 100), outerR = capOuter(g, m.hang ? { vol: crownVol(m), side: hangW(m) } : { vol: V, side: V * 0.8 }, m.sideY);
      let frontS = front.filter(function (q) { return q[0] >= 100 - fx * 0.3; });
      let pathS = outerR.slice().reverse().concat(hug(g, frontS)).concat([[100 - fx * 0.32, hyS - 2], [100 - fx * 0.36, g.top + g.H * 0.12], [100 - fx * 0.2, g.top - V * 0.6]]);
      out.add(tex.kind === 'straight' ? spline(pathS, true) : texPath(pathS, tex, 100, g.sk.cy), c);
      capStrands(out, g, m, dark);
      if (m.hang) curtains(out, g, p, m, c, dark, hi, { only: 1 });
      break;
    }
    default: { // plain, half up, triangle
      if (m.coily) out.add(capT(g, { vol: 2.2, side: 1.5, low: m.sideY, front: front }, tex), c);
      else if (m.hang) out.add(capT(g, { vol: id === 'triangle' ? crownVol(m) * 0.8 : crownVol(m), side: hangW(m), low: m.sideY, front: front }, tex), c);
      else out.add(capT(g, { vol: id === 'triangle' ? V * 0.6 : V, side: V * 0.8, low: m.sideY, front: front }, tex), c);
      thinning(out, g, p, m);
      partLine(out, g, p, m, c);
      capStrands(out, g, m, dark);
      if (m.hang) curtains(out, g, p, m, c, dark, hi, { flare: id === 'triangle' });
      if (m.front.id === 'bangs') out.add(band(sample(function (t) { let fy = yAt(front, lerp(100 - fx * 0.8, 100 + fx * 0.8, t)); return [lerp(100 - fx * 0.8, 100 + fx * 0.8, t), fy - 2.2]; }, 10), 0.3, 0.3, 1.1), dark, 0.45);
      if (hi && !m.hang) out.add(band(sample(function (t) { return skull(g, lerp(118, 70, t), m.coily ? 6 : V * 0.6); }, 8), 0.6, 0.6, 3), hi, 0.9);
    }
  }
  edgeHairs(out, g, p, m, c);
}
