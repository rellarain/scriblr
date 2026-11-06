import type { ReactNode } from 'react'
import type { CharacterMark } from '../../../../../api/types'
import { DEFAULT_MARK_COLORS, DESIGNS } from './wardrobe'
import { num, seeded } from './space'

// The drawing of one mark, centred on the origin of its own box: `unit` is the size of the box in head units (the box a tattoo's line drawing fills), `flip` is -1 for
// the mirrored copy on the other side of the face. The caller puts the box where the mark goes (head.tsx on the face, body.tsx on a limb or the torso).

export const markColor = (m: CharacterMark): string => m.color ?? DEFAULT_MARK_COLORS[m.kind]

export interface MarkCtx { skinDark: string; uid: string; at?: [number, number] }

const STAR = 'M0 -9 L2.4 -3 L8.5 -2.8 L3.8 1.2 L5.4 7.5 L0 4 L-5.4 7.5 L-3.8 1.2 L-8.5 -2.8 L-2.4 -3 Z'

export function drawMark(m: CharacterMark, unit: number, flip: 1 | -1, ctx: MarkCtx): ReactNode {
  const c = markColor(m)
  const s = m.size
  const designs = DESIGNS[m.kind]
  const design = designs.find(d => d.id === m.design) ?? designs[0]
  switch (m.kind) {
    case 'freckles': {
      const rnd = seeded(m.id)
      const n = design.id === 'dense' ? 20 : design.id === 'nose' ? 12 : 9
      const rx = unit * 0.45 * s, ry = design.id === 'nose' ? unit * 0.14 * s : unit * 0.45 * s
      const dots: ReactNode[] = []
      for (let i = 0; i < n; i += 1) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd())
        dots.push(<circle key={i} cx={num(Math.cos(a) * r * rx)} cy={num(Math.sin(a) * r * ry)} r={num((0.55 + rnd() * 0.55) * Math.sqrt(s))} fill={c} opacity={0.78} />)
      }
      return <g>{dots}</g>
    }
    case 'mole': {
      const r = ({ small: 1.2, round: 1.9, large: 2.8 } as Record<string, number>)[design.id] ?? 1.9
      return <circle r={num(r * s)} fill={c} />
    }
    case 'scar':
    case 'tattoo': {
      const k = (unit * s) / 100
      const custom = m.kind === 'tattoo' && m.strokes.length > 0
      const sw = m.kind === 'scar' ? 3.4 : 3
      return (
        <g transform={`scale(${num(k * flip)} ${num(k)}) translate(-50 -50)`} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity={m.kind === 'scar' ? 0.85 : 0.92}>
          {custom
            ? m.strokes.map((st, i) => <path key={i} d={`M${st.map(([x, y]) => `${num(x * 100)} ${num(y * 100)}`).join('L')}`} />)
            : <path d={design.d ?? ''} />}
        </g>
      )
    }
    case 'birthmark': {
      const blobs: Record<string, string> = {
        patch: 'M-10 -4 Q-6 -12 4 -10 Q12 -6 10 4 Q4 12 -6 8 Q-12 4 -10 -4Z',
        splash: 'M-12 0 Q-8 -8 -2 -4 Q2 -12 8 -6 Q14 0 6 4 Q8 10 0 8 Q-6 12 -8 5 Q-14 4 -12 0Z',
        strawberry: 'M0 -10 Q10 -10 10 -1 Q10 8 0 11 Q-10 8 -10 -1 Q-10 -10 0 -10Z',
      }
      return <path d={blobs[design.id] ?? blobs.patch} transform={`scale(${num((unit / 30) * s * flip)} ${num((unit / 30) * s)})`} fill={c} opacity={0.55} />
    }
    case 'blush': {
      const rx = ({ round: 5, soft: 7, nose: 10 } as Record<string, number>)[design.id] ?? 5
      const ry = design.id === 'nose' ? 3.2 : design.id === 'soft' ? 5 : 3.6
      const id = `${ctx.uid}b`
      return (
        <g>
          <radialGradient id={id}><stop offset="0" stopColor={c} stopOpacity={0.55} /><stop offset="1" stopColor={c} stopOpacity={0} /></radialGradient>
          <ellipse rx={num(rx * s)} ry={num(ry * s)} fill={`url(#${id})`} />
        </g>
      )
    }
    case 'makeup': {
      if (design.id === 'lipstick') return null
      if (design.id === 'eyeshadow') return <ellipse rx={num(8 * s)} ry={num(4.2 * s)} cy={-1.5} fill={c} opacity={0.55} />
      if (design.id === 'eyeliner') return <path d={`M${num(-8 * s * flip)} 1Q0 ${num(-5 * s)} ${num(8.5 * s * flip)} ${num(-2 * s)}`} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      return <path d={`M${num(-8 * s * flip)} -5Q0 ${num(3 * s)} ${num(8 * s * flip)} 6`} fill="none" stroke={ctx.skinDark} strokeWidth={4} strokeLinecap="round" opacity={0.3} />
    }
    case 'paint': {
      if (design.id === 'band') return <path d={`M-32 0H32`} stroke={c} strokeWidth={num(7 * s)} opacity={0.9} />
      if (design.id === 'star') return <path d={STAR} fill={c} transform={`scale(${num(s * 0.8)})`} opacity={0.9} />
      if (design.id === 'half') {
        const [ax, ay] = ctx.at ?? [0, 0]
        return <path d={`M${num(-ax)} ${num(-44 - ay)}A32 48 0 0 1 ${num(-ax)} ${num(52 - ay)}Z`} fill={c} opacity={0.85} />
      }
      return <path d={`M${num(-7 * flip)} -6L${num(7 * flip)} -2M${num(-7 * flip)} 0L${num(7 * flip)} 4M${num(-7 * flip)} 6L${num(7 * flip)} 10`} stroke={c} strokeWidth={num(2.4 * s)} strokeLinecap="round" opacity={0.9} />
    }
  }
}
