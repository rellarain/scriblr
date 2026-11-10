import { useId, type CSSProperties, type ReactElement, type SVGProps } from 'react'
import { MASK_BOX, gradientAxis, gradientStops, paintAttrs, type PaintDef, type PaintItem } from './engine/paint'

// The SVG side of painting (phase 4b): the definitions an effect needs and one path drawn with all of them. The canvas, the preview tiles and the pictures of
// forms use these, so a gradient, a clip or a cut-out looks the same everywhere.

// An id prefix of this drawing's own: ids of inline SVG are global to the page, and several drawings (the tiles, the form pictures) share it.
export function useSvgPrefix(): string {
  return `pt${useId().replace(/[^A-Za-z0-9]/g, '')}`
}

export function PaintDefs({ defs }: { defs: PaintDef[] }): ReactElement | null {
  if (defs.length === 0) return null
  return (
    <defs>
      {defs.map(d => {
        if (d.kind === 'gradient') {
          const stops = gradientStops(d.from, d.to, d.reach).map((st, i) => <stop key={i} offset={st.offset} stopColor={st.colour} />)
          return d.dir === 'radial'
            ? <radialGradient key={d.id} id={d.id} cx="0.5" cy="0.5" r="0.5">{stops}</radialGradient>
            : <linearGradient key={d.id} id={d.id} {...gradientAxis(d.dir, d.angle)}>{stops}</linearGradient>
        }
        if (d.kind === 'clip') return <clipPath key={d.id} id={d.id}>{d.ds.map((x, i) => <path key={i} d={x} />)}</clipPath>
        return (
          <mask key={d.id} id={d.id} maskUnits="userSpaceOnUse" x={MASK_BOX.x} y={MASK_BOX.y} width={MASK_BOX.w} height={MASK_BOX.h}>
            <rect x={MASK_BOX.x} y={MASK_BOX.y} width={MASK_BOX.w} height={MASK_BOX.h} fill="#fff" />
            {d.ds.map((x, i) => <path key={i} d={x} fill="#000" />)}
          </mask>
        )
      })}
    </defs>
  )
}

type PathProps = Omit<SVGProps<SVGPathElement>, 'd' | 'style' | 'fillOpacity' | 'clipPath' | 'mask' | 'ref'>

// One shape, painted. Its fill is the colour (or the gradient) in the `--shape-fill` variable, like the portrait's own colours, so the stylesheet can still dim or
// ring it; a shading shape sits in a group that keeps it inside the base shapes, and a garment worn under others in one that keeps it inside theirs. A thing with nothing to be kept inside
// is invisible but still there to be picked.
export function PaintedPath({ item, prefix, ...rest }: { item: PaintItem; prefix: string } & PathProps): ReactElement {
  const a = paintAttrs(item, prefix)
  const path = (
    <path
      d={item.d} style={{ '--shape-fill': a.fill, ...(a.blend ? { mixBlendMode: a.blend } : {}) } as CSSProperties} fillOpacity={item.blank ? 0 : item.opacity}
      clipPath={a.clip} mask={a.mask} {...rest}
    />
  )
  const inner = a.comp ? <g clipPath={a.comp}>{path}</g> : path
  // a garment worn under others is drawn only inside their outlines
  return a.wear ? <g clipPath={a.wear}>{inner}</g> : inner
}
