// The ears and the head: the shape of the face, with one plane of shade down the side away from the light (the light comes from the upper left).

import { Shapes, mirror, PI, spline, sym } from '../paths'
import { shade } from '../colour'
import { EARS, pick } from '../library'
import { headOutline, type Rig } from '../rig'
import { type Drawn } from '../types'

export function drawEars(out: Shapes, g: Rig, p: Drawn): void {
  let e = pick(EARS, p.ears), skin = p.skin;
  let y0 = g.browY - 1, y1 = g.noseY + 1.5, h = (y1 - y0) * e.h, t = (y0 + y1) / 2 - h / 2;
  let w = g.H * 0.1 * e.w * (g.child ? 0.95 : 1), x = 100 + g.cheek * 0.94;
  let lobe = 2.2 * e.lobe;
  let pts = [[x - 3, t + 2], [x + w * 0.55 * (e.topW || 1), t - 1], [x + w * (e.topW || 1), t + h * 0.22], [x + w * 0.9, t + h * 0.55], [x + w * 0.55, t + h * 0.82], [x + w * 0.25, t + h + lobe * 0.6], [x - 2, t + h * 0.86]];
  let inner = [[x + 0.5, t + h * 0.2], [x + w * 0.58, t + h * 0.14], [x + w * 0.72, t + h * 0.42], [x + w * 0.42, t + h * 0.66], [x + 0.5, t + h * 0.58]];
  out.add(spline(pts, true), skin); out.add(spline(pts.map(mirror), true), skin);
  out.add(spline(inner, true), shade(skin, 0.18)); out.add(spline(inner.map(mirror), true), shade(skin, 0.12));
}

export function drawHead(out: Shapes, g: Rig, p: Drawn): void {
  let right = headOutline(g);
  out.add(spline(sym(right), true), p.skin);
  // One plane of shade down the far side of the face (light from the upper left).
  let outer = right.filter(function (q, i) { return i >= 3; });
  let inner = outer.map(function (q, i) { let t = i / (outer.length - 1); let k = Math.sin(t * PI) * g.W * 0.13; return [q[0] - k, q[1] - k * 0.2]; });
  out.add(spline(outer.concat(inner.reverse()), true), shade(p.skin, 0.07));
}
