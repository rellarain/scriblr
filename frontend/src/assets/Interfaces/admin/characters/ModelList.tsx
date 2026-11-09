import type { ModelEntry } from '../../../../api/types'
import DragGap from '../../../../components/DragGap'
import { CheckIcon, ChevronDownIcon, ExportIcon, GripIcon, ImportIcon, PlusIcon } from '../../../icons'
import { useReorder } from '../plot/useReorder'
import { publishState } from './modelContent'

// Where a model stands, in words and in a shape (a tick, a filled dot, a hollow dot, a grey dot), so colour is not what tells them apart.
export function StatusBadge({ entry }: { entry: ModelEntry }) {
  const state = publishState(entry)
  if (state === 'published') return <span className="cmBadge"><CheckIcon size={11} /> Published v{entry.published!.version}</span>
  if (state === 'changed') return <span className="cmBadge cmBadge--pending"><span className="cmDot" aria-hidden="true" /> v{entry.published!.version} · unpublished changes</span>
  if (state === 'unpublished') return <span className="cmBadge"><span className="cmDot cmDot--off" aria-hidden="true" /> Unpublished (was v{entry.history[0].version})</span>
  return <span className="cmBadge"><span className="cmDot cmDot--never" aria-hidden="true" /> Not published</span>
}

export const modelLabel = (entry: ModelEntry) => entry.draft.name.trim() || 'Untitled model'

function nudged<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const at = list.findIndex(x => x.id === id), to = at + dir
  if (at < 0 || to < 0 || to >= list.length) return list
  const out = [...list]
  ;[out[at], out[to]] = [out[to], out[at]]
  return out
}

// The models, in a column. On a narrow page the list folds into one picker above the designer.
export function ModelList({ entries, current, open, onToggle, onSelect, onNew, onImport, onExportAll, onMove }: {
  entries: ModelEntry[]
  current: ModelEntry | undefined
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onImport: () => void
  onExportAll: () => void
  onMove: (id: string, beforeId: string | null) => void
}) {
  const drag = useReorder<string>(onMove, (id, dir) => {
    const next = nudged(entries, id, dir)
    if (next === entries) return
    const at = next.findIndex(e => e.id === id)
    onMove(id, next[at + 1]?.id ?? null)
  })
  return (
    <>
      {current && (
        <button type="button" className="cmPick" aria-expanded={open} aria-controls="cm-list" onClick={onToggle}>
          <span className="cmRowText"><span className="cmRowName">{modelLabel(current)}</span><StatusBadge entry={current} /></span>
          <ChevronDownIcon size={14} />
        </button>
      )}
      <aside id="cm-list" className={`cmList${open ? ' cmList--open' : ''}`} aria-label="Models">
        <div className="cmListHead">
          <span className="cmListTitle">Models · {entries.length}</span>
          <button type="button" className="cmBtn cmBtn--small" onClick={onNew}><PlusIcon size={12} /> New</button>
        </div>
        <div className="cmListTools">
          <button type="button" className="cmBtn cmBtn--small" onClick={onImport}><ImportIcon size={12} /> Import</button>
          <button type="button" className="cmBtn cmBtn--small" disabled={entries.length === 0} onClick={onExportAll}><ExportIcon size={12} /> Export all</button>
        </div>
        <ul className="cmRows" ref={drag.listRef}>
          <DragGap rect={drag.gap} />
          {entries.map(entry => (
            <li key={entry.id} className={`cmRowItem${drag.dragId === entry.id ? ' cmRowItem--dragging' : ''}`} {...drag.item(entry.id)}>
              <span className="cmGrip" role="button" tabIndex={0} aria-label={`Move ${modelLabel(entry)} (Alt+Up or Down)`} {...drag.grip(entry.id)}><GripIcon size={12} /></span>
              <button type="button" className={`cmRow${entry.id === current?.id ? ' cmRow--on' : ''}`} aria-current={entry.id === current?.id} onClick={() => onSelect(entry.id)}>
                <span className="cmRowText"><span className="cmRowName">{modelLabel(entry)}</span><StatusBadge entry={entry} /></span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  )
}
