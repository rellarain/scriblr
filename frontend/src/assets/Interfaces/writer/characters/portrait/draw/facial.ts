// Facial hair: the beard (under the mouth) and the moustache (over it).

import { Shapes, band, lerp, mirror, PI, sample, spline, sym } from '../paths'
import { shade } from '../colour'
import { type Expression } from '../library'
import { headOutline, type Rig } from '../rig'
import { type Drawn } from '../types'
import { mouthGeom, type MouthGeom } from './features'

export interface BeardOpts { sides?: boolean; fluff?: number; len: number; point?: number }

// Facial hair: the beard (under the mouth) and the moustache (over it).
export function beardShape(g: Rig, p: Drawn, M: MouthGeom, o: BeardOpts): string {
  // o: top (how high on the cheek), fluff (beyond the jaw), len (below the chin), sides (do the sides reach the ears), chinOnly
  let right = [];
  let ex = o.fluff || 2;
  if (o.sides) {
    right.push([100 + g.cheek * 0.95, g.browY + 4]);
    right.push([100 + g.cheek + ex * 0.4, g.eyeY + g.H * 0.08]);
  }
  if (o.sides) right.push([100 + g.jaw + ex, g.jawY + 1]);
  right.push([100 + Math.max(g.chinW, g.W * 0.32) + ex * 0.8, g.chin - g.H * 0.02 + ex * 0.5 + o.len * 0.3]);
  right.push([100 + (o.point ? g.W * 0.1 : g.W * 0.18), g.chin + o.len * 0.85 + ex * 0.3]);
  right.push([100, g.chin + o.len + ex * 0.4]);
  let left = right.slice().reverse().map(mirror); left.shift();
  let inner;
  if (o.sides) inner = [[100 - g.cheek * 0.85, g.browY + 5], [100 - g.cheek * 0.78, g.eyeY + g.H * 0.1], [100 - M.hw - 3, M.y - 1], [100, M.y + 2], [100 + M.hw + 3, M.y - 1], [100 + g.cheek * 0.78, g.eyeY + g.H * 0.1], [100 + g.cheek * 0.85, g.browY + 5]];
  else inner = [[100 - M.hw - 1.5, M.y + 1], [100, M.y + 3], [100 + M.hw + 1.5, M.y + 1]];
  return spline(right.concat(left).concat(inner), true, 0.9);
}

export function drawBeard(out: Shapes, g: Rig, p: Drawn, ex: Expression): void {
  let f = p.facialHair, c = p.facialHairColor, M = mouthGeom(g, p, ex);
  if (f === 'none' || g.child) return;
  if (f === 'stubble') {
    out.add(beardShape(g, p, M, { sides: true, fluff: 0.2, len: 0.5 }), c, 0.13);
    out.add(spline([[100 - M.hw - 2, M.y - 1.5], [100 - 5, g.noseY + 2.5], [100 + 5, g.noseY + 2.5], [100 + M.hw + 2, M.y - 1.5], [100 + M.hw * 0.5, M.y - M.upH - 0.3], [100 - M.hw * 0.5, M.y - M.upH - 0.3]], true), c, 0.13);
    return;
  }
  const shapes: Record<string, BeardOpts> = { full: { sides: true, fluff: 3, len: 9 }, short: { sides: true, fluff: 1.4, len: 4 }, long: { sides: true, fluff: 4, len: 24, point: 1 }, circle: { sides: false, fluff: 1.5, len: 5 }, goatee: { sides: false, fluff: 1, len: 4.5, point: 1 }, vandyke: { sides: false, fluff: 0.8, len: 8, point: 1 }, chinstrap: { sides: true, fluff: 0.6, len: 1.6 } };
  let o = shapes[f];
  if (o) {
    let narrow = f === 'goatee' || f === 'vandyke' || f === 'circle';
    if (narrow) {
      let w = f === 'vandyke' ? M.hw * 0.55 : f === 'goatee' ? M.hw * 0.6 : M.hw * 0.95;
      let pts = [[100 - w, M.y + 1.5], [100 - w * 1.05, g.chin - 4], [100 - w * 0.5, g.chin + o.len * 0.6], [100, g.chin + o.len], [100 + w * 0.5, g.chin + o.len * 0.6], [100 + w * 1.05, g.chin - 4], [100 + w, M.y + 1.5], [100 + M.hw * 0.4, M.y + M.loH + 1.2], [100, M.y + M.loH + 2], [100 - M.hw * 0.4, M.y + M.loH + 1.2]];
      if (f === 'vandyke') pts = [[100 - w, M.y + M.loH + 1.5], [100 - w * 0.9, g.chin - 3], [100, g.chin + o.len], [100 + w * 0.9, g.chin - 3], [100 + w, M.y + M.loH + 1.5], [100, M.y + M.loH + 2.6]];
      out.add(spline(pts, true), c);
    } else if (f === 'chinstrap') {
            let jawLine = headOutline(g).slice(5);
      let full = sym(jawLine).filter(function (q) { return q[1] > g.noseY; });
      out.add(band(full, 1.6, 1.6, 2.4), c);
    } else {
      out.add(beardShape(g, p, M, o), c);
      out.add(beardShape(g, p, M, { sides: o.sides, fluff: (o.fluff ?? 2) * 0.5, len: o.len * 0.8, point: o.point }), shade(c, 0.12), 0.5);
    }
  }
  if (f === 'chops') {
    [1, -1].forEach(function (k) { out.add(spline([[100 + k * g.cheek * 0.96, g.browY + 4], [100 + k * (g.cheek + 1.5), g.eyeY + g.H * 0.08], [100 + k * (g.jaw + 2), g.jawY], [100 + k * (g.jaw - 6), g.jawY + 4], [100 + k * (M.hw + 4), M.y + 1], [100 + k * g.cheek * 0.8, g.eyeY + g.H * 0.08], [100 + k * g.cheek * 0.84, g.browY + 5]], true), c); });
  }
  if (f === 'soulpatch') out.add(spline([[100 - 2.6, M.y + M.loH + 1.6], [100 + 2.6, M.y + M.loH + 1.6], [100 + 1.2, M.y + M.loH + 6], [100 - 1.2, M.y + M.loH + 6]], true), c);
}

export function drawMoustache(out: Shapes, g: Rig, p: Drawn, ex: Expression): void {
  let f = p.facialHair, c = p.facialHairColor, M = mouthGeom(g, p, ex);
  if (g.child || ['moustache', 'handlebar', 'horseshoe', 'goatee', 'circle', 'vandyke', 'short', 'full', 'long'].indexOf(f) < 0) return;
  let y = M.y, hw = M.hw, top = g.noseY + 1.2, thick = f === 'handlebar' ? 3.4 : f === 'short' ? 3.2 : 4;
  let wing = hw + (f === 'vandyke' ? 1 : 2.5);
  let right = [[100, top + 1.2], [100 + 5, top], [100 + wing * 0.75, y - M.upH - 0.2], [100 + wing, y + 0.5 - M.smile * 2], [100 + wing * 0.7, y - M.upH * 0.4 + 1], [100 + 3, y - M.upH + thick * 0.15], [100, y - M.upH + 0.8]];
  if (f === 'handlebar') right.splice(4, 0, [100 + wing + 4, y - 4], [100 + wing + 2.5, y - 1.5]);
  if (f === 'horseshoe') right.splice(4, 0, [100 + wing + 0.5, g.chin - 3], [100 + wing - 2.2, g.chin - 2.5]);
  out.add(spline(sym(right.slice(0, -1)).concat([]), true), c);
  out.add(band(sample(function (t) { return [lerp(100 - wing * 0.7, 100 + wing * 0.7, t), y - M.upH - 0.4 + Math.sin(t * PI) * -0.6]; }, 10), 0.4, 0.4, 1.1), shade(c, 0.15), 0.7);
}
