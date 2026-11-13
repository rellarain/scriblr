import { useEffect, useState } from 'react'
import type { FigureModel } from '../../../../../api/types'
import { PencilIcon, PlusIcon, SaveIcon, SwapIcon, TrashIcon } from '../../../../icons'
import { swatchHex } from '../../../admin/characters/engine/colour'
import { NAME_MAX, SWATCH_NAME_MAX } from '../../../admin/characters/modelContent'
import { Colour, CommitText, Field, Slider } from '../CharFields'
import { SWATCHES } from '../portrait/registry'
import { carryOver } from './figureCarry'
import { addSwatchTo, deleteSwatch, editSwatch, isMine, paletteFor, renameMine, deleteMine, saveMine, setTile, type ObjectPart } from './figureEditing'
import { ensureFigureModel } from './figureModelStore'
import { choiceLabel, getModelChoices, type ModelChoice } from './modelChoices'
import { isOwnModel, ownCopyOf, useOpenMyModel } from './ownModel'
import type { Ctx } from './FigureSteps'

// What belongs to the character, not to the model: its palette and the colour of its card, the model it is drawn from (step 0), and the styles it keeps of its own (a part's step).

const message = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback)

// ---- the palette ----

export function PaletteEditor({ ctx }: { ctx: Ctx }) {
  const { copy, figure, apply } = ctx
  const palette = paletteFor(copy, figure)
  const [problem, setProblem] = useState('')
  return (
    <div className="charPalette" role="group" aria-label="Palette">
      <div className="charStepHead">
        <h4 className="charLabel">Palette</h4>
        <button
          type="button" className="charIconBtn" aria-label="Add a swatch" title="Add a swatch to the palette" disabled={palette.length >= 10}
          onClick={() => { const made = addSwatchTo(copy, figure); if (typeof made === 'string') setProblem(made); else { setProblem(''); apply(() => made) } }}
        ><PlusIcon size={16} /></button>
      </div>
      <p className="charHint">The swatches this character's colours can be taken from. Change one and every colour that uses it changes with it.</p>
      {problem && <p className="charHint" role="alert">{problem}</p>}
      {palette.map(sw => (
        <div key={sw.id} className="charSwatchRow" role="group" aria-label={sw.name}>
          <div className="charRow">
            <span className="charSwatch charSwatch--static" style={{ background: swatchHex(sw, 50) }} aria-hidden="true" />
            <CommitText label={`Name of ${sw.name}`} value={sw.name} max={SWATCH_NAME_MAX} onCommit={name => apply(f => editSwatch(copy, f, sw.id, { name }))} />
            <button type="button" className="charIconBtn" aria-label={`Delete ${sw.name}`} title="Delete this swatch: the colours that use it go gray" disabled={palette.length <= 1} onClick={() => apply(f => deleteSwatch(copy, f, sw.id))}><TrashIcon size={14} /></button>
          </div>
          <Slider label={`${sw.name} hue`} value={sw.h} min={0} max={359} step={1} format={x => `${x}°`} onChange={h => apply(f => editSwatch(copy, f, sw.id, { h }), `figure.palette.${sw.id}.h`)} />
          <Slider label={`${sw.name} saturation`} value={sw.s} min={0} max={100} step={1} format={x => `${x}%`} onChange={s => apply(f => editSwatch(copy, f, sw.id, { s }), `figure.palette.${sw.id}.s`)} />
        </div>
      ))}
    </div>
  )
}

// ---- the colour of the card ----

export function CardColour({ ctx }: { ctx: Ctx }) {
  return (
    <Field label="Card colour">
      <Colour label="Card colour" value={ctx.figure.tile} swatches={SWATCHES.tile} onChange={v => { if (v) ctx.apply(f => setTile(f, v), 'figure.tile') }} />
    </Field>
  )
}

// ---- using another model ----

// Every published model, and the one this figure is drawn from marked (a newer version of it as such). Pressing Use copies the model into the project (a copy that is there already is
// used) and carries over what the figure has chosen that the model has too; Undo brings the old model back. Nothing is asked, and nothing is said: the copy is the character's.
export function OtherModel({ projectId, model, ctx }: { projectId: string; model: FigureModel; ctx: Ctx }) {
  const [models, setModels] = useState<ModelChoice[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    let live = true
    getModelChoices().then(list => { if (live) setModels(list) }).catch(() => { if (live) { setModels([]); setProblem('The models could not be loaded.') } })
    return () => { live = false }
  }, [])
  if (models === null) return <p className="charHint" role="status">Looking for models…</p>
  if (models.length === 0) return problem ? <p className="charHint" role="alert">{problem}</p> : null
  const pick = models.find(m => m.id === chosen) ?? models.find(m => m.id === model.modelId) ?? models[0]
  const same = pick.id === model.modelId
  const inUse = same && pick.version === model.version
  const tag = (m: ModelChoice): string => (m.id === model.modelId ? (m.version === model.version ? ' (in use)' : m.version > model.version ? ' (newer version)' : '') : '')

  async function use() {
    setBusy(true)
    setProblem('')
    try {
      const made = await ensureFigureModel(projectId, { modelId: pick.id })
      ctx.apply(f => carryOver(made.content, f, made.id))
    } catch (err) {
      setProblem(message(err, 'The model could not be used.'))
    }
    setBusy(false)
  }

  return (
    <div className="charRow" role="group" aria-label="Another model">
      <select className="charSelect charSelect--auto" aria-label="Model to use" title="A published model to draw this character from" value={pick.id} onChange={e => setChosen(e.target.value)}>
        {models.map(m => <option key={m.id} value={m.id}>{`${choiceLabel(m)}${tag(m)}`}</option>)}
      </select>
      <button type="button" className="charChip" disabled={busy || inUse} title="Draw the character from this model: what it has under the same name is kept" onClick={() => { void use() }}><SwapIcon size={14} /> Use this model</button>
      {problem && <p className="charHint" role="alert">{problem}</p>}
    </div>
  )
}

// ---- editing the model ----

// Opens the model this figure is drawn from in My models, to change it. A model of the writer's own opens as it is; one of Scriblr's is copied first, as a draft of their own (the
// character keeps drawing from its own copy until they publish the new model and choose it with Use this model).
export function EditModel({ model }: { model: FigureModel }) {
  const open = useOpenMyModel()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!open) return null
  const own = isOwnModel(model.modelId)
  async function edit() {
    setBusy(true)
    setProblem('')
    try {
      open!(await ownCopyOf(model))
    } catch (err) {
      setProblem(message(err, 'The model could not be opened.'))
    }
    setBusy(false)
  }
  return (
    <div role="group" aria-label="Edit the model">
      <div className="charRow">
        <button
          type="button" className="charChip" disabled={busy}
          title={own ? 'Open this model in My models' : 'Make a copy of this model in My models, a draft of your own to change'} onClick={() => { void edit() }}
        ><PencilIcon size={14} /> Edit this model</button>
      </div>
      <p className="charHint">{own ? 'This model is one of yours: it opens in My models.' : 'Makes a copy of it in My models. Publish it there, then choose it above with Use this model.'}</p>
      {problem && <p className="charHint" role="alert">{problem}</p>}
    </div>
  )
}

// ---- my styles ----

// Under a part's styles: keep what is chosen for the part as a style of the character's own (typed name), and, while one of them is the style that is on, rename it or delete it.
export function MineBlock({ ctx, part }: { ctx: Ctx; part: ObjectPart }) {
  const { copy, figure, apply } = ctx
  const [name, setName] = useState('')
  const [problem, setProblem] = useState('')
  const on = part.kinds.map(k => k.presets.find(p => p.id === k.value)).find(p => !!p && isMine(figure, p.id))
  const save = () => {
    const made = saveMine(copy, figure, part.owner.id, name)
    if (typeof made === 'string') { setProblem(made); return }
    setProblem('')
    setName('')
    apply(() => made)
  }
  return (
    <div className="charMine" role="group" aria-label="My styles">
      <div className="charRow">
        <input
          type="text" className="charInput charInput--inline" aria-label="Name for my style" title="A name for the style (my style 1, 2... when empty)" placeholder="My style" maxLength={NAME_MAX} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }}
        />
        <button type="button" className="charIconBtn" aria-label="Save as my style" title={`Keep what is chosen for ${part.object.name} as a style of this character's own`} onClick={save}><SaveIcon size={16} /></button>
      </div>
      {problem && <p className="charHint" role="alert">{problem}</p>}
      {on && (
        <div className="charRow">
          <CommitText label="Name of my style" value={on.name} max={NAME_MAX} onCommit={next => apply(f => renameMine(f, on.id, next))} />
          <button type="button" className="charIconBtn" aria-label="Delete my style" title={`Delete ${on.name}`} onClick={() => apply(f => deleteMine(f, on.id))}><TrashIcon size={14} /></button>
        </div>
      )}
    </div>
  )
}
