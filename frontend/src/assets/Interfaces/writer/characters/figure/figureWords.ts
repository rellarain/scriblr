import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { slotsOf } from '../../../admin/characters/engine/colour'
import type { AppearanceField } from '../describe'
import { describeFigure } from './figureState'

// A figure in the words of the Appearance section: a first draft of the fields a stranger would notice, written from what the model says about the figure (the presets that
// are on, the forms that are not the model's own, the colour of each slot). A model names its own parts, so the words are its names ("Head shape: square"); a field the figure
// has nothing to say about is left empty, and the author's own words always come first.
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)
const lower = (s: string): string => s.toLowerCase()

export function describeFigureFields(copy: ModelContent, figure: CharacterFigure): Record<AppearanceField, string> {
  const lines = describeFigure(copy, figure)
  const slotNames = new Set(slotsOf(copy).map(s => s.name))
  const slotColour = (re: RegExp): string => {
    const slot = slotsOf(copy).find(s => re.test(s.name))
    return slot ? lower(lines.find(([label]) => label === slot.name)?.[1] ?? '') : ''
  }
  const preset = (re: RegExp): string => lower(lines.find(([label]) => re.test(label) && !slotNames.has(label))?.[1] ?? '')
  const forms = (re: RegExp): string[] => lines.filter(([label]) => re.test(label) && !slotNames.has(label)).map(([label, value]) => `${lower(label)}: ${lower(value)}`)
  const join = (parts: string[]): string => cap(parts.filter(Boolean).join('; '))

  const age = preset(/^age$/i), build = preset(/^build$/i), expression = preset(/^expression$/i)
  const skin = slotColour(/skin/i), hairColour = slotColour(/hair/i), eyeColour = slotColour(/eye/i)
  const parts = {
    height: '',
    build: build ? cap(build) : '',
    skin: skin ? `${cap(skin)} skin` : '',
    hair: join([hairColour && `${hairColour} hair`, ...forms(/hair|fringe|bang/i)]),
    eyes: join([eyeColour && `${eyeColour} eyes`, ...forms(/^eye/i)]),
    face: join(forms(/head|face|nose|mouth|brow|ear|jaw|cheek|lip/i)),
    voice: '',
    bearing: expression ? `Usually looks ${expression}` : '',
    style: join(forms(/outfit|cloth|shirt|top|jacket|coat|dress|trouser|skirt|hat/i)),
    marks: '',
  }
  const whole = [age && cap(age), build && `${build} build`, skin && `${skin} skin`, hairColour && `${hairColour} hair`, eyeColour && `${eyeColour} eyes`].filter(Boolean)
  return { appearance: whole.length > 0 ? `${whole.join(', ')}.` : '', ...parts }
}
