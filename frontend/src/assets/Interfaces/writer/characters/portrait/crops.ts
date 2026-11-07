import type { CharacterPortrait } from '../../../../../api/types'
import { rigOf } from './rig'

// What a portrait is drawn at: the whole card, or a square of it round one part (the previews in a dropdown show the part that choice changes, and a scene's small head shows the
// face with a little hair).
export type PortraitCrop = 'card' | 'head' | 'face' | 'ears' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'lower'
export type Box = [number, number, number, number]

const square = (cx: number, cy: number, side: number): Box => [cx - side / 2, cy - side / 2, side, side]

// The box of the 200 x 200 tile a crop shows, as [x, y, width, height].
export function cropBox(p: CharacterPortrait, crop: PortraitCrop): Box {
  if (crop === 'card') return [0, 0, 200, 200]
  const g = rigOf(p)
  const W = g.W
  switch (crop) {
    case 'head': return square(100, g.top + g.H * 0.52, W * 2.5)
    case 'face': return square(100, g.top + g.H * 0.56, W * 2.3)
    case 'ears': return square(100 + g.cheek + 3, (g.browY + g.noseY) / 2, W * 0.95)
    case 'eyes': return square(100, g.eyeY, W * 1.7)
    case 'brows': return square(100, g.browY + 1, W * 1.7)
    case 'nose': return square(100, (g.browY + g.noseY) / 2 + 3, W * 1.2)
    case 'mouth': return square(100, g.mouthY, W * 1.2)
    case 'lower': return square(100, g.mouthY + W * 0.3, W * 2.3)
  }
}
