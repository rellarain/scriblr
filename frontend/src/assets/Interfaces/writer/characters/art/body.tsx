import type { ReactNode } from 'react'
import type { CharacterLook, CharacterMark } from '../../../../../api/types'
import { light, shade } from './colour'
import { accessoryColour, headParts } from './head'
import { drawMark } from './marks'
import { pick } from './library'
import { clamp, lerp, num, rad, smoothPath, turn, turnOf, type Turn, type V2, type V3, type View } from './space'
import { bump, foldLine, handShape, hull, limbShape, shadedShape, taper, type Profile } from './shapes'
import { BOTTOMS, BUILDS, ITEMS, OUTER, POSES, SHOES, TOPS, areaOf, type Seg } from './wardrobe'

// The whole figure, in head units (a head is 100 high). It is a skeleton of joints in 3D (the pose gives the direction of every limb segment), drawn as tapered limbs and a
// torso with the clothes over them, turned to a view; the pieces are painted far to near. The ground is y = 0 and the middle of the figure is x = 0.

export interface FigureParts {
  nodes: ReactNode[]
  // The centre of the head and where the neck meets the shoulders, and the extent of the whole figure.
  head: V2
  shoulderY: number
  bounds: { x0: number; y0: number; x1: number; y1: number }
  headHalfWidth: number
  chin: number
}

const INK = '#1c1226'

const dirOf = (side: 1 | -1, [ab, fw]: Seg): V3 => {
  const a = rad(ab), f = rad(fw)
  return [side * Math.sin(a) * Math.cos(f), Math.cos(a) * Math.cos(f), Math.sin(f)]
}
const add3 = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const mid3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

export function figureParts(look: CharacterLook, view: View, uid: string, opts: { marks?: boolean } = {}): FigureParts {
  const t = turnOf(view)
  const S = look.height
  const build = pick(BUILDS, look.build)
  const pose = pick(POSES, look.pose)
  const W = look.width
  const skin = look.skin
  const skinDark = shade(skin, 0.2)
  const outfit = look.outfit
  const top = outfit.top ? TOPS.find(x => x.id === outfit.top) ?? null : null
  const bottom = outfit.bottom ? BOTTOMS.find(x => x.id === outfit.bottom) ?? null : null
  const shoes = outfit.shoes ? SHOES.find(x => x.id === outfit.shoes) ?? null : null
  const outer = outfit.outer ? OUTER.find(x => x.id === outfit.outer) ?? null : null
  const topC = outfit.colors.top ?? '#4a6fa5'
  const botC = outfit.colors.bottom ?? '#3b3f4a'
  const shoeC = outfit.colors.shoes ?? '#4a3a30'
  const outC = outfit.colors.outer ?? '#6b5b4a'
  const acc = new Set(outfit.accessories)

  // ---- the skeleton ----
  const torsoLen = 218 * S, neckLen = 27 * S
  const upperLen = 130 * S, foreLen = 112 * S, handLen = 42 * S
  const thighLen = 200 * S, shinLen = 190 * S
  const shoulderHalf = 66 * build.shoulder * look.shoulders * Math.pow(W, 0.6)
  const hipHalf = 34 * Math.pow(W, 0.8)
  const lk = build.limb * Math.pow(W, 0.55)
  const lean = rad(pose.lean)
  const up: V3 = [(pose.sway ?? 0) / torsoLen, -Math.cos(lean), Math.sin(lean)]
  const shT = rad(pose.shoulderTilt ?? 0), hpT = rad(pose.hipTilt ?? 0)
  const P: V3 = [0, 0, 0]
  const N = add3(P, up, torsoLen)
  const sides = [1, -1] as const
  const arms = [pose.armL, pose.armR]
  const legs = [pose.legL, pose.legR]
  const sh: V3[] = sides.map(s => add3(N, [s * shoulderHalf * 0.9 * Math.cos(shT), 17 + s * shoulderHalf * 0.9 * Math.sin(shT), 0]))
  const el: V3[] = sides.map((s, i) => add3(sh[i], dirOf(s, arms[i][0]), upperLen))
  const wr: V3[] = sides.map((s, i) => add3(el[i], dirOf(s, arms[i][1]), foreLen))
  const hd: V3[] = sides.map((s, i) => add3(wr[i], dirOf(s, arms[i][1]), handLen))
  const hip: V3[] = sides.map(s => [s * hipHalf * Math.cos(hpT), 6 + s * hipHalf * Math.sin(hpT), 0] as V3)
  const kn: V3[] = sides.map((s, i) => add3(hip[i], dirOf(s, legs[i][0]), thighLen))
  const an: V3[] = sides.map((s, i) => add3(kn[i], dirOf(s, legs[i][1]), shinLen))
  const heel: V3[] = an.map((a, i) => add3(a, [0, 14, -14 + (i === 0 ? 0 : 0)]))
  const toe: V3[] = an.map((a, i) => add3(a, [sides[i] * 6, 14, 54]))
  const headC = add3(N, up, neckLen + 50)
  // Put the lowest point on the ground.
  const lowest = Math.max(...[...kn.map(k => k[1] + 18), ...an.map(a => a[1] + 22), ...toe.map(k => k[1] + 14), P[1] + 30])
  const shift = -lowest

  const T = (p: V3): V3 => turn(t, p)
  const items: Array<{ depth: number; node: ReactNode }> = []
  let keyN = 0
  const key = () => `f${keyN++}`
  const push = (depth: number, node: ReactNode) => items.push({ depth, node })

  // A limb from the joint `a` to `b`: its silhouette with the plane of shadow (shapes.tsx).
  const piece = (a: V3, b: V3, w: Profile, color: string, dark = shade(color, 0.2)): ReactNode => {
    const pa = T(a), pb = T(b)
    return limbShape([pa[0], pa[1]], [pb[0], pb[1]], w, color, dark, key())
  }
  let clipN = 0
  // A flat shape with a plane of shadow on the side away from the light (the clip path keeps the shadow inside the shape).
  const twoTone = (pts: V2[], k: number, color: string, dark: string, split = 0.62): ReactNode => shadedShape(pts, k, color, dark, `${uid}c${clipN++}`, key(), split)
  // A mark on a stretch of a limb or the torso: `u` is how far along, and across.
  const markOn = (m: CharacterMark, p: V3, facing: number, unit: number, depth: number) => {
    if (facing < 0.08) return
    push(depth, <g key={key()} transform={`translate(${num(p[0])} ${num(p[1])}) scale(${num(clamp(facing, 0.25, 1))} 1)`}>{drawMark(m, unit, 1, { skinDark, uid: `${uid}${m.id}` })}</g>)
  }

  // ---- the torso ----
  const neckHalf = 17 * Math.pow(W, 0.4) * build.limb
  const W07 = Math.pow(W, 0.7) * 1.16
  // Half widths down the torso (1 is the neck, 0 the hips): the slope of the shoulders into the neck, the chest, the waist and the hips.
  const levels: Array<[number, number]> = [
    [1.1, neckHalf + 6], [1.075, neckHalf + 17], [1.035, shoulderHalf * 0.66], [1.0, shoulderHalf * 0.9], [0.9, shoulderHalf * 0.84], [0.78, build.chest * W07], [0.42, build.waist * W07], [0.06, build.hip * W07], [-0.1, build.hip * W07 * 0.92],
  ]
  const widthAt = (f: number): number => {
    const table: Array<[number, number]> = [...levels, [-0.5, build.hip * W07 + 5], [-1.4, build.hip * W07 + 14]]
    if (f >= table[0][0]) return table[0][1]
    for (let i = 0; i < table.length - 1; i += 1) {
      const [f0, w0] = table[i], [f1, w1] = table[i + 1]
      if (f <= f0 && f >= f1) return lerp(w0, w1, (f0 - f) / (f0 - f1))
    }
    return table[table.length - 1][1]
  }
  const spineAt = (f: number): V3 => add3(P, up, torsoLen * f)
  // The two sides of the torso at a level, turned: the middle, and half the width it shows.
  const ring = (f: number, pad = 0): { c: V3; hw: number; L: V2; Rr: V2 } => {
    const c = T(spineAt(f))
    const half = widthAt(f) + pad
    const hw = Math.sqrt((half * t.c) ** 2 + (half * 0.62 * t.s) ** 2)
    return { c, hw, L: [c[0] - hw, c[1]], Rr: [c[0] + hw, c[1]] }
  }
  // The outline of the torso (or a garment on it, `pad` wider) from one level to another; `flare` widens it towards the hem, `sag` lets the hem hang lower in the middle.
  const torsoOutline = (fromF: number, toF: number, pad: number, steps = 6, flare = 0, sag = 0): V2[] => {
    const fs: number[] = []
    for (let i = 0; i <= steps; i += 1) fs.push(lerp(fromF, toF, i / steps))
    const rs = fs.map((f, i) => ring(f, pad + flare * Math.pow(i / steps, 2)))
    const last = rs[rs.length - 1]
    return [...rs.map(r => r.Rr), ...(sag ? [[last.c[0], last.c[1] + sag] as V2] : []), ...rs.slice().reverse().map(r => r.L)]
  }
  const torsoShape = (fromF: number, toF: number, pad: number, color: string, dark: string, k = 0.8): ReactNode => twoTone(torsoOutline(fromF, toF, pad), k, color, dark)
  const torsoDepth = 0
  const neckBase = T(spineAt(1.0))
  const headP = T(headC)
  const neckTop = T(add3(N, up, neckLen + 34))
  const head = headParts(look, t, `${uid}h`, opts)
  // The neck, with the shadow the jaw throws on it, and the torso skin.
  push(torsoDepth - 0.002, <g key={key()}>{piece(N, add3(N, up, neckLen + 34), taper(neckHalf * 1.18, neckHalf * 0.92), skin)}</g>)
  {
    const jawY = headP[1] + head.chin
    const nh = neckHalf * 0.95
    push(torsoDepth - 0.001, <path key={key()} d={`M${num(headP[0] - nh)} ${num(jawY - 8)}L${num(headP[0] + nh)} ${num(jawY - 8)}L${num(headP[0] + nh)} ${num(jawY + 6)}Q${num(headP[0])} ${num(jawY + 22)} ${num(headP[0] - nh)} ${num(jawY + 6)}Z`} fill={shade(skin, 0.34)} />)
  }
  push(torsoDepth, torsoShape(1.1, -0.1, 0, skin, skinDark))

  // Marks on the torso, on the front or the back.
  if (opts.marks !== false) {
    for (const m of look.marks) {
      const area = areaOf(m.area)
      if (area.zone !== 'torso') continue
      const [v0, v1] = area.id === 'chest' ? [0.06, 0.4] : area.id === 'belly' ? [0.45, 0.9] : [0.06, 0.72]
      const f = 1 - lerp(v0, v1, m.y) * 0.9
      const half = widthAt(f)
      const x = (m.x - 0.5) * 2 * half * 0.82
      const side = area.id === 'back' ? -1 : 1
      const z = side * half * 0.62 * Math.sqrt(Math.max(0, 1 - (x / half) ** 2))
      const c = spineAt(f)
      const p = T([c[0] + x * (side === 1 ? 1 : -1) * (side === 1 ? 1 : 1), c[1], c[2] + z])
      const facing = p[2] / (Math.hypot(x, z) || 1)
      markOn(m, p, facing, 28, torsoDepth + 0.01)
    }
  }

  // ---- the legs ----
  const covered = (bottom?.skirt ?? 0) > 0 || (top?.skirt ?? 0) > 0 || (outer !== null && outer.hem > 1.5 && outer.shape !== 'cape' && outer.shape !== 'cloak')
  const legR0 = 25 * lk, legR1 = 17 * lk, legR2 = 11.5 * lk
  const thighW = taper(legR0, legR1, bump(0.3, 0.07)), shinW = taper(legR1, legR2, bump(0.3, 0.17, 0.2))
  // A profile made thicker by `pad` (cloth over the limb) and by `flare` towards the end of the piece, and the part of one up to a fraction of the way along.
  const padded = (p: Profile, pad: number, flare = 0): Profile => u => p(u) + pad + flare * u * u
  const upTo = (p: Profile, f: number): Profile => u => p(u * f)
  // The silhouette of a foot, seen from any side: the hull of the ankle, the heel, the ball and the toes, `grow` wider all round.
  const footSilhouette = (i: number, grow: number): V2[] => {
    const s = sides[i]
    const a = an[i]
    const spots: V3[] = [
      add3(a, [-9 - grow, -2, 0]), add3(a, [9 + grow, -2, 0]), add3(a, [-8 - grow, 14 + grow * 0.5, -16 - grow]), add3(a, [8 + grow, 14 + grow * 0.5, -16 - grow]),
      add3(a, [s * 6 - 12.5 - grow, 14 + grow * 0.5, 38]), add3(a, [s * 6 + 12.5 + grow, 14 + grow * 0.5, 38]), add3(a, [s * 6 - 7, 14 + grow * 0.5, 62 + grow]), add3(a, [s * 6 + 7, 14 + grow * 0.5, 62 + grow]),
    ]
    return hull(spots.map(p => { const q = T(p); return [q[0], q[1]] as V2 }))
  }
  sides.forEach((s, i) => {
    // A leg is behind a skirt or a long coat that hangs over it (the order of the two legs is kept).
    const legZ = (T(kn[i])[2] + T(an[i])[2]) / 2
    const depth = covered ? -0.04 + Math.tanh(legZ / 80) * 0.03 + 0.01 : legZ - 0.05
    const nodes: ReactNode[] = []
    nodes.push(piece(hip[i], kn[i], thighW, skin))
    nodes.push(piece(kn[i], an[i], shinW, skin))
    // The foot, bare or in a shoe (a darker sole under it).
    const shod = shoes && !shoes.open
    if (shod) {
      const foot = footSilhouette(i, 3)
      nodes.push(<path key={key()} d={smoothPath(foot.map(([x, y]): V2 => [x, y + 3.5]), true, 0.8)} fill={shade(shoeC, 0.5)} />)
      nodes.push(twoTone(foot, 0.8, shoeC, shade(shoeC, 0.3), 0.55))
    } else {
      nodes.push(twoTone(footSilhouette(i, 0), 0.8, skin, skinDark, 0.55))
    }
    if (opts.marks !== false) {
      for (const m of look.marks) {
        const aid = areaOf(m.area).id
        const seg = aid === `thigh${i === 0 ? 'L' : 'R'}` ? [hip[i], kn[i], legR0, legR1] as const : aid === `shin${i === 0 ? 'L' : 'R'}` ? [kn[i], an[i], legR1, legR2] as const : null
        if (!seg) continue
        const p = T(mid3(seg[0], seg[1], 0.2 + 0.6 * m.y))
        const half = lerp(seg[2], seg[3], m.y)
        const px = p[0] + (m.x - 0.5) * half * 1.4
        nodes.push(<g key={key()} transform={`translate(${num(px)} ${num(p[1])})`}>{drawMark(m, Math.min(24, half * 1.5), 1, { skinDark, uid: `${uid}${m.id}` })}</g>)
      }
    }
    // Trousers, shorts, leggings, breeches: over the leg from the hip down.
    if (bottom && bottom.leg > 0) {
      const total = thighLen + shinLen
      const cover = bottom.leg * total
      const pad = bottom.tight ? 1.4 : 5
      const flare = bottom.tight ? 0 : 7
      const thighF = Math.min(cover, thighLen) / thighLen
      nodes.push(piece(hip[i], mid3(hip[i], kn[i], thighF), upTo(padded(thighW, pad), thighF), botC))
      if (cover > thighLen) {
        const f = (cover - thighLen) / shinLen
        nodes.push(piece(kn[i], mid3(kn[i], an[i], f), upTo(padded(shinW, pad, flare), f), botC))
        if (!bottom.tight) {
          const k = T(kn[i])
          nodes.push(foldLine([k[0] - 10, k[1] - 6], [k[0] + 4, k[1] - 3], 3, shade(botC, 0.34), 1.5, key()))
          nodes.push(foldLine([k[0] - 8, k[1] + 5], [k[0] + 5, k[1] + 7], -3, shade(botC, 0.34), 1.3, key()))
        }
      }
    }
    // Boots and the shaft of a shoe.
    if (shoes && shoes.shaft > 0) {
      const from = 1 - shoes.shaft
      nodes.push(piece(mid3(kn[i], an[i], from), an[i], u => shinW(lerp(from, 1, u)) + 3.5, shoeC))
    }
    if (shoes && shoes.open) {
      const a = T(an[i]), h = T(heel[i]), tp = T(toe[i])
      nodes.push(<path key={key()} d={`M${num(a[0] - 11)} ${num(a[1])}L${num(tp[0] - 8)} ${num(tp[1])}M${num(a[0] + 11)} ${num(a[1])}L${num(tp[0] + 8)} ${num(tp[1])}M${num(h[0])} ${num(h[1])}L${num(tp[0])} ${num(tp[1])}`} stroke={shoeC} strokeWidth={4} fill="none" strokeLinecap="round" />)
    }
    push(depth - 0.01, <g key={key()}>{nodes}</g>)
    void s
  })

  // ---- the arms ----
  const armR0 = 15 * lk, armR1 = 13 * lk, armR2 = 9.8 * lk
  const upperW = taper(armR0, armR1, bump(0.22, 0.09)), foreW = taper(armR1, armR2, bump(0.2, 0.1))
  sides.forEach((s, i) => {
    const depth = (T(el[i])[2] + T(wr[i])[2]) / 2 + 0.05
    const nodes: ReactNode[] = []
    // The hand: a palm and fingers, with the thumb on the side towards the body (and a little to the front).
    const handOf = (color: string, dark: string, r: number): ReactNode => {
      const w2 = T(wr[i]), h2 = T(hd[i])
      const du = [h2[0] - w2[0], h2[1] - w2[1]]
      const len = Math.hypot(du[0], du[1]) || 1
      const vx = -du[1] / len, vy = du[0] / len
      const inward = turn(t, [-s, 0, 0.35])
      const dot = inward[0] * vx + inward[1] * vy
      const thumb = Math.abs(dot) < 0.12 ? -s : Math.sign(dot)
      return handShape([w2[0], w2[1]], [h2[0], h2[1]], r, thumb, color, dark, key())
    }
    nodes.push(piece(sh[i], el[i], upperW, skin))
    nodes.push(piece(el[i], wr[i], foreW, skin))
    if (opts.marks !== false) {
      for (const m of look.marks) {
        const aid = areaOf(m.area).id
        const seg = aid === `upperArm${i === 0 ? 'L' : 'R'}` ? [sh[i], el[i], armR0, armR1] as const : aid === `foreArm${i === 0 ? 'L' : 'R'}` ? [el[i], wr[i], armR1, armR2] as const : null
        if (!seg) continue
        const p = T(mid3(seg[0], seg[1], 0.2 + 0.6 * m.y))
        const half = lerp(seg[2], seg[3], m.y)
        const px = p[0] + (m.x - 0.5) * half * 1.4
        nodes.push(<g key={key()} transform={`translate(${num(px)} ${num(p[1])})`}>{drawMark(m, Math.min(20, half * 1.5), 1, { skinDark, uid: `${uid}${m.id}` })}</g>)
      }
    }
    const gloves = acc.has('gloves')
    const gc = gloves ? accessoryColour(look, 'gloves') : skin
    nodes.push(handOf(gc, gloves ? shade(gc, 0.22) : skinDark, armR2 + (gloves ? 1.5 : 0)))
    // A sleeve: cloth round the arm from the shoulder, `cover` of the way to the wrist, loose at the cuff.
    const sleeveOn = (cover: number, color: string, pad: number, cuff: number) => {
      if (cover <= 0) return
      const L = cover * (upperLen + foreLen)
      const f1 = Math.min(L, upperLen) / upperLen
      nodes.push(piece(sh[i], mid3(sh[i], el[i], f1), upTo(padded(upperW, pad, L <= upperLen ? cuff : 0), f1), color))
      if (L > upperLen) {
        const f2 = Math.min(1, (L - upperLen) / foreLen)
        nodes.push(piece(el[i], mid3(el[i], wr[i], f2), upTo(padded(foreW, pad, cuff), f2), color))
        const e = T(el[i])
        nodes.push(foldLine([e[0] - 7, e[1] + 4], [e[0] + 6, e[1] + 7], 2.5, shade(color, 0.34), 1.4, key()))
      }
    }
    if (top) sleeveOn(top.sleeve, topC, 2.2, top.fit > 1.08 ? 3 : 1)
    if (outer && outer.sleeve > 0) sleeveOn(outer.sleeve, outC, 5, 3)
    if (gloves) nodes.push(piece(mid3(wr[i], el[i], 0.16), wr[i], () => armR2 + 2.8, gc))
    // Something held.
    const held = i === 0 ? look.heldLeft : look.heldRight
    const item = held ? ITEMS.find(x => x.id === held) : null
    push(depth + 0.001, <g key={key()}>{nodes}</g>)
    if (item) push(depth + 0.002, heldItem(item.id, item.len, T(hd[i]), t, outfit.colors.accessory ?? '#c9a227', key()))
    void s
  })

  // ---- clothes on the torso ----
  const TOP_F = 1.1
  // A garment on the torso from the neck down to a hem; `flare` widens it towards the hem. It has folds at the waist and under the arms, and a hem that hangs a little lower in the middle.
  const topShape = (hemF: number, color: string, pad: number, neck: string, buttons: boolean, hood: boolean, flare = 0) => {
    const outline = torsoOutline(TOP_F, hemF, pad, 8, flare, 4)
    const dark = shade(color, 0.2)
    const fold = shade(color, 0.34)
    const n = T(spineAt(1.0))
    const waist = ring(0.5, pad)
    const hemRing = ring(hemF, pad + flare)
    return (
      <g key={key()}>
        {hood && <path d={`M${num(n[0] - 26)} ${num(n[1] - 8)}Q${num(n[0])} ${num(n[1] - 30)} ${num(n[0] + 26)} ${num(n[1] - 8)}L${num(n[0] + 22)} ${num(n[1] + 14)}L${num(n[0] - 22)} ${num(n[1] + 14)}Z`} fill={dark} />}
        {twoTone(outline, 0.7, color, dark)}
        {t.c > 0.2 && neck !== 'high' && (
          <path
            d={neck === 'v' ? `M${num(n[0] - 15 * t.c)} ${num(n[1] - 24)}L${num(n[0])} ${num(n[1] + 28)}L${num(n[0] + 15 * t.c)} ${num(n[1] - 24)}Z` : neck === 'collar' ? `M${num(n[0] - 14 * t.c)} ${num(n[1] - 24)}Q${num(n[0])} ${num(n[1] + 14)} ${num(n[0] + 14 * t.c)} ${num(n[1] - 24)}Z` : `M${num(n[0] - 15 * t.c)} ${num(n[1] - 24)}Q${num(n[0])} ${num(n[1] + 20)} ${num(n[0] + 15 * t.c)} ${num(n[1] - 24)}Z`}
            fill={skin}
          />
        )}
        {neck === 'collar' && t.c > 0.2 && (
          <>
            <path d={`M${num(n[0] - 15 * t.c)} ${num(n[1] - 18)}L${num(n[0] - 3 * t.c)} ${num(n[1] + 10)}L${num(n[0] - 21 * t.c)} ${num(n[1] + 9)}Z`} fill={light(color, 0.18)} />
            <path d={`M${num(n[0] + 15 * t.c)} ${num(n[1] - 18)}L${num(n[0] + 3 * t.c)} ${num(n[1] + 10)}L${num(n[0] + 21 * t.c)} ${num(n[1] + 9)}Z`} fill={light(color, 0.1)} />
          </>
        )}
        {buttons && t.c > 0.3 && [0.12, 0.3, 0.48, 0.66, 0.84].map(f => {
          const c = T(spineAt(lerp(1.0, hemF, f)))
          return <circle key={f} cx={num(c[0])} cy={num(c[1])} r={2.2} fill={shade(color, 0.35)} />
        })}
        {foldLine([waist.L[0] + waist.hw * 0.25, waist.L[1] - 4], [waist.L[0] + waist.hw * 0.75, waist.L[1] + 3], 3, fold, 1.5, key())}
        {foldLine([waist.Rr[0] - waist.hw * 0.75, waist.Rr[1] + 3], [waist.Rr[0] - waist.hw * 0.25, waist.Rr[1] - 4], 3, fold, 1.5, key())}
        {Math.abs(hemF - 1) > 0.05 && foldLine([hemRing.L[0] + hemRing.hw * 0.4, hemRing.L[1] - 16], [hemRing.L[0] + hemRing.hw * 0.5, hemRing.L[1] + 2], 2, fold, 1.4, key())}
      </g>
    )
  }
  // A skirt from the waist to a hem `len` below the hip, flaring by `flare`: a hem that sways, with the folds of its pleats.
  const skirtShape = (len: number, color: string, flare: number): ReactNode => {
    const a = ring(0.34, 3)
    // A long skirt reaches the ground and no further.
    const hemY = Math.min(T([0, len + 6, 0])[1], lowest - 3)
    const hwTop = a.hw
    const half = hwTop + flare
    const n = 7
    const bottomPts: V2[] = []
    for (let j = 0; j <= n; j += 1) {
      const u = -1 + (2 * j) / n
      bottomPts.push([a.c[0] + u * half, hemY + Math.cos((u * Math.PI) / 2) * 7 - Math.abs(Math.sin(j * 1.9)) * 3])
    }
    const pts: V2[] = [[a.c[0] - hwTop, a.c[1]], ...bottomPts, [a.c[0] + hwTop, a.c[1]]]
    const dark = shade(color, 0.2)
    const wedges = [2, 4, 5].map(j => {
      const u = -1 + (2 * j) / n
      const hx = a.c[0] + u * half, hy = bottomPts[j][1]
      const wx = a.c[0] + u * hwTop * 0.9
      return <path key={`w${j}`} d={`M${num(wx)} ${num(a.c[1] + 6)}L${num(hx - 9)} ${num(hy)}L${num(hx + 5)} ${num(hy)}Z`} fill={shade(color, 0.14)} />
    })
    return <g key={key()}>{twoTone(pts, 0.6, color, dark, 0.66)}{wedges}</g>
  }

  // The cape or cloak behind the body.
  if (outer && (outer.shape === 'cape' || outer.shape === 'cloak')) {
    const a = ring(1.0, 6)
    const hemY = T(spineAt(1 - outer.hem))[1]
    const wide = widthAt(0.06) + 36
    const hwHem = Math.sqrt((wide * t.c) ** 2 + (wide * 0.9 * t.s) ** 2)
    push(-60 * t.c - 0.5, twoTone([[a.c[0] - a.hw, a.c[1] - 4], [a.c[0] - hwHem, hemY - 14], [a.c[0] - hwHem * 0.5, hemY + 2], [a.c[0], hemY + 8], [a.c[0] + hwHem * 0.5, hemY + 2], [a.c[0] + hwHem, hemY - 14], [a.c[0] + a.hw, a.c[1] - 4]], 0.7, outC, shade(outC, 0.25)))
  }

  // Bottom, skirt, top, outer, in that order.
  if (bottom) {
    const len = bottom.skirt
    if (len > 0) push(torsoDepth + 0.02, skirtShape(len, botC, len > 250 ? 56 : 34))
    else push(torsoDepth + 0.02, torsoShape(0.12, -0.1, 3.5, botC, shade(botC, 0.2)))
  }
  if (top) {
    if (top.skirt > 0) push(torsoDepth + 0.03, skirtShape(top.skirt, topC, top.skirt > 380 ? 64 : 40))
    push(torsoDepth + 0.04, topShape(1 - top.hem, topC, 3.2 * top.fit, top.neck, top.buttons, top.hood, top.hem > 1.3 ? 8 : 0))
  }
  if (outer && outer.shape !== 'cape' && outer.shape !== 'cloak') {
    if (outer.shape === 'armor') {
      const n = T(spineAt(0.62))
      push(torsoDepth + 0.05, (
        <g key={key()}>
          {twoTone(torsoOutline(0.98, 0.3, 2, 5), 0.8, outC, shade(outC, 0.2))}
          {t.c > 0.3 && <path d={`M${num(n[0])} ${num(n[1] - 40)}V${num(n[1] + 40)}`} stroke={light(outC, 0.25)} strokeWidth={3} />}
          {sides.map(s => {
            const p = T(sh[s === 1 ? 0 : 1])
            return <ellipse key={s} cx={num(p[0])} cy={num(p[1] - 4)} rx={num(Math.max(10, 24 * Math.abs(t.c) + 14 * Math.abs(t.s)))} ry={15} fill={outC} stroke={shade(outC, 0.35)} strokeWidth={2} />
          })}
        </g>
      ))
    } else {
      const open = outer.shape === 'jacket' || outer.shape === 'coat'
      const hemEnd = T(spineAt(1 - outer.hem))
      push(torsoDepth + 0.05, (
        <g key={key()}>
          {topShape(1 - outer.hem, outC, 5.5, 'open', false, false, outer.hem > 1.5 ? 18 : 4)}
          {open && t.c > 0.3 && <path d={`M${num(neckBase[0])} ${num(neckBase[1] + 2)}L${num(hemEnd[0])} ${num(hemEnd[1] + 4)}`} stroke={shade(outC, 0.42)} strokeWidth={2.4} />}
          {open && t.c > 0.3 && (
            <>
              <path d={`M${num(neckBase[0] - 12 * t.c)} ${num(neckBase[1] - 4)}L${num(neckBase[0])} ${num(neckBase[1] + 36)}L${num(neckBase[0] - 22 * t.c)} ${num(neckBase[1] + 16)}Z`} fill={light(outC, 0.12)} />
              <path d={`M${num(neckBase[0] + 12 * t.c)} ${num(neckBase[1] - 4)}L${num(neckBase[0])} ${num(neckBase[1] + 36)}L${num(neckBase[0] + 22 * t.c)} ${num(neckBase[1] + 16)}Z`} fill={shade(outC, 0.12)} />
            </>
          )}
        </g>
      ))
    }
  }

  // Accessories on the body.
  if (acc.has('belt')) {
    const c = accessoryColour(look, 'belt')
    const a = ring(0.34, 3.5)
    push(torsoDepth + 0.06, (
      <g key={key()}>
        <path d={`M${num(a.L[0])} ${num(a.L[1] - 5)}L${num(a.Rr[0])} ${num(a.Rr[1] - 5)}L${num(a.Rr[0])} ${num(a.Rr[1] + 5)}L${num(a.L[0])} ${num(a.L[1] + 5)}Z`} fill={c} />
        {t.c > 0.3 && <rect x={num(a.c[0] - 6)} y={num(a.c[1] - 7)} width={12} height={14} rx={2} fill={light(c, 0.4)} stroke={shade(c, 0.4)} strokeWidth={1.4} />}
      </g>
    ))
  }
  if (acc.has('scarf')) {
    const c = accessoryColour(look, 'scarf')
    const a = ring(1.0, 4)
    const tail = T(spineAt(0.62))
    push(torsoDepth + 0.07, (
      <g key={key()}>
        <path d={`M${num(a.L[0] + 4)} ${num(a.L[1] - 14)}Q${num(a.c[0])} ${num(a.c[1] + 18)} ${num(a.Rr[0] - 4)} ${num(a.Rr[1] - 14)}L${num(a.Rr[0] - 6)} ${num(a.Rr[1] + 4)}Q${num(a.c[0])} ${num(a.c[1] + 34)} ${num(a.L[0] + 6)} ${num(a.L[1] + 4)}Z`} fill={c} />
        {t.c > -0.2 && <path d={`M${num(a.c[0] + 4)} ${num(a.c[1] + 22)}L${num(tail[0] + 14)} ${num(tail[1])}L${num(tail[0] + 28)} ${num(tail[1] + 4)}L${num(a.c[0] + 20)} ${num(a.c[1] + 20)}Z`} fill={shade(c, 0.2)} />}
      </g>
    ))
  }
  if (acc.has('necklace') && t.c > 0.2) {
    const c = accessoryColour(look, 'necklace')
    const n = T(spineAt(1.0))
    push(torsoDepth + 0.065, (
      <g key={key()}>
        <path d={`M${num(n[0] - 17)} ${num(n[1] - 6)}Q${num(n[0])} ${num(n[1] + 40)} ${num(n[0] + 17)} ${num(n[1] - 6)}`} fill="none" stroke={c} strokeWidth={2.2} />
        <circle cx={num(n[0])} cy={num(n[1] + 28)} r={5} fill={c} stroke={shade(c, 0.4)} strokeWidth={1.2} />
      </g>
    ))
  }
  if (acc.has('backpack')) {
    const c = accessoryColour(look, 'backpack')
    const a = ring(0.62, 0)
    const w = widthAt(0.62) * 0.9
    const hwp = Math.sqrt((w * t.s) ** 2 + (w * 0.5 * t.c) ** 2) + 10
    push(-50 * t.c, (
      <g key={key()}>
        <rect x={num(a.c[0] - hwp - (t.s !== 0 ? t.s * 28 : 0))} y={num(a.c[1] - 60)} width={num(hwp * 2)} height={120} rx={22} fill={shade(c, 0.2)} />
        <rect x={num(a.c[0] - hwp * 0.7 - (t.s !== 0 ? t.s * 28 : 0))} y={num(a.c[1] - 8)} width={num(hwp * 1.4)} height={46} rx={10} fill={c} />
      </g>
    ))
    if (t.c > 0.2) {
      for (const s of sides) {
        const p = T(sh[s === 1 ? 0 : 1])
        const q = ring(0.1)
        push(torsoDepth + 0.055, <path key={key()} d={`M${num(p[0] - s * 14)} ${num(p[1] - 6)}L${num(q.c[0] + s * 18)} ${num(q.c[1])}`} stroke={c} strokeWidth={6} strokeLinecap="round" fill="none" />)
      }
    }
  }
  if (acc.has('satchel')) {
    const c = accessoryColour(look, 'satchel')
    const p0 = T(sh[0]), hipP = T(add3(hip[1], [0, 40, 20]))
    push(torsoDepth + 0.075, (
      <g key={key()}>
        <path d={`M${num(p0[0])} ${num(p0[1] - 4)}L${num(hipP[0])} ${num(hipP[1] - 10)}`} stroke={shade(c, 0.1)} strokeWidth={5} strokeLinecap="round" />
        <rect x={num(hipP[0] - 22)} y={num(hipP[1] - 14)} width={44} height={38} rx={6} fill={c} stroke={shade(c, 0.4)} strokeWidth={1.6} />
        <path d={`M${num(hipP[0] - 22)} ${num(hipP[1] - 4)}H${num(hipP[0] + 22)}`} stroke={shade(c, 0.4)} strokeWidth={1.6} />
      </g>
    ))
  }

  // The head, on the neck: what is behind the body first, then the head itself.
  const headNode = (nodes: ReactNode[]) => <g key={key()} transform={`translate(${num(headP[0])} ${num(headP[1])})`}>{nodes}</g>
  if (head.behind.length > 0) push(-10 * Math.abs(t.c) - 0.5 + (t.c < 0 ? 0 : 0), headNode(head.behind))
  push(1000, headNode(head.front))

  items.sort((a, b) => a.depth - b.depth)
  const xs: number[] = [], ys: number[] = []
  for (const p of [...sh, ...el, ...wr, ...hd, ...hip, ...kn, ...an, ...toe, headC]) { const q = T(p); xs.push(q[0]); ys.push(q[1]) }
  void neckTop
  const headR = 56
  return {
    nodes: [<g key="figure" transform={`translate(0 ${num(shift)})`}>{items.map(i => i.node)}</g>],
    head: [headP[0], headP[1] + shift],
    shoulderY: neckBase[1] + shift,
    bounds: { x0: Math.min(...xs) - 30, y0: headP[1] + shift - headR - 40, x1: Math.max(...xs) + 30, y1: 12 },
    headHalfWidth: head.halfWidth,
    chin: head.chin,
  }
}

// A thing held in a hand: drawn upright from the hand (a sword's blade, a staff, a torch, a book, a cup, a lantern).
function heldItem(id: string, len: number, hand: V3, t: Turn, accent: string, k: string): ReactNode {
  const [x, y] = hand
  const wood = '#7a5a3a', steel = '#c9d2dc'
  const w = Math.max(0.35, Math.abs(t.c))
  switch (id) {
    case 'sword':
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <path d={`M-4 4H4V${num(-len)}L0 ${num(-len - 14)}L-4 ${num(-len)}Z`} fill={steel} stroke="#8793a0" strokeWidth={1.2} transform={`scale(${num(w)} 1)`} />
          <rect x={-16 * w} y={-6} width={32 * w} height={8} rx={2} fill={accent} />
          <rect x={-3} y={2} width={6} height={22} fill={wood} />
        </g>
      )
    case 'staff':
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <rect x={-3.5} y={num(-len + 40)} width={7} height={len} rx={3} fill={wood} />
          <circle cx={0} cy={num(-len + 36)} r={10} fill={accent} stroke={shade(accent, 0.4)} strokeWidth={2} />
        </g>
      )
    case 'torch':
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <rect x={-3.5} y={num(-len + 30)} width={7} height={len} rx={3} fill={wood} />
          <path d={`M0 ${num(-len + 30)}C-14 ${num(-len + 12)} -8 ${num(-len - 6)} 0 ${num(-len - 16)}C8 ${num(-len - 6)} 14 ${num(-len + 12)} 0 ${num(-len + 30)}Z`} fill="#f29a3a" />
          <path d={`M0 ${num(-len + 26)}C-6 ${num(-len + 14)} -3 ${num(-len)} 0 ${num(-len - 6)}C3 ${num(-len)} 6 ${num(-len + 14)} 0 ${num(-len + 26)}Z`} fill="#ffd86b" />
        </g>
      )
    case 'book':
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <rect x={-20 * w - 2} y={-len + 6} width={40 * w + 4} height={len - 6} rx={3} fill={accent} stroke={shade(accent, 0.4)} strokeWidth={2} />
          <rect x={-16 * w} y={-len + 10} width={32 * w} height={len - 14} fill="#f2ead8" />
        </g>
      )
    case 'cup':
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <path d={`M-12 ${num(-len)}H12L9 -2H-9Z`} fill="#d6b27a" stroke="#9a7a46" strokeWidth={1.6} />
        </g>
      )
    default:
      return (
        <g key={k} transform={`translate(${num(x)} ${num(y)})`}>
          <path d={`M0 ${num(-len - 16)}V${num(-len)}`} stroke="#6c6c76" strokeWidth={2.4} />
          <rect x={-11} y={num(-len)} width={22} height={len - 6} rx={5} fill="#f6d27a" stroke="#6c6c76" strokeWidth={2.4} opacity={0.95} />
        </g>
      )
  }
}

