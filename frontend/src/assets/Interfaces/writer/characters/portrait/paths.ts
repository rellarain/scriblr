// Paths and numbers for the portrait: the portrait is a list of filled shapes (no outlines), each an SVG path, a colour and an opacity, drawn in a 200 x 200 tile.
// A point is [x, y]; a third value (1) makes it a corner, where the smooth curve through the points turns sharply.

export type Pt = number[]
export const PI = Math.PI

// One filled shape of the portrait.
export interface Shape { d: string; fill: string; opacity: number }

// The shapes drawn so far, in paint order (what is added later is painted over what is added before).
export class Shapes {
  list: Shape[] = []
  add(d: string, fill: string, opacity = 1): void {
    if (d) this.list.push({ d, fill, opacity })
  }
}

// ---------- numbers ----------
export function r(n: number): number { return Math.round(n * 100) / 100; }

export function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

// ---------- paths ----------
export function pt(p: Pt): string { return r(p[0]) + ' ' + r(p[1]); }

// A smooth path through points (Catmull-Rom as cubic Beziers). A point with a third value `true` is a corner.
export function spline(pts: Pt[], closed = false, k = 1): string {
  let n = pts.length; if (n < 2) return '';
  let d = 'M' + pt(pts[0]); let last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    let p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    let c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k];
    let c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k];
    d += 'C' + pt(c1) + ' ' + pt(c2) + ' ' + pt(p2);
  }
  return closed ? d + 'Z' : d;
}

export function poly(pts: Pt[]): string { return pts.map(function (p, i) { return (i ? 'L' : 'M') + pt(p); }).join('') + 'Z'; }

export function ell(cx: number, cy: number, rx: number, ry: number): string { return 'M' + r(cx - rx) + ' ' + r(cy) + 'A' + r(rx) + ' ' + r(ry) + ' 0 1 0 ' + r(cx + rx) + ' ' + r(cy) + 'A' + r(rx) + ' ' + r(ry) + ' 0 1 0 ' + r(cx - rx) + ' ' + r(cy) + 'Z'; }

export function mirror(p: Pt): Pt { return [200 - p[0], p[1], p[2]]; }

// A symmetric outline from its right half (top to bottom): the right half, then the left half back up.
export function sym(right: Pt[]): Pt[] { let left = right.slice().reverse().map(mirror); if (Math.abs(right[0][0] - 100) < 0.01) left.pop(); if (Math.abs(right[right.length - 1][0] - 100) < 0.01) left.shift(); return right.concat(left); }

// A band along a curve (a list of points): thickness from `w0` to `w1` with a bulge `mid` (0..1 of the length), centred on the curve or to one side.
export function band(curve: Pt[], w0: number, w1: number, wm?: number, side = 0): string {
  let top = [], bot = [], n = curve.length;
  for (let i = 0; i < n; i++) {
    let a = curve[Math.max(0, i - 1)], b = curve[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    let t = i / (n - 1), w = (wm == null ? lerp(w0, w1, t) : (t < 0.5 ? lerp(w0, wm, t * 2) : lerp(wm, w1, (t - 0.5) * 2))) / 2;
    let o1 = w * (1 + side), o2 = w * (1 - side);
    top.push([curve[i][0] + nx * o1, curve[i][1] + ny * o1]); bot.push([curve[i][0] - nx * o2, curve[i][1] - ny * o2]);
  }
  return spline(top.concat(bot.reverse()), true);
}

// A curve sampled from a function of t in 0..1.
export function sample(f: (t: number) => Pt, n: number): Pt[] { let out = []; for (let i = 0; i <= n; i++) out.push(f(i / n)); return out; }

// A repeatable number from 0 to 1 for each whole number: the same every time, with no pattern the eye can find (curls that are not all alike, drawn the same every time).
export function rnd(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// A closed outline with a bumpy (curly) edge: each segment bulges outward from the centre, by `amp` (or by the amount a function gives for the segment), leaning a little to one
// side or the other (`lean`, from 0, none, to 1) so that no two curls are the same.
export function bumpy(pts: Pt[], amp: number | ((i: number) => number), cx: number, cy: number, lean = 0): string {
  let n = pts.length, d = 'M' + pt(pts[0]);
  for (let i = 0; i < n; i++) {
    let a = pts[i], b = pts[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy) || 1;
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]); let k = Math.min(typeof amp === 'function' ? amp(i) : amp, seg * 0.7);
    let slide = lean ? (rnd(i + 31) - 0.5) * 2 * lean * seg * 0.45 : 0, tx = (b[0] - a[0]) / (seg || 1), ty = (b[1] - a[1]) / (seg || 1);
    d += 'Q' + pt([mx + ox / ol * k * 1.6 + tx * slide, my + oy / ol * k * 1.6 + ty * slide]) + ' ' + pt(b);
  }
  return d + 'Z';
}

// Points along a closed outline at spaces that vary (by up to `spread` of the step, either way), so that curls and coils are not all the same size.
export function uneven(pts: Pt[], step: number, spread = 0.4): Pt[] {
  const n = pts.length, out: Pt[] = [pts[0]];
  let k = 0, target = step * (1 + spread * (2 * rnd(0) - 1)), acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg === 0) continue;
    let pos = 0;
    while (acc + (seg - pos) >= target) {
      pos += target - acc;
      out.push([lerp(a[0], b[0], pos / seg), lerp(a[1], b[1], pos / seg)]);
      acc = 0; k++; target = step * (1 + spread * (2 * rnd(k) - 1));
    }
    acc += seg - pos;
  }
  const f = out[0], l = out[out.length - 1];
  if (out.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < step * 0.4) out.pop();
  return out;
}

// Points every `step` units along a closed outline (so a curl or a wave has the same size wherever the outline is long or short).
export function evenly(pts: Pt[], step: number): Pt[] {
  let out = [pts[0]], n = pts.length, acc = 0;
  for (let i = 0; i < n; i++) {
    let a = pts[i], b = pts[(i + 1) % n], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), d = step - acc;
    while (d <= seg) { let t = d / seg; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); d += step; }
    acc = seg - (d - step);
  }
  let f = out[0], l = out[out.length - 1];
  if (out.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < step * 0.5) out.pop();
  return out;
}

export function smoothDense(pts: Pt[]): Pt[] {
  // points along the Catmull-Rom curve, so a textured edge follows the smooth outline, not its corners
  let out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    let p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < 6; s++) {
      let t = s / 6, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(function (d) { return 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3); }));
    }
  }
  return out;
}
