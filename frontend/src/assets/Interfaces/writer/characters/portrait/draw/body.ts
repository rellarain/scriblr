// The neck, the shoulders and the top the character wears.

import { Shapes, band, lerp, mirror, PI, sample, spline, sym } from '../paths'
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
  let top = pick(TOPS, p.top), cloth = p.topColor, dark = shade(cloth, 0.14);
  let ox = top.open, d = top.depth;
  if (top.v || top.id === 'scoop' || top.id === 'boat') { // collarbones show above a low neckline
    out.add(band(sample(function (t) { return [lerp(100 - 3, 100 - N - 14, t), nb + 5 + Math.sin(t * PI) * -1.2 + t * 1.5]; }, 8), 0.5, 0.3, 1.1), shade(skin, 0.12), 0.8);
    out.add(band(sample(function (t) { return [lerp(100 + 3, 100 + N + 14, t), nb + 5 + Math.sin(t * PI) * -1.2 + t * 1.5]; }, 8), 0.5, 0.3, 1.1), shade(skin, 0.12), 0.8);
  }
  let clothR;
  if (top.turtle) {
    clothR = [[100 + N + 1.5, g.chin + 3], [100 + N + 2.2, nb - 4], [100 + N + (S - N) * tr, nb + 1.5], [100 + S - 13, sy - 3], [100 + S - 1.5, sy + 7.5], [100 + S + 3, sy + 28], [100 + S + 5, 220]];
    out.add(spline(sym(clothR), true), cloth);
    out.add(spline([[100 - N - 1.5, g.chin + 3], [100 + N + 1.5, g.chin + 3], [100 + N + 2, g.chin + 7], [100 - N - 2, g.chin + 7]], true), dark);
    // folds of the roll
    out.add(band(sample(function (t) { return [lerp(100 - N - 1, 100 + N + 1, t), nb - 5 + Math.sin(t * PI) * 2.5]; }, 10), 0.6, 0.6, 1.2), dark);
  } else {
    let edge = top.v
      ? [[100 + N + ox, nb - 3.5], [100 + (N + ox) * 0.5, nb + d * 0.45], [100, nb + d, 1]]
      : [[100 + N + ox, nb - 3.5], [100 + (N + ox) * 0.62, nb + d * 0.72], [100, nb + d]];
    clothR = [[100 + N + ox, nb - 3.5, 1], [100 + N + ox + (S - N - ox) * 0.4, nb + 1.5], [100 + S - 13, sy - 3], [100 + S - 1.5, sy + 7.5], [100 + S + 3, sy + 28], [100 + S + 5, 220]];
    let right = clothR.slice().reverse(); // from the bottom up to the neckline
    let outline = right.concat([]).concat(edge.slice(1)).concat(edge.slice(0, -1).reverse().map(mirror)).concat(clothR.map(mirror));
    out.add(spline(outline, true), cloth);
    if (top.band) { // the neckband: a deeper strip along the neckline
      let nbPts = top.v
        ? sample(function (t) { let x = lerp(-(N + ox), N + ox, t); return [100 + x, nb - 3.5 + (d + 3.5) * (1 - Math.abs(x) / (N + ox))]; }, 20)
        : sample(function (t) { let x = lerp(-(N + ox), N + ox, t); let u = Math.abs(x) / (N + ox); return [100 + x, nb - 3.5 + (d + 3.5) * (1 - u * u)]; }, 20);
      out.add(band(nbPts, 2.2, 2.2, 2.6, -0.9), dark);
    }
  }
  // The far side of the body falls into shade, with a fold from the shoulder.
  let sk = S / 86;
  out.add(spline([[100 + S - 6 * sk, sy + 2], [100 + S - 1, sy + 8], [100 + S + 3, sy + 28], [100 + S + 5, 220], [100 + S - 7 * sk, 220], [100 + S - 8 * sk, sy + 28]], true), dark);
  out.add(band(sample(function (t) { return [lerp(100 - S + 16, 100 - S + 24, t), lerp(sy + 14, 210, t)]; }, 6), 0.4, 1.2, 1.6), dark, 0.55);
  let chest = p.chest;
  if (chest === 'full') {
    out.add(band(sample(function (t) { return [lerp(100 - S * 0.5, 100 - 4, t), 197 + Math.sin(t * PI) * 6]; }, 10), 0.4, 0.8, 2), dark, 0.75);
    out.add(band(sample(function (t) { return [lerp(100 + S * 0.5, 100 + 4, t), 197 + Math.sin(t * PI) * 6]; }, 10), 0.4, 0.8, 2), dark, 0.75);
  } else if (chest === 'flat' && g.build.id !== 'slight') {
    out.add(band(sample(function (t) { return [lerp(100 - S * 0.55, 100 - 6, t), 194 + Math.sin(t * PI) * 2.5 + t * 2]; }, 10), 0.3, 0.6, 1.2), dark, 0.45);
    out.add(band(sample(function (t) { return [lerp(100 + S * 0.55, 100 + 6, t), 194 + Math.sin(t * PI) * 2.5 + t * 2]; }, 10), 0.3, 0.6, 1.2), dark, 0.45);
  }
}
