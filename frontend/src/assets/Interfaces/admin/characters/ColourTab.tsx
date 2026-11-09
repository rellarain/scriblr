import { useState, type CSSProperties } from 'react'
import type { ModelColour, ModelContent, ModelShape, ModelSlot, ModelSwatch } from '../../../../api/types'
import { ColorRange } from '../../../../components/ColorRange'
import { ChevronDownIcon, ChevronRightIcon, DiceIcon, PlusIcon, RestoreIcon, SaveIcon, TrashIcon } from '../../../icons'
import { Stepper } from './Stepper'
import type { Selection } from './designerState'
import {
  NEUTRAL_GRAY, fitsGenre, genresOf, hexHsl, hslHex, paintSource, paletteOf, resolveColour, slotById, slotOfShape, slotsOf, swatchHex, type SlotChoice, type SlotChoices, type SlotKey,
} from './engine/colour'
import { standardSlots } from './engine/standardColours'
import { LIMITS } from './engine/limits'
import { NAME_MAX, SWATCH_NAME_MAX, objectById, objectOfShape, shapeById } from './modelContent'

// The Colour tab: what the selected shape or object is painted from (a colour slot, or a fixed gray), the colours of the test character (a default colour or a swatch
// of the palette for each slot, inside the slot's brightness and opacity, and a Roll for the whole look), the test palette, and the model's own slots with their default
// colours and ranges, and its genre tags. The test character is never saved; the slots, default colours and genres are the model's.
export interface ColourActions {
  setSlot: (shapeIds: string[], slotId: string | null) => void
  stepGray: (shapeId: string, dir: 1 | -1, big: boolean) => void
  neutral: (shapeId: string) => void
  choose: (slotId: string, choice: SlotChoice | null) => void
  roll: () => void
  setGenre: (genreId: string | null) => void
  addSwatch: () => void
  setSwatch: (id: string, change: Partial<Pick<ModelSwatch, 'h' | 's'>>) => void
  removeSwatch: (id: string) => void
  saveStarter: () => void
  resetPalette: () => void
  addSlot: () => void
  renameSlot: (id: string, name: string) => void
  stepSlot: (id: string, key: SlotKey, dir: 1 | -1, big: boolean) => void
  removeSlot: (id: string) => void
  addColour: (slotId: string) => void
  renameColour: (slotId: string, id: string, name: string) => void
  setColourHex: (slotId: string, id: string, hex: string) => void
  toggleColourGenre: (slotId: string, id: string, genreId: string) => void
  removeColour: (slotId: string, id: string) => void
  addGenre: () => void
  renameGenre: (id: string, name: string) => void
  removeGenre: (id: string) => void
  addStandard: () => void
}

export interface ColourState { colours: SlotChoices; palette: ModelSwatch[]; genre: string | null; locks: string[] }

const label = (name: string, fallback: string) => name.trim() || fallback
const same = (a: ModelSwatch[], b: ModelSwatch[]) => JSON.stringify(a) === JSON.stringify(b)
const css = (v: string) => ({ '--sw': v }) as CSSProperties

// A round swatch button: its colour is the character's data, set inline.
function Swatch({ hex, name, on, onClick, title }: { hex: string; name: string; on: boolean; onClick: () => void; title?: string }) {
  return <button type="button" className={`cmSwatch${on ? ' cmSwatch--on' : ''}`} style={css(hex)} aria-label={name} aria-pressed={on} title={title ?? name} onClick={onClick} />
}

function Range({ label: text, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="cmField">
      <span>{text} <output>{Math.round(value)}%</output></span>
      <span className="cmRange"><input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} aria-label={text} onChange={e => onChange(Number(e.target.value))} /></span>
    </label>
  )
}

// ---- what the selection is painted from ----

function ThisShape({ content, shape, shapeIds, name, actions }: { content: ModelContent; shape: ModelShape | undefined; shapeIds: string[]; name: string; actions: ColourActions }) {
  const slots = slotsOf(content)
  const own = shape ? shape.slot ?? null : null
  const all = shapeIds.map(id => shapeById(content, id)).filter((s): s is ModelShape => !!s)
  const chosen = (id: string | null) => all.length > 0 && all.every(s => (s.slot ?? null) === id)
  const source = shape ? paintSource(content, shape) : null
  return (
    <section className="cmSec" aria-label="Colour of the selection">
      <h3 className="cmInsSub">{shape ? 'This shape' : `Every shape of ${name}`}</h3>
      {slots.length === 0 && <p className="cmInsText">The model has no colour slot yet: add the standard slots, or a slot of your own, below.</p>}
      <div className="cmChips" role="group" aria-label="Colour slot">
        <button type="button" className={`cmChip cmChip--wide${chosen(null) ? ' cmChip--on' : ''}`} aria-pressed={chosen(null)} title="Paint from no slot: a fixed gray, or the gray of the shape it copies" onClick={() => actions.setSlot(shapeIds, null)}>No slot</button>
        {slots.map(s => <button key={s.id} type="button" className={`cmChip cmChip--wide${chosen(s.id) ? ' cmChip--on' : ''}`} aria-pressed={chosen(s.id)} onClick={() => actions.setSlot(shapeIds, s.id)}>{label(s.name, 'Untitled slot')}</button>)}
      </div>
      {shape && own === null && (
        <>
          {source?.slot && <p className="cmInsText">It follows the shape it copies, which is painted from the slot {label(source.slot.name, 'Untitled slot')}.</p>}
          {!source?.slot && (
            <div className="cmInline">
              <Stepper label="Fixed gray" value={shape.gray === null || shape.gray === undefined ? 'neutral' : `${shape.gray}%`} onStep={(dir, big) => actions.stepGray(shape.id, dir, big)} />
              <button type="button" className="cmBtn cmBtn--small" aria-pressed={shape.gray === null || shape.gray === undefined} disabled={shape.gray === null || shape.gray === undefined} title={`Back to the neutral gray (${NEUTRAL_GRAY}%)`} onClick={() => actions.neutral(shape.id)}>Neutral gray</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ---- the test character's colours ----

function TestColours({ content, state, slotId, onSlot, actions }: { content: ModelContent; state: ColourState; slotId: string | null; onSlot: (id: string) => void; actions: ColourActions }) {
  const slots = slotsOf(content), genres = genresOf(content)
  const slot = slotById(content, slotId) ?? slots[0]
  const choice = slot ? state.colours[slot.id] : undefined
  const r = slot ? resolveColour(slot, choice, state.palette) : null
  const fits = slot ? slot.colours.filter(k => fitsGenre(k, state.genre)) : []
  const pick = (next: SlotChoice) => slot && actions.choose(slot.id, { ...next, ...(choice?.l !== undefined ? { l: choice.l } : {}), ...(choice?.a !== undefined ? { a: choice.a } : {}) })
  return (
    <section className="cmSec" aria-label="Test colours">
      <h3 className="cmInsSub">Test colours</h3>
      <p className="cmInsText">The test character starts gray, as the model is saved. Choose a colour for a slot, or roll the whole look. None of this is saved.</p>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small cmBtn--primary" title="Roll colours, a form on every axis and the member of each family, leaving what is locked in the tree" onClick={actions.roll}><DiceIcon size={12} /> Roll colours and forms</button>
        <label className="cmField cmField--inline">
          <span>Genre</span>
          <select value={state.genre ?? ''} aria-label="Genre the colours are drawn from" onChange={e => actions.setGenre(e.target.value || null)}>
            <option value="">Any genre</option>
            {genres.map(g => <option key={g.id} value={g.id}>{label(g.name, 'Untitled genre')}</option>)}
          </select>
        </label>
      </div>
      {slots.length > 0 && (
        <div className="cmChips" role="group" aria-label="Slot to colour">
          {slots.map(s => <button key={s.id} type="button" className={`cmChip cmChip--wide${slot?.id === s.id ? ' cmChip--on' : ''}`} aria-pressed={slot?.id === s.id} onClick={() => onSlot(s.id)}>{label(s.name, 'Untitled slot')}</button>)}
        </div>
      )}
      {slot && r && (
        <>
          <div className="cmSwatches" role="group" aria-label={`Colours of ${label(slot.name, 'the slot')}`}>
            <button type="button" className={`cmChip cmChip--wide${!choice ? ' cmChip--on' : ''}`} aria-pressed={!choice} title="No colour: gray" onClick={() => actions.choose(slot.id, null)}>Gray</button>
            {fits.map(k => <Swatch key={k.id} hex={k.hex} name={`Colour ${label(k.name, k.hex)}`} on={choice?.src === 'colour' && choice.id === k.id} title={`${label(k.name, k.hex)}${k.genres.length ? ` (${k.genres.map(g => genres.find(x => x.id === g)?.name ?? '').filter(Boolean).join(', ')})` : ''}`} onClick={() => pick({ src: 'colour', id: k.id })} />)}
            {fits.length === 0 && <span className="cmInsText">No default colour fits this genre.</span>}
          </div>
          <div className="cmSwatches" role="group" aria-label="Swatches of the palette">
            {state.palette.map(p => <Swatch key={p.id} hex={swatchHex(p)} name={`Swatch ${label(p.name, p.id)}`} on={choice?.src === 'swatch' && choice.id === p.id} onClick={() => pick({ src: 'swatch', id: p.id })} />)}
          </div>
          {choice && (
            <>
              <Range label={`Brightness of ${label(slot.name, 'the slot')}`} value={r.l} min={slot.lMin} max={slot.lMax} onChange={l => actions.choose(slot.id, { ...choice, l })} />
              {slot.aMax > slot.aMin && <Range label={`Opacity of ${label(slot.name, 'the slot')}`} value={r.a * 100} min={slot.aMin} max={slot.aMax} onChange={a => actions.choose(slot.id, { ...choice, a })} />}
            </>
          )}
        </>
      )}
    </section>
  )
}

// ---- the palette ----

function TestPalette({ content, state, actions }: { content: ModelContent; state: ColourState; actions: ColourActions }) {
  const starter = paletteOf(content), unchanged = same(state.palette, starter)
  return (
    <section className="cmSec" aria-label="Test palette">
      <h3 className="cmInsSub">Palette</h3>
      <p className="cmInsText">The swatches of hue and saturation a character owns; a slot that uses one changes with it. This is a test copy: save it as the model's starter palette to keep it.</p>
      <ul className="cmPlain cmPalette">
        {state.palette.map(p => (
          <li key={p.id} className="cmPaletteRow" aria-label={`Swatch ${label(p.name, p.id)}`}>
            <span className="cmSwatch cmSwatch--static" style={css(swatchHex(p))} aria-hidden="true" />
            <div className="cmPaletteSliders">
              <span className="cmHueLabel" aria-hidden="true">Hue of {label(p.name, p.id)} {p.h}°</span>
              <ColorRange label={`Hue of ${label(p.name, p.id)}`} value={p.h} min={0} max={359} sat={p.s} light={50} onChange={h => actions.setSwatch(p.id, { h })} />
              <Range label={`Saturation of ${label(p.name, p.id)}`} value={p.s} min={0} max={100} onChange={s => actions.setSwatch(p.id, { s })} />
            </div>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete swatch ${label(p.name, p.id)}`} title="Delete the swatch (slots that used it go gray)" disabled={state.palette.length <= 1} onClick={() => actions.removeSwatch(p.id)}><TrashIcon size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={state.palette.length >= LIMITS.paletteMax} title={state.palette.length >= LIMITS.paletteMax ? `A palette may have at most ${LIMITS.paletteMax} swatches` : 'A new swatch'} onClick={actions.addSwatch}><PlusIcon size={12} /> Add a swatch</button>
        <span className={`cmCount${state.palette.length >= LIMITS.paletteMax ? ' cmCount--warn' : ''}`} title="Swatches">{state.palette.length} of {LIMITS.paletteMax}</span>
        <button type="button" className="cmBtn cmBtn--small" disabled={unchanged} title="Keep this palette as the one new characters start with" onClick={actions.saveStarter}><SaveIcon size={12} /> Use as the starter palette</button>
        <button type="button" className="cmBtn cmBtn--small" disabled={unchanged} title="Put the test palette back to the starter palette" onClick={actions.resetPalette}><RestoreIcon size={12} /> Start over from the starter palette</button>
      </div>
    </section>
  )
}

// ---- the slots of the model ----

function ColourEditor({ slot, colour, genres, actions }: { slot: ModelSlot; colour: ModelColour; genres: Array<{ id: string; name: string }>; actions: ColourActions }) {
  const [h, s, l] = hexHsl(colour.hex)
  const set = (nh: number, ns: number, nl: number) => actions.setColourHex(slot.id, colour.id, hslHex(nh, ns, nl))
  return (
    <div className="cmColourEditor" role="group" aria-label={`Edit colour ${label(colour.name, colour.hex)}`}>
      <label className="cmField">
        <span>Name</span>
        <input value={colour.name} maxLength={NAME_MAX} aria-label={`Name of colour ${label(colour.name, colour.hex)}`} placeholder={colour.hex} onChange={e => actions.renameColour(slot.id, colour.id, e.target.value)} />
      </label>
      <span className="cmHueLabel" aria-hidden="true">Hue of the colour {Math.round(h)}°</span>
      <ColorRange label="Hue of the colour" value={h} min={0} max={359} sat={Math.max(s, 20)} light={Math.min(Math.max(l, 25), 75)} onChange={v => set(v, s, l)} />
      <Range label="Saturation of the colour" value={s} min={0} max={100} onChange={v => set(h, v, l)} />
      <Range label="Lightness of the colour" value={l} min={0} max={100} onChange={v => set(h, s, v)} />
      {genres.length > 0 && (
        <div className="cmChips" role="group" aria-label="Genres the colour fits (none: every genre)">
          {genres.map(g => { const on = colour.genres.includes(g.id); return <button key={g.id} type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on} onClick={() => actions.toggleColourGenre(slot.id, colour.id, g.id)}>{label(g.name, 'Untitled genre')}</button> })}
        </div>
      )}
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" aria-label={`Delete colour ${label(colour.name, colour.hex)}`} onClick={() => actions.removeColour(slot.id, colour.id)}><TrashIcon size={12} /> Delete the colour</button>
      </div>
    </div>
  )
}

function SlotEditor({ content, slot, open, onToggle, actions }: { content: ModelContent; slot: ModelSlot; open: boolean; onToggle: () => void; actions: ColourActions }) {
  const [edit, setEdit] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const genres = genresOf(content), title = label(slot.name, 'Untitled slot')
  const editing = slot.colours.find(k => k.id === edit)
  const used = content.shapes.filter(s => s.slot === slot.id).length
  return (
    <li className="cmSlot" aria-label={`Slot ${title}`}>
      <div className="cmSlotHead">
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} slot ${title}`} title={open ? 'Close' : 'Open'} onClick={onToggle}>{open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</button>
        <input className="cmSliderName" aria-label={`Name of slot ${title}`} value={slot.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.renameSlot(slot.id, e.target.value)} />
        <span className={`cmCount${slot.colours.length > LIMITS.coloursWarn ? ' cmCount--warn' : ''}`} title="Default colours">{slot.colours.length}</span>
      </div>
      {open && (
        <div className="cmSlotBody">
          <div className="cmSwatches" role="group" aria-label={`Default colours of ${title}`}>
            {slot.colours.map(k => <Swatch key={k.id} hex={k.hex} name={`Edit ${label(k.name, k.hex)}`} on={edit === k.id} title={`${label(k.name, k.hex)}: edit`} onClick={() => setEdit(edit === k.id ? null : k.id)} />)}
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Add a default colour to ${title}`} title={slot.colours.length >= LIMITS.coloursMax ? `A slot may have at most ${LIMITS.coloursMax} default colours` : 'A new default colour'} disabled={slot.colours.length >= LIMITS.coloursMax} onClick={() => actions.addColour(slot.id)}><PlusIcon size={12} /></button>
          </div>
          {editing && <ColourEditor slot={slot} colour={editing} genres={genres} actions={actions} />}
          <Stepper label={`${title} brightness smallest`} value={`${slot.lMin}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'lMin', dir, big)} lowerOff={slot.lMin <= 0} raiseOff={slot.lMin >= slot.lRest} />
          <Stepper label={`${title} brightness at rest`} value={`${slot.lRest}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'lRest', dir, big)} lowerOff={slot.lRest <= slot.lMin} raiseOff={slot.lRest >= slot.lMax} />
          <Stepper label={`${title} brightness largest`} value={`${slot.lMax}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'lMax', dir, big)} lowerOff={slot.lMax <= slot.lRest} raiseOff={slot.lMax >= 100} />
          <Stepper label={`${title} opacity smallest`} value={`${slot.aMin}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'aMin', dir, big)} lowerOff={slot.aMin <= 0} raiseOff={slot.aMin >= slot.aRest} />
          <Stepper label={`${title} opacity at rest`} value={`${slot.aRest}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'aRest', dir, big)} lowerOff={slot.aRest <= slot.aMin} raiseOff={slot.aRest >= slot.aMax} />
          <Stepper label={`${title} opacity largest`} value={`${slot.aMax}%`} onStep={(dir, big) => actions.stepSlot(slot.id, 'aMax', dir, big)} lowerOff={slot.aMax <= slot.aRest} raiseOff={slot.aMax >= 100} />
          {confirm ? (
            <span className="cmConfirm" role="group" aria-label={`Delete slot ${title}?`}>
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(false); actions.removeSlot(slot.id) }}>Delete the slot</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(false)}>Keep it</button>
              <small>{used === 0 ? 'No shape uses it.' : `${used} shape${used === 1 ? '' : 's'} will go gray.`}</small>
            </span>
          ) : <button type="button" className="cmBtn cmBtn--small" aria-label={`Delete slot ${title}`} onClick={() => setConfirm(true)}><TrashIcon size={12} /> Delete the slot</button>}
        </div>
      )}
    </li>
  )
}

function Slots({ content, actions }: { content: ModelContent; actions: ColourActions }) {
  const [open, setOpen] = useState<string | null>(null)
  const slots = slotsOf(content)
  const missing = standardSlots().some(s => !slots.some(x => x.id === s.id))
  return (
    <section className="cmSec" aria-label="Slots of the model">
      <h3 className="cmInsSub">Slots of the model</h3>
      <p className="cmInsText">A slot is a kind of colour (skin, hair, an eye): the default colours offered for it and how bright and how opaque a colour in it may be. Shapes pick a slot above.</p>
      {slots.length > 0 && <ul className="cmPlain cmSlots">{slots.map(s => <SlotEditor key={s.id} content={content} slot={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} actions={actions} />)}</ul>}
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={slots.length >= LIMITS.slotsMax} title={slots.length >= LIMITS.slotsMax ? `A model may have at most ${LIMITS.slotsMax} colour slots` : 'A new slot with no default colour'} onClick={actions.addSlot}><PlusIcon size={12} /> Add a slot</button>
        {missing && <button type="button" className="cmBtn cmBtn--small" title="Skin, Hair, Eye, Lip, Clothing and Shoes with default colours, and the standard genres; what the model has is kept" onClick={actions.addStandard}><PlusIcon size={12} /> Add the standard slots</button>}
        <span className={`cmCount${slots.length > LIMITS.slotsWarn ? ' cmCount--warn' : ''}`} title="Slots of the model">{slots.length} of {LIMITS.slotsMax}</span>
      </div>
    </section>
  )
}

function Genres({ content, actions }: { content: ModelContent; actions: ColourActions }) {
  const genres = genresOf(content)
  return (
    <section className="cmSec" aria-label="Genres of the model">
      <h3 className="cmInsSub">Genres of the model</h3>
      <p className="cmInsText">A default colour says which genres it fits, so a character made for a project of that genre draws its random colours from those only.</p>
      <ul className="cmPlain cmGenres">
        {genres.map(g => (
          <li key={g.id} className="cmGenre">
            <input className="cmSliderName" aria-label={`Name of genre ${label(g.name, g.id)}`} value={g.name} maxLength={SWATCH_NAME_MAX} placeholder="Name" onChange={e => actions.renameGenre(g.id, e.target.value)} />
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete genre ${label(g.name, g.id)}`} title="Delete the genre (colours that fitted it then fit every genre)" onClick={() => actions.removeGenre(g.id)}><TrashIcon size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={genres.length >= LIMITS.genresMax} title={genres.length >= LIMITS.genresMax ? `A model may have at most ${LIMITS.genresMax} genres` : 'A new genre'} onClick={actions.addGenre}><PlusIcon size={12} /> Add a genre</button>
        <span className={`cmCount${genres.length > LIMITS.genresWarn ? ' cmCount--warn' : ''}`} title="Genres of the model">{genres.length} of {LIMITS.genresMax}</span>
      </div>
    </section>
  )
}

export function ColourTab({ content, sel, state, actions }: { content: ModelContent; sel: Selection; state: ColourState; actions: ColourActions }) {
  const [slotPick, setSlotPick] = useState<string | null>(null)
  const shape = sel.kind === 'shape' ? shapeById(content, sel.id) : undefined
  const object = sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'shape' ? objectOfShape(content, sel.id) : undefined
  // an object paints every shape of its own outline (a twin follows its original)
  const shapeIds = shape ? [shape.id] : object ? object.shapes.filter(id => !shapeById(content, id)?.mirrorOf) : []
  const current = shape ? slotOfShape(content, shape) : null
  return (
    <div className="cmTabBody">
      <h2 className="cmInsTitle">Colour</h2>
      <p className="cmInsText">The model is drawn in gray until colours are chosen. Shapes pick a slot; the test character picks a colour for each slot.</p>
      {(shape || object) && <ThisShape content={content} shape={shape} shapeIds={shapeIds} name={label(object?.name ?? '', 'the object')} actions={actions} />}
      <TestColours content={content} state={state} slotId={slotPick ?? current?.id ?? null} onSlot={setSlotPick} actions={actions} />
      <TestPalette content={content} state={state} actions={actions} />
      <Slots content={content} actions={actions} />
      <Genres content={content} actions={actions} />
    </div>
  )
}
