// Colour arithmetic for the portrait. A colour is #rrggbb. The portrait's colours are the author's data (skin, hair, eyes, cloth, the tile), so these are the only
// colours it draws with, besides the white of an eye and the dark of a pupil.

import { clamp } from './paths'

// ---------- colours ----------
export function hexRgb(h: string): number[] { let m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [128, 128, 128]; let n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function rgbHex(c: number[]): string { return '#' + c.map(function (x) { let s = clamp(Math.round(x), 0, 255).toString(16); return s.length < 2 ? '0' + s : s; }).join(''); }

export function mix(a: string, b: string, t: number): string { let x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }

export function toHsl(h: string): number[] {
  let c = hexRgb(h).map(function (v) { return v / 255; }); let mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, s = 0, hu = 0;
  if (mx !== mn) { let d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hu = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hu /= 6; }
  return [hu, s, l];
}

export function fromHsl(hu: number, s: number, l: number): string {
  function f(p: number, q: number, t: number): number { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
  if (s === 0) return rgbHex([l * 255, l * 255, l * 255]);
  let q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbHex([f(p, q, hu + 1 / 3) * 255, f(p, q, hu) * 255, f(p, q, hu - 1 / 3) * 255]);
}

// A shadow of a colour: darker, a little richer, the hue nudged toward red (skin and cloth in shade warm up).
export function shade(h: string, t: number): string { let c = toHsl(h); let hu = c[0] > 0.5 ? c[0] + (1 - c[0]) * 0.04 * t : c[0] - c[0] * 0.04 * t; return fromHsl(hu, clamp(c[1] * (1 + 0.35 * t) + 0.03 * t, 0, 1), clamp(c[2] * (1 - t), 0, 1)); }

export function lightOf(h: string): number { return toHsl(h)[2]; }
