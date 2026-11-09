import type { CharacterFigure, CharacterPortrait, FigureModel } from '../../../../../api/types'
import { Portrait } from '../portrait/Portrait'
import type { PortraitCrop } from '../portrait/crops'
import { Figure } from './Figure'
import { useFigureCopy } from './figureModelStore'

// The one component every place that shows a character uses: it draws the character's figure when it has one and the copy of its model is here, else the portrait. `crop` is
// the whole card (the whole figure), the bust (what a small card shows: the model's bust frame, and for a portrait the card) or the head (a scene's small head); a portrait part
// crop (a dropdown's preview) is the portrait's own and always draws the portrait. `copies` are the model
// copies of a book's extras, for the reader, where the project's own are not.
export type ArtCrop = 'card' | 'bust' | 'head'

export function CharacterArt({ portrait, figure, copies, crop = 'card', label, className, idPrefix }: {
  portrait: CharacterPortrait | null | undefined
  figure?: CharacterFigure | null
  copies?: Record<string, FigureModel> | null
  crop?: ArtCrop | PortraitCrop
  label: string
  className?: string
  idPrefix?: string
}) {
  const stored = useFigureCopy(figure?.model)
  const copy = figure ? (copies?.[figure.model] ?? stored)?.content : undefined
  if (figure && copy && (crop === 'card' || crop === 'bust' || crop === 'head')) return <Figure copy={copy} figure={figure} crop={crop === 'card' ? 'figure' : crop} label={label} className={className} />
  return <Portrait portrait={portrait} label={label} crop={crop === 'bust' ? 'card' : crop} className={className} idPrefix={idPrefix} />
}
