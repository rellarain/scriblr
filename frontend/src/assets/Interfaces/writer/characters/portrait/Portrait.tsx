import { memo, useId, useMemo } from 'react'
import type { CharacterPortrait } from '../../../../../api/types'
import { cropBox, type PortraitCrop } from './crops'
import { normalizePortrait } from './defaults'
import { portraitShapes } from './scene'

// A character's portrait: a head and shoulders on a coloured tile, drawn from the portrait's choices (nothing is stored but the choices). `crop` shows the whole card or a square
// round one part; `label` names the picture for a screen reader (an empty one hides it, for a picture that sits beside its name). Several portraits in one page draw side by side:
// each has its own clip path (`idPrefix` names it when the markup is made outside React, where `useId` is not).
export const Portrait = memo(function Portrait({ portrait, label, crop = 'card', className, idPrefix }: {
  portrait: CharacterPortrait | null | undefined; label: string; crop?: PortraitCrop; className?: string; idPrefix?: string
}) {
  const reactId = useId()
  const uid = `p${(idPrefix ?? reactId).replace(/[^A-Za-z0-9]/g, '')}`
  const p = useMemo(() => normalizePortrait(portrait), [portrait])
  const shapes = useMemo(() => portraitShapes(p), [p])
  const [x, y, w, h] = useMemo(() => cropBox(p, crop), [p, crop])
  return (
    <svg
      className={className} viewBox={`${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}`} preserveAspectRatio="xMidYMid meet"
      role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}
    >
      <clipPath id={`${uid}clip`}><rect x={r2(x)} y={r2(y)} width={r2(w)} height={r2(h)} rx={crop === 'card' ? 16 : 0} /></clipPath>
      <g clipPath={`url(#${uid}clip)`}>
        {shapes.map((s, i) => <path key={i} d={s.d} fill={s.fill} opacity={s.opacity < 1 ? s.opacity : undefined} />)}
      </g>
    </svg>
  )
})

const r2 = (n: number) => Math.round(n * 100) / 100
