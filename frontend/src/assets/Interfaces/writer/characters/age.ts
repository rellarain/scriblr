import type { CharacterLook } from '../../../../api/types'
import { RANGES } from './art/defaults'
import { mix } from './art/colour'

// Age a look up or down by a number of years (a tool, not a stored age: the author chooses whether to keep the result). Older: the hair, the brows and the beard grey, the skin
// warms a little, the figure stoops and thickens, and at an advanced age the eyes hood and the lips thin. Younger: the figure is smaller and slighter, the eyes larger, and the
// beard goes. Every slider stays within its range.

export const AGE_RANGE = { min: -30, max: 60, step: 5 } as const

const held = (key: keyof typeof RANGES, v: number): number => Math.min(RANGES[key][1], Math.max(RANGES[key][0], Math.round(v * 1000) / 1000))
const GREY = '#d6d6d6'

export function ageLook(look: CharacterLook, years: number): CharacterLook {
  if (years === 0) return look
  const t = years / 10
  if (t > 0) {
    const grey = Math.min(0.92, 0.2 * t)
    return {
      ...look,
      hairColor: mix(look.hairColor, GREY, grey),
      browColor: mix(look.browColor, GREY, grey * 0.8),
      facialHairColor: mix(look.facialHairColor, GREY, grey),
      streakColor: look.streakColor ? mix(look.streakColor, GREY, grey) : null,
      skin: mix(look.skin, '#b98f7a', Math.min(0.2, 0.03 * t)),
      height: held('height', look.height * (1 - 0.015 * t)),
      width: held('width', look.width * (1 + 0.03 * t)),
      shoulders: held('shoulders', look.shoulders * (1 - 0.02 * t)),
      eyeSize: held('eyeSize', look.eyeSize * (1 - 0.03 * t)),
      eyes: t >= 3 && ['round', 'almond', 'wide', 'large', 'upturned'].includes(look.eyes) ? 'hooded' : look.eyes,
      mouth: t >= 3 && look.mouth !== 'small' ? 'thin' : look.mouth,
    }
  }
  const u = -t
  return {
    ...look,
    height: held('height', look.height * (1 - 0.06 * u)),
    width: held('width', look.width * (1 - 0.04 * u)),
    shoulders: held('shoulders', look.shoulders * (1 - 0.04 * u)),
    eyeSize: held('eyeSize', look.eyeSize * (1 + 0.05 * u)),
    eyes: u >= 1.5 && look.eyes !== 'hooded' ? 'large' : look.eyes,
    facialHair: u >= 1 ? 'none' : look.facialHair,
  }
}
