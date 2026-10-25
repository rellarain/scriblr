import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PresetCard, PresetCluster, PresetContent, PresetSubcategory } from '../../../../api/types'
import { GripIcon, PlusIcon, TrashIcon } from '../../../icons'
import {
  DESCRIPTION_MAX, FIELD_MAX, KEYWORD_MAX, NAME_MAX, ROOT, addCluster, addFieldName, addKeyword, addSubcategory, isBlankCard, moveCard,
  moveFieldTo, nudge, removeCard, removeFieldAt, removeKeyword, updateCard, type CardKind, type MakeId,
} from './presetModel'
import { useReorder } from './useReorder'

// The open preset as a tree of cards: the category, its subcategories and their clusters. Each card has a name edited in place, a description,
// keywords and field chips; subcategories and clusters can be reordered by their grips, and a field by its chip.

export interface TreeCtx {
  // Change the open preset's draft (a structural change passes `immediate`).
  edit: (change: (draft: PresetContent) => PresetContent, immediate?: boolean) => void
  makeId: MakeId
  // The cards that cannot be published as they are, by id (ROOT is the preset), with the reason.
  faults: Map<string, string>
}

const KIND_LABEL: Record<CardKind, string> = { category: 'Category', subcategory: 'Subcategory', cluster: 'Cluster' }

// ---- chips ----

function ChipList({ items, label, placeholder, maxLength, onAdd, onRemove, onMove }: {
  items: string[]
  label: string
  placeholder: string
  maxLength: number
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  // Given, the chips can be reordered (fields): by their grips, or Alt+Left and Alt+Right on a chip's remove button.
  onMove?: (from: number, before: number | null) => void
}) {
  const [draft, setDraft] = useState('')
  const drag = useReorder<number>((from, before) => onMove?.(from, before), (from, dir) => onMove?.(from, dir < 0 ? from - 1 : from + 2))
  const submit = () => {
    if (!draft.trim()) return
    onAdd(draft)
    setDraft('')
  }
  const onChipKey = (e: KeyboardEvent, index: number) => {
    if (!onMove || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    if (e.key === 'ArrowLeft' && index > 0) onMove(index, index - 1)
    if (e.key === 'ArrowRight' && index < items.length - 1) onMove(index, index + 2 > items.length - 1 ? null : index + 2)
  }
  return (
    <div className="plpChips" role="group" aria-label={label}>
      {items.map((item, index) => (
        <span
          key={`${index}-${item}`}
          className={`plpChip${onMove ? ' plpChip--field' : ''}${drag.dragId === index ? ' plpChip--dragging' : ''}${drag.overId === index && drag.dragId !== index ? ' plpChip--over' : ''}`}
          {...(onMove ? drag.target(index) : {})}
        >
          {onMove && <span className="plpGrip plpGrip--chip" aria-hidden="true" title="Drag to reorder" {...drag.grip(index)}><GripIcon size={12} /></span>}
          {item}
          <button
            type="button" aria-label={`Remove ${item}`} aria-keyshortcuts={onMove ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
            onClick={() => onRemove(index)} onKeyDown={e => onChipKey(e, index)}
          >×</button>
        </span>
      ))}
      <span className="plpChipAdd" {...(onMove ? drag.target(null) : {})}>
        <input
          value={draft} placeholder={placeholder} aria-label={placeholder} maxLength={maxLength} data-kf=""
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        />
        <button type="button" aria-label={`Add ${placeholder.replace('…', '')}`} disabled={!draft.trim()} onClick={submit}><PlusIcon size={12} /></button>
      </span>
    </div>
  )
}

// ---- a card ----

function CardBody({ kind, card, cardId, ctx }: { kind: CardKind; card: PresetCard; cardId: string; ctx: TreeCtx }) {
  const noun = kind === 'category' ? 'preset' : kind
  const who = kind === 'category' ? 'Preset' : KIND_LABEL[kind]
  return (
    <>
      <div>
        <div className="plpLabel">Description <span>{card.description.length}/{DESCRIPTION_MAX}</span></div>
        <textarea
          className="plpField" rows={2} maxLength={DESCRIPTION_MAX} data-kf="" aria-label={`${who} description`}
          placeholder="What is this for? Shown beside the preset when you add it."
          value={card.description} onChange={e => ctx.edit(c => updateCard(c, cardId, { description: e.target.value }))}
        />
      </div>
      <div>
        <div className="plpLabel">Keywords</div>
        <ChipList
          items={card.keywords} label={`${who} keywords`} placeholder="Add keyword…" maxLength={KEYWORD_MAX}
          onAdd={k => ctx.edit(c => addKeyword(c, cardId, k), true)}
          onRemove={i => ctx.edit(c => removeKeyword(c, cardId, card.keywords[i]), true)}
        />
      </div>
      <div>
        <div className="plpLabel">Fields <span>each becomes a field on the new {noun}</span></div>
        <ChipList
          items={card.fields} label={`${who} fields`} placeholder="Add field…" maxLength={FIELD_MAX}
          onAdd={f => ctx.edit(c => addFieldName(c, cardId, f), true)}
          onRemove={i => ctx.edit(c => removeFieldAt(c, cardId, i), true)}
          onMove={(from, before) => ctx.edit(c => moveFieldTo(c, cardId, from, before), true)}
        />
      </div>
    </>
  )
}

function Card({ kind, card, cardId, nodeId, ctx, grip, nameInput, onDelete, confirmDelete, dropProps, over, children, footer }: {
  kind: CardKind
  card: PresetCard
  cardId: string
  // The id the keyboard shortcuts find the card by (data-knode); the preset's own is its entry id.
  nodeId: string
  ctx: TreeCtx
  grip?: ReactNode
  nameInput?: ReactNode
  onDelete: () => void
  // Ask first when the card has something in it (the preset asks in the page, so it passes false).
  confirmDelete: boolean
  dropProps?: object
  over?: boolean
  children?: ReactNode
  footer?: ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const fault = ctx.faults.get(cardId)
  const label = card.name.trim() || 'without a name'
  const noun = kind === 'category' ? 'preset' : kind
  const askFirst = confirmDelete && !isBlankCard(card)
  return (
    <section
      className={`plpCard plpCard--${kind}${fault ? ' plpCard--invalid' : ''}${over ? ' plpCard--over' : ''}`}
      data-knode={nodeId} aria-label={`${noun} ${label}`} {...dropProps}
    >
      <header className="plpHead">
        {grip}
        <span className="plpKind">{noun}</span>
        {nameInput ?? (
          <input
            className="plpName" data-kf="" maxLength={NAME_MAX} aria-label={`${KIND_LABEL[kind]} name`} placeholder={`${KIND_LABEL[kind]} name`}
            value={card.name} onChange={e => ctx.edit(c => updateCard(c, cardId, { name: e.target.value }))}
          />
        )}
        {card.fields.length > 0 && <span className="plpCount">{card.fields.length} field{card.fields.length === 1 ? '' : 's'}</span>}
        {confirming ? (
          <span className="plpConfirm" role="alertdialog" aria-label={`Delete ${noun} ${label}`}>
            <span>Delete {card.name.trim() || `this ${noun}`} and what is in it?</span>
            <button type="button" className="plpBtn plpBtn--small plpBtn--primary" onClick={() => { setConfirming(false); onDelete() }}>Confirm</button>
            <button type="button" className="plpBtn plpBtn--small" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        ) : (
          <button
            type="button" className="plpIconBtn" aria-label={`Delete ${noun} ${label}`} title="Delete"
            onClick={() => (askFirst ? setConfirming(true) : onDelete())}
          ><TrashIcon size={14} /></button>
        )}
      </header>
      {fault && <p className="plpErr" role="note">{fault}</p>}
      <CardBody kind={kind} card={card} cardId={cardId} ctx={ctx} />
      {children}
      {footer}
    </section>
  )
}

function ClusterCard({ cluster, ctx, drag }: { cluster: PresetCluster; ctx: TreeCtx; drag: ReturnType<typeof useReorder<string>> }) {
  return (
    <Card
      kind="cluster" card={cluster} cardId={cluster.id} nodeId={cluster.id} ctx={ctx}
      grip={<span className="plpGrip" role="button" tabIndex={0} aria-label={`Move cluster ${cluster.name || 'without a name'} (Alt+Up or Down)`} {...drag.grip(cluster.id)}><GripIcon size={14} /></span>}
      dropProps={drag.target(cluster.id)} over={drag.overId === cluster.id && drag.dragId !== cluster.id}
      confirmDelete onDelete={() => ctx.edit(c => removeCard(c, cluster.id), true)}
    />
  )
}

function SubcategoryCard({ sub, ctx, drag }: { sub: PresetSubcategory; ctx: TreeCtx; drag: ReturnType<typeof useReorder<string>> }) {
  const clusterDrag = useReorder<string>(
    (id, before) => ctx.edit(c => moveCard(c, id, before), true),
    (id, dir) => ctx.edit(c => ({
      ...c, subcategories: c.subcategories.map(s => (s.id === sub.id ? { ...s, clusters: nudge(s.clusters, id, dir) } : s)),
    }), true),
  )
  const addClusterAfter = () => ctx.edit(c => addCluster(c, sub.id, ctx.makeId('cluster'), sub.clusters.at(-1)?.id), true)
  return (
    <Card
      kind="subcategory" card={sub} cardId={sub.id} nodeId={sub.id} ctx={ctx}
      grip={<span className="plpGrip" role="button" tabIndex={0} aria-label={`Move subcategory ${sub.name || 'without a name'} (Alt+Up or Down)`} {...drag.grip(sub.id)}><GripIcon size={14} /></span>}
      dropProps={drag.target(sub.id)} over={drag.overId === sub.id && drag.dragId !== sub.id}
      confirmDelete onDelete={() => ctx.edit(c => removeCard(c, sub.id), true)}
      footer={<div className="plpFoot"><button type="button" className="plpBtn plpBtn--small" onClick={addClusterAfter}><PlusIcon size={12} /> Cluster</button></div>}
    >
      {sub.clusters.length > 0 && (
        <div className="plpKids">
          {sub.clusters.map(c => <ClusterCard key={c.id} cluster={c} ctx={ctx} drag={clusterDrag} />)}
          {clusterDrag.dragId !== null && <div className={`plpDropEnd${clusterDrag.overId === null ? ' plpDropEnd--over' : ''}`} {...clusterDrag.target(null)}>Move here to put it last</div>}
        </div>
      )}
    </Card>
  )
}

// The preset itself: the category card, holding the subcategory cards.
export function PresetTree({ content, entryId, ctx, nameInput, onDelete }: {
  content: PresetContent
  entryId: string
  ctx: TreeCtx
  // The preset's name field, which refuses a name another preset has.
  nameInput: ReactNode
  onDelete: () => void
}) {
  const subDrag = useReorder<string>(
    (id, before) => ctx.edit(c => moveCard(c, id, before), true),
    (id, dir) => ctx.edit(c => ({ ...c, subcategories: nudge(c.subcategories, id, dir) }), true),
  )
  // A card added to a list that is empty has no sibling to follow; the list's last card is the one to follow otherwise.
  const addSub = () => ctx.edit(c => addSubcategory(c, ctx.makeId('sub'), c.subcategories.at(-1)?.id), true)
  return (
    <Card
      kind="category" card={content} cardId={ROOT} nodeId={entryId} ctx={ctx} nameInput={nameInput}
      confirmDelete={false} onDelete={onDelete}
      footer={<div className="plpFoot"><button type="button" className="plpBtn plpBtn--small" onClick={addSub}><PlusIcon size={12} /> Subcategory</button></div>}
    >
      {content.subcategories.length > 0 && (
        <div className="plpKids">
          {content.subcategories.map(s => <SubcategoryCard key={s.id} sub={s} ctx={ctx} drag={subDrag} />)}
          {subDrag.dragId !== null && <div className={`plpDropEnd${subDrag.overId === null ? ' plpDropEnd--over' : ''}`} {...subDrag.target(null)}>Move here to put it last</div>}
        </div>
      )}
    </Card>
  )
}

