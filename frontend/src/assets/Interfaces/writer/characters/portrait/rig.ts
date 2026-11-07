// The measurements of one portrait: where the crown, the eyes, the brows, the nose, the mouth and the chin are, how wide the head is at each height, and where the neck and the
// shoulders are, all in the 200 x 200 tile. They come from the age (the proportions of the head and the neck), the build, the shape of the head and the sliders. The head of an
// adult is about 92 units tall with the eyes halfway down it; a child's is rounder, with the eyes lower and larger.

import { clamp, lerp, PI, type Pt } from './paths'
import { AGES, BUILDS, EYES, HEADS, pick, type Age, type Build, type Head } from './library'

export interface RigInput { age: string; build: string; headShape: string; headWidth: number; eyes: string; eyeSize: number; eyeSpacing: number; shoulderWidth?: number; neckWidth?: number }

export interface Rig {
  age: Age; build: Build; hs: Head
  H: number; top: number; chin: number; eyeY: number; W: number; child: boolean; baby: number
  browY: number; noseY: number; mouthY: number; hairY: number
  fore: number; cheek: number; jaw: number; jawY: number; chinW: number; lines: number; hairK: number
  neck: number; neckBase: number; S: number; shoulderY: number
  // The skull: its half width, its half height and the height of its centre.
  sk: { rx: number; ry: number; cy: number }
  eyeHW: number; eyeCX: number
}

// ---------- geometry ----------
export function rigOf(p: RigInput): Rig {
  let age = pick(AGES, p.age, 'adult'), build = pick(BUILDS, p.build), hs = pick(HEADS, p.headShape);
  let H = age.H * (hs.long || 1), chin = age.chin, top = chin - H, eyeY = top + H * age.eye;
  let W = H * age.wr / 2 * hs.w * clamp(p.headWidth, 0.8, 1.2) * build.face;
  let child = age.lines === 0 && age.H > 93;
  // How much a child's head is rounded: a baby's cranium is wide and its cheeks full whatever the head shape.
  let baby = ({ infant: 1, toddler: 0.8, child: 0.5 } as Record<string, number>)[age.id] || 0;
  const g = {
    age: age, build: build, hs: hs, H: H, top: top, chin: chin, eyeY: eyeY, W: W, child: child, baby: baby,
    browY: eyeY - H * age.brow, noseY: eyeY + H * age.nose, mouthY: eyeY + H * age.mouth, hairY: top + H * age.hair,
    fore: W * lerp(hs.fore, Math.max(hs.fore, 1.0), baby), cheek: W * lerp(hs.cheek, 1.03, baby), jaw: W * lerp(hs.jaw, 0.8, baby) * (build.jowl ? 1.06 : 1), jawY: top + H * lerp(hs.jawY, 0.85, baby),
    chinW: W * lerp(hs.chin, 0.38, baby), lines: age.lines,
    hairK: 1 - baby * 0.5,
  } as Rig;
  g.neck = W * build.neck * age.neckW * (child ? 1.05 : 1) * clamp(p.neckWidth ?? 1, 0.7, 1.4);
  g.neckBase = chin + age.neckLen * build.neckLen;
  g.S = build.shoulder * age.shoulder * clamp(p.shoulderWidth ?? 1, 0.7, 1.4);
  g.shoulderY = g.neckBase + 12 * Math.max(0.6, age.shoulder) + (build.trap - 0.35) * 8;
  g.sk = { rx: g.fore, ry: eyeY + H * 0.02 - top, cy: eyeY + H * 0.02 };
  // The eyes: half width and the distance of each centre from the middle.
  let es = pick(EYES, p.eyes);
  g.eyeHW = W * 0.205 * es.w * age.eyeS * clamp(p.eyeSize, 0.6, 1.4);
  g.eyeCX = W * 0.42 * clamp(p.eyeSpacing, 0.8, 1.25) * (child ? 0.97 : 1);
  return g;
}

// A point on the skull's upper outline, expanded by `e` (the angle from the right side, 0, over the crown, 90, to the left, 180).
// The crown is a superellipse (exponent APEX; 2 would be an ellipse): fuller and rounder at the top than an egg.
export const APEX = 2.7
const APEX_N = 2 / APEX

export function skull(g: Rig, deg: number, e: number, ey?: number): Pt {
  let t = deg * PI / 180, c = Math.cos(t), s = Math.sin(t);
  return [100 + (g.sk.rx + e) * Math.sign(c) * Math.pow(Math.abs(c), APEX_N), g.sk.cy - (g.sk.ry + (ey == null ? e : ey)) * Math.sign(s) * Math.pow(Math.abs(s), APEX_N)];
}

export function headOutline(g: Rig): Pt[] {
  let right = [];
  for (let a = 90; a >= 26; a -= 16) right.push(skull(g, a, 0));
  let cy = lerp(g.eyeY + g.H * 0.06, (g.noseY + g.mouthY) / 2, g.baby);
  right.push([100 + g.cheek, cy]);
  right.push([100 + lerp(g.cheek, g.jaw, 0.55) + g.W * 0.02, lerp(cy, g.jawY, 0.6)]);
  if (g.hs.sharp) { right.push([100 + g.jaw, g.jawY - 3]); right.push([100 + g.jaw - 1.2, g.jawY + 1.2]); }
  else right.push([100 + g.jaw, g.jawY]);
  right.push([100 + lerp(g.jaw, g.chinW, 0.62), lerp(g.jawY, g.chin, 0.7)]);
  right.push([100 + g.chinW, g.chin - g.H * 0.018]);
  right.push([100, g.chin]);
  return right;
}

// ---------- hair ----------
// The right half of a cap's outer edge, from where its side reaches `low` up to the crown.
export function capOuter(g: Rig, o: { vol: number; side: number }, low: number): Pt[] {
  let r = clamp((g.sk.cy - low) / (g.sk.ry + o.vol), -0.95, 0.95);
  let a0 = Math.asin(Math.sign(r) * Math.pow(Math.abs(r), APEX / 2)) * 180 / PI, out = [];
  for (let i = 0; i <= 9; i++) { let a = lerp(a0, 90, i / 9); out.push(skull(g, a, o.side + (o.vol - o.side) * Math.pow(Math.max(0, a) / 90, 1.4), o.vol)); }
  return out;
}

// Front-edge points pulled inside the face outline (a hairline outside the face would leave a gap of background at the temple).
export function hug(g: Rig, pts: Pt[]): Pt[] {
  return pts.map(function (q) { let dx = q[0] - 100, lim = faceX(g, q[1]) - 0.5; if (q[1] > g.top + 4 && Math.abs(dx) > lim) return [100 + Math.sign(dx) * lim, q[1], q[2]]; return q; });
}

// Half the width of the face at a height (from the head outline).
export function faceX(g: Rig, y: number): number {
  let pts = headOutline(g);
  if (y <= pts[0][1]) return 0;
  for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { let a = pts[i - 1], b = pts[i]; return lerp(a[0], b[0], (y - a[1]) / Math.max(0.001, b[1] - a[1])) - 100; }
  return g.chinW;
}
