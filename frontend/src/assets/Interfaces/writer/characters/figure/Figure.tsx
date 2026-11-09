import { memo, useMemo } from 'react'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { paintDefs } from '../../../admin/characters/engine/paint'
import type { View } from '../../../admin/characters/engine/rig'
import { PaintDefs, PaintedPath, useSvgPrefix } from '../../../admin/characters/PaintedPath'
import { drawFigure, type Crop } from './figureState'

// A character's figure: the model copy drawn with the writer's choices on the card colour, through a crop (the whole figure, the head or one of the model's frames). The
// picture is drawn by the same code as the designer's previews. `label` names it for a screen reader (an empty one hides it, for a picture that sits beside its name).
// `square` grows the tile to a square (a small card); the editor looks at the frame's own shape.
export const Figure = memo(function Figure({ copy, figure, crop = 'figure', view = 'front', square = true, label, className }: {
  copy: ModelContent; figure: CharacterFigure; crop?: Crop; view?: View; square?: boolean; label: string; className?: string
}) {
  const prefix = useSvgPrefix()
  const { box, items, tile } = useMemo(() => drawFigure(copy, figure, crop, view, square), [copy, figure, crop, view, square])
  const defs = useMemo(() => paintDefs(items, prefix), [items, prefix])
  const r = (n: number) => Math.round(n * 100) / 100
  const radius = Math.min(box.w, box.h) * 0.08
  return (
    <svg
      className={className} viewBox={`${r(box.x)} ${r(box.y)} ${r(box.w)} ${r(box.h)}`} preserveAspectRatio="xMidYMid meet"
      role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} data-figure=""
    >
      <defs><clipPath id={`${prefix}-card`}><rect x={r(box.x)} y={r(box.y)} width={r(box.w)} height={r(box.h)} rx={r(radius)} /></clipPath></defs>
      <PaintDefs defs={defs} />
      <g clipPath={`url(#${prefix}-card)`}>
        <rect x={r(box.x)} y={r(box.y)} width={r(box.w)} height={r(box.h)} fill={tile} data-tile="" />
        {items.map(item => <PaintedPath key={item.id} item={item} prefix={prefix} className="charFigureShape" />)}
      </g>
    </svg>
  )
})
