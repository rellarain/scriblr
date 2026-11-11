import type { ReactNode } from 'react'
import type { CharacterFigure, ModelContent, ModelFallSide, ModelLayer, ModelRange, ModelSlot } from '../../../../../api/types'
import { paletteOf, swatchHex } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import { FALL_SIDES } from '../../../admin/characters/modelContent'
import { DiceIcon, LockIcon } from '../../../../icons'
import { Field, Slider } from '../CharFields'
import {
  FALL_LABELS, NONE, chooseKind, chooseOption, garmentsIn, groupPartsOf, layersIn, objectPartOf, figurePartOf, pickColour, rollPart, setBrightness, setForm, setMember, setOpacity, setPattern,
  setFall, setWorn, slotViewOf, type FieldsetPart, type Layers, type ObjectPart, type PresetKind, type StateChoice,
} from './figureEditing'
import { setValue, spanOf, valuesOf } from './figureState'

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

function Kinds({ kinds, ctx }: { kinds: PresetKind[]; ctx: Ctx }) {
  return (
    <>
      {kinds.map(k => (
        <Pick
          key={k.key} label={k.label} value={k.value} onChange={id => ctx.apply(f => chooseKind(ctx.copy, f, k, id))}
          options={[...(k.scoped ? [{ id: NONE, name: 'None' }] : []), ...k.presets.map(p => ({ id: p.id, name: p.name }))]}
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

export function FigureStep({ ctx, describe, onForget }: { ctx: Ctx; describe: string; onForget: () => void }) {
  const part = figurePartOf(ctx.copy, ctx.figure)
  return (
    <div className="charStep">
      <p className="charHint">Point at the figure: a sheet shows where each part of it lies. Click a sheet to open it, then click the part you want to change.</p>
      {part.kinds.length > 0 && <div className="charStepGrid"><Kinds kinds={part.kinds} ctx={ctx} /></div>}
      <Ranges ranges={part.sliders} ctx={ctx} />
      <Fieldsets parts={part.fieldsets} ctx={ctx} />
      <div className="charMannequin" role="group" aria-label="Mannequin">
        <h4 className="charLabel">Mannequin</h4>
        <p className="charHint">{describe}</p>
        <div className="charRow">
          <button type="button" className="charChip" aria-label="Go back to the portrait" title="Stop using the mannequin: the character is drawn from its portrait again" onClick={onForget}>Use the portrait instead</button>
        </div>
        <p className="charHint">The portrait is kept, and is what shows if the mannequin is put away.</p>
      </div>
    </div>
  )
}

// ---- step 1: a region of the card ----

const LAYER_NAMES: Record<ModelLayer, string> = { body: 'Body', clothing: 'Clothing', hair: 'Hair' }

export function RegionStep({ ctx, regionId, regionName, layers, onLayers }: { ctx: Ctx; regionId: string; regionName: string; layers: Layers; onLayers: (l: Layers) => void }) {
  const groups = groupPartsOf(ctx.copy, ctx.figure, regionId)
  const garments = garmentsIn(ctx.copy, ctx.figure, regionId)
  const here = layersIn(ctx.copy, ctx.figure, regionId)
  return (
    <div className="charStep">
      <Title>{regionName}</Title>
      {groups.map(g => (
        <section key={g.group.id} className="charStepGroup" role="group" aria-label={g.group.name}>
          <Title roll={<Roll ctx={ctx} id={g.group.id} name={g.group.name} />}>{g.group.name}</Title>
          <div className="charStepGrid"><Kinds kinds={g.kinds} ctx={ctx} /><States groupId={g.group.id} states={g.states} ctx={ctx} /></div>
          <Ranges ranges={g.sliders} ctx={ctx} />
          <Fieldsets parts={g.fieldsets} ctx={ctx} />
        </section>
      ))}
      {garments.length > 0 && (
        <section className="charStepGroup" role="group" aria-label="Clothing">
          <Title>Clothing</Title>
          {garments.map(g => <Toggle key={g.object.id} label={`${g.name} worn`} on={g.worn} onChange={on => ctx.apply(f => setWorn(ctx.copy, f, g.object.id, on))} />)}
        </section>
      )}
      {here.length > 1 && (
        <div className="charRow" role="group" aria-label="Pick from">
          <span className="charLabel">Pick from</span>
          {here.map(l => <button key={l} type="button" className="charChip" aria-pressed={layers[l]} title={`${layers[l] ? 'Hide' : 'Show'} the ${LAYER_NAMES[l].toLowerCase()} on the card to reach what is under it`} onClick={() => onLayers({ ...layers, [l]: !layers[l] })}>{LAYER_NAMES[l]}</button>)}
        </div>
      )}
      {groups.length === 0 && garments.length === 0 && <p className="charHint">Click a part of the figure to change it.</p>}
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

export function ObjectStep({ ctx, part }: { ctx: Ctx; part: ObjectPart }) {
  const { copy, apply } = ctx
  const { object, owner } = part
  return (
    <div className="charStep" role="group" aria-label={object.name}>
      <Title roll={<Roll ctx={ctx} id={owner.id} name={object.name} />}>{object.name}</Title>
      {object !== owner && <p className="charHint">{object.name} mirrors {owner.name}: a change here changes both.</p>}
      {part.worn !== null && <Toggle label="Worn" on={part.worn} onChange={on => apply(f => setWorn(copy, f, owner.id, on))} />}
      <div className="charStepGrid">
        {part.family && (
          <Pick
            label={part.family.klass.name} value={part.family.value} options={part.family.members.map(m => ({ id: m.id, name: m.name }))}
            onChange={id => { apply(f => setMember(f, part.family!.klass, id)); ctx.onObject(id) }}
          />
        )}
        <Kinds kinds={part.kinds} ctx={ctx} />
        {part.axes.map(({ axis, value }) => (
          <Pick key={axis.id} label={axis.name} value={value} options={axis.options.map(o => ({ id: o.id, name: o.name }))} onChange={id => apply(f => setForm(f, owner.id, axis, id))} />
        ))}
        {part.falls && <Pick label="Where it falls" value={ctx.figure.fall} options={FALL_SIDES.map(s => ({ id: s, name: FALL_LABELS[s] }))} onChange={id => apply(f => setFall(f, id as ModelFallSide))} />}
      </div>
      <Ranges ranges={part.sliders} ctx={ctx} />
      <Fieldsets parts={part.fieldsets} ctx={ctx} />
      {part.patterns.map(({ pattern, on }) => <Toggle key={pattern.id} label={pattern.name.trim() || 'Pattern'} on={on} onChange={next => apply(f => setPattern(f, pattern.id, next))} />)}
      {part.slots.map(slot => <SlotBlock key={slot.id} ctx={ctx} objectId={object.id} slot={slot} />)}
    </div>
  )
}

// The part of an object (null when the model has no such object, which can only be a part that was picked before the figure changed model).
export const partOf = (ctx: Ctx, objectId: string): ObjectPart | null => objectPartOf(ctx.copy, ctx.figure, objectId)
