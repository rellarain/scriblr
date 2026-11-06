import type { ReactNode } from 'react'
import type { CharacterLook, CharacterMark } from '../../../../../api/types'
import { light, mix, shade } from './colour'
import { BROWS, EARS, EXPRESSIONS, EYES, FACIAL_HAIR, HAIR, HEAD_SHAPES, MOUTHS, NOSES, pick } from './library'
import { clamp, lerp, num, polyPath, seeded, smoothPath, turn, type Turn, type V2, type V3 } from './space'
import { drawMark, markColor } from './marks'
import { ACCESSORIES, areaOf } from './wardrobe'

// The head, in head space: the centre of the head is (0, 0) and a head is 100 high. `headParts` returns the pieces of the head sorted into those behind the body (the
// hair behind the head, the ear that is turned away) and those in front of it (the skin first, then what is on it), each in the order it is painted. The head is a little
// ellipsoid: a point of the face has a depth, and a turn of the view moves it sideways by it (see space.ts), so the same data draws every view.

export interface HeadParts { behind: ReactNode[]; front: ReactNode[]; chin: number; halfWidth: number }

const INK = '#1c1226'

// The colour a garment or accessory of the look has: its own (`acc:<id>`), or the accessory colour of the outfit.
export function accessoryColour(look: CharacterLook, id: string): string {
  return look.outfit.colors[`acc:${id}`] ?? look.outfit.colors.accessory ?? '#c9a227'
}

export function headParts(look: CharacterLook, t: Turn, uid: string, opts: { marks?: boolean } = {}): HeadParts {
  const shape = pick(HEAD_SHAPES, look.headShape)
  const hw = look.headWidth
  const right: V2[] = shape.pts.map(([x, y]) => [x * hw, y])
  const expr = pick(EXPRESSIONS, look.expression)
  const skin = look.skin
  const skinDark = shade(skin, 0.2)

  // Half width of the head at a height, and its depth (a little less than its width).
  const R = (y: number): number => {
    if (y <= right[0][1] || y >= right[right.length - 1][1]) return 0
    for (let i = 0; i < right.length - 1; i += 1) {
      const [x0, y0] = right[i], [x1, y1] = right[i + 1]
      if (y >= y0 && y <= y1) return lerp(x0, x1, (y - y0) / (y1 - y0 || 1))
    }
    return 0
  }
  const D = (y: number) => 0.9 * R(y)
  const A0 = R(-8)
  const chinY = right[right.length - 1][1]

  type Piece = { depth: number; node: ReactNode }
  const pieces: Piece[] = []
  let keyN = 0
  const key = () => `h${keyN++}`
  const add = (depth: number, node: ReactNode) => pieces.push({ depth, node })

  // A point of the face in 3D, turned: (x, y) on the face, `side` +1 the front, -1 the back, `out` pushes it off the skin.
  const P = (x: number, y: number, side: 1 | -1 = 1, out = 0): V3 => {
    const r = R(y)
    if (r > 1 && Math.abs(x) <= r) {
      const z = side * (D(y) * Math.sqrt(1 - (x / r) ** 2) + out * 0.9)
      return turn(t, [x * (1 + out / r), y, z])
    }
    return turn(t, [x + Math.sign(x) * out, y, 0])
  }
  // A point of the hair's dome (a little ellipsoid round the skull, `spread` wider than the head, `top` taller).
  const dome = (x: number, y: number, side: 1 | -1, spread: number, top: number, zmax = Infinity): V3 => {
    const A = A0 + spread
    const B = 42 + top
    const sinPsi = clamp((-8 - y) / (y < -8 ? B : 50), -1, 1)
    const cosPsi = Math.sqrt(1 - sinPsi * sinPsi)
    const ax = A * cosPsi
    let z = 0
    if (ax > 1 && Math.abs(x) < ax) z = side * (0.9 * A0 + spread) * cosPsi * Math.sqrt(1 - (x / ax) ** 2)
    return turn(t, [x, y, Math.max(-zmax, Math.min(zmax, z))])
  }
  const scr = (p: V3): V2 => [p[0], p[1]]
  const meanDepth = (ps: V3[]) => ps.reduce((a, p) => a + p[2], 0) / Math.max(1, ps.length)
  // A piece that lies on the head, drawn from its outline in the front view: turned to the front or the three-quarter view its outline is turned point by point; seen from
  // the side the outline alone folds flat (its edges lie on the edge of the skull), so the whole of the patch is sampled and the shape it covers is the hull of those points.
  const patch = (pts2: V2[], map: (x: number, y: number) => V3): V3[] => {
    const boundary = pts2.map(([x, y]) => map(x, y))
    if (Math.abs(t.s) < 0.8) return boundary
    const xs = pts2.map(q => q[0]), ys = pts2.map(q => q[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const inside = (x: number, y: number) => {
      let c = false
      for (let i = 0, j = pts2.length - 1; i < pts2.length; j = i, i += 1) {
        const [xi, yi] = pts2[i], [xj, yj] = pts2[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    const all: V3[] = [...boundary]
    for (let y = y0; y <= y1; y += 4) for (let x = x0; x <= x1; x += 4) if (inside(x, y)) all.push(map(x, y))
    const z = meanDepth(all)
    return hull(all.map(scr)).map(([x, y]): V3 => [x, y, z])
  }

  // ---- the skull ----
  const sil = Math.sqrt(t.c * t.c + 0.81 * t.s * t.s)
  const outline: V2[] = [...right.map(([x, y]): V2 => [x * sil, y]), ...right.slice(1, -1).reverse().map(([x, y]): V2 => [-x * sil, y])]
  const headD = smoothPath(outline, true, 1)
  add(0, (
    <g key={key()}>
      <path d={headD} fill={skinDark} />
      <path d={headD} fill={skin} transform={`translate(${num(-2.4)} ${num(-1)}) scale(0.94 0.97)`} />
    </g>
  ))

  // ---- ears ----
  const ear = pick(EARS, look.ears)
  for (const s of [-1, 1] as const) {
    const y = 4
    const x = turn(t, [s * R(y) * 0.98, y, 0])
    const dirX = Math.abs(t.c) > 0.3 ? Math.sign(s * t.c) : -Math.sign(t.s) || 1
    const k = look.earSize
    const w = ear.w * k, h = ear.h * k, tip = ear.point * k, lobe = ear.lobe * k
    const d = ear.point > 0
      ? `M0 ${num(-h / 2)}L${num(w * 0.75)} ${num(-h / 2 - tip)}Q${num(w * 1.35)} ${num(-h * 0.1)} ${num(w * 0.9)} ${num(h * 0.25)}C${num(w * 0.7)} ${num(h * 0.5)} ${num(w * 0.5)} ${num(h / 2 + lobe)} 0 ${num(h / 2)}Z`
      : `M0 ${num(-h / 2)}C${num(w * 0.9)} ${num(-h / 2)} ${num(w * 1.35)} ${num(-h * 0.1)} ${num(w * 0.9)} ${num(h * 0.25)}C${num(w * 0.7)} ${num(h * 0.5)} ${num(w * 0.5)} ${num(h / 2 + lobe)} 0 ${num(h / 2)}Z`
    const squeeze = 0.55 + 0.45 * Math.abs(t.s)
    add(x[2] < -0.5 ? x[2] - 1 : x[2] > 0.5 ? x[2] + 0.5 : -0.5, (
      <g key={key()} transform={`translate(${num(x[0])} ${num(y)}) scale(${num(dirX * squeeze)} 1)`}>
        <path d={d} fill={skinDark} />
        <path d={d} fill={skin} transform="translate(-0.5 0) scale(0.82)" />
        <path d={`M${num(w * 0.28)} ${num(-h * 0.25)}Q${num(w * 0.7)} ${num(-h * 0.05)} ${num(w * 0.4)} ${num(h * 0.3)}`} fill="none" stroke={skinDark} strokeWidth={1.4} strokeLinecap="round" />
      </g>
    ))
  }

  // ---- what is on the face ----
  // A feature faces the viewer by how much its normal points at it; one turned away is not drawn.
  const faceOf = (x: number, y: number) => {
    const p = P(x, y)
    const r = Math.hypot(x, Math.sqrt(Math.max(0, D(y) ** 2 * (1 - (x / (R(y) || 1)) ** 2)))) || 1
    return { p, facing: p[2] / r }
  }
  const onFace = (x: number, y: number, draw: () => ReactNode, minFacing = 0.04, depthBias = 0.2) => {
    const { p, facing } = faceOf(x, y)
    if (facing < minFacing) return
    add(Math.max(0.05, p[2] * 0.01) + depthBias, (
      <g key={key()} transform={`translate(${num(p[0])} ${num(p[1])}) scale(${num(clamp(facing, 0.2, 1))} 1)`}>{draw()}</g>
    ))
  }

  // Marks on the face (under the features).
  if (opts.marks !== false) {
    for (const m of look.marks) {
      const area = areaOf(m.area)
      if (area.zone !== 'head' || !area.rect) continue
      const [x0, y0, x1, y1] = area.rect
      const cx = lerp(x0, x1, m.x), cy = lerp(y0, y1, m.y)
      const mirrored = isMirrored(m)
      const spots = mirrored && Math.abs(m.x - 0.5) > 0.03 ? [cx, lerp(x0, x1, 1 - m.x)] : [cx]
      for (const sx of spots) {
        onFace(sx, cy, () => drawMark(m, 14, sx < 0 && mirrored && spots.length === 2 ? -1 : 1, { skinDark, uid: `${uid}${m.id}`, at: [sx, cy] }), 0.05, 0.05)
      }
    }
  }

  // Eyes.
  const eye = pick(EYES, look.eyes)
  const lineInk = mix(skin, INK, 0.82)
  for (const s of [-1, 1] as const) {
    const ex = s * 17 * look.eyeSpacing
    onFace(ex, -6, () => {
      const k = look.eyeSize
      const rx = eye.rx * k
      const open = expr.eye
      const top = eye.top * k * open
      const bot = eye.bottom * k * Math.min(1, open + 0.2)
      const lift = eye.lift * k + look.eyeTilt * 0.25
      const inner: V2 = [-s * rx, 0], outer: V2 = [s * rx, -lift]
      const midY = -lift / 2
      const white = `M${num(inner[0])} ${num(inner[1])}Q0 ${num(midY - 2 * top)} ${num(outer[0])} ${num(outer[1])}Q0 ${num(midY + 2 * bot)} ${num(inner[0])} ${num(inner[1])}Z`
      const lid = `M${num(inner[0])} ${num(inner[1])}Q0 ${num(midY - 2 * top)} ${num(outer[0])} ${num(outer[1])}`
      const ir = Math.min(eye.iris * k, (top + bot) * 0.95 + 0.5)
      const id = `${uid}e${s}`
      return (
        <g>
          <clipPath id={id}><path d={white} /></clipPath>
          <path d={white} fill="#f6f2ee" />
          <g clipPath={`url(#${id})`}>
            <circle cx={0} cy={midY * 0.5} r={num(ir)} fill={look.eyeColor} />
            <circle cx={0} cy={midY * 0.5} r={num(ir * 0.5)} fill={INK} />
            <circle cx={num(-ir * 0.35)} cy={num(midY * 0.5 - ir * 0.35)} r={num(Math.max(0.7, ir * 0.22))} fill="#ffffff" />
            <path d={white} fill="none" stroke={skinDark} strokeWidth={2.4} opacity={0.35} />
          </g>
          <path d={lid} fill="none" stroke={lineInk} strokeWidth={eye.lash * (open < 0.5 ? 1.5 : 1)} strokeLinecap="round" />
          <path d={`M${num(inner[0] * 0.9)} ${num(1.2)}Q0 ${num(midY + 2 * bot + 1)} ${num(outer[0] * 0.9)} ${num(outer[1] + 1.2)}`} fill="none" stroke={skinDark} strokeWidth={0.8} opacity={0.6} strokeLinecap="round" />
        </g>
      )
    })
  }

  // Brows.
  const brow = pick(BROWS, look.brows)
  if (brow.thick > 0) {
    for (const s of [-1, 1] as const) {
      const bx = s * 17 * look.eyeSpacing
      const by = -19 - expr.lift * 0.8
      onFace(bx, by, () => {
        const len = brow.len
        const tiltIn = expr.tilt * 0.3
        const outerUp = (brow.angle + look.browTilt) * 0.35 - expr.tilt * 0.08
        const inner: V2 = [-s * len * 0.9, tiltIn], outer: V2 = [s * len * 0.9, -outerUp]
        const mid: V2 = [0, (inner[1] + outer[1]) / 2 - brow.arch]
        return <path d={`M${num(inner[0])} ${num(inner[1])}Q${num(mid[0])} ${num(mid[1] * 2 - (inner[1] + outer[1]) / 2)} ${num(outer[0])} ${num(outer[1])}`} fill="none" stroke={look.browColor} strokeWidth={brow.thick * look.browThickness} strokeLinecap="round" />
      }, 0.04, 0.3)
    }
  }

  // The nose: a solid shape that stands out of the face (so it makes a profile), with its shading on it.
  {
    const nose = pick(NOSES, look.nose)
    const ns = look.noseSize, nw = look.noseWidth
    const tipY = -6 + nose.len * ns + nose.hook * 0.5
    const z0 = D(-10) + 2
    const zTip = D(tipY) + nose.z * ns
    const w = nose.w * nw
    const b = nose.bridge * nw
    const pts3: V3[] = [
      [0, -12, z0], [b, -2, D(-2) + nose.z * ns * 0.3], [w, tipY - 1, D(tipY) + nose.z * ns * 0.38], [w * 0.5, tipY + 2.5, D(tipY) + nose.z * ns * 0.7],
      [0, tipY + 3.5, zTip - nose.hook * 0.4], [-w * 0.5, tipY + 2.5, D(tipY) + nose.z * ns * 0.7], [-w, tipY - 1, D(tipY) + nose.z * ns * 0.38], [-b, -2, D(-2) + nose.z * ns * 0.3],
    ].map(p => turn(t, p as V3))
    const tip = turn(t, [0, tipY, zTip])
    if (tip[2] > 0) {
      const sideLook = Math.abs(t.s)
      const d = smoothPath(pts3.map(scr), true, 0.9)
      const nl = turn(t, [-w * 0.55, tipY + 1, D(tipY) + nose.z * ns * 0.5])
      const nr = turn(t, [w * 0.55, tipY + 1, D(tipY) + nose.z * ns * 0.5])
      add(tip[2] * 0.01 + 0.4, (
        <g key={key()}>
          <path d={d} fill={skin} stroke={sideLook > 0.3 ? skinDark : 'none'} strokeWidth={0.9} strokeLinejoin="round" />
          <path d={`M${num(pts3[0][0])} ${num(pts3[0][1])}Q${num(lerp(pts3[0][0], pts3[7][0], 0.8))} ${num(lerp(pts3[0][1], pts3[7][1], 0.5))} ${num(pts3[6][0])} ${num(pts3[6][1])}`} fill="none" stroke={skinDark} strokeWidth={1.2} opacity={0.5} strokeLinecap="round" />
          {nl[2] > 0 && <ellipse cx={num(nl[0])} cy={num(nl[1] + 1.4)} rx={num(Math.max(0.6, 2.2 * Math.abs(t.c)))} ry={1.3} fill={mix(skin, INK, 0.55)} opacity={0.75} />}
          {nr[2] > 0 && <ellipse cx={num(nr[0])} cy={num(nr[1] + 1.4)} rx={num(Math.max(0.6, 2.2 * Math.abs(t.c)))} ry={1.3} fill={mix(skin, INK, 0.55)} opacity={0.75} />}
          <ellipse cx={num(tip[0])} cy={num(tip[1] - 1.5)} rx={num(Math.max(0.8, 2 * Math.abs(t.c) + 0.8))} ry={1.4} fill={light(skin, 0.3)} opacity={0.6} />
        </g>
      ))
    }
  }

  // The mouth.
  {
    const mouth = pick(MOUTHS, look.mouth)
    const cy = 0 // the mouth is drawn about its own centre, which onFace puts at (0, 30)
    const lipstick = look.marks.find(m => m.kind === 'makeup' && m.design === 'lipstick')
    const lipColor = lipstick ? markColor(lipstick) : look.lipColor
    onFace(0, cy, () => {
      const w = mouth.w * look.mouthSize
      const up = mouth.upper * look.mouthSize, low = mouth.lower * look.mouthSize
      const openH = expr.open * 9 * look.mouthSize
      const bend = (x: number, y: number): V2 => {
        const f = Math.abs(x) / (w || 1)
        return [x, y - expr.curve * 4.2 * f * f - (x > 0 ? expr.skew * 2.4 * f : 0)]
      }
      const L = bend(-w, cy), Rr = bend(w, cy)
      const upper = [L, bend(-w * 0.5, cy - up * 1.2), bend(-w * 0.17, cy - up * 1.45), bend(0, cy - up * 1.1 + mouth.cupid * 0.5), bend(w * 0.17, cy - up * 1.45), bend(w * 0.5, cy - up * 1.2), Rr, bend(w * 0.45, cy + 0.3), bend(0, cy + 0.5), bend(-w * 0.45, cy + 0.3)]
      const lower = [bend(-w * 0.85, cy + openH + 0.4), bend(-w * 0.45, cy + openH + low * 1.0), bend(0, cy + openH + low * 1.15), bend(w * 0.45, cy + openH + low * 1.0), bend(w * 0.85, cy + openH + 0.4), bend(w * 0.4, cy + openH + 0.2), bend(0, cy + openH + 0.1), bend(-w * 0.4, cy + openH + 0.2)]
      const mouthLine = `M${num(L[0])} ${num(L[1])}Q0 ${num(cy + 0.9)} ${num(Rr[0])} ${num(Rr[1])}`
      return (
        <g>
          {openH > 0.6 && (
            <>
              <path d={`M${num(L[0] * 0.9)} ${num(L[1] + 0.5)}Q0 ${num(cy - 0.6)} ${num(Rr[0] * 0.9)} ${num(Rr[1] + 0.5)}Q0 ${num(cy + openH * 2 + 1)} ${num(L[0] * 0.9)} ${num(L[1] + 0.5)}Z`} fill="#3a1a22" />
              <path d={`M${num(-w * 0.7)} ${num(cy + 0.6)}Q0 ${num(cy + 0.2)} ${num(w * 0.7)} ${num(cy + 0.6)}L${num(w * 0.62)} ${num(cy + Math.min(openH, 4))}Q0 ${num(cy + Math.min(openH, 4) + 0.6)} ${num(-w * 0.62)} ${num(cy + Math.min(openH, 4))}Z`} fill="#f6f2ee" />
            </>
          )}
          {openH <= 0.6 && <path d={mouthLine} fill="none" stroke={mix(lipColor, INK, 0.45)} strokeWidth={1} strokeLinecap="round" />}
          <path d={smoothPath(upper, true, 0.9)} fill={shade(lipColor, 0.14)} />
          <path d={smoothPath(lower, true, 0.9)} fill={lipColor} />
          <ellipse cx={0} cy={num(cy + openH + low * 0.55)} rx={num(w * 0.22)} ry={0.7} fill={light(lipColor, 0.35)} opacity={0.7} />
        </g>
      )
    }, 0.0, 0.3)
  }

  // Facial hair.
  const fh = pick(FACIAL_HAIR, look.facialHair)
  if (fh.id !== 'none') {
    const fc = look.facialHairColor
    const fOpacity = fh.stubble ? 0.3 : 1
    const flat = (pts: V2[], k = 1, fill = fc, opacity = fOpacity) => {
      const p3 = patch(pts, (x, y) => P(x, y, 1, 0.8))
      if (p3.every(p => p[2] < -2)) return
      add(Math.max(0.05, meanDepth(p3) * 0.01) + 0.15, <path key={key()} d={smoothPath(p3.map(scr), true, k)} fill={fill} opacity={opacity} />)
    }
    if (fh.beard > 0) {
      const reach = fh.reach
      const r10 = R(10), r22 = R(22), r34 = R(34), r44 = R(44)
      flat([
        [-r10 * 0.97, 4], [-r22 * 0.99, 20], [-r34 * 0.98, 34], [-r44 * 0.9, 45 + reach * 0.4], [-r44 * 0.4, 50 + reach * 0.9], [0, chinY + reach], [r44 * 0.4, 50 + reach * 0.9], [r44 * 0.9, 45 + reach * 0.4], [r34 * 0.98, 34], [r22 * 0.99, 20], [r10 * 0.97, 4],
        [r22 * 0.7, 18], [18, 26], [13, 28.5], [8, 34.5], [0, 35.5], [-8, 34.5], [-13, 28.5], [-18, 26], [-r22 * 0.7, 18],
      ], 0.8)
    }
    if (fh.chops > 0) {
      for (const s of [-1, 1]) flat([[s * (R(-6) - 1), -8], [s * (R(8) - 1), 6], [s * (R(24) - 3), 26], [s * (R(24) - 9), 24], [s * (R(8) - 8), 6], [s * (R(-6) - 7), -6]], 0.6)
    }
    if (fh.stache > 0) {
      const sw = (fh.stache === 1 ? 12 : 15) + (look.mouthSize - 1) * 4
      const th = 2.2 + fh.stache * 1.6
      const curl = fh.curl * -7
      flat([[-sw, 24.5 + curl * 0.3], [-sw * 0.6, 22 - th * 0.2], [-sw * 0.2, 21.5], [0, 22.5], [sw * 0.2, 21.5], [sw * 0.6, 22 - th * 0.2], [sw, 24.5 + curl * 0.3], [sw * 0.6, 26 + th * 0.6], [sw * 0.15, 24.5 + th * 0.3], [0, 25], [-sw * 0.15, 24.5 + th * 0.3], [-sw * 0.6, 26 + th * 0.6]], 0.9)
      if (fh.curl) for (const s of [-1, 1]) flat([[s * sw, 24.5], [s * (sw + 4), 22 + curl * 0.6], [s * (sw + 5), 19 + curl], [s * (sw + 2), 21 + curl * 0.6], [s * (sw - 2), 23]], 0.9)
    }
    if (fh.patch > 0) flat([[-4.5, 37.5], [0, 35.5], [4.5, 37.5], [3, 42], [0, 43], [-3, 42]], 1)
  }

  // ---- hair ----
  const style = pick(HAIR, look.hair)
  if (!style.bald) hairPieces()

  function hairPieces() {
    const len = look.hairLength
    const hc = look.hairColor
    const dark = shade(hc, 0.22)
    const high = light(hc, 0.2)
    const tex = style.texture
    const spread = style.side
    const top = style.top
    const drop = (a: [number, number] | null): number | null => (a ? lerp(a[0], a[1], len) : null)
    const clip = (n: number) => `${uid}k${n}`
    let clipN = 0
    const streaks = look.streakColor ? Math.round(look.streakAmount * 7) : 0

    // A piece of hair: filled, with the edge of a curly texture, the strands of a streak and a light edge.
    const piece = (pts2: V2[], side: 1 | -1, fill: string, k: number, o: { depth?: number; spiky?: boolean; lightEdge?: boolean; zmax?: number } = {}) => {
      const pts3 = patch(pts2, (x, y) => dome(x, y, side, spread, top, o.zmax))
      const pts = pts3.map(scr)
      const d = o.spiky ? polyPath(pts) : smoothPath(pts, true, k)
      const depth = o.depth ?? meanDepth(pts3)
      const id = clip(clipN++)
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      const rnd = seeded(`${uid}${id}`)
      const circles: ReactNode[] = []
      if (tex === 'curly' || tex === 'coily') {
        const r = tex === 'coily' ? 8.5 : 6
        const step = r * 1.5
        for (let i = 0; i < pts.length; i += 1) {
          const a = pts[i], b = pts[(i + 1) % pts.length]
          const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
          for (let j = 0; j < n; j += 1) circles.push(<circle key={`c${i}-${j}`} cx={num(lerp(a[0], b[0], j / n))} cy={num(lerp(a[1], b[1], j / n))} r={num(r * (0.8 + rnd() * 0.4))} fill={fill} />)
        }
      }
      const strands: ReactNode[] = []
      for (let i = 0; i < streaks; i += 1) {
        const sx = lerp(x0, x1, 0.12 + rnd() * 0.76)
        const sw = 1.6 + rnd() * 2.4
        strands.push(<path key={`s${i}`} d={`M${num(sx)} ${num(y0 - 2)}Q${num(sx + (rnd() - 0.5) * 14)} ${num(lerp(y0, y1, 0.5))} ${num(sx + (rnd() - 0.5) * 10)} ${num(y1 + 2)}`} fill="none" stroke={look.streakColor ?? hc} strokeWidth={num(sw)} strokeLinecap="round" opacity={0.95} />)
      }
      add(depth, (
        <g key={key()}>
          <path d={d} fill={fill} />
          {circles}
          {(streaks > 0 || o.lightEdge) && (
            <>
              <clipPath id={id}><path d={d} /></clipPath>
              <g clipPath={`url(#${id})`}>
                {strands}
                {o.lightEdge && <path d={d} fill="none" stroke={high} strokeWidth={4} opacity={0.35} transform={`translate(${num(-1.5)} ${num(-1.5)})`} />}
              </g>
            </>
          )}
        </g>
      ))
    }

    const Rt = A0 + spread * 0.6 + 1
    const topArc = (spiky = false): V2[] => {
      const out: V2[] = []
      const n = spiky ? 10 : 8
      for (let i = 0; i <= n; i += 1) {
        const a = Math.PI - (i * Math.PI) / n
        const bump = spiky && i % 2 === 1 && i > 0 && i < n ? 5 : 0
        out.push([Math.cos(a) * Rt, -8 - Math.sin(a) * (42 + top) - bump])
      }
      return out
    }
    const shaved = style.shaved

    // The hair behind and over the back of the head.
    {
      const bd = drop(style.backDrop)
      const nape = shaved ? -14 : bd ?? 8
      const rim = A0 + spread
      const lowPts: V2[] = bd !== null && !shaved
        ? [[R(-4) + spread, -4], [Math.max(R(20) * 0.95 + spread, 18) + (bd > 40 ? 4 : 0), nape - 6], [0, nape + 4], [-(Math.max(R(20) * 0.95 + spread, 18) + (bd > 40 ? 4 : 0)), nape - 6], [-(R(-4) + spread), -4]]
        : [[rim, -18], [rim * 0.8, nape], [0, nape + 2], [-rim * 0.8, nape], [-rim, -18]]
      const back = [...topArc(style.fringe === 'spiky'), ...lowPts]
      const widen = bd !== null && bd > 40 ? 6 : 0
      if (shaved === 'mohawk') {
        piece(mohawkRidge(), -1, dark, 0.5, { spiky: true })
      } else {
        piece(wavyBottom(back, tex, widen), -1, dark, tex === 'straight' ? 0.9 : 0.8)
      }
    }
    // A tail, a bun or pigtails.
    tails()

    // The front of the cap, down to the hairline.
    if (shaved === 'mohawk') {
      piece(mohawkRidge(), 1, hc, 0.5, { spiky: true, lightEdge: true, depth: 0.55 })
    } else {
      const front = [...topArc(style.fringe === 'spiky'), ...hairline(style.fringe, style.hairline, spread, top)]
      piece(front, 1, hc, style.fringe === 'spiky' || style.fringe === 'messy' ? 0.5 : 0.9, { spiky: style.fringe === 'spiky', lightEdge: true, depth: 0.55 })
    }

    // The locks at the sides, down to the ears or past them.
    const sd = drop(style.sideDrop)
    if (sd !== null && !shaved) {
      const lowY = sd <= 10 ? sd + 14 : sd
      for (const s of [-1, 1]) {
        const longHair = lowY > 55
        const wob = tex === 'wavy' ? 3 : tex === 'curly' || tex === 'coily' ? 5 : 0
        // A short lock is a sideburn along the edge of the face; a long one falls past the jaw, in front of the shoulder.
        const edge = (y: number) => R(Math.min(y, 30)) + spread + 1
        const width = longHair ? 17 : 4.5
        const outerB = s * (longHair ? Math.max(edge(30), 24) + 2 : edge(Math.min(lowY, 30)))
        const innerB = outerB - s * width
        const lock: V2[] = longHair
          ? [[s * (R(-6) + spread), -10], [s * edge(14), 14], [s * edge(34), 40], [outerB, lowY + wob], [lerp(outerB, innerB, 0.5), lowY - wob + 3], [innerB, lowY + wob * 0.5], [s * (R(30) - 4), 40], [s * (R(-6) - 6), -2]]
          : [[s * (R(-6) + spread), -6], [s * edge(8), 4], [outerB, lowY], [innerB, lowY - 1], [s * (R(-6) - 3), -2]]
        piece(lock, 1, hc, 0.9, { depth: 0.52 + (s * -t.s) * 0.01, zmax: longHair ? 9 : 6 })
      }
    }
    accessoriesOnHead()
  }

  // The outline of the lower edge of the front of the cap (right temple to left temple), in head space.
  function hairline(fringe: string, y: number, spread: number, top: number): V2[] {
    const r = R(-8) + spread
    const rt = R(-6) + spread
    void top
    switch (fringe) {
      case 'bangs': return [[rt, -12], [r * 0.55, y + 3], [0, y + 6], [-r * 0.55, y + 3], [-rt, -12]]
      case 'side': return [[rt, -10], [r * 0.42, y + 5], [-r * 0.1, y - 5], [-r * 0.6, y - 1], [-rt, -14]]
      case 'swoop': return [[rt, -12], [r * 0.35, y + 12], [-r * 0.15, y - 6], [-r * 0.65, y + 4], [-rt, -8]]
      case 'curtain': return [[rt, -2], [r * 0.6, y + 14], [r * 0.14, y - 6], [0, y - 12], [-r * 0.14, y - 6], [-r * 0.6, y + 14], [-rt, -2]]
      case 'quiff': return [[rt, -14], [r * 0.5, y - 2], [0, y - 8], [-r * 0.5, y - 2], [-rt, -14]]
      case 'messy': return [[rt, -8], [r * 0.7, y + 8], [r * 0.38, y - 2], [r * 0.1, y + 9], [-r * 0.2, y - 3], [-r * 0.5, y + 8], [-rt, -8]]
      case 'spiky': return [[rt, -16], [r * 0.5, y], [0, y - 6], [-r * 0.5, y], [-rt, -16]]
      default: return [[rt, -14], [r * 0.7, y + 2], [0, y - 2], [-r * 0.7, y + 2], [-rt, -14]]
    }
  }
  function mohawkRidge(): V2[] {
    const top = style.top
    return [[-9, -4], [-11, -38], [-8, -50], [-6, -56 - top], [-3, -50 - top * 0.5], [0, -62 - top], [3, -50 - top * 0.5], [6, -56 - top], [8, -50], [11, -38], [9, -4]]
  }
  // A curly or wavy texture roughens the lower edge of a piece (the points below the middle of the head).
  function wavyBottom(pts: V2[], tex: string, widen: number): V2[] {
    if (tex === 'straight' && widen === 0) return pts
    return pts.map(([x, y]): V2 => {
      if (y < 6) return [x, y]
      const w = tex === 'wavy' ? 3 : tex === 'curly' || tex === 'coily' ? 5 : 0
      return [x + Math.sign(x) * widen * 0.5, y + Math.sin(x * 0.35) * w]
    })
  }

  // The tail of the hair: a ponytail, a braid, a bun or pigtails (in hair colour; the parts behind the head are drawn first).
  function tails() {
    const hc = look.hairColor
    const len = look.hairLength
    const dark = shade(hc, 0.2)
    const ring = (cx: number, cy: number, cz: number, rx: number, ry: number, fill: string, depthBias = 0) => {
      const p = turn(t, [cx, cy, cz])
      const rxs = Math.max(rx * 0.55, rx * Math.sqrt(t.c * t.c * 0.5 + 0.5))
      add(p[2] + depthBias, <ellipse key={key()} cx={num(p[0])} cy={num(p[1])} rx={num(rxs)} ry={num(ry)} fill={fill} />)
    }
    const tube = (pts: V3[], w0: number, w1: number, fill: string) => {
      const ps = pts.map(p => turn(t, p))
      const dep = meanDepth(ps)
      ps.slice(0, -1).forEach((a, i) => {
        const b = ps[i + 1]
        const r0 = lerp(w0, w1, i / (ps.length - 1)), r1 = lerp(w0, w1, (i + 1) / (ps.length - 1))
        const d = `M${num(a[0])} ${num(a[1])}L${num(b[0])} ${num(b[1])}`
        void r1
        add(dep, <path key={key()} d={d} fill="none" stroke={fill} strokeWidth={num((r0 + r1) / 2 * 2)} strokeLinecap="round" />)
      })
    }
    if (style.tail === 'bun') {
      const top = style.top
      ring(0, -58 - top, -4, 17, 15, dark, 0.3)
      ring(-1.5, -59 - top, -3, 13, 11.5, hc, 0.35)
      ring(0, -50 - top * 0.3, -2, 14, 3.5, light(look.hairColor, 0.1), 0.4)
    } else if (style.tail === 'pony' || style.tail === 'braid') {
      const L = 50 + len * 150
      const root: V3 = [0, -24, -A0 * 0.95]
      const pts: V3[] = [root, [0, -12, -A0 * 1.15], [0, 6, -A0 * 1.22], [0, 6 + L * 0.5, -A0 * 1.2], [0, 6 + L, -A0 * 1.12]]
      if (style.tail === 'pony') tube(pts, 9, 5, hc)
      else {
        const n = Math.round(4 + len * 7)
        for (let i = 0; i < n; i += 1) {
          const y = lerp(-8, 6 + L, i / n)
          const p = turn(t, [(i % 2 === 0 ? -1 : 1) * 3, y, -A0 * 1.2])
          add(p[2], <ellipse key={key()} cx={num(p[0])} cy={num(p[1] + 6)} rx={num(8 - (i / n) * 3)} ry={num(8)} fill={i % 2 === 0 ? hc : dark} />)
        }
      }
      const tie = turn(t, [0, -12, -A0 * 1.15])
      add(tie[2] + 0.2, <ellipse key={key()} cx={num(tie[0])} cy={num(tie[1])} rx={num(Math.max(4, 10 * Math.abs(t.c)))} ry={3.4} fill={shade(look.outfit.colors.accessory ?? '#c9a227', 0.1)} />)
    } else if (style.tail === 'pigtails') {
      const L = 40 + len * 80
      for (const s of [-1, 1]) {
        const x = s * (R(-14) + 4)
        const pts: V3[] = [[x, -16, -6], [x + s * 10, 0, -4], [x + s * 18, 14 + L * 0.3, -2], [x + s * 22, 22 + L * 0.7, 0], [x + s * 22, 22 + L, 0]]
        tube(pts, 8, 4, hc)
        const tie = turn(t, [x, -14, -6])
        add(tie[2] + 0.2, <circle key={key()} cx={num(tie[0])} cy={num(tie[1])} r={3.6} fill={shade(look.outfit.colors.accessory ?? '#c9a227', 0.1)} />)
      }
    }
  }

  // ---- accessories on the head ----
  function accessoriesOnHead() {
    const worn = look.outfit.accessories
    const kind = (id: string) => ACCESSORIES.find(a => a.id === id)
    const top = style.top
    for (const id of worn) {
      const a = kind(id)
      if (!a) continue
      const c = accessoryColour(look, id)
      const dk = shade(c, 0.22)
      const ringEllipse = (cy: number, ax: number, az: number, tilt = 0.2) => {
        const rx = Math.hypot(ax * t.c, az * t.s)
        const p = turn(t, [0, cy, 0])
        return { x: p[0], y: p[1], rx, ry: Math.max(2, rx * tilt) }
      }
      if (id === 'hat') {
        const e = ringEllipse(-32, A0 + 26, A0 * 0.9 + 26, 0.2)
        const domeR = ringEllipse(-32, A0 + 4, A0 * 0.9 + 4, 0.2)
        add(5, (
          <g key={key()}>
            <ellipse cx={num(e.x)} cy={num(e.y)} rx={num(e.rx)} ry={num(e.ry)} fill={dk} />
            <path d={`M${num(domeR.x - domeR.rx)} ${num(e.y)}C${num(domeR.x - domeR.rx)} ${num(e.y - 40 - top)} ${num(domeR.x + domeR.rx)} ${num(e.y - 40 - top)} ${num(domeR.x + domeR.rx)} ${num(e.y)}Z`} fill={c} />
            <path d={`M${num(domeR.x - domeR.rx)} ${num(e.y - 4)}Q${num(domeR.x)} ${num(e.y + 6)} ${num(domeR.x + domeR.rx)} ${num(e.y - 4)}L${num(domeR.x + domeR.rx)} ${num(e.y - 9)}Q${num(domeR.x)} ${num(e.y + 1)} ${num(domeR.x - domeR.rx)} ${num(e.y - 9)}Z`} fill={dk} />
          </g>
        ))
      } else if (id === 'cap') {
        const domeR = ringEllipse(-26, A0 + 4, A0 * 0.9 + 4, 0.2)
        const front = turn(t, [0, -30, A0 * 0.9 + 14])
        add(5, (
          <g key={key()}>
            <path d={`M${num(domeR.x - domeR.rx)} ${num(domeR.y)}C${num(domeR.x - domeR.rx)} ${num(domeR.y - 46 - top)} ${num(domeR.x + domeR.rx)} ${num(domeR.y - 46 - top)} ${num(domeR.x + domeR.rx)} ${num(domeR.y)}Z`} fill={c} />
            {front[2] > -2 && <ellipse cx={num(front[0])} cy={num(front[1] + 2)} rx={num(Math.max(6, (A0 + 4) * Math.abs(t.c) + 10 * Math.abs(t.s)))} ry={5} fill={dk} />}
          </g>
        ))
      } else if (id === 'crown') {
        const e = ringEllipse(-48 - top * 0.5, A0 * 0.9, A0 * 0.8, 0.18)
        const zig: V2[] = []
        const n = 5
        for (let i = 0; i <= n; i += 1) {
          zig.push([e.x - e.rx + (i * 2 * e.rx) / n, e.y - 14 - (i % 2 === 0 ? 8 : 0)])
          if (i < n) zig.push([e.x - e.rx + ((i + 0.5) * 2 * e.rx) / n, e.y - 14])
        }
        add(5, <path key={key()} d={`${polyPath([...zig, [e.x + e.rx, e.y + 2], [e.x - e.rx, e.y + 2]])}`} fill={c} stroke={dk} strokeWidth={1.2} />)
      } else if (id === 'hood') {
        const rim = A0 + 10
        const hood = [turn(t, [-rim, -6, -8]), turn(t, [-rim - 4, -40 - top, -8]), turn(t, [0, -62 - top, -8]), turn(t, [rim + 4, -40 - top, -8]), turn(t, [rim, -6, -8]), turn(t, [rim * 0.9, 50, -34]), turn(t, [0, 62, -40]), turn(t, [-rim * 0.9, 50, -34])]
        add(-4, <path key={key()} d={smoothPath(hood.map(scr), true, 0.9)} fill={dk} />)
        const frame = [-1, -0.75, -0.4, 0, 0.4, 0.75, 1].map((f): V3 => dome(f * (A0 + 4), f * f > 0.8 ? -6 : -8 - (1 - f * f) * (46 + top), 1, 4, top))
        add(6, <path key={key()} d={smoothPath(frame.map(scr), false, 1)} fill="none" stroke={c} strokeWidth={9} strokeLinecap="round" />)
      } else if (id === 'headband') {
        const band = [-1, -0.6, 0, 0.6, 1].map((f): V3 => dome(f * (R(-26) + 3), -28 + Math.abs(f) * 4, 1, 3, 0))
        add(4, <path key={key()} d={smoothPath(band.map(scr), false, 1)} fill="none" stroke={c} strokeWidth={5.5} strokeLinecap="round" />)
      } else if (id === 'glasses') {
        for (const s of [-1, 1]) {
          const f = faceOf(s * 17 * look.eyeSpacing, -6)
          if (f.facing < 0.04) continue
          const rr = 11.5
          add(f.p[2] * 0.01 + 0.9, (
            <g key={key()} transform={`translate(${num(f.p[0])} ${num(f.p[1])}) scale(${num(clamp(f.facing, 0.25, 1))} 1)`}>
              <circle r={rr} fill={mix('#bfe3f5', '#ffffff', 0.4)} opacity={0.22} />
              <circle r={rr} fill="none" stroke={c} strokeWidth={1.8} />
            </g>
          ))
        }
        const bridge = P(0, -8, 1, 2)
        if (bridge[2] > 0) {
          const l = P(-17 * look.eyeSpacing + 11.5, -6, 1, 2), r2 = P(17 * look.eyeSpacing - 11.5, -6, 1, 2)
          add(bridge[2] * 0.01 + 0.9, <path key={key()} d={`M${num(l[0])} ${num(l[1])}Q${num(bridge[0])} ${num(bridge[1] - 3)} ${num(r2[0])} ${num(r2[1])}`} fill="none" stroke={c} strokeWidth={1.6} />)
        }
        if (Math.abs(t.s) > 0.35) {
          const near = t.s > 0 ? -1 : 1
          const e = faceOf(near * 17 * look.eyeSpacing, -6)
          const earP = turn(t, [near * R(4), 2, 0])
          add(Math.max(e.p[2], earP[2]) * 0.01 + 0.9, <path key={key()} d={`M${num(e.p[0])} ${num(e.p[1])}L${num(earP[0])} ${num(earP[1])}`} stroke={c} strokeWidth={1.6} fill="none" />)
        }
      } else if (id === 'eyepatch') {
        const s = -1
        const f = faceOf(s * 17 * look.eyeSpacing, -6)
        if (f.facing > 0.04) {
          add(f.p[2] * 0.01 + 0.9, <ellipse key={key()} cx={num(f.p[0])} cy={num(f.p[1])} rx={num(12 * clamp(f.facing, 0.25, 1))} ry={9.5} fill={dk} />)
          const strap = [-1, -0.5, 0, 0.5, 1].map((u): V3 => dome(u * (R(-14) + 2), -16 - Math.abs(u) * 3, 1, 2, 0))
          add(0.8, <path key={key()} d={smoothPath(strap.map(scr), false, 1)} fill="none" stroke={dk} strokeWidth={2.2} />)
        }
      } else if (id === 'earrings') {
        for (const s of [-1, 1]) {
          const p = turn(t, [s * R(4) * 0.98, 4 + ear.h * look.earSize * 0.5 + ear.lobe * look.earSize + 3, 0])
          add(p[2] >= 0 ? p[2] + 0.6 : p[2] - 1.2, <circle key={key()} cx={num(p[0] + (Math.abs(t.c) > 0.3 ? s * t.c * 1.5 : 0))} cy={num(p[1])} r={3.2} fill={c} stroke={dk} strokeWidth={0.8} />)
        }
      }
    }
  }

  const sorted = pieces.map((p, i) => ({ ...p, i })).sort((a, b) => a.depth - b.depth || a.i - b.i)
  return {
    behind: sorted.filter(p => p.depth < 0).map(p => p.node),
    front: sorted.filter(p => p.depth >= 0).map(p => p.node),
    chin: chinY,
    halfWidth: A0 * sil,
  }
}

// Marks that are the same on both sides of the face.
function hull(points: V2[]): V2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: V2[] = []
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: V2[] = []
  for (const q of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function isMirrored(m: CharacterMark): boolean {
  if (m.kind === 'freckles' || m.kind === 'blush') return true
  if (m.kind === 'makeup') return m.design === 'eyeshadow' || m.design === 'eyeliner' || m.design === 'contour'
  if (m.kind === 'paint') return m.design === 'stripes' || m.design === 'star'
  return false
}
