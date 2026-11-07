import type { CharacterPortrait } from '../../../../../api/types'
import { drawBody } from './draw/body'
import { drawBeard, drawMoustache } from './draw/facial'
import { drawBrows, drawEyes, drawMouth, drawNose } from './draw/features'
import { drawEars, drawHead } from './draw/head'
import { drawHair } from './draw/hair'
import { mix, lightOf, shade } from './colour'
import { EXPRESSIONS, GREYING, AUTO_GREY, pick } from './library'
import { Shapes, band, lerp, PI, sample, type Shape } from './paths'
import { rigOf } from './rig'
import type { Drawn } from './types'

// The portrait as a list of filled shapes in paint order: the tile, the hair behind, the body, the ears, the head, the lines of age, the brows, the eyes, the nose, the facial hair,
// the mouth, the moustache, and the hair in front. The tile is 200 x 200 with rounded corners; what lies beyond it (hair, shoulders) is cut off by the card.

// How grey the hair, the brows and the beard are drawn: with `greying` set to auto, as much as the age gives; otherwise the amount the setting names.
export function greyAmount(p: Pick<CharacterPortrait, 'greying' | 'age'>): number {
  const gr = pick(GREYING, p.greying)
  return gr.id === 'auto' ? AUTO_GREY[p.age] || 0 : gr.amount || 0
}
function greyed(hex: string, t: number): string {
  return t > 0 ? mix(hex, lightOf(hex) > 0.7 ? '#f2f0ec' : '#d9d6d1', t) : hex
}

// The colours as they are drawn: greying applied; the brows and the facial hair take the hair's colour when they have none of their own; the lips a natural colour from the skin.
export function drawnOf(p: CharacterPortrait): Drawn {
  const t = greyAmount(p)
  return {
    ...p,
    hairColor: greyed(p.hairColor, t),
    browColor: greyed(p.browColor || shade(p.hairColor, 0.1), t * 0.7),
    facialHairColor: greyed(p.facialHairColor || p.hairColor, Math.min(1, t * 1.1)),
    lipColor: p.lipColor || mix(shade(p.skin, 0.18), '#b0505a', 0.3),
  }
}

const TILE = 'M16 0H184A16 16 0 0 1 200 16V184A16 16 0 0 1 184 200H16A16 16 0 0 1 0 184V16A16 16 0 0 1 16 0Z'

export function portraitShapes(portrait: CharacterPortrait): Shape[] {
  const p = drawnOf(portrait)
  const g = rigOf(p)
  const ex = pick(EXPRESSIONS, p.expression)
  const out = new Shapes()
  out.add(TILE, p.tileColor)
  drawHair(out, g, p, 'back')
  drawBody(out, g, p)
  drawEars(out, g, p)
  drawHead(out, g, p)
  // The lines across the forehead of an older face.
  if (g.lines > 1) {
    ;[0, 1].forEach(i => {
      const y = g.browY - g.H * (0.075 + i * 0.05)
      out.add(band(sample(t => [lerp(100 - g.fore * 0.45, 100 + g.fore * 0.45, t), y - Math.sin(t * PI) * 1.2], 8), 0.2, 0.2, 0.7), shade(p.skin, 0.12), 0.65)
    })
  }
  drawBrows(out, g, p, ex)
  drawEyes(out, g, p, ex)
  drawNose(out, g, p)
  drawBeard(out, g, p, ex)
  drawMouth(out, g, p, ex)
  drawMoustache(out, g, p, ex)
  drawHair(out, g, p, 'front')
  return out.list
}
