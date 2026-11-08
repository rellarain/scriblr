// The features of the face: the eyes, the brows, the nose and the mouth, each drawn from its library entry and the expression.

import { Shapes, band, clamp, ell, lerp, poly, PI, sample, spline, type Pt } from '../paths'
import { mix, shade } from '../colour'
import { BROWS, EYES, MOUTHS, NOSES, pick, type Expression, type Eye, type Mouth } from '../library'
import { EYE_STYLES } from '../fantasyLibrary'
import { type Rig } from '../rig'
import { type Drawn } from '../types'

// The curves of one eye: the upper and the lower lid and the line between the corners, as functions of t from the inner corner (0) to the outer one (1).
export interface EyeCurves { es: Eye; hw: number; cx: number; xi: number; xo: number; yi: number; yo: number; up: (t: number) => number; lo: (t: number) => number; X: (t: number) => number; hTop: number; side: number }

export function eyeCurves(g: Rig, p: Drawn, ex: Pick<Expression, 'lid' | 'bot'>, side: number): EyeCurves {
  let es = pick(EYES, p.eyes), hw = g.eyeHW, cx = 100 + side * g.eyeCX;
  let tilt = (es.tilt * (1 - g.baby) + clamp(p.eyeTilt, -12, 12)) * PI / 180, dy = Math.tan(tilt) * hw;
  let xi = cx - side * hw, xo = cx + side * hw, yi = g.eyeY + dy * 0.5 + hw * 0.06, yo = g.eyeY - dy * 0.5;
  let hTop = hw * 0.6 * es.open * ex.lid * (es.lid ? 0.92 : 1) * (1 + 0.18 * g.baby), hBot = hw * 0.3 * es.bot * (1 + 0.25 * g.baby);
  let pk = lerp(es.peak, 1, g.baby);
  function base(t: number): number { return lerp(yi, yo, t); }
  function up(t: number): number { return base(t) - hTop * Math.pow(Math.sin(PI * Math.pow(t, pk)), 0.85); }
  function lo(t: number): number { let s = Math.sin(PI * Math.pow(t, 0.85)); return base(t) + hBot * (1 - ex.bot) * s - hTop * ex.bot * 0.35 * s; }
  function X(t: number): number { return lerp(xi, xo, t); }
  return { es: es, hw: hw, cx: cx, xi: xi, xo: xo, yi: yi, yo: yo, up: up, lo: lo, X: X, hTop: hTop, side: side };
}

// Which eyes to draw (the picture's right is 1, the left -1) and whether they are the small extra eyes of a fantasy portrait, which have no crease, no bags and no lines.
export interface EyeOpts { sides?: number[]; mini?: boolean }

export function drawEyes(out: Shapes, g: Rig, p: Drawn, ex: Expression, opts: EyeOpts = {}): void {
  let lash = mix('#1d1513', p.browColor, 0.25);
  const mini = !!opts.mini, style = EYE_STYLES.some(s => s.id === p.eyeStyle) ? p.eyeStyle : 'normal';
  (opts.sides ?? [1, -1]).forEach(function (side) {
    let c = eyeCurves(g, p, ex, side), es = c.es, hw = c.hw, skin = p.skin;
    // The colour of this eye: with two colours the picture's left eye has the second.
    const iris = style === 'twocolour' && side < 0 ? p.eyeColor2 : p.eyeColor;
    let white = mix('#f7f2ec', skin, 0.1);
    if (style === 'blank') white = mix('#f1f2f6', '#cfd3dd', 0.35);
    if (es.deep && !mini) out.add(spline(sample(function (t) { return [c.X(t), c.up(t) - 1.5 - Math.sin(t * PI) * hw * 0.55]; }, 10).concat(sample(function (t) { return [c.X(1 - t), c.up(1 - t)]; }, 10)), true), shade(skin, 0.1));
    // The crease above the lid.
    if (es.crease > 0 && ex.lid > 0.5 && g.baby < 0.7 && !mini) {
      let gap = hw * (es.hood ? 0.18 : 0.34) * (0.6 + 0.4 * ex.lid);
      let crease = sample(function (t) { let u = lerp(0.12, 0.98, t); return [c.X(u), c.up(u) - gap - Math.sin(u * PI) * hw * 0.08]; }, 12);
      out.add(band(crease, 0.25, 0.4, 0.9 * es.crease, side > 0 ? 0.6 : -0.6), shade(skin, 0.2), 0.85);
    }
    if ((es.hood || es.lid) && !mini) // the fold of the lid over the eye
      out.add(spline(sample(function (t) { return [c.X(t), c.up(t) - 0.3]; }, 12).concat(sample(function (t) { let u = 1 - t; return [c.X(u), c.up(u) - hw * 0.2 * Math.sin(u * PI)]; }, 12)), true), shade(skin, 0.05));
    let outline = sample(function (t) { return [c.X(t), c.up(t)]; }, 14).concat(sample(function (t) { return [c.X(1 - t), c.lo(1 - t)]; }, 14).slice(1, -1));
    // A glowing eye has a halo round it, under the lids.
    const mid = lerp(c.yi, c.yo, 0.5);
    if (style === 'glowing') {
      out.add(ell(c.cx, mid, hw * 1.7, hw * 1.05), iris, 0.14);
      out.add(ell(c.cx, mid, hw * 1.3, hw * 0.78), iris, 0.2);
    }
    out.add(spline(outline, true, 0.6), style === 'solid' ? iris : white);
    // The iris and pupil, kept inside the opening.
    let look = (ex.look || 0) * hw * 0.35;
    let ri = hw * 0.5 * es.iris * (1 + 0.14 * g.baby), icx = c.cx + look, icy = lerp(c.yi, c.yo, 0.5) - c.hTop * 0.12;
    function clipEll(rx: number, ry: number): Pt[] {
      return sample(function (t) {
        let a = t * PI * 2, x = icx + Math.cos(a) * rx, y = icy + Math.sin(a) * ry;
        let u = clamp((x - c.xi) / (c.xo - c.xi), 0.02, 0.98); x = c.X(u);
        return [x, clamp(y, c.up(u) + 0.15, c.lo(u) - 0.15)];
      }, 36).slice(0, -1);
    }
    function clip(rad: number): Pt[] { return clipEll(rad, rad); }
    if (style === 'glowing') {
      out.add(poly(clip(ri)), mix(iris, '#ffffff', 0.25));
      out.add(poly(clip(ri * 0.66)), mix(iris, '#ffffff', 0.62));
      out.add(poly(clip(ri * 0.34)), '#ffffff', 0.92);
    } else if (style === 'solid') {
      out.add(poly(clip(ri * 1.5)), shade(iris, 0.26), 0.45);
      out.add(poly(clip(ri * 0.8)), shade(iris, 0.12), 0.5);
    } else if (style === 'slit' || style === 'goat') {
      out.add(poly(clip(ri * 1.1)), iris);
      out.add(poly(clip(ri * 0.74)), shade(iris, 0.28), 0.55);
      out.add(poly(style === 'slit' ? clipEll(ri * 0.17, ri * 1.2) : clipEll(ri * 0.86, ri * 0.2)), '#16100e');
    } else if (style !== 'blank') {
      out.add(poly(clip(ri)), iris);
      out.add(poly(clip(ri * 0.62)), shade(iris, 0.28), 0.6);
      out.add(poly(clip(ri * 0.42)), '#16100e');
    }
    let hx = icx - ri * 0.38, hy = icy - ri * 0.36, hu = clamp((hx - c.xi) / (c.xo - c.xi), 0, 1);
    if (style !== 'blank' && hy > c.up(hu) + 0.4) out.add(ell(hx, hy, ri * 0.2, ri * 0.2), '#ffffff', 0.9);
    // The lash line along the upper lid, heavier toward the outer corner.
    let lashLine = sample(function (t) { return [c.X(t), c.up(t)]; }, 14);
    if (es.flick) lashLine.push([c.xo + side * hw * 0.28, c.yo - hw * 0.22]);
    out.add(band(lashLine, 0.35, es.flick ? 0.2 : 0.7, 1.35 * (1 - 0.4 * g.baby), side > 0 ? 0.55 : -0.55), lash);
    // A soft line under the eye: deeper with age.
    if (!mini && (g.lines > 0.5 || ex.bot > 0.3)) {
      let bag = sample(function (t) { let u = lerp(0.18, 0.9, t); return [c.X(u), c.lo(u) + 1.4 + g.lines * 0.5]; }, 10);
      out.add(band(bag, 0.15, 0.25, 0.55 + g.lines * 0.12), shade(skin, 0.16), clamp(0.3 + g.lines * 0.3 + ex.bot * 0.4, 0, 0.9));
    }
    if (g.lines > 1 && !mini) { // crow's feet
      for (let k = 0; k < 3; k++) {
        let fy = c.yo + (k - 1) * 1.9, fx = c.xo + side * 1.4;
        out.add(band([[fx, fy], [fx + side * 3, fy + (k - 1) * 0.8]], 0.4, 0.15), shade(skin, 0.16), 0.75);
      }
    }
  });
}

export function drawBrows(out: Shapes, g: Rig, p: Drawn, ex: Expression, sides: number[] = [1, -1]): void {
  let b = pick(BROWS, p.brows); if (b.none) return;
  sides.forEach(function (side) {
    let c = eyeCurves(g, p, { lid: 1, bot: 0 }, side), hw = c.hw;
    let xi = c.xi - side * hw * 0.12, xo = c.xo + side * hw * 0.45 * b.len;
    let raise = (ex.browRaise && side < 0 ? ex.browRaise : 0);
    let yi = g.browY + (ex.bin || 0) + (b.low || 0) + raise, yo = g.browY + b.tail + (ex.bout || 0) + (b.low || 0) + raise * 0.7;
    let th = b.th * lerp(1, 0.45, g.baby) * (g.H / 92);
    let browCol = mix(p.browColor, p.skin, 0.5 * g.baby);
    let pts = sample(function (t) {
      let arch = b.angle ? lerp(Math.sin(PI * Math.min(1, t / b.peak) * 0.5), 1 - (t - b.peak) / (1 - b.peak), t > b.peak ? 1 : 0) : Math.sin(PI * Math.pow(t, Math.log(0.5) / Math.log(b.peak)));
      if (b.angle && t <= b.peak) arch = Math.sin(PI / 2 * t / b.peak);
      let y = lerp(yi, yo, t) - b.arch * arch + (b.s ? Math.sin(t * PI * 2) * 0.5 : 0);
      return [lerp(xi, xo, t), y];
    }, 16);
    let d = band(pts, th * 1.05, th * (1 - b.taper) * 0.5, th * (1 - b.taper * 0.35), side > 0 ? -0.15 : 0.15);
    out.add(d, browCol, b.sparse ? 0.62 : 1);
    if (b.rough) out.add(band(pts.map(function (q) { return [q[0], q[1] - th * 0.45]; }), th * 0.4, th * 0.2, th * 0.5), browCol, 0.6);
  });
}

export function drawNose(out: Shapes, g: Rig, p: Drawn): void {
  let n = pick(NOSES, p.nose), skin = p.skin, s = g.age.noseS * clamp(p.noseSize, 0.6, 1.4), ws = clamp(p.noseWidth, 0.6, 1.5);
  let by = g.noseY + (n.len - 1) * 6 * s, top = g.browY + 2;
  let tip = g.W * 0.1 * n.tip * s * ws, wing = g.W * 0.25 * n.wing * s * ws * (g.child ? 1.05 : 1), br = g.W * 0.075 * n.bridge * ws;
  let up = (n.up || 0) * 1.4 * s, droop = (n.droop || 0) * 1.6 * s, hook = (n.hook || 0), bend = n.bent ? 1.6 : 0;
  let mid = lerp(top, by, 0.5);
  // The far side of the nose in shade: down the bridge to the tip.
  let side = [[100 + br * 0.4 + bend * 0.3, top + 3], [100 + br * (1 + hook * 0.5) + bend, mid], [100 + tip * 1.15 + bend * 0.5, by - 4.6 * s + up - droop * 0.2], [100 + wing * 0.82, by - 3.2 * s], [100 + wing * 0.62, by - 6.8 * s], [100 + br * 1.9 + bend, mid + 3], [100 + br * 1.6 + bend * 0.3, top + 7]];
  if (!g.child) out.add(spline(side, true), shade(skin, 0.085), 0.9);
  // The underside of the nose and the tip.
  let under = [[100 - wing * 0.78, by - 2.6 * s], [100 - tip, by - 4.4 * s + up], [100 + bend * 0.3, by - 3.6 * s + up + droop], [100 + tip, by - 4.4 * s + up], [100 + wing * 0.78, by - 2.6 * s], [100 + wing * 0.3, by + 0.9 * s], [100, by + 1.3 * s + droop * 0.5], [100 - wing * 0.3, by + 0.9 * s]];
  out.add(spline(under, true), shade(skin, n.flat ? 0.1 : 0.13));
  if (n.round) out.add(ell(100 + bend * 0.3, by - 4.2 * s + up, tip * 0.9 * n.round, 2.4 * s), shade(skin, 0.05), 0.8);
  // The wings and nostrils.
  [1, -1].forEach(function (k) {
    // the crease around each wing: an arc on its outer side only
    out.add(band(sample(function (t) { let a = lerp(0.22, 0.95, t) * PI; return [100 + k * (wing * 0.64 + Math.sin(a) * wing * 0.18), by - 2.2 * s - Math.cos(a) * 2.3 * s]; }, 10), 0.2, 0.25, 0.95 * s, k > 0 ? -0.4 : 0.4), shade(skin, 0.19), 0.8);
    out.add(ell(100 + k * wing * 0.42, by - 0.6 * s, wing * 0.17, 0.85 * s), shade(skin, 0.34), 0.85);
  });
}

// The geometry of the mouth: its entry, scale, half width, the heights of the lips, the smile (the corners lifted), how far it is open, and where it is.
export interface MouthGeom { m: Mouth; s: number; hw: number; upH: number; loH: number; smile: number; open: number; y: number }

export function mouthGeom(g: Rig, p: Drawn, ex: Expression): MouthGeom {
  let m = pick(MOUTHS, p.mouth), s = g.age.mouthS * clamp(p.mouthSize, 0.7, 1.35);
  let hw = g.W * 0.37 * m.w * s * (1 + (ex.wide || 0) * 0.14) * (ex.round ? 0.62 : 1) * (ex.narrow ? 0.9 : 1);
  let thin = g.lines > 1.5 ? 0.72 : g.lines > 1 ? 0.85 : 1;
  let upH = 2.3 * m.up * s * thin, loH = 3.1 * m.lo * s * thin;
  let smile = (ex.smile || 0) + m.rest * 0.4, open = (ex.open || 0) * 6.5 * s;
  return { m: m, s: s, hw: hw, upH: upH, loH: loH, smile: smile, open: open, y: g.mouthY };
}

export function drawMouth(out: Shapes, g: Rig, p: Drawn, ex: Expression): void {
  let M = mouthGeom(g, p, ex), m = M.m, s = M.s, hw = M.hw, y = M.y, lip = p.lipColor, skin = p.skin;
  function cornerY(k: number): number { let sm = M.smile + (ex.asym && k > 0 ? ex.asym : 0) + (m.uneven && k > 0 ? 0.35 : 0); return y - sm * 2.9 * s + (sm < 0 ? -sm * 0.6 * s : 0); }
  let cl = [100 - hw, cornerY(-1)], cr = [100 + hw, cornerY(1)];
  let midY = y + Math.max(0, M.smile) * 1.1 * s;
  function line(t: number): Pt { let x = lerp(cl[0], cr[0], t); let base = lerp(cl[1], cr[1], t); let u = Math.sin(t * PI); return [x, base + (midY - (cl[1] + cr[1]) / 2) * u]; }
  let lineUp = sample(line, 16);
  let gap = M.open;
  let lineLo = lineUp.map(function (q, i) { let t = i / 16; return [q[0], q[1] + gap * Math.pow(Math.sin(t * PI), ex.round ? 0.7 : 0.9)]; });
  // The shadow under the lower lip.
  out.add(band(sample(function (t) { let u = lerp(0.25, 0.75, t); let q = lineLo[Math.round(u * 16)]; return [q[0], q[1] + M.loH + 1.6 * s]; }, 8), 0.4, 0.4, 1.6 * s), shade(skin, 0.12), 0.7);
  if (gap > 0.6) {
    out.add(spline(lineUp.concat(lineLo.slice().reverse().slice(1, -1)), true, 0.8), mix('#3b1d22', lip, 0.25));
    if (ex.teeth && g.baby < 0.8) {
      let tH = Math.min(gap * 0.5, 3.4 * s) * ex.teeth;
      let teeth = sample(function (t) { let u = lerp(0.1, 0.9, t); let a = line(u); return [a[0], a[1] - 0.2]; }, 12);
      let tb = teeth.map(function (q, i) { let u = lerp(0.1, 0.9, i / 12); return [q[0], q[1] + tH * Math.pow(Math.sin(u * PI), 0.5)]; });
      out.add(spline(teeth.concat(tb.reverse()), true), '#f2ede6');
    }
  }
  // Upper lip with its bow, lower lip below the line.
  let bowW = hw * 0.22, dip = 0.9 * m.bow * s;
  let upper = [cl, [100 - hw * 0.62, lerp(cl[1], y, 0.6) - M.upH * 0.72], [100 - bowW, y - M.upH], [100, y - M.upH + dip], [100 + bowW, y - M.upH], [100 + hw * 0.62, lerp(cr[1], y, 0.6) - M.upH * 0.72], cr];
  upper[0] = [cl[0], cl[1], 1]; upper[upper.length - 1] = [cr[0], cr[1], 1];
  out.add(spline(upper.concat(lineUp.slice().reverse().slice(1, -1)), true), shade(lip, 0.13));
  let lower = lineLo.slice(); lower[0] = [cl[0], cl[1], 1]; lower[16] = [cr[0], cr[1], 1];
  let lowerBottom = [[100 + hw * 0.62, lineLo[13][1] + M.loH * 0.75], [100, lineLo[8][1] + M.loH], [100 - hw * 0.62, lineLo[3][1] + M.loH * 0.75]];
  out.add(spline(lower.concat(lowerBottom), true), lip);
  if (gap <= 0.6) out.add(band(lineUp, 0.35, 0.35, 0.95 * s), shade(lip, 0.5), 0.9);
  // Creases at the corners of a smile; lines from the nose with age.
  if (M.smile > 0.5) [cl, cr].forEach(function (c, i) { let k = i ? 1 : -1; out.add(band([[c[0] + k * 0.6, c[1] - 2.2], [c[0] + k * 1.6, c[1]], [c[0] + k * 0.9, c[1] + 2]], 0.2, 0.2, 0.6), shade(skin, 0.18), 0.8); });
  let lines = g.lines + Math.max(0, M.smile - 0.4) * 0.8;
  if (lines > 0.3) [1, -1].forEach(function (k) {
    let wing = g.W * 0.25 * pick(NOSES, p.nose).wing * g.age.noseS;
    let a = [100 + k * (wing + 1.5), g.noseY - 2.5], b = [100 + k * (hw + 2.4 + Math.max(0, M.smile) * 1.5), y + 1.5 + g.lines * 0.8];
    let curve = sample(function (t) { return [lerp(a[0], b[0], t) + k * Math.sin(t * PI) * 1.6, lerp(a[1], b[1], t)]; }, 8);
    out.add(band(curve, 0.2, 0.3, 0.55 + g.lines * 0.15, k > 0 ? -0.3 : 0.3), shade(skin, 0.15), clamp(lines * 0.45, 0, 0.85));
  });
}
