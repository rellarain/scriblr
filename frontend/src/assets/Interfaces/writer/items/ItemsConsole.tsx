import { useEffect, useMemo, useState } from 'react'
import type { ItemDoc, ItemHolding, OutlineNode, PlotNode } from '../../../../api/types'
import { ITEM_KINDS, ITEM_MAX_HOLDINGS } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { BagIcon, CheckIcon, CloseIcon, PlusIcon, RedoIcon, TrashIcon } from '../../../icons'
import { Colour, CommitText, Field, TextField } from '../characters/CharFields'
import { useCast } from '../characters/castStore'
import { nextId, storyPoints } from '../characters/story'
import { WorldLinks } from '../links/WorldLinks'
import { hasPending, usePendingOpen } from '../links/worldNav'
import { usePlaces } from '../maps/placesStore'
import { holdingsInOrder, holderAt, KIND_LABEL, nextPointAfter } from './itemModel'
import { useItems } from './useItems'
import '../characters/characters.scss'
import './items.scss'

// Project > Items: the library of things that pass from hand to hand (a sword, a letter, a ring). Each item has a name, a kind, a description and the holdings that say who
// has it from which chapter or scene on, the way a character's states carry forward. Beside the holdings are the links to the characters, places, plot nodes and scenes it
// belongs to. Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on.
export default function ItemsConsole({ projectId, outline = [], plotNodes = [], onOpenPlot, onOpenScene }: {
  projectId: string; outline?: OutlineNode[]; plotNodes?: PlotNode[]; onOpenPlot?: (nodeId: string) => void; onOpenScene?: (nodeId: string) => void
}) {
  const it = useItems(projectId)
  const { ui } = useSettings()
  const { doc } = it
  const points = useMemo(() => storyPoints(outline), [outline])
  const { cast } = useCast(projectId)
  const { places } = usePlaces(projectId)
  const [confirming, setConfirming] = useState<string | null>(null)

  // The first item opens by itself.
  useEffect(() => {
    if (it.status === 'ready' && it.openId === null && it.list.length > 0 && !hasPending('item')) void it.open(it.list[0].id)
    // Only when the list has loaded (opening is not repeated after an item is closed by deleting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it.status])

  // A link from another console asked for an item.
  usePendingOpen('item', it.status === 'ready', id => { void it.open(id) })

  if (it.status === 'error') {
    return (
      <div className="charNote" role="alert">
        <p>{it.loadError ?? 'The items could not be loaded.'}</p>
        <button type="button" className="charIconBtn" aria-label="Try loading again" title="Try loading again" onClick={() => { void it.reload() }}><RedoIcon size={18} /></button>
      </div>
    )
  }
  if (it.status === 'loading') return <p className="charNote" role="status">Loading the items…</p>

  const holderLabel = (ref: string): string => {
    if (ref === '') return 'Nobody known'
    if (ref.startsWith('char:')) return cast.find(c => `char:${c.id}` === ref)?.name ?? 'A character who is gone'
    return places.find(p => `place:${p.key}` === ref)?.path ?? 'A place that is gone'
  }
  const pointName = (id: string) => (id === '' ? 'From the start' : points.find(p => p.id === id)?.label ?? 'A part of the book that is gone')
  const now = doc ? holderAt(doc, points, null) : null

  return (
    <div className="charPage">
      <div className="charBar">
        <h2 className="charBarTitle">Items</h2>
        <SaveCluster
          status={it.saveStatus} onSave={() => { void it.saveNow() }} scope=".charPage"
          history={{ canUndo: it.canUndo, canRedo: it.canRedo, onUndo: it.undo, onRedo: it.redo }}
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: it.saveCountdown.nextSaveAt, wait: it.saveCountdown.wait }}
        />
      </div>
      {it.saveStatus.error && <p className="charNote charNote--error" role="alert">{it.saveStatus.error}</p>}
      {it.notice && <p className="charNote charNote--error" role="alert">{it.notice}</p>}
      <div className="charSplit">
        <nav className="charList" aria-label="Items">
          <header className="charPanelHead">
            <h3 className="charPanelTitle">Library</h3>
            <button type="button" className="charIconBtn" aria-label="New item" title="New item" onClick={() => { void it.create() }}><PlusIcon size={16} /></button>
          </header>
          {it.list.length === 0 && <p className="charHint">No items yet. Make the first one with the plus.</p>}
          <ul className="charRows">
            {it.list.map(i => (
              <li key={i.id} className={`charRowItem${i.id === it.openId ? ' charRowItem--on' : ''}`}>
                <button type="button" className="charRowMain" aria-label={`Open ${i.name}`} aria-current={i.id === it.openId ? 'true' : undefined} title={`Open ${i.name}`} onClick={() => { void it.open(i.id) }}>
                  <BagIcon size={14} />
                  <span className="charRowName">{i.name}</span>
                  <span className="itemKind">{KIND_LABEL[i.kind] ?? 'Other'}</span>
                </button>
                {confirming === i.id ? (
                  <span className="charConfirm" role="group" aria-label={`Delete ${i.name}?`}>
                    <button type="button" className="charIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={() => { setConfirming(null); void it.remove(i.id) }}><CheckIcon size={16} /></button>
                    <button type="button" className="charIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
                  </span>
                ) : (
                  <button type="button" className="charIconBtn charRowTool" aria-label={`Delete ${i.name}`} title={`Delete ${i.name}`} onClick={() => setConfirming(i.id)}><TrashIcon size={16} /></button>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {doc ? (
          <div className="charSheet">
            <section className="charPanel" aria-label="The item">
              <h3 className="charPanelTitle">The item</h3>
              <div className="charRow">
                <Field label="Name"><CommitText label="Name of the item" value={doc.name} max={120} onCommit={it.rename} /></Field>
                <Field label="Kind" short>
                  <select className="charSelect charSelect--auto" aria-label="Kind of item" value={doc.kind} onChange={e => it.edit(d => ({ ...d, kind: e.target.value }), 'kind')}>
                    {ITEM_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Tag colour">
                <Colour label="Tag colour" value={doc.color || null} none="No colour" onChange={v => it.edit(d => ({ ...d, color: v ?? '' }), 'color')} />
              </Field>
              <TextField label="Description" multiline rows={4} max={4000} value={doc.description} onChange={v => it.edit(d => ({ ...d, description: v }), 'description')} />
              <TextField label="Notes" multiline rows={3} max={4000} value={doc.notes} onChange={v => it.edit(d => ({ ...d, notes: v }), 'notes')} />
            </section>
            <HoldingsPanel
              doc={doc} edit={it.edit} points={points} now={now} holderLabel={holderLabel} pointName={pointName}
              characters={cast.map(c => ({ ref: `char:${c.id}`, label: c.name }))} places={places.map(p => ({ ref: `place:${p.key}`, label: p.path || p.name }))}
            />
            <section className="charPanel" aria-label="Links">
              <WorldLinks projectId={projectId} self={`item:${doc.id}`} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} heading="Belongs to" />
            </section>
          </div>
        ) : (
          <p className="charNote charEmpty">{it.list.length === 0 ? 'Make an item to start: a sword, a letter, a key, anything that changes hands.' : 'Pick an item in the list to open it.'}</p>
        )}
      </div>
    </div>
  )
}

// Who has the item, and from when: each holding is a holder (a character, a place or nobody known), the chapter or scene it starts at and a note.
function HoldingsPanel({ doc, edit, points, now, holderLabel, pointName, characters, places }: {
  doc: ItemDoc
  edit: (change: (d: ItemDoc) => ItemDoc, group?: string) => void
  points: ReturnType<typeof storyPoints>
  now: ItemHolding | null
  holderLabel: (ref: string) => string
  pointName: (id: string) => string
  characters: Array<{ ref: string; label: string }>
  places: Array<{ ref: string; label: string }>
}) {
  const ordered = holdingsInOrder(doc, points)
  const setHolding = (id: string, patch: Partial<ItemHolding>) => edit(d => ({ ...d, holdings: d.holdings.map(h => (h.id === id ? { ...h, ...patch } : h)) }), `holding.${id}`)
  const add = () => edit(d => ({ ...d, holdings: [...d.holdings, { id: nextId(d.holdings, 'h'), holder: '', at: nextPointAfter(d, points), note: '' }] }), 'holdings')
  const known = (ref: string) => ref === '' || characters.some(c => c.ref === ref) || places.some(p => p.ref === ref)
  return (
    <section className="charPanel charWide" aria-label="Who has it">
      <header className="charPanelHead">
        <h3 className="charPanelTitle">Who has it</h3>
        <button type="button" className="charIconBtn" aria-label="Add a holding" title="Add a holding (who has the item from a chapter or scene on)" disabled={doc.holdings.length >= ITEM_MAX_HOLDINGS} onClick={add}><PlusIcon size={16} /></button>
      </header>
      <p className="charHint" role="status">{now ? `At the end of the story: ${holderLabel(now.holder)}.` : 'Nobody has said who has it yet.'}</p>
      <p className="charHint">A holding is who has the item from a chapter or scene until the next holding: a character, a place (a vault, a shelf) or nobody known (lost, hidden, not made yet).</p>
      <ul className="charList2">
        {ordered.map((h, i) => (
          <li key={h.id} className="charItem charItem--col" aria-label={`Holding ${i + 1}`}>
            <div className="charRow">
              <select className="charSelect charSelect--auto" aria-label={`Who has it in holding ${h.id}`} value={h.holder} onChange={e => setHolding(h.id, { holder: e.target.value })}>
                <option value="">Nobody known</option>
                {characters.length > 0 && <optgroup label="Characters">{characters.map(c => <option key={c.ref} value={c.ref}>{c.label}</option>)}</optgroup>}
                {places.length > 0 && <optgroup label="Places">{places.map(p => <option key={p.ref} value={p.ref}>{p.label}</option>)}</optgroup>}
                {!known(h.holder) && <option value={h.holder}>{holderLabel(h.holder)}</option>}
              </select>
              <select className="charSelect charSelect--auto" aria-label={`From when in holding ${h.id}`} value={h.at} onChange={e => setHolding(h.id, { at: e.target.value })}>
                <option value="">From the start</option>
                {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                {h.at !== '' && !points.some(p => p.id === h.at) && <option value={h.at}>{pointName(h.at)}</option>}
              </select>
              <button type="button" className="charIconBtn" aria-label={`Remove holding ${h.id}`} title="Remove this holding" onClick={() => edit(d => ({ ...d, holdings: d.holdings.filter(x => x.id !== h.id) }), 'holdings')}><TrashIcon size={16} /></button>
            </div>
            <TextField label={`Note on holding ${h.id}`} value={h.note} max={500} onChange={v => setHolding(h.id, { note: v })} />
          </li>
        ))}
      </ul>
    </section>
  )
}
