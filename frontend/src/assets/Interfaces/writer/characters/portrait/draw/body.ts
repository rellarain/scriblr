// The neck, the shoulders and the top the character wears.

import { Shapes, band, ell, lerp, mirror, PI, sample, spline, sym, type Pt } from '../paths'
import { shade } from '../colour'
import { TOPS, pick } from '../library'
import { type Rig } from '../rig'
import { type Drawn } from '../types'

export function drawBody(out: Shapes, g: Rig, p: Drawn): void {
  let N = g.neck, S = g.S, nb = g.neckBase, sy = g.shoulderY, skin = p.skin, tr = g.build.trap;
  let bodyR = [[100 + N, g.chin - g.H * 0.22], [100 + N * 1.0, nb - 9], [100 + N + (S - N) * tr, nb + 2], [100 + S - 13, sy - 2], [100 + S - 2.5, sy + 8], [100 + S + 2, sy + 28], [100 + S + 4, 220]];
  out.add(spline(sym(bodyR), true), skin);
  // The shadow the head throws on the neck, and the far side of the neck.
  out.add(spline([[100 - N - 1, g.chin - g.H * 0.24], [100 + N + 1, g.chin - g.H * 0.24], [100 + N + 1, g.chin - g.H * 0.05], [100 + N * 0.4, g.chin + 5.5], [100, g.chin + 6.5], [100 - N * 0.4, g.chin + 5.5], [100 - N - 1, g.chin - g.H * 0.05]], true), shade(skin, 0.16));
  out.add(spline([[100 + N - 3.5, g.chin], [100 + N + 0.5, g.chin - 2], [100 + N * 1.0 + 0.4, nb - 9], [100 + N + 4, nb + 0.5], [100 + N - 2, nb - 3], [100 + N - 4, nb - 12]], true), shade(skin, 0.1));
  if (g.lines > 1) { // the cords of an older neck
    out.add(band(sample(function (t) { return [100 - N * 0.45 + t * 2, lerp(g.chin + 6, nb - 2, t)]; }, 6), 0.4, 0.8, 0.9), shade(skin, 0.13), 0.7);
    out.add(band(sample(function (t) { return [100 + N * 0.45 - t * 2, lerp(g.chin + 6, nb - 2, t)]; }, 6), 0.4, 0.8, 0.9), shade(skin, 0.13), 0.7);
  }
  let top = pick(TOPS, p.top), cloth = p.topColor, dark = shade(cloth, 0.14), shape = top.shape;
  let ox = top.open, d = top.depth;
  // Off the shoulder and strapless leave the shoulders (and, strapless, the arms) bare: no cloth over them, and no fall of shade from them.
  let bare = shape === 'off' || shape === 'strapless';
  if (top.v || bare || ['scoop', 'widescoop', 'boat', 'square', 'sweetheart'].includes(top.id)) { // collarbones show above a low neckline
    out.add(band(sample(function (t) { return [lerp(100 - 3, 100 - N - 14, t), nb + 5 + Math.sin(t * PI) * -1.2 + t * 1.5]; }, 8), 0.5, 0.3, 1.1), shade(skin, 0.12), 0.8);
    out.add(band(sample(function (t) { return [lerp(100 + 3, 100 + N + 14, t), nb + 5 + Math.sin(t * PI) * -1.2 + t * 1.5]; }, 8), 0.5, 0.3, 1.1), shade(skin, 0.12), 0.8);
  }
  let clothR;
  if (top.turtle) {
    // A turtleneck rolls up to under the chin; a mock neck stops part of the way.
    let ty = top.mock ? lerp(g.chin + 3, nb - 6, 0.6) : g.chin + 3;
    clothR = [[100 + N + 1.5, ty], [100 + N + 2.2, nb - 4], [100 + N + (S - N) * tr, nb + 1.5], [100 + S - 13, sy - 3], [100 + S - 1.5, sy + 7.5], [100 + S + 3, sy + 28], [100 + S + 5, 220]];
    out.add(spline(sym(clothR), true), cloth);
    out.add(spline([[100 - N - 1.5, ty], [100 + N + 1.5, ty], [100 + N + 2, ty + 4], [100 - N - 2, ty + 4]], true), dark);
    // folds of the roll
    out.add(band(sample(function (t) { return [lerp(100 - N - 1, 100 + N + 1, t), nb - 5 + Math.sin(t * PI) * 2.5]; }, 10), 0.6, 0.6, 1.2), dark);
  } else {
    let edge: Pt[];
    if (shape === 'strapless') {
      // The cloth covers the body between the arms, from a straight edge across the chest down.
      edge = [[100 + S - 14, nb + d - 4, 1], [100 + S * 0.5, nb + d], [100, nb + d + 2]];
      clothR = [[100 + S - 14, nb + d - 4, 1], [100 + S - 13, sy + 28], [100 + S - 12, 220]];
    } else if (shape === 'off') {
      // The sleeves sit on the arms; the edge runs across the chest below the collarbones, and the shoulders are bare.
      edge = [[100 + S - 5, sy + 1, 1], [100 + S * 0.6, nb + d * 0.85], [100 + S * 0.25, nb + d * 0.95], [100, nb + d]];
      clothR = [[100 + S - 5, sy + 1, 1], [100 + S - 1.5, sy + 7.5], [100 + S + 3, sy + 28], [100 + S + 5, 220]];
    } else {
      edge = shape === 'square'
        ? [[100 + N + ox, nb - 3.5, 1], [100 + N + ox, nb + d, 1], [100, nb + d]]
        : shape === 'heart'
          ? [[100 + N + ox, nb - 3.5], [100 + (N + ox) * 0.92, nb + d * 0.34], [100 + (N + ox) * 0.74, nb + d * 0.46], [100 + (N + ox) * 0.52, nb + d * 0.3], [100 + (N + ox) * 0.3, nb + d * 0.2], [100 + (N + ox) * 0.1, nb + d * 0.5], [100, nb + d, 1]]
          : top.v
            ? [[100 + N + ox, nb - 3.5], [100 + (N + ox) * 0.5, nb + d * 0.45], [100, nb + d, 1]]
            : [[100 + N + ox, nb - 3.5], [100 + (N + ox) * 0.62, nb + d * 0.72], [100, nb + d]];
      clothR = [[100 + N + ox, nb - 3.5, 1], [100 + N + ox + (S - N - ox) * 0.4, nb + 1.5], [100 + S - 13, sy - 3], [100 + S - 1.5, sy + 7.5], [100 + S + 3, sy + 28], [100 + S + 5, 220]];
    }
    let right = clothR.slice().reverse(); // from the bottom up to the neckline
    let outline = right.concat([]).concat(edge.slice(1)).concat(edge.slice(0, -1).reverse().map(mirror)).concat(clothR.map(mirror));
    out.add(spline(outline, true), cloth);
    if (top.band) { // the neckband: a deeper strip along the neckline
      let nbPts = shape === 'square' || shape === 'heart'
        ? along(edge.concat(edge.slice(0, -1).reverse().map(mirror)), 1.6)
        : top.v
          ? sample(function (t) { let x = lerp(-(N + ox), N + ox, t); return [100 + x, nb - 3.5 + (d + 3.5) * (1 - Math.abs(x) / (N + ox))]; }, 20)
          : sample(function (t) { let x = lerp(-(N + ox), N + ox, t); let u = Math.abs(x) / (N + ox); return [100 + x, nb - 3.5 + (d + 3.5) * (1 - u * u)]; }, 20);
      out.add(band(nbPts, 2.2, 2.2, 2.6, -0.9), dark);
    }
    if (shape === 'henley') { // a placket down the front with its buttons
      out.add(band([[100, nb + 3], [100, nb + 31]], 4.6, 4.6, 4.6), shade(cloth, 0.09));
      [11, 19, 27].forEach(function (dy) { out.add(ell(100, nb + dy, 1.1, 1.1), dark); });
    }
    if (shape === 'polo') { // a collar of two flaps, and a short placket below the V
      const flap = [[100 + 2, nb + d - 1, 1], [100 + N + ox + 1, nb - 5, 1], [100 + N + ox + 9, nb + 1.5], [100 + 13, nb + d + 4]];
      out.add(spline(flap, true), shade(cloth, -0.1));
      out.add(spline(flap.map(mirror), true), shade(cloth, -0.1));
      out.add(band([[100, nb + d], [100, nb + d + 14]], 4.2, 4.2, 4.2), shade(cloth, 0.09));
      [d + 5, d + 11].forEach(function (dy) { out.add(ell(100, nb + dy, 1, 1), dark); });
    }
    if (shape === 'cowl') { // the cloth hangs in a drape across the neckline, in folds
      const w = N + ox, rim = sample(function (t) { return [lerp(100 + w * 0.97, 100 - w * 0.97, t), nb - 2 + Math.sin(t * PI) * d * 0.34]; }, 12);
      out.add(spline(rim.concat(sample(function (t) { return [lerp(100 - w * 0.9, 100 + w * 0.9, t), nb + 1 + Math.sin(t * PI) * d * 0.74]; }, 12)), true), shade(cloth, -0.07));
      [0, 1].forEach(function (j) {
        out.add(band(sample(function (t) { return [lerp(100 - w * 0.86, 100 + w * 0.86, t), nb + 3 + j * 5 + Math.sin(t * PI) * (d * 0.5 - j * 3)]; }, 12), 0.4, 0.4, 1.4), dark, 0.5);
      });
      out.add(band(rim, 0.6, 0.6, 1.3), dark, 0.6);
    }
  }
  // The far side of the body falls into shade, with a fold from the shoulder (cloth over the arm: not where the arm is bare).
  let sk = S / 86;
  if (!bare) {
    out.add(spline([[100 + S - 6 * sk, sy + 2], [100 + S - 1, sy + 8], [100 + S + 3, sy + 28], [100 + S + 5, 220], [100 + S - 7 * sk, 220], [100 + S - 8 * sk, sy + 28]], true), dark);
    out.add(band(sample(function (t) { return [lerp(100 - S + 16, 100 - S + 24, t), lerp(sy + 14, 210, t)]; }, 6), 0.4, 1.2, 1.6), dark, 0.55);
  } else if (shape === 'off') {
    out.add(spline([[100 + S - 3, sy + 4], [100 + S - 1, sy + 8], [100 + S + 3, sy + 28], [100 + S + 5, 220], [100 + S - 7 * sk, 220], [100 + S - 8 * sk, sy + 28]], true), dark);
  }
  let chest = p.chest;
  if (chest === 'full') {
    out.add(band(sample(function (t) { return [lerp(100 - S * 0.5, 100 - 4, t), 197 + Math.sin(t * PI) * 6]; }, 10), 0.4, 0.8, 2), dark, 0.75);
    out.add(band(sample(function (t) { return [lerp(100 + S * 0.5, 100 + 4, t), 197 + Math.sin(t * PI) * 6]; }, 10), 0.4, 0.8, 2), dark, 0.75);
  } else if (chest === 'flat' && g.build.id !== 'slight') {
    out.add(band(sample(function (t) { return [lerp(100 - S * 0.55, 100 - 6, t), 194 + Math.sin(t * PI) * 2.5 + t * 2]; }, 10), 0.3, 0.6, 1.2), dark, 0.45);
    out.add(band(sample(function (t) { return [lerp(100 + S * 0.55, 100 + 6, t), 194 + Math.sin(t * PI) * 2.5 + t * 2]; }, 10), 0.3, 0.6, 1.2), dark, 0.45);
  }
}

// Points every `step` units along a polyline (a band drawn along a neckline with a corner follows it closely).
function along(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [[pts[0][0], pts[0][1]]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step))
    for (let k = 1; k <= n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)])
  }
  return out
}
