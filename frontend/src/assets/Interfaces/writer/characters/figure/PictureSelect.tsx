import { useRef } from 'react'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { Field } from '../CharFields'
import { PreviewSelect } from '../PreviewSelect'
import { Figure } from './Figure'
import type { Crop } from './figureState'

// A choice list of the figure editor whose choices are pictures: each one drawn on this character (`figureFor` gives the figure with that choice made, `crop` what it is looked at
// through, or how to work that out from the pictures of all the choices). The pictures are only drawn while the list is open, and the figures made for them are kept until the
// character changes, so moving over the choices draws nothing again.
export function PictureSelect({ label, value, options, onChange, copy, figure, figureFor, crop, custom = 'Custom' }: {
  label: string
  value: string
  options: Array<{ id: string; name: string }>
  onChange: (id: string) => void
  copy: ModelContent
  figure: CharacterFigure
  figureFor: (id: string) => CharacterFigure
  crop: Crop | ((figures: CharacterFigure[]) => Crop)
  custom?: string
}) {
  const kept = useRef<{ base: CharacterFigure; figures: Map<string, CharacterFigure>; crop: Crop | null }>({ base: figure, figures: new Map(), crop: null })
  if (kept.current.base !== figure) kept.current = { base: figure, figures: new Map(), crop: null }
  const figureOf = (id: string): CharacterFigure => {
    let made = kept.current.figures.get(id)
    if (!made) { made = figureFor(id); kept.current.figures.set(id, made) }
    return made
  }
  const cropOf = (): Crop => {
    if (typeof crop !== 'function') return crop
    if (!kept.current.crop) kept.current.crop = crop(options.map(o => figureOf(o.id)))
    return kept.current.crop
  }
  return (
    <Field label={label}>
      <PreviewSelect
        bare label={label} options={options} value={value} onChange={onChange} buttonThumb={false} custom={custom}
        thumb={o => <Figure copy={copy} figure={figureOf(o.id)} crop={cropOf()} label="" className="charPickArt" />}
      />
    </Field>
  )
}
