import { useId } from 'react'
import type { CharacterDoc, CharacterPortrait } from '../../../../api/types'
import { BodyIcon, BrushIcon, CardIcon, ChevronDownIcon, DiceIcon, EyeIcon, FaceIcon, LockIcon, SparkleIcon } from '../../../icons'
import { Colour, CommitText, Field, Slider } from './CharFields'
import { MannequinPanel } from './MannequinPanel'
import { PortraitCard, roleAge } from './PortraitCard'
import { PreviewSelect } from './PreviewSelect'
import { usePortraitPanels } from './portraitPanels'
import { PORTRAIT_RANGES, type SliderKey } from './portrait/defaults'
import { fitHair } from './portrait/library'
import { Portrait } from './portrait/Portrait'
import { randomPortrait } from './portrait/random'
import { COLOUR_LABELS, PART_CROPS, PART_LABELS, SLIDER_LABELS, SWATCHES, optionsFor, previewBase, type ColourKey, type PartKey } from './portrait/registry'
import { drawnOf } from './portrait/scene'
import type { Characters } from './useCharacters'

// A field may have a condition (`when`): the colour of a horn is only asked when there are horns.
type FieldSpec =
  | { kind: 'part'; key: PartKey; hideIfOne?: boolean; when?: (p: CharacterPortrait) => boolean }
  | { kind: 'colour'; key: ColourKey; swatches: readonly string[]; none?: string; when?: (p: CharacterPortrait) => boolean }
  | { kind: 'slider'; key: SliderKey; format: (value: number) => string; when?: undefined }
  | { kind: 'name'; when?: undefined }

export interface PortraitSub { id: string; label: string; fields: FieldSpec[] }
export interface PortraitSectionSpec { id: string; label: string; Icon: typeof FaceIcon; subs: PortraitSub[] }

const percent = (v: number) => `${Math.round(v * 100)}%`
const degrees = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°`
const part = (key: PartKey, hideIfOne = false, when?: (p: CharacterPortrait) => boolean): FieldSpec => ({ kind: 'part', key, hideIfOne, when })
const slider = (key: SliderKey, format = percent): FieldSpec => ({ kind: 'slider', key, format })
const colour = (key: ColourKey, swatches: readonly string[], none?: string, when?: (p: CharacterPortrait) => boolean): FieldSpec => ({ kind: 'colour', key, swatches, none, when })
const shown = (f: FieldSpec, p: CharacterPortrait): boolean => !f.when || f.when(p)

const labelOf = (f: FieldSpec): string => (f.kind === 'part' ? PART_LABELS[f.key] : f.kind === 'colour' ? COLOUR_LABELS[f.key] : f.kind === 'slider' ? SLIDER_LABELS[f.key] : 'Name')

// The page: six sections (the portrait is made of the head, the hair, the face and the body, with the fantasy elements as a section of their own; the card is the tile it sits on
// and the name), each of subsections that open and close on their own.
export const PORTRAIT_SECTIONS: PortraitSectionSpec[] = [
  {
    id: 'head', label: 'Head', Icon: FaceIcon, subs: [
      { id: 'age', label: 'Age', fields: [part('age')] },
      { id: 'shape', label: 'Head shape', fields: [part('headShape'), slider('headWidth')] },
      { id: 'ears', label: 'Ears', fields: [part('ears')] },
      { id: 'skin', label: 'Skin', fields: [colour('skin', SWATCHES.skin)] },
    ],
  },
  {
    id: 'hair', label: 'Hair', Icon: BrushIcon, subs: [
      { id: 'length', label: 'Length, placement and ends', fields: [part('hairLength'), part('hairPlacement', true), part('hairEnds', true)] },
      { id: 'style', label: 'Texture and style', fields: [part('hairTexture'), part('hairStyle'), part('hairFront')] },
      { id: 'hairline', label: 'Hairline', fields: [part('hairline'), part('hairlineHeight'), part('hairEdges')] },
      { id: 'colour', label: 'Colour', fields: [colour('hairColor', SWATCHES.hair), colour('highlightColor', SWATCHES.highlight, 'No highlights'), part('greying')] },
      { id: 'facial', label: 'Facial hair', fields: [part('facialHair'), colour('facialHairColor', SWATCHES.hair, 'Same as the hair')] },
    ],
  },
  {
    id: 'face', label: 'Face', Icon: EyeIcon, subs: [
      { id: 'expression', label: 'Expression', fields: [part('expression')] },
      { id: 'eyes', label: 'Eyes', fields: [part('eyes'), colour('eyeColor', SWATCHES.eye), slider('eyeSize'), slider('eyeSpacing'), slider('eyeTilt', degrees)] },
      { id: 'brows', label: 'Brows', fields: [part('brows'), colour('browColor', SWATCHES.hair, 'Same as the hair')] },
      { id: 'nose', label: 'Nose', fields: [part('nose'), slider('noseSize'), slider('noseWidth')] },
      { id: 'mouth', label: 'Mouth', fields: [part('mouth'), colour('lipColor', SWATCHES.lip, 'Natural'), slider('mouthSize')] },
    ],
  },
  {
    id: 'body', label: 'Body', Icon: BodyIcon, subs: [
      { id: 'build', label: 'Build', fields: [part('build'), part('chest')] },
      { id: 'frame', label: 'Shoulders and neck', fields: [slider('shoulderWidth'), slider('neckWidth')] },
      { id: 'top', label: 'Top', fields: [part('top'), colour('topColor', SWATCHES.cloth)] },
      { id: 'necklace', label: 'Necklace', fields: [part('necklace'), colour('necklaceColor', SWATCHES.metal, undefined, p => p.necklace !== 'none')] },
    ],
  },
  {
    id: 'fantasy', label: 'Fantasy', Icon: SparkleIcon, subs: [
      { id: 'ears', label: 'Ears', fields: [part('fantasyEars')] },
      { id: 'horns', label: 'Horns and antlers', fields: [part('horns'), colour('hornColor', SWATCHES.horn, undefined, p => p.horns !== 'none')] },
      { id: 'skin', label: 'Unusual skin', fields: [colour('skin', SWATCHES.skinFantasy)] },
      {
        id: 'eyes', label: 'Eyes', fields: [
          part('eyeStyle'), colour('eyeColor', SWATCHES.eyeFantasy), colour('eyeColor2', SWATCHES.eyeFantasy, undefined, p => p.eyeStyle === 'twocolour'), part('eyeCount'),
        ],
      },
      { id: 'crown', label: 'Crown or circlet', fields: [part('crown'), colour('crownColor', SWATCHES.metal, undefined, p => p.crown !== 'none')] },
      { id: 'hood', label: 'Hood', fields: [part('hood'), colour('hoodColor', SWATCHES.hood, undefined, p => p.hood !== 'none')] },
      {
        id: 'item', label: 'Held item', fields: [
          part('heldItem'), part('heldSide', false, p => p.heldItem !== 'none'), colour('itemColor', SWATCHES.item, undefined, p => p.heldItem !== 'none'),
        ],
      },
    ],
  },
  {
    id: 'card', label: 'Card', Icon: CardIcon, subs: [
      { id: 'tile', label: 'Tile', fields: [colour('tileColor', SWATCHES.tile)] },
      { id: 'name', label: 'Name', fields: [{ kind: 'name' }] },
    ],
  },
]

// The portrait of the open character: the card as it is drawn (it stays in view while the page scrolls) and beside it the choices it is made of, on one page of sections that
// open and close. A choice from a list is a dropdown whose entries are drawn as they would look on this character; a colour is a row of swatches and a picker; a few sliders
// fine-tune the face. Every change is one step of the character's undo (a slider or a colour moved several times in a row is one step).
export function PortraitSection({ projectId, doc, edit, rename, setFigure }: {
  projectId: string
  doc: CharacterDoc
  edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void
  rename: (name: string) => void
  setFigure: Characters['setFigure']
}) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '')
  const panels = usePortraitPanels()
  const p = doc.portrait
  const drawn = drawnOf(p)
  // The colour a colour that follows another is drawn in (shown in its picker).
  const following: Partial<Record<ColourKey, string>> = { browColor: drawn.browColor, lipColor: drawn.lipColor, highlightColor: drawn.hairColor, facialHairColor: drawn.facialHairColor }

  // Change some of the portrait's choices; the hair is made to fit again (a style, a front, a placement or ends that the new length does not allow become the first that fit).
  // Nothing changes, no step.
  const set = (patch: Partial<CharacterPortrait>, group?: string) => edit(d => {
    const next = fitHair({ ...d.portrait, ...patch })
    const same = (Object.keys(next) as Array<keyof CharacterPortrait>).every(k => next[k] === d.portrait[k])
    return same ? d : { ...d, portrait: next }
  }, group)

  // Randomise: new choices for every section that is not locked (one step of the undo).
  const randomise = () => set(randomPortrait(p, panels.locked))

  // `bare`: the field is alone in a subsection of its own name, so its label is not written twice (it is still its accessible name).
  const renderField = (f: FieldSpec, bare = false) => {
    if (f.kind === 'part') {
      const key = f.key
      const options = optionsFor(key, p)
      // The placement and the ends are only a choice for hair that hangs loose: elsewhere there is nothing to choose, so one note says why.
      if (f.hideIfOne && options.length < 2) return key === 'hairPlacement' ? <p key={key} className="charHint charHint--wide">Placement and ends are a choice for loose hair from the chin down.</p> : null
      const base = previewBase(key, p)
      return (
        <PreviewSelect
          key={key} label={PART_LABELS[key]} bare={bare} options={options} value={p[key]} onChange={id => set({ [key]: id })}
          thumb={o => <Portrait portrait={{ ...base, [key]: o.id } as CharacterPortrait} crop={PART_CROPS[key]} label="" className="charPickArt" />}
        />
      )
    }
    if (f.kind === 'colour') {
      const key = f.key
      return (
        <Field key={key} label={COLOUR_LABELS[key]} bare={bare}>
          <Colour
            label={COLOUR_LABELS[key]} value={p[key]} swatches={f.swatches} none={f.none} shown={following[key]}
            onChange={v => { if (v !== null || f.none !== undefined) set({ [key]: v }, `portrait.${key}`) }}
          />
        </Field>
      )
    }
    if (f.kind === 'name') return <Field key="name" label="Name" bare={bare}><CommitText label="Name of the character" value={doc.name} max={120} onCommit={rename} /></Field>
    const [min, max] = PORTRAIT_RANGES[f.key]
    return <Slider key={f.key} label={SLIDER_LABELS[f.key]} value={p[f.key]} min={min} max={max} step={f.key === 'eyeTilt' ? 1 : 0.01} format={f.format} onChange={v => set({ [f.key]: v }, `portrait.${f.key}`)} />
  }

  return (
    <div className="charPortrait">
      <section className="charPanel charPanel--start charPortraitStage" aria-label="The portrait card">
        <PortraitCard portrait={p} figure={doc.figure} crop="card" name={doc.name} caption={roleAge(doc.profile)} label={`${doc.name}, ${doc.figure ? 'figure' : 'portrait'}`} className="charPortraitCard charPortraitCard--big" />
        <p className="charHint">The name and the role and age under the card come from Profile. {doc.figure ? 'The card colour is part of the mannequin.' : 'The tile colour is part of the portrait.'}</p>
        <MannequinPanel projectId={projectId} doc={doc} setFigure={setFigure} />
        {!doc.figure && <div className="charRandom" role="group" aria-label="Randomise">
          <button type="button" className="charIconBtn charDice" aria-label="Randomise the portrait" title="Randomise the portrait: new choices for every section that is not locked" onClick={randomise}>
            <DiceIcon size={20} />
          </button>
          {PORTRAIT_SECTIONS.map(({ id, label, Icon }) => {
            const locked = panels.isLocked(id)
            return (
              <button
                key={id} type="button" className="charIconBtn charLock" aria-pressed={locked} aria-label={`Lock ${label}`}
                title={locked ? `${label} is locked: Randomise leaves it as it is` : `Lock ${label}: Randomise leaves it as it is`} onClick={() => panels.toggleLock(id)}
              >
                <Icon size={16} />
                {locked && <span className="charLockMark" aria-hidden="true"><LockIcon size={9} /></span>}
              </button>
            )
          })}
        </div>}
      </section>
      <section className="charPanel charPanel--start charAcc" aria-label="Parts of the portrait">
        {PORTRAIT_SECTIONS.map(({ id, label, Icon, subs }) => {
          const open = panels.open === id
          const head = `${uid}s${id}`, body = `${uid}b${id}`
          return (
            <div key={id} className="charAccItem">
              <h3 className="charAccHead">
                <button
                  type="button" id={head} className="charAccBtn" aria-expanded={open} aria-controls={open ? body : undefined} title={label} onClick={() => panels.toggle(id)}
                ><Icon size={18} /><span className="charAccName">{label}</span><span className="charAccChev" aria-hidden="true"><ChevronDownIcon size={16} /></span></button>
              </h3>
              {open && (
                <div id={body} role="region" aria-labelledby={head} className="charAccBody">
                  {subs.map(sub => {
                    const key = `${id}.${sub.id}`
                    const subOpen = panels.subOpen(key)
                    const subHead = `${uid}h${id}${sub.id}`, subBody = `${uid}f${id}${sub.id}`
                    return (
                      <div key={key} className="charSub">
                        <h4 className="charSubHead">
                          <button
                            type="button" id={subHead} className="charSubBtn" aria-expanded={subOpen} aria-controls={subOpen ? subBody : undefined} title={sub.label} onClick={() => panels.toggleSub(key)}
                          ><span className="charAccName">{sub.label}</span><span className="charAccChev" aria-hidden="true"><ChevronDownIcon size={14} /></span></button>
                        </h4>
                        {subOpen && (
                          <div id={subBody} role="group" aria-labelledby={subHead} className="charPortraitFields">
                            {sub.fields.filter(f => shown(f, p)).map((f, _i, all) => renderField(f, all.length === 1 && labelOf(f).toLowerCase() === sub.label.toLowerCase()))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
