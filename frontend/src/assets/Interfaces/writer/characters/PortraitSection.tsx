import { useId, type KeyboardEvent } from 'react'
import type { CharacterDoc, CharacterPortrait } from '../../../../api/types'
import { BrushIcon, CardIcon, EyeIcon, FaceIcon, UserIcon } from '../../../icons'
import { Colour, CommitText, Field, Slider } from './CharFields'
import { PortraitCard, roleAge } from './PortraitCard'
import { PreviewSelect } from './PreviewSelect'
import { PORTRAIT_RANGES, type SliderKey } from './portrait/defaults'
import { fitHair } from './portrait/library'
import { Portrait } from './portrait/Portrait'
import { COLOUR_LABELS, PART_CROPS, PART_LABELS, SLIDER_LABELS, SWATCHES, optionsFor, previewBase, type ColourKey, type PartKey } from './portrait/registry'
import { drawnOf } from './portrait/scene'

export type PortraitTab = 'face' | 'features' | 'hair' | 'body' | 'card'
export const PORTRAIT_TABS: Array<{ id: PortraitTab; label: string; Icon: typeof FaceIcon }> = [
  { id: 'face', label: 'Face', Icon: FaceIcon },
  { id: 'features', label: 'Features', Icon: EyeIcon },
  { id: 'hair', label: 'Hair', Icon: BrushIcon },
  { id: 'body', label: 'Body', Icon: UserIcon },
  { id: 'card', label: 'Card', Icon: CardIcon },
]

type FieldSpec =
  | { kind: 'part'; key: PartKey }
  | { kind: 'colour'; key: ColourKey; swatches: readonly string[]; none?: string }
  | { kind: 'slider'; key: SliderKey; format: (value: number) => string }

const percent = (v: number) => `${Math.round(v * 100)}%`
const degrees = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°`
const part = (key: PartKey): FieldSpec => ({ kind: 'part', key })
const slider = (key: SliderKey, format = percent): FieldSpec => ({ kind: 'slider', key, format })

const FIELDS: Record<Exclude<PortraitTab, 'card'>, FieldSpec[]> = {
  face: [
    part('age'), part('headShape'), slider('headWidth'), part('ears'), { kind: 'colour', key: 'skin', swatches: SWATCHES.skin }, part('expression'),
  ],
  features: [
    part('eyes'), { kind: 'colour', key: 'eyeColor', swatches: SWATCHES.eye }, slider('eyeSize'), slider('eyeSpacing'), slider('eyeTilt', degrees),
    part('brows'), { kind: 'colour', key: 'browColor', swatches: SWATCHES.hair, none: 'Same as the hair' },
    part('nose'), slider('noseSize'), slider('noseWidth'),
    part('mouth'), { kind: 'colour', key: 'lipColor', swatches: SWATCHES.lip, none: 'Natural' }, slider('mouthSize'),
  ],
  hair: [
    part('hairLength'), part('hairTexture'), part('hairStyle'), part('hairFront'), part('hairline'), part('hairlineHeight'), part('hairEdges'),
    { kind: 'colour', key: 'hairColor', swatches: SWATCHES.hair }, { kind: 'colour', key: 'highlightColor', swatches: SWATCHES.highlight, none: 'No highlights' }, part('greying'),
    part('facialHair'), { kind: 'colour', key: 'facialHairColor', swatches: SWATCHES.hair, none: 'Same as the hair' },
  ],
  body: [part('build'), part('chest'), part('top'), { kind: 'colour', key: 'topColor', swatches: SWATCHES.cloth }],
}

// The portrait of the open character: the card as it is drawn, and beside it the choices it is made of, in tabs. A choice from a list is a dropdown whose entries are drawn
// as they would look on this character; a colour is a row of swatches and a picker; a few sliders fine-tune the face. Every change is one step of the character's undo
// (a slider or a colour moved several times in a row is one step).
export function PortraitSection({ doc, edit, rename, tab, onTab }: {
  doc: CharacterDoc
  edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void
  rename: (name: string) => void
  tab: PortraitTab
  onTab: (tab: PortraitTab) => void
}) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '')
  const p = doc.portrait
  const drawn = drawnOf(p)
  // The colour a colour that follows another is drawn in (shown in its picker).
  const shown: Partial<Record<ColourKey, string>> = { browColor: drawn.browColor, lipColor: drawn.lipColor, highlightColor: drawn.hairColor, facialHairColor: drawn.facialHairColor }

  // Change some of the portrait's choices; the hair is made to fit again (a style or a front that the new length does not allow becomes the first that fits). Nothing changes, no step.
  const set = (patch: Partial<CharacterPortrait>, group?: string) => edit(d => {
    const next = fitHair({ ...d.portrait, ...patch })
    const same = (Object.keys(next) as Array<keyof CharacterPortrait>).every(k => next[k] === d.portrait[k])
    return same ? d : { ...d, portrait: next }
  }, group)

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? PORTRAIT_TABS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    const next = PORTRAIT_TABS[(to + PORTRAIT_TABS.length) % PORTRAIT_TABS.length]
    onTab(next.id)
    document.getElementById(`${uid}tab${next.id}`)?.focus()
  }

  const renderField = (f: FieldSpec) => {
    if (f.kind === 'part') {
      const key = f.key
      const base = previewBase(key, p)
      return (
        <PreviewSelect
          key={key} label={PART_LABELS[key]} options={optionsFor(key, p)} value={p[key]} onChange={id => set({ [key]: id })}
          thumb={o => <Portrait portrait={{ ...base, [key]: o.id } as CharacterPortrait} crop={PART_CROPS[key]} label="" className="charPickArt" />}
        />
      )
    }
    if (f.kind === 'colour') {
      const key = f.key
      return (
        <Field key={key} label={COLOUR_LABELS[key]}>
          <Colour
            label={COLOUR_LABELS[key]} value={p[key]} swatches={f.swatches} none={f.none} shown={shown[key]}
            onChange={v => { if (v !== null || f.none !== undefined) set({ [key]: v }, `portrait.${key}`) }}
          />
        </Field>
      )
    }
    const [min, max] = PORTRAIT_RANGES[f.key]
    return <Slider key={f.key} label={SLIDER_LABELS[f.key]} value={p[f.key]} min={min} max={max} step={f.key === 'eyeTilt' ? 1 : 0.01} format={f.format} onChange={v => set({ [f.key]: v }, `portrait.${f.key}`)} />
  }

  return (
    <div className="charPortrait">
      <section className="charPanel charPanel--start charPortraitStage" aria-label="The portrait card">
        <PortraitCard portrait={p} name={doc.name} caption={roleAge(doc.profile)} label={`${doc.name}, portrait`} className="charPortraitCard charPortraitCard--big" />
        <p className="charHint">The name and the role and age under the card come from Profile. The tile colour is part of the portrait.</p>
      </section>
      <section className="charPanel charPanel--start" aria-label="Parts of the portrait">
        <div className="charTabs" role="tablist" aria-label="Parts of the portrait">
          {PORTRAIT_TABS.map(({ id, label, Icon }, i) => (
            <button
              key={id} type="button" role="tab" id={`${uid}tab${id}`} className="charTab" aria-selected={tab === id} aria-controls={`${uid}panel`} tabIndex={tab === id ? 0 : -1} title={label}
              onClick={() => onTab(id)} onKeyDown={e => onTabKey(e, i)}
            ><Icon size={18} /><span>{label}</span></button>
          ))}
        </div>
        <div className="charPortraitFields" role="tabpanel" id={`${uid}panel`} aria-labelledby={`${uid}tab${tab}`}>
          {tab === 'card' ? (
            <>
              <Field label="Tile colour"><Colour label={COLOUR_LABELS.tileColor} value={p.tileColor} swatches={SWATCHES.tile} onChange={v => { if (v !== null) set({ tileColor: v }, 'portrait.tileColor') }} /></Field>
              <Field label="Name"><CommitText label="Name of the character" value={doc.name} max={120} onCommit={rename} /></Field>
            </>
          ) : FIELDS[tab].map(renderField)}
        </div>
      </section>
    </div>
  )
}
