import { useState, type DragEvent, type ReactNode } from 'react'
import type { PlotCustomFieldDef, PlotFieldKind, PlotNode } from '../../../api/types'
import { GripIcon, LockIcon, PlusIcon } from '../../icons'
import type { PlotDrag, PlotUi } from './FieldBlocks'
import { fieldHasValues, optionUse } from './plotAnswers'
import { valueLook } from './plotCardColors'
import { TITLE_MAX, valuesIn, type FieldInfo } from './plotFields'
import { FIELD_KINDS, KIND_LABEL, MAX_OPTIONS, OPTION_LABEL_MAX, hasOptions, kindOf, optionsOf } from './plotKinds'
import { placedCount } from './plotPlacement'
import { nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import type { WriterWorkspace } from './useWriterWorkspace'

// The body of a multi-select, dropdown or short-text field (plotKinds.ts, plotAnswers.ts): for the node that defines it, the options to choose
// from; for every node that answers it, the answer. An answer is a plotpoint (it wears the category's colours like a value card, is dragged onto
// a chapter by its grip, and counts how often it is placed). A plotline shows the answer of the node that defines the field, read-only, above
// its own. Taking away an answer that is placed asks first, since its places go with it.

const placesGo = (n: number) => (n === 1 ? 'Its place goes too.' : `Its ${n} places go too.`)

type Grip = { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }

function Counter({ n }: { n: number }) {
  if (n === 0) return null
  const text = `Placed ${n === 1 ? 'once' : `${n} times`}`
  return <span className="wrCount" title={text} aria-label={text}>×{n}</span>
}

// The question that stands in for a control while an answer that is placed is being taken away.
function AskBar({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="wrConfirm wrConfirm--dark" role="alertdialog" aria-label={message}>
      <span className="wrConfirmText">{message}</span>
      <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={onConfirm}>Confirm</button>
      <button type="button" className="wrSmallBtn" onClick={onCancel}>Cancel</button>
    </span>
  )
}

// One answer as a plotpoint card: a grip (when it can be dragged), what it says, how often it is placed, and a lock when it is read-only.
function AnswerCard({ w, answer, drag, dragging, lock, children }: {
  w: WriterWorkspace
  answer: PlotNode
  drag?: Grip
  dragging?: boolean
  // Why it cannot be changed here (the answer of the node that defines the field, seen from a plotline).
  lock?: string
  children?: ReactNode
}) {
  const placed = placedCount(answer, new Map(w.outlineNodes.map(n => [n.id, n])))
  const highlighted = w.highlightedPointId === answer.id
  return (
    <span
      className={`wrPlotValue wrPlotValue--answer${placed === 0 ? '' : ' wrPlotValue--assigned'}${dragging ? ' wrPlotValue--dragging' : ''}${highlighted ? ' wrPlotValue--highlight' : ''}`}
      data-point={answer.id} style={valueLook(answer, w.plotNodeById)}
    >
      {drag && (
        <span className="wrGrip wrPlotValueGrip" draggable {...drag} aria-label="Drag plotpoint" title="Drag onto a chapter">
          <GripIcon size={14} />
        </span>
      )}
      {children ?? <span className="wrAnswerLabel">{answer.title}</span>}
      <Counter n={placed} />
      {lock && <span className="wrPlotValueLock" title={lock}><LockIcon size={14} /></span>}
    </span>
  )
}

// ---- the field's kind and options (the node that defines the field) ----

export function KindSelect({ w, owner, def, ui }: { w: WriterWorkspace; owner: PlotNode; def: PlotCustomFieldDef; ui: PlotUi }) {
  const locked = fieldHasValues(w.plotNodes, def.id)
  return (
    <select
      className="wrSelect" aria-label={`Kind of ${def.name || 'field'}`} value={kindOf(def)} disabled={locked}
      title={locked ? 'A field keeps its kind once it has values.' : 'What this field holds'}
      onChange={e => { w.setPlotFieldKind(owner.id, def.id, e.target.value as PlotFieldKind); ui.setOpen(def.id, true) }}
    >
      {FIELD_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </select>
  )
}

// The options of a multi-select or dropdown, as chips: renamed in place, reordered by their grips (or Alt + arrow keys), removed with x (which
// asks first when answers use the option), and added at the end.
function OptionsEditor({ w, owner, def }: { w: WriterWorkspace; owner: PlotNode; def: PlotCustomFieldDef }) {
  const options = optionsOf(def)
  const [draft, setDraft] = useState('')
  const [taken, setTaken] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const full = options.length >= MAX_OPTIONS

  function add() {
    if (!draft.trim()) return
    if (w.addPlotOption(owner.id, def.id, draft)) { setDraft(''); setTaken(false) } else setTaken(true)
  }
  // An option left blank is dropped when nothing answers with it, and named otherwise.
  function blur(id: string, label: string) {
    if (label.trim() !== '') { if (label !== label.trim()) w.renamePlotOption(owner.id, def.id, id, label.trim()); return }
    if (optionUse(w.plotNodes, def.id, id, outlineById).answers === 0) w.removePlotOption(owner.id, def.id, id)
    else w.renamePlotOption(owner.id, def.id, id, 'Untitled option')
  }
  function remove(id: string) {
    if (optionUse(w.plotNodes, def.id, id, outlineById).answers === 0) w.removePlotOption(owner.id, def.id, id)
    else setAsking(id)
  }
  const askedFor = asking ? options.find(o => o.id === asking) : undefined
  const use = askedFor ? optionUse(w.plotNodes, def.id, askedFor.id, outlineById) : null

  return (
    <div className="wrOptionsBlock">
      <div className="wrOptions" role="group" aria-label={`Options of ${def.name || 'field'}`}>
        {options.map((o, i) => (
          <span
            key={o.id} className={`wrOption${dragging === o.id ? ' wrOption--dragging' : ''}`}
            onDragOver={e => { if (dragging && dragging !== o.id) e.preventDefault() }}
            onDrop={e => { if (!dragging) return; e.preventDefault(); w.movePlotOption(owner.id, def.id, dragging, o.id); setDragging(null) }}
          >
            <span
              className="wrGrip" draggable aria-label="Drag to reorder options" title="Drag to reorder"
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.id); setDragging(o.id) }}
              onDragEnd={() => setDragging(null)}
            >
              <GripIcon size={12} />
            </span>
            <input
              className="wrOptionInput" value={o.label} maxLength={OPTION_LABEL_MAX} size={Math.max(4, o.label.length + 1)} aria-label={`Option ${i + 1} of ${def.name || 'field'}`}
              onChange={e => w.renamePlotOption(owner.id, def.id, o.id, e.target.value)} onBlur={e => blur(o.id, e.target.value)}
              onKeyDown={e => {
                if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
                e.preventDefault()
                const before = e.key === 'ArrowLeft' ? options[i - 1]?.id : options[i + 2]?.id ?? null
                if (e.key === 'ArrowLeft' ? i > 0 : i < options.length - 1) w.movePlotOption(owner.id, def.id, o.id, before ?? null)
              }}
            />
            <button type="button" className="wrOptionX" aria-label={`Remove option ${o.label}`} onClick={() => remove(o.id)}>×</button>
          </span>
        ))}
        <span
          className="wrOptionAdd"
          onDragOver={e => { if (dragging) e.preventDefault() }}
          onDrop={e => { if (!dragging) return; e.preventDefault(); w.movePlotOption(owner.id, def.id, dragging, null); setDragging(null) }}
        >
          <input
            value={draft} placeholder="Add option…" aria-label="Add option" maxLength={OPTION_LABEL_MAX} disabled={full}
            title={full ? `A field can have ${MAX_OPTIONS} options` : undefined}
            onChange={e => { setDraft(e.target.value); setTaken(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />
          <button type="button" aria-label="Add the option" disabled={full || !draft.trim()} onClick={add}><PlusIcon size={12} /></button>
        </span>
      </div>
      {taken && <p className="wrHint" role="note">That option is there already.</p>}
      {askedFor && use && (
        <AskBar
          message={`Remove ${askedFor.label}? ${use.answers === 1 ? '1 answer uses it' : `${use.answers} answers use it`}${use.placements > 0 ? ` and ${use.placements === 1 ? 'its place goes' : `${use.placements} places go`}` : ''}.`}
          onConfirm={() => { w.removePlotOption(owner.id, def.id, askedFor.id); setAsking(null) }} onCancel={() => setAsking(null)}
        />
      )}
    </div>
  )
}

// ---- the answers (any node that answers the field) ----

function MultiAnswer({ w, def, holder, drag }: { w: WriterWorkspace; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag }) {
  const [asking, setAsking] = useState<string | null>(null)
  const mine = valuesIn(w.plotNodes, holder.id, def.id)
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const tick = (optionId: string, answer: PlotNode | undefined, on: boolean) => {
    if (on) { w.togglePlotOption(holder.id, def.id, optionId, true); return }
    if (answer && placedCount(answer, outlineById) > 0) setAsking(optionId)
    else w.togglePlotOption(holder.id, def.id, optionId, false)
  }
  return (
    <div className="wrChoiceList" role="group" aria-label={`${def.name || 'Field'} answers`}>
      {optionsOf(def).map(o => {
        const answer = mine.find(a => a.optionId === o.id)
        const box = <input type="checkbox" className="wrAnswerBox" checked={Boolean(answer)} onChange={e => tick(o.id, answer, e.target.checked)} />
        const placed = answer ? placedCount(answer, outlineById) : 0
        return (
          <div key={o.id} className="wrChoiceRow">
            {answer ? (
              <AnswerCard w={w} answer={answer} drag={drag.valueDrag(answer.id)} dragging={drag.dragId === answer.id}>
                <label className="wrAnswerLabel">{box}<span>{o.label}</span></label>
              </AnswerCard>
            ) : (
              <label className="wrAnswerLabel wrAnswerLabel--off">{box}<span>{o.label}</span></label>
            )}
            {asking === o.id && (
              <AskBar
                message={`Untick ${o.label}? ${placesGo(placed)}`}
                onConfirm={() => { w.togglePlotOption(holder.id, def.id, o.id, false); setAsking(null) }} onCancel={() => setAsking(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DropdownAnswer({ w, def, holder, drag }: { w: WriterWorkspace; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag }) {
  // undefined: not asking; null: asking to clear; an id: asking to change to that option.
  const [asking, setAsking] = useState<string | null | undefined>(undefined)
  const answer = valuesIn(w.plotNodes, holder.id, def.id)[0]
  const placed = answer ? placedCount(answer, new Map(w.outlineNodes.map(n => [n.id, n]))) : 0
  const change = (value: string) => {
    const next = value === '' ? null : value
    if (placed > 0) setAsking(next)
    else w.choosePlotOption(holder.id, def.id, next)
  }
  const target = asking ? optionsOf(def).find(o => o.id === asking) : undefined
  return (
    <div className="wrChoiceList">
      <select className="wrSelect" aria-label={`${def.name || 'Field'} answer`} value={answer?.optionId ?? ''} onChange={e => change(e.target.value)}>
        <option value="">None</option>
        {optionsOf(def).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {asking !== undefined && (
        <AskBar
          message={`${target ? `Change to ${target.label}` : 'Clear the answer'}? ${placesGo(placed)}`}
          onConfirm={() => { w.choosePlotOption(holder.id, def.id, asking); setAsking(undefined) }} onCancel={() => setAsking(undefined)}
        />
      )}
      {answer && <AnswerCard w={w} answer={answer} drag={drag.valueDrag(answer.id)} dragging={drag.dragId === answer.id} />}
    </div>
  )
}

function TextAnswer({ w, def, holder, drag }: { w: WriterWorkspace; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag }) {
  // What is being typed (null: show the answer as it stands). Text is kept as typed; a blank one is not kept, and leaving the field blank
  // takes the answer away unless it is placed (then it stays as it was: it is taken away with the x).
  const [draft, setDraft] = useState<string | null>(null)
  const answer = valuesIn(w.plotNodes, holder.id, def.id)[0]
  const placed = answer ? placedCount(answer, new Map(w.outlineNodes.map(n => [n.id, n]))) : 0
  const change = (text: string) => {
    setDraft(text)
    if (text.trim() !== '') w.setPlotTextAnswer(holder.id, def.id, text)
  }
  function blur() {
    const typed = draft
    setDraft(null)
    if (typed === null) return
    if (typed.trim() === '') { if (answer && placed === 0) w.removePlotAnswer(answer.id); return }
    if (typed !== typed.trim()) w.setPlotTextAnswer(holder.id, def.id, typed.trim())
  }
  const grip = answer ? drag.valueDrag(answer.id) : undefined
  const label = def.name || 'Field'
  return (
    <span
      className={`wrAnswerText${answer ? ' wrPlotValue wrPlotValue--answer' : ''}${answer && placed > 0 ? ' wrPlotValue--assigned' : ''}${answer && drag.dragId === answer.id ? ' wrPlotValue--dragging' : ''}`}
      style={answer ? valueLook(answer, w.plotNodeById) : undefined} data-point={answer?.id}
    >
      {grip && <span className="wrGrip wrPlotValueGrip" draggable {...grip} aria-label="Drag plotpoint" title="Drag onto a chapter"><GripIcon size={14} /></span>}
      <input
        className="wrPointTitle" value={draft ?? answer?.title ?? ''} maxLength={TITLE_MAX} placeholder="Short text" aria-label={`${label} answer`}
        onChange={e => change(e.target.value)} onBlur={blur}
      />
      {answer && <Counter n={placed} />}
      {answer && (
        <DeleteControl
          tone="dark" message={placed > 0 ? `Clear the answer? ${placesGo(placed)}` : 'Clear the answer?'}
          onConfirm={() => { setDraft(null); w.removePlotAnswer(answer.id) }}
        />
      )}
    </span>
  )
}

// What a plotline shows of the answer of the node that defines the field: read-only, with the answer's counter.
function OwnerAnswers({ w, info }: { w: WriterWorkspace; info: FieldInfo }) {
  const answers = valuesIn(w.plotNodes, info.owner.id, info.def.id)
  const scope = `${info.scope.charAt(0).toUpperCase()}${info.scope.slice(1)}`
  return (
    <div className="wrAnswerFrom">
      <span className="wrAnswerWho">{scope}: {nodeLabel(info.owner)}</span>
      {answers.length === 0
        ? <span className="wrMuted">No answer</span>
        : answers.map(a => <AnswerCard key={a.id} w={w} answer={a} lock={`Answered on ${nodeLabel(info.owner)}. Change it there.`} />)}
    </div>
  )
}

export function ChoiceBody({ w, info, holder, editable, drag }: {
  w: WriterWorkspace
  info: FieldInfo
  // The node whose answer is shown and changed: the plotline being edited, or the owner itself.
  holder: PlotNode
  // The field's owner is being edited: its options can be changed.
  editable: boolean
  drag: PlotDrag
}) {
  const { def, owner } = info
  const kind = kindOf(def)
  const inherited = owner.id !== holder.id
  const noOptions = hasOptions(def) && optionsOf(def).length === 0
  return (
    <div className="wrFieldValues wrChoice">
      {editable && hasOptions(def) && <OptionsEditor w={w} owner={owner} def={def} />}
      {inherited && <OwnerAnswers w={w} info={info} />}
      {inherited && <span className="wrAnswerWho">This plotline</span>}
      {noOptions
        ? <p className="wrMuted">{editable ? 'Add the options to choose from.' : 'No options yet. Add them on the node that defines this field.'}</p>
        : kind === 'multi' ? <MultiAnswer w={w} def={def} holder={holder} drag={drag} />
          : kind === 'dropdown' ? <DropdownAnswer w={w} def={def} holder={holder} drag={drag} />
            : <TextAnswer w={w} def={def} holder={holder} drag={drag} />}
    </div>
  )
}
