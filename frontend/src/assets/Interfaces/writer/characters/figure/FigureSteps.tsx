import { useState, type ReactNode } from 'react'
import type { CharacterFigure, FigureModel, ModelAxis, ModelContent, ModelFallSide, ModelLayer, ModelRange, ModelSlot } from '../../../../../api/types'
import { paletteOf, swatchHex } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import { FALL_SIDES } from '../../../admin/characters/modelContent'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, DiceIcon, LockIcon, UndoIcon } from '../../../../icons'
import { Field, Slider } from '../CharFields'
import {
  FALL_LABELS, NONE, chooseKind, chooseOption, groupPartsOf, isMine, layerListIn, layersIn, lockSheet, moveLayer, objectPartOf, optionalObjects, figurePartOf, pickColour, rollPart, setBrightness, setForm, setLock,
  setMember, setOpacity, setPattern, setFall, setWorn, sheetLocked, slotViewOf, type FieldsetPart, type Layers, type MovableLayer, type ObjectPart, type PresetKind, type StateChoice,
} from './figureEditing'
import { CardColour, MineBlock, OtherModel, PaletteEditor } from './FigureSettings'
import { cropAround, kindCrop } from './figurePictures'
import { setValue, spanOf, valuesOf } from './figureState'
import { PictureSelect } from './PictureSelect'

// The controls under the card, one step at a time: the figure as a whole (step 0), what a sheet of the card holds (step 1: its groups, and the clothes worn there) and one part of it
// (step 2: a part's forms, sliders, colours and what else the model lets a writer change). Everything offered is read from the model copy by figureEditing.ts; a change is a function
// of the figure, handed to `apply` (a slider or a colour moved several times in a row is one step of the character's undo: it gives the group they share).

export type Apply = (op: (f: CharacterFigure) => CharacterFigure, group?: string) => void
export interface Ctx { copy: ModelContent; figure: CharacterFigure; apply: Apply; onObject: (id: string) => void }

const seed = (): number => Math.floor(Math.random() * 0x100000000)
const shown = (v: number, unit: string): string => `${Math.round(v * 10) / 10}${unit}`
// Words in a list: "hue", "hue and saturation", "hue, saturation and lightness".
const sentence = (items: readonly string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

// ---- small controls ----

function Pick({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (id: string) => void }) {
  return (
    <Field label={label}>
      <select className="charSelect" aria-label={label} title={label} value={value} onChange={e => onChange(e.target.value)}>
        {value === '' && <option value="" disabled>Custom</option>}
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Field>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="charCheck">
      <input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function Roll({ ctx, id, name }: { ctx: Ctx; id: string; name: string }) {
  return (
    <button
      type="button" className="charIconBtn charDice" aria-label={`Randomise ${name}`} title={`Randomise ${name} only: new choices within the genre; the rest of the figure stays as it is`}
      onClick={() => ctx.apply(f => rollPart(ctx.copy, f, id, seededRng(seed())))}
    ><DiceIcon size={16} /></button>
  )
}

function Ranges({ ranges, ctx }: { ranges: ModelRange[]; ctx: Ctx }) {
  const values = valuesOf(ctx.copy, ctx.figure)
  return (
    <>
      {ranges.map(r => {
        const [lo, hi] = spanOf(r)
        if (!(lo < hi)) return null
        const step = hi - lo > 60 ? 1 : hi - lo > 6 ? 0.5 : 0.01
        return (
          <Slider
            key={r.id} label={r.name} value={values[r.id] ?? r.rest} min={lo} max={hi} step={step} format={x => shown(x, r.unit)}
            onChange={x => ctx.apply(f => setValue(ctx.copy, f, r.id, x), `figure.value.${r.id}`)}
          />
        )
      })}
    </>
  )
}

// The forms of one axis of a part, as pictures of the part with each form (the part's own place with every form drawn, so the pictures line up).
function Forms({ ctx, ownerId, axis, value, label }: { ctx: Ctx; ownerId: string; axis: ModelAxis; value: string; label?: string }) {
  return (
    <PictureSelect
      label={label ?? axis.name} value={value} options={axis.options.map(o => ({ id: o.id, name: o.name }))} copy={ctx.copy} figure={ctx.figure}
      onChange={id => ctx.apply(f => setForm(f, ownerId, axis, id))} figureFor={id => setForm(ctx.figure, ownerId, axis, id)} crop={figures => cropAround(ctx.copy, figures, ownerId)}
    />
  )
}

// The ready looks of a kind (ages, builds, expressions, hairstyles, a part's styles), as pictures: a part's styles through the part's own place (`around`), the others through the
// frame that suits what the kind is called.
function Kinds({ kinds, ctx, around }: { kinds: PresetKind[]; ctx: Ctx; around?: string }) {
  return (
    <>
      {kinds.map(k => (
        <PictureSelect
          key={k.key} label={k.label} value={k.value} onChange={id => ctx.apply(f => chooseKind(ctx.copy, f, k, id))} copy={ctx.copy} figure={ctx.figure}
          options={[...(k.scoped ? [{ id: NONE, name: 'None' }] : []), ...k.presets.map(p => ({ id: p.id, name: isMine(ctx.figure, p.id) ? `${p.name} (mine)` : p.name }))]}
          figureFor={id => chooseKind(ctx.copy, ctx.figure, k, id)} crop={k.scoped && around ? (figures => cropAround(ctx.copy, figures, around)) : kindCrop(k.label)}
        />
      ))}
    </>
  )
}

function States({ groupId, states, ctx }: { groupId: string; states: StateChoice[]; ctx: Ctx }) {
  return (
    <>
      {states.map(({ state, value }) => (
        <Pick key={state.id} label={state.name} value={value} options={state.options.map(o => ({ id: o.id, name: o.name }))} onChange={id => ctx.apply(f => chooseOption(ctx.copy, f, groupId, state.id, id))} />
      ))}
    </>
  )
}

function Fieldsets({ parts, ctx }: { parts: FieldsetPart[]; ctx: Ctx }) {
  return (
    <>
      {parts.map(({ set, ranges }) => (
        <div key={set.id} className="charStepSet" role="group" aria-label={set.name}>
          <h4 className="charLabel">{set.name}</h4>
          <Ranges ranges={ranges} ctx={ctx} />
        </div>
      ))}
    </>
  )
}

const Title = ({ children, roll }: { children: ReactNode; roll?: ReactNode }) => <div className="charStepHead"><h3 className="charStepTitle">{children}</h3>{roll}</div>

// ---- step 0: the figure ----

// The parts that are off until chosen (a beard, horns, a crown, a necklace), a list for each: they have no box on the card until they show.
function Extras({ ctx }: { ctx: Ctx }) {
  const parts = optionalObjects(ctx.copy).map(o => objectPartOf(ctx.copy, ctx.figure, o.id)).filter((p): p is ObjectPart => p !== null && p.axes.length > 0)
  if (parts.length === 0) return null
  return (
    <div className="charExtras" role="group" aria-label="Extras">
      <h4 className="charLabel">Extras</h4>
      <p className="charHint">Parts that are off until you choose them. Once one is on, point at it on the card to change its colour.</p>
      <div className="charStepGrid">
        {parts.flatMap(p => p.axes.map(({ axis, value }) => <Forms key={`${p.owner.id}.${axis.id}`} ctx={ctx} ownerId={p.owner.id} axis={axis} value={value} />))}
      </div>
    </div>
  )
}

export function FigureStep({ ctx, projectId, model, describe, onForget, onRevert }: { ctx: Ctx; projectId: string; model: FigureModel; describe: string; onForget: () => void; onRevert?: () => Promise<boolean> }) {
  const part = figurePartOf(ctx.copy, ctx.figure)
  const [asking, setAsking] = useState(false)
  return (
    <div className="charStep">
      <p className="charHint">Point at the figure: a sheet shows where each part of it lies. Click a sheet to open it, then click the part you want to change.</p>
      {part.kinds.length > 0 && <div className="charStepGrid"><Kinds kinds={part.kinds} ctx={ctx} /></div>}
      <Ranges ranges={part.sliders} ctx={ctx} />
      <Fieldsets parts={part.fieldsets} ctx={ctx} />
      <Extras ctx={ctx} />
      <PaletteEditor ctx={ctx} />
      <CardColour ctx={ctx} />
      <div className="charMannequin" role="group" aria-label="Mannequin">
        <h4 className="charLabel">Mannequin</h4>
        <p className="charHint">{describe}</p>
        <OtherModel projectId={projectId} model={model} ctx={ctx} />
        {ctx.figure.converted && onRevert ? (
          asking ? (
            <div className="charRow" role="group" aria-label="Back to the old portrait">
              <p className="charHint" role="alert">The mannequin and what was changed on it go, and the story looks and published editions that were converted with it show the old portrait again.</p>
              <button type="button" className="charIconBtn" aria-label="Yes, back to the old portrait" title="Bring the old portrait back" onClick={() => { void onRevert().then(done => { if (!done) setAsking(false) }) }}><CheckIcon size={16} /></button>
              <button type="button" className="charIconBtn" aria-label="Keep the mannequin" title="Keep the mannequin" onClick={() => setAsking(false)}><CloseIcon size={16} /></button>
            </div>
          ) : (
            <div className="charRow">
              <button type="button" className="charChip" aria-label="Back to the old portrait" title="Bring the old portrait back: the mannequin made from it goes" onClick={() => setAsking(true)}><UndoIcon size={14} /> Back to the old portrait</button>
            </div>
          )
        ) : (
          <div className="charRow">
            <button type="button" className="charChip" aria-label="Go back to the portrait" title="Stop using the mannequin: the character is drawn from its portrait again" onClick={onForget}>Use the portrait instead</button>
          </div>
        )}
        <p className="charHint">The portrait is kept, and is what shows if the mannequin is put away.</p>
      </div>
    </div>
  )
}

// ---- step 1: a region of the card ----

const LAYER_NAMES: Record<ModelLayer, string> = { body: 'Body', clothing: 'Clothing', hair: 'Hair' }

// The clothing or the hair of a sheet, the part in front first: put a garment on or take it off, move a part in front of or behind the next one (a part the model keeps in order
// cannot be moved past that one, and the button says why), and open it for its fit and colour.
function LayerList({ ctx, regionId, layer, title }: { ctx: Ctx; regionId: string; layer: MovableLayer; title: string }) {
  const { copy, figure, apply } = ctx
  const rows = layerListIn(copy, figure, regionId, layer)
  if (rows.length === 0) return null
  return (
    <section className="charStepGroup" role="group" aria-label={title}>
      <Title>{title}</Title>
      {rows.map(r => (
        <div key={r.key} className="charLayerRow">
          {r.worn !== null ? <Toggle label={`${r.name} worn`} on={r.worn} onChange={on => apply(f => setWorn(copy, f, r.open.id, on))} /> : <span className="charLayerName">{r.name}</span>}
          <div className="charLayerBtns">
            <button
              type="button" className="charIconBtn" aria-label={`Move ${r.name} in front`} title={r.front ?? `Move ${r.name} in front of the one above it`} disabled={r.front !== null}
              onClick={() => apply(f => moveLayer(copy, f, layer, r.key, 'front', regionId))}
            ><ChevronUpIcon size={14} /></button>
            <button
              type="button" className="charIconBtn" aria-label={`Move ${r.name} behind`} title={r.behind ?? `Move ${r.name} behind the one below it`} disabled={r.behind !== null}
              onClick={() => apply(f => moveLayer(copy, f, layer, r.key, 'behind', regionId))}
            ><ChevronDownIcon size={14} /></button>
            <button type="button" className="charChip" aria-label={`${layer === 'clothing' ? 'Fit and colour' : 'Shape and colour'} of ${r.name}`} onClick={() => ctx.onObject(r.open.id)}>{layer === 'clothing' ? 'Fit and colour' : 'Shape and colour'}</button>
          </div>
        </div>
      ))}
    </section>
  )
}

export function RegionStep({ ctx, regionId, regionName, layers, onLayers }: { ctx: Ctx; regionId: string; regionName: string; layers: Layers; onLayers: (l: Layers) => void }) {
  const groups = groupPartsOf(ctx.copy, ctx.figure, regionId)
  const clothes = layerListIn(ctx.copy, ctx.figure, regionId, 'clothing'), hair = layerListIn(ctx.copy, ctx.figure, regionId, 'hair')
  const here = layersIn(ctx.copy, ctx.figure, regionId)
  return (
    <div className="charStep">
      <Title>{regionName}</Title>
      <Toggle label="Lock all here" on={sheetLocked(ctx.copy, ctx.figure, regionId)} onChange={on => ctx.apply(f => lockSheet(ctx.copy, f, regionId, on))} />
      {groups.map(g => (
        <section key={g.group.id} className="charStepGroup" role="group" aria-label={g.group.name}>
          <Title roll={<Roll ctx={ctx} id={g.group.id} name={g.group.name} />}>{g.group.name}</Title>
          <div className="charStepGrid"><Kinds kinds={g.kinds} ctx={ctx} /><States groupId={g.group.id} states={g.states} ctx={ctx} /></div>
          <Ranges ranges={g.sliders} ctx={ctx} />
          <Fieldsets parts={g.fieldsets} ctx={ctx} />
        </section>
      ))}
      <LayerList ctx={ctx} regionId={regionId} layer="clothing" title="Clothing" />
      <LayerList ctx={ctx} regionId={regionId} layer="hair" title="Hair" />
      {here.length > 1 && (
        <div className="charRow" role="group" aria-label="Pick from">
          <span className="charLabel">Pick from</span>
          {here.map(l => <button key={l} type="button" className="charChip" aria-pressed={layers[l]} title={`${layers[l] ? 'Hide' : 'Show'} the ${LAYER_NAMES[l].toLowerCase()} on the card to reach what is under it`} onClick={() => onLayers({ ...layers, [l]: !layers[l] })}>{LAYER_NAMES[l]}</button>)}
        </div>
      )}
      {groups.length === 0 && clothes.length === 0 && hair.length === 0 && <p className="charHint">Click a part of the figure to change it.</p>}
    </div>
  )
}

// ---- step 2: one part ----

function SlotBlock({ ctx, objectId, slot }: { ctx: Ctx; objectId: string; slot: ModelSlot }) {
  const { copy, figure, apply } = ctx
  const v = slotViewOf(copy, figure, objectId, slot)
  const palette = figure.palette ?? paletteOf(copy)
  const l = v.choice?.l ?? slot.lRest
  const fixed = ([['hue', v.locked.h], ['saturation', v.locked.s], ['lightness', v.locked.l]] as const).filter(([, on]) => on).map(([name]) => name)
  const on = (src: 'colour' | 'swatch', id: string) => v.choice?.src === src && v.choice.id === id
  return (
    <div className="charSlot" role="group" aria-label={`${slot.name} colour`}>
      <h4 className="charLabel">{slot.name}</h4>
      {fixed.length > 0 && <p className="charHint charLocked"><LockIcon size={12} /> The model fixes this colour's {sentence(fixed)}{v.locked.all ? ', so it cannot be changed' : ''}.</p>}
      {slot.colours.length > 0 && (
        <div className="charColour" role="group" aria-label={`${slot.name} defaults`}>
          {slot.colours.map(k => (
            <button
              key={k.id} type="button" className="charSwatch" style={{ background: k.hex }} aria-pressed={on('colour', k.id)} disabled={v.locked.all}
              aria-label={`${slot.name} ${k.name.trim() || k.hex}`} title={k.name.trim() || k.hex} onClick={() => apply(f => pickColour(copy, f, slot.id, 'colour', k.id))}
            />
          ))}
        </div>
      )}
      {palette.length > 0 && slot.colours.length > 0 && <span className="charHint" aria-hidden="true">Palette</span>}
      {palette.length > 0 && (
        <div className="charColour" role="group" aria-label={`${slot.name} from the palette`}>
          {palette.map(sw => (
            <button
              key={sw.id} type="button" className="charSwatch" style={{ background: swatchHex(sw, l) }} aria-pressed={on('swatch', sw.id)} disabled={v.locked.all}
              aria-label={`${slot.name} palette ${sw.name}`} title={`Palette: ${sw.name}`} onClick={() => apply(f => pickColour(copy, f, slot.id, 'swatch', sw.id))}
            />
          ))}
        </div>
      )}
      <Slider
        label={`${slot.name} brightness`} value={Math.round(v.resolved.l)} min={v.brightness[0]} max={v.brightness[1]} step={1} format={x => `${x}%`} disabled={v.locked.l || !v.choice}
        hint={v.locked.l ? 'The model fixes this lightness' : !v.choice ? 'Choose a colour first' : undefined} onChange={x => apply(f => setBrightness(copy, f, slot.id, x), `figure.colour.${slot.id}.l`)}
      />
      {v.opacity && (
        <Slider
          label={`${slot.name} opacity`} value={Math.round(v.resolved.a * 100)} min={v.opacity[0]} max={v.opacity[1]} step={1} format={x => `${x}%`} disabled={!v.choice}
          hint={!v.choice ? 'Choose a colour first' : undefined} onChange={x => apply(f => setOpacity(copy, f, slot.id, x), `figure.colour.${slot.id}.a`)}
        />
      )}
    </div>
  )
}

// A part is locked: Randomise (the whole figure's and the part's own) leaves it as it is. The lock is kept on the part, and a twin has its original's.
function LockButton({ ctx, part }: { ctx: Ctx; part: ObjectPart }) {
  const name = part.object.name
  return (
    <button
      type="button" className="charIconBtn charLock" aria-pressed={part.locked} aria-label={`Lock ${name}`}
      title={part.locked ? `${name} is locked: Randomise leaves it as it is` : `Lock ${name}: Randomise leaves it as it is`} onClick={() => ctx.apply(f => setLock(ctx.copy, f, part.owner.id, !part.locked))}
    ><LockIcon size={16} /></button>
  )
}

export function ObjectStep({ ctx, part }: { ctx: Ctx; part: ObjectPart }) {
  const { copy, apply } = ctx
  const { object, owner } = part
  const varies = part.axes.length + part.sliders.length + part.fieldsets.length + part.patterns.length > 0 || !!part.family || part.falls
  return (
    <div className="charStep" role="group" aria-label={object.name}>
      <Title roll={<span className="charStepTools"><LockButton ctx={ctx} part={part} /><Roll ctx={ctx} id={owner.id} name={object.name} /></span>}>{object.name}</Title>
      {object !== owner && <p className="charHint">{object.name} mirrors {owner.name}: a change here changes both.</p>}
      {part.worn !== null && <Toggle label="Worn" on={part.worn} onChange={on => apply(f => setWorn(copy, f, owner.id, on))} />}
      <div className="charStepGrid">
        {part.family && (
          <Pick
            label={part.family.klass.name} value={part.family.value} options={part.family.members.map(m => ({ id: m.id, name: m.name }))}
            onChange={id => { apply(f => setMember(f, part.family!.klass, id)); ctx.onObject(id) }}
          />
        )}
        <Kinds kinds={part.kinds} ctx={ctx} around={owner.id} />
        {part.axes.map(({ axis, value }) => <Forms key={axis.id} ctx={ctx} ownerId={owner.id} axis={axis} value={value} />)}
        {part.falls && <Pick label="Where it falls" value={ctx.figure.fall} options={FALL_SIDES.map(s => ({ id: s, name: FALL_LABELS[s] }))} onChange={id => apply(f => setFall(f, id as ModelFallSide))} />}
      </div>
      {varies && <MineBlock ctx={ctx} part={part} />}
      <Ranges ranges={part.sliders} ctx={ctx} />
      <Fieldsets parts={part.fieldsets} ctx={ctx} />
      {part.patterns.map(({ pattern, on }) => <Toggle key={pattern.id} label={pattern.name.trim() || 'Pattern'} on={on} onChange={next => apply(f => setPattern(f, pattern.id, next))} />)}
      {part.slots.map(slot => <SlotBlock key={slot.id} ctx={ctx} objectId={object.id} slot={slot} />)}
    </div>
  )
}

// The part of an object (null when the model has no such object, which can only be a part that was picked before the figure changed model).
export const partOf = (ctx: Ctx, objectId: string): ObjectPart | null => objectPartOf(ctx.copy, ctx.figure, objectId)
