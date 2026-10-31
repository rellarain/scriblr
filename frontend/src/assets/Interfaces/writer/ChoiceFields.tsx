import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { PlotCustomFieldDef, PlotFieldKind, PlotNode } from '../../../api/types'
import { GripIcon, PlusIcon } from '../../icons'
import type { PlotDrag, PlotUi } from './FieldBlocks'
import { fieldHasValues, optionUse } from './plotAnswers'
import { valueLook } from './plotCardColors'
import { TITLE_MAX, valuesIn, type FieldInfo } from './plotFields'
import { FIELD_KINDS, KIND_LABEL, MAX_OPTIONS, OPTION_LABEL_MAX, hasOptions, kindOf, optionsOf } from './plotKinds'
import { placedCount } from './plotPlacement'
import { nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import { slideStyle, useChipDrop } from './useChipDrop'
import { useFieldGroupDrop } from './useFieldGroupDrop'
import type { WriterWorkspace } from './useWriterWorkspace'

// The body of a multi-select, dropdown or short-text field (plotKinds.ts, plotAnswers.ts): for the node that defines it, the options to choose
// from; for every node that answers it, the answer. An answer is a plotpoint (it wears the category's colours like a value card, is dragged onto
// a chapter by its grip, and counts how often it is placed). A plotline shows the answer of the node that defines the field, read-only, above
// its own. Taking away an answer that is placed asks first, since its places go with it.

const placesGo = (n: number) => (n === 1 ? 'Its place goes too.' : `Its ${n} places go too.`)

type Grip = { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }

// The grip that drags an answer onto a chapter, where that is offered.
const valueGrip = (drag: PlotDrag, id: string) => (drag.noPlacing ? undefined : drag.valueDrag(id))

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

// One answer as a plotpoint card: a grip (when it can be dragged), what it says and how often it is placed.
function AnswerCard({ w, answer, drag, dragging, hint, children }: {
  w: WriterWorkspace
  answer: PlotNode
  drag?: Grip
  dragging?: boolean
  // Said on hover: why it cannot be changed here (the answer of the node that defines the field, seen from a plotline).
  hint?: string
  children?: ReactNode
}) {
  const placed = placedCount(answer, new Map(w.outlineNodes.map(n => [n.id, n])))
  const highlighted = w.highlightedPointId === answer.id
  return (
    <span
      className={`wrPlotValue wrPlotValue--answer${placed === 0 ? '' : ' wrPlotValue--assigned'}${dragging ? ' wrPlotValue--dragging' : ''}${highlighted ? ' wrPlotValue--highlight' : ''}`}
      data-point={answer.id} style={valueLook(answer, w.plotNodeById)} title={hint}
    >
      {drag && (
        <span className="wrGrip wrPlotValueGrip" draggable {...drag} aria-label="Drag plotpoint" title="Drag onto a chapter">
          <GripIcon size={14} />
        </span>
      )}
      {children ?? <span className="wrAnswerLabel">{answer.title}</span>}
      <Counter n={placed} />
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

// What both editors of a field's options do: name one, add one, take one away (asking first when answers use it).
function useOptionEdits(w: WriterWorkspace, owner: PlotNode, def: PlotCustomFieldDef) {
  const options = optionsOf(def)
  const [draft, setDraft] = useState('')
  const [taken, setTaken] = useState(false)
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
  // Alt and an arrow key moves the option one place along.
  function nudge(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
    if (!e.altKey || step === 0) return
    e.preventDefault()
    if (step < 0 ? i === 0 : i >= options.length - 1) return
    w.movePlotOption(owner.id, def.id, options[i].id, (step < 0 ? options[i - 1] : options[i + 2])?.id ?? null)
  }
  const askedFor = asking ? options.find(o => o.id === asking) : undefined
  const use = askedFor ? optionUse(w.plotNodes, def.id, askedFor.id, outlineById) : null
  return { options, outlineById, draft, setDraft, taken, setTaken, full, add, blur, remove, nudge, asking, setAsking, askedFor, use }
}
type OptionEdits = ReturnType<typeof useOptionEdits>

// The "Add option…" input at the end of the options.
function AddOption({ edits, tail, style }: { edits: OptionEdits; tail?: boolean; style?: CSSProperties }) {
  const { draft, setDraft, setTaken, full, add } = edits
  return (
    <span className="wrOptionAdd" data-chip-tail={tail ? '' : undefined} style={style}>
      <input
        value={draft} placeholder="Add option…" aria-label="Add option" maxLength={OPTION_LABEL_MAX} disabled={full}
        title={full ? `A field can have ${MAX_OPTIONS} options` : undefined}
        onChange={e => { setDraft(e.target.value); setTaken(false) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />
      <button type="button" aria-label="Add the option" disabled={full || !draft.trim()} onClick={add}><PlusIcon size={12} /></button>
    </span>
  )
}

// What an option's editor says below its options: that one is there already, and the question before taking away one that answers use.
function OptionNotes({ w, owner, def, edits }: { w: WriterWorkspace; owner: PlotNode; def: PlotCustomFieldDef; edits: OptionEdits }) {
  const { taken, askedFor, use, setAsking } = edits
  return (
    <>
      {taken && <p className="wrHint" role="note">That option is there already.</p>}
      {askedFor && use && (
        <AskBar
          message={`Remove ${askedFor.label}? ${use.answers === 1 ? '1 answer uses it' : `${use.answers} answers use it`}${use.placements > 0 ? ` and ${use.placements === 1 ? 'its place goes' : `${use.placements} places go`}` : ''}.`}
          onConfirm={() => { w.removePlotOption(owner.id, def.id, askedFor.id); setAsking(null) }} onCancel={() => setAsking(null)}
        />
      )}
    </>
  )
}

// The grip of an option: it starts the reorder drag, and the pointer carries the whole option, not just the grip, once it is hidden.
function optionGrip(optionId: string, rowSelector: string, setDragging: (id: string | null) => void) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', optionId)
      const row = (e.currentTarget as HTMLElement).closest(rowSelector)
      if (row && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 12, 12)
      setDragging(optionId)
    },
    onDragEnd: () => setDragging(null),
  }
}

// The options of a dropdown, as chips: renamed in place, reordered by their grips (the chips it passes slide out of the way, and a gap opens
// where it will land; or Alt + arrow keys), removed with x (which asks first when answers use the option), and added at the end.
function OptionsEditor({ w, owner, def }: { w: WriterWorkspace; owner: PlotNode; def: PlotCustomFieldDef }) {
  const edits = useOptionEdits(w, owner, def)
  const { options, blur, remove, nudge } = edits
  const [dragging, setDragging] = useState<string | null>(null)
  const group = useChipDrop({
    draggedId: dragging,
    onDrop: (id, before) => { w.movePlotOption(owner.id, def.id, id, before); setDragging(null) },
  })

  return (
    <div className="wrOptionsBlock">
      <div
        ref={group.ref} className={`wrOptions${group.sliding ? ' wrOptions--sliding' : ''}`} role="group" aria-label={`Options of ${def.name || 'field'}`}
        {...group.handlers}
      >
        {options.map((o, i) => (
          <span
            key={o.id} data-chip={o.id} style={slideStyle(group.slideOf(o.id))}
            className={`wrOption${dragging === o.id && !group.isLifted(o.id) ? ' wrOption--dragging' : ''}${group.isLifted(o.id) ? ' wrOption--lifted' : ''}`}
          >
            <span className="wrGrip" aria-label="Drag to reorder options" title="Drag to reorder" {...optionGrip(o.id, '[data-chip]', setDragging)}>
              <GripIcon size={12} />
            </span>
            <input
              className="wrOptionInput" value={o.label} maxLength={OPTION_LABEL_MAX} size={Math.max(4, o.label.length + 1)} aria-label={`Option ${i + 1} of ${def.name || 'field'}`}
              onChange={e => w.renamePlotOption(owner.id, def.id, o.id, e.target.value)} onBlur={e => blur(o.id, e.target.value)}
              onKeyDown={e => nudge(e, i)}
            />
            <button type="button" className="wrOptionX" aria-label={`Remove option ${o.label}`} onClick={() => remove(o.id)}>×</button>
          </span>
        ))}
        <AddOption edits={edits} tail style={slideStyle(group.tailSlide)} />
      </div>
      <OptionNotes w={w} owner={owner} def={def} edits={edits} />
    </div>
  )
}

// The options of a multi-select merged with its answers, in one column: each option is a row with a tick box (ticked, it is the answer: the row
// wears the answer card's colours, counts how often it is placed and has a grip that drags it onto a chapter), its label edited in place, and an
// x that takes the option away. The grip at the left reorders the options: the rows it passes slide out of the way.
function OptionRows({ w, owner, def, holder, drag }: { w: WriterWorkspace; owner: PlotNode; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag }) {
  const edits = useOptionEdits(w, owner, def)
  const { options, outlineById, blur, remove, nudge } = edits
  const [dragging, setDragging] = useState<string | null>(null)
  const [unticking, setUnticking] = useState<string | null>(null)
  const mine = valuesIn(w.plotNodes, holder.id, def.id)
  const group = useFieldGroupDrop({
    ids: options.map(o => o.id), draggedId: dragging, active: true,
    onDrop: (id, before) => { w.movePlotOption(owner.id, def.id, id, before); setDragging(null) },
  })
  const tick = (optionId: string, answer: PlotNode | undefined, on: boolean) => {
    if (on) { w.togglePlotOption(holder.id, def.id, optionId, true); return }
    if (answer && placedCount(answer, outlineById) > 0) setUnticking(optionId)
    else w.togglePlotOption(holder.id, def.id, optionId, false)
  }
  const untickFor = unticking ? options.find(o => o.id === unticking) : undefined
  const untickAnswer = untickFor ? mine.find(a => a.optionId === untickFor.id) : undefined

  return (
    <div className="wrOptionsBlock">
      <div
        ref={group.ref} className={`wrOptionRows${group.sliding ? ' wrOptionRows--sliding' : ''}`} role="group" aria-label={`Options of ${def.name || 'field'}`}
        {...group.handlers}
      >
        {options.map((o, i) => {
          const answer = mine.find(a => a.optionId === o.id)
          const placed = answer ? placedCount(answer, outlineById) : 0
          const lifted = group.isLifted(o.id)
          const slide = group.slideOf(o.id)
          const look = answer ? valueLook(answer, w.plotNodeById) : undefined
          return (
            <div
              key={o.id} data-field={o.id} data-point={answer?.id}
              className={`wrOptionRow${answer ? ` wrPlotValue wrPlotValue--answer${placed > 0 ? ' wrPlotValue--assigned' : ''}${drag.dragId === answer.id ? ' wrPlotValue--dragging' : ''}` : ''}${dragging === o.id && !lifted ? ' wrOptionRow--dragging' : ''}${lifted ? ' wrOptionRow--lifted' : ''}${answer && w.highlightedPointId === answer.id ? ' wrPlotValue--highlight' : ''}`}
              style={{ ...look, ...(slide ? { transform: `translateY(${slide}px)` } : {}) }}
            >
              <span className="wrGrip" aria-label="Drag to reorder options" title="Drag to reorder" {...optionGrip(o.id, '[data-field]', setDragging)}>
                <GripIcon size={12} />
              </span>
              <input type="checkbox" className="wrAnswerBox" aria-label={o.label} checked={Boolean(answer)} onChange={e => tick(o.id, answer, e.target.checked)} />
              <input
                className="wrOptionInput" value={o.label} maxLength={OPTION_LABEL_MAX} aria-label={`Option ${i + 1} of ${def.name || 'field'}`}
                onChange={e => w.renamePlotOption(owner.id, def.id, o.id, e.target.value)} onBlur={e => blur(o.id, e.target.value)}
                onKeyDown={e => nudge(e, i)}
              />
              {answer && <Counter n={placed} />}
              {answer && !drag.noPlacing && (
                <span className="wrGrip wrPlotValueGrip" aria-label="Drag plotpoint" title="Drag onto a chapter" {...drag.valueDrag(answer.id)} draggable>
                  <GripIcon size={14} />
                </span>
              )}
              <button type="button" className="wrOptionX" aria-label={`Remove option ${o.label}`} onClick={() => remove(o.id)}>×</button>
            </div>
          )
        })}
        <AddOption edits={edits} />
      </div>
      {options.length === 0 && <p className="wrMuted">Add the options to choose from.</p>}
      <OptionNotes w={w} owner={owner} def={def} edits={edits} />
      {untickFor && untickAnswer && (
        <AskBar
          message={`Untick ${untickFor.label}? ${placesGo(placedCount(untickAnswer, outlineById))}`}
          onConfirm={() => { w.togglePlotOption(holder.id, def.id, untickFor.id, false); setUnticking(null) }} onCancel={() => setUnticking(null)}
        />
      )}
    </div>
  )
}

// ---- the answers (any node that answers the field) ----

// `answeredAbove` are the options the node that defines the field has already ticked (shown above, in OwnerAnswers): they are not offered again
// here, unless this node already holds an answer for one (so that it can still be unticked).
function MultiAnswer({ w, def, holder, drag, answeredAbove }: { w: WriterWorkspace; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag; answeredAbove?: Set<string> }) {
  const [asking, setAsking] = useState<string | null>(null)
  const mine = valuesIn(w.plotNodes, holder.id, def.id)
  const offered = optionsOf(def).filter(o => !answeredAbove?.has(o.id) || mine.some(a => a.optionId === o.id))
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const tick = (optionId: string, answer: PlotNode | undefined, on: boolean) => {
    if (on) { w.togglePlotOption(holder.id, def.id, optionId, true); return }
    if (answer && placedCount(answer, outlineById) > 0) setAsking(optionId)
    else w.togglePlotOption(holder.id, def.id, optionId, false)
  }
  if (offered.length === 0) return <p className="wrMuted">Every option is answered above.</p>
  return (
    <div className="wrChoiceList" role="group" aria-label={`${def.name || 'Field'} answers`}>
      {offered.map(o => {
        const answer = mine.find(a => a.optionId === o.id)
        const box = <input type="checkbox" className="wrAnswerBox" checked={Boolean(answer)} onChange={e => tick(o.id, answer, e.target.checked)} />
        const placed = answer ? placedCount(answer, outlineById) : 0
        return (
          <div key={o.id} className="wrChoiceRow">
            {answer ? (
              <AnswerCard w={w} answer={answer} drag={valueGrip(drag, answer.id)} dragging={drag.dragId === answer.id}>
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

// A dropdown answers with a select while it has no answer; once an option is picked the select is replaced by the answer as a chip. Not yet
// placed, the chip has an x that takes the answer away (and brings the select back); placed, its count stands where the x was.
function DropdownAnswer({ w, def, holder, drag }: { w: WriterWorkspace; def: PlotCustomFieldDef; holder: PlotNode; drag: PlotDrag }) {
  const answer = valuesIn(w.plotNodes, holder.id, def.id)[0]
  const placed = answer ? placedCount(answer, new Map(w.outlineNodes.map(n => [n.id, n]))) : 0
  const label = def.name || 'Field'
  return (
    <div className="wrChoiceList">
      {answer ? (
        <AnswerCard w={w} answer={answer} drag={valueGrip(drag, answer.id)} dragging={drag.dragId === answer.id}>
          <span className="wrAnswerLabel">{answer.title}</span>
          {placed === 0 && (
            <button type="button" className="wrPlotValueX" aria-label={`Clear the ${label} answer`} title="Clear the answer" onClick={() => w.choosePlotOption(holder.id, def.id, null)}>×</button>
          )}
        </AnswerCard>
      ) : (
        <select className="wrSelect" aria-label={`${label} answer`} value="" onChange={e => w.choosePlotOption(holder.id, def.id, e.target.value === '' ? null : e.target.value)}>
          <option value="">None</option>
          {optionsOf(def).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
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
  const grip = answer ? valueGrip(drag, answer.id) : undefined
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

// What a plotline shows of the answer of the node that defines the field, in a card of its own: the node's title at the top left, its kind at the top
// right (fainter), the answers below. It cannot be changed here, but is dragged onto a chapter like any answer and counts its places.
function OwnerAnswers({ w, info, drag }: { w: WriterWorkspace; info: FieldInfo; drag: PlotDrag }) {
  const answers = valuesIn(w.plotNodes, info.owner.id, info.def.id)
  const scope = `${info.scope.charAt(0).toUpperCase()}${info.scope.slice(1)}`
  return (
    <div className="wrAnswerFrom" role="group" aria-label={`${scope}: ${nodeLabel(info.owner)}`}>
      <div className="wrAnswerFromHead">
        <span className="wrAnswerFromName">{nodeLabel(info.owner)}</span>
        <span className="wrAnswerFromKind">{scope}</span>
      </div>
      <div className="wrAnswerFromBody">
        {answers.length === 0
          ? <span className="wrMuted">No answer</span>
          : answers.map(a => (
            <AnswerCard key={a.id} w={w} answer={a} drag={valueGrip(drag, a.id)} dragging={drag.dragId === a.id} hint={`Answered on ${nodeLabel(info.owner)}. Change it there.`} />
          ))}
      </div>
    </div>
  )
}

// The options of a field that the node defining it has answered.
const answeredOn = (w: WriterWorkspace, owner: PlotNode, def: PlotCustomFieldDef) => new Set(valuesIn(w.plotNodes, owner.id, def.id).flatMap(a => (a.optionId ? [a.optionId] : [])))

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
  // An inherited multi-select or dropdown the defining node has not answered has no card to show (no "No answer" card), and so no caption to tell the plotline's own answer from the
  // card's. A short text still says "No answer".
  const showOwner = inherited && (kind === 'text' || valuesIn(w.plotNodes, owner.id, def.id).length > 0)
  // Where its options are edited, a multi-select's options and answers are one list.
  if (editable && kind === 'multi') {
    return (
      <div className="wrFieldValues wrChoice">
        <OptionRows w={w} owner={owner} def={def} holder={holder} drag={drag} />
      </div>
    )
  }
  return (
    <div className="wrFieldValues wrChoice">
      {editable && hasOptions(def) && <OptionsEditor w={w} owner={owner} def={def} />}
      {showOwner && <OwnerAnswers w={w} info={info} drag={drag} />}
      {showOwner && <span className="wrAnswerWho">This plotline</span>}
      {noOptions
        ? <p className="wrMuted">{editable ? 'Add the options to choose from.' : 'No options yet. Add them on the node that defines this field.'}</p>
        : kind === 'multi' ? <MultiAnswer w={w} def={def} holder={holder} drag={drag} answeredAbove={inherited ? answeredOn(w, owner, def) : undefined} />
          : kind === 'dropdown' ? <DropdownAnswer w={w} def={def} holder={holder} drag={drag} />
            : <TextAnswer w={w} def={def} holder={holder} drag={drag} />}
    </div>
  )
}
