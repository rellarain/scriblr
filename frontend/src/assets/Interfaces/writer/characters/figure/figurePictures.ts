import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import type { Box } from '../../../admin/characters/engine/geometry'
import { solveFigure, type Crop } from './figureState'

// The pictures of the figure editor's dropdowns (phase 6c-5): every choice of a list drawn on this character, through a crop that suits the list: a part's own place for the forms of
// a part (the eyes for the eye shapes, with room around them), and a frame of the figure for a ready look (the head for an expression, the bust for a hairstyle, the whole figure for
// an age).

// What a part takes of the picture, drawn with this figure: the box of the shapes of the object that show (and of its twin, so a pair of eyes is both), null when none shows.
export function partBox(copy: ModelContent, figure: CharacterFigure, objectId: string): Box | null {
  const solved = solveFigure(copy, figure, 'figure')
  const ids = copy.objects.filter(o => o.id === objectId || o.mirrorOf === objectId).flatMap(o => o.shapes)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of ids) {
    const s = solved.shapes[id]
    if (!s || !s.visible || !Number.isFinite(s.box.x + s.box.y + s.box.w + s.box.h) || (s.box.w <= 0 && s.box.h <= 0)) continue
    x0 = Math.min(x0, s.box.x); y0 = Math.min(y0, s.box.y); x1 = Math.max(x1, s.box.x + s.box.w); y1 = Math.max(y1, s.box.y + s.box.h)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

const PAD = 0.22
const LEAST = 30

// The crop for the choices of one part: the place the part takes with every one of them (so the pictures line up), a little room around it and not less than a small area (a
// part as small as an eye is not blown up past recognition), about its middle. Nothing shows with any choice: the bust.
export function cropAround(copy: ModelContent, figures: CharacterFigure[], objectId: string): Crop {
  let box: Box | null = null
  for (const f of figures) {
    const b = partBox(copy, f, objectId)
    if (!b) continue
    box = box ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x), h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y) } : b
  }
  if (!box) return 'bust'
  const w = Math.max(LEAST, box.w * (1 + 2 * PAD)), h = Math.max(LEAST, box.h * (1 + 2 * PAD))
  const r = (v: number): number => Math.round(v * 100) / 100
  return { box: { x: r(box.x + box.w / 2 - w / 2), y: r(box.y + box.h / 2 - h / 2), w: r(w), h: r(h) } }
}

// What a ready look of this kind is looked at through, by what the kind is called: the proportions and the pose want the whole figure, the face's looks the head, and the rest
// (hairstyles, tops, outfits' tops) the bust.
export function kindCrop(label: string): Crop {
  if (/age|build|height|pose|outfit|hand|weather|stance/i.test(label)) return 'figure'
  if (/expression|facial|beard|moustache|eye|brow|mouth|nose|ear/i.test(label)) return 'head'
  return 'bust'
}
