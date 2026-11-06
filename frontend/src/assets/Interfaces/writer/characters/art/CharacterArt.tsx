import { useId, useMemo } from 'react'
import type { CharacterLook } from '../../../../../api/types'
import { figureParts } from './body'
import { headParts } from './head'
import { turnOf, type View } from './space'

// The art of a character as an SVG: a close-up (head and shoulders), the full body, or the head alone for the expression strip and the thumbnails of the parts. The
// same look is drawn in any view; `facing` is the way the figure looks in the side and three-quarter views. Nothing here uses the page's colours: a figure is drawn in the
// colours the author chose.

export type ArtMode = 'closeup' | 'full' | 'head'
export interface ArtBox { x: number; y: number; w: number; h: number }

export interface CharacterArtProps {
  look: CharacterLook
  mode?: ArtMode
  view?: View
  facing?: 'left' | 'right'
  // The name it is given to assistive technology.
  label: string
  // Fit the figure to the box, or keep one scale for every character so that heights can be compared (a fixed frame).
  frame?: 'fit' | 'fixed'
  // A part of the head to fill the box with (for the thumbnails of the parts): the box in head units.
  crop?: ArtBox
  className?: string
  marks?: boolean
}

// The frame that holds the tallest figure the sliders allow, standing, with some air.
const FIXED: ArtBox = { x: -300, y: -1000, w: 600, h: 1040 }

export function CharacterArt({ look, mode = 'full', view = 'front', facing = 'right', label, frame = 'fit', crop, className, marks = true }: CharacterArtProps) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '')
  const scene = useMemo(() => {
    if (mode === 'head') {
      const t = turnOf(view)
      const h = headParts(look, t, `${uid}h`, { marks })
      return { nodes: [...h.behind, ...h.front], box: crop ?? { x: -85, y: -85, w: 170, h: 175 } }
    }
    const f = figureParts(look, view, uid, { marks })
    if (mode === 'closeup') {
      const box: ArtBox = crop ?? { x: f.head[0] - 130, y: f.head[1] - 100, w: 260, h: 300 }
      return { nodes: f.nodes, box }
    }
    if (frame === 'fixed') return { nodes: f.nodes, box: FIXED }
    const { x0, y0, x1, y1 } = f.bounds
    const w = Math.max(x1 - x0, (y1 - y0) * 0.5)
    const cx = (x0 + x1) / 2
    return { nodes: f.nodes, box: { x: cx - w / 2, y: y0, w, h: y1 - y0 } }
  }, [look, mode, view, uid, crop, frame, marks])

  const { x, y, w, h } = scene.box
  const flip = facing === 'left' && (view === 'side' || view === 'threeQuarter')
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g transform={flip ? `translate(${2 * x + w} 0) scale(-1 1)` : undefined}>{scene.nodes}</g>
    </svg>
  )
}
