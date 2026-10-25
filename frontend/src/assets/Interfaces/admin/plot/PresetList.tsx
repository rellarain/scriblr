import type { PresetEntry } from '../../../../api/types'
import { CheckIcon, ChevronDownIcon, GripIcon, ImportIcon, ExportIcon, PlusIcon } from '../../../icons'
import { nudge, statusOf } from './presetModel'
import { useReorder } from './useReorder'

// Where a preset stands, in words and in a shape (a tick, a filled dot, a hollow dot, a grey dot), so colour is not what tells them apart.
export function StatusBadge({ entry }: { entry: PresetEntry }) {
  const status = statusOf(entry)
  if (status === 'live') return <span className="plpBadge"><CheckIcon size={11} /> Published v{entry.published!.version}</span>
  if (status === 'pending') return <span className="plpBadge plpBadge--pending"><span className="plpDot" aria-hidden="true" /> v{entry.published!.version} · unpublished changes</span>
  if (status === 'off') return <span className="plpBadge"><span className="plpDot plpDot--off" aria-hidden="true" /> Unpublished (was v{entry.history[0].version})</span>
  return <span className="plpBadge"><span className="plpDot plpDot--never" aria-hidden="true" /> Not published</span>
}

export const presetLabel = (entry: PresetEntry) => entry.draft.name.trim() || 'Untitled preset'

// The presets, in the order the Writer's list shows them. On a narrow page the list folds into one picker above the editor.
export function PresetList({ entries, current, open, onToggle, onSelect, onNew, onImport, onExportAll, onMove }: {
  entries: PresetEntry[]
  current: PresetEntry | undefined
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onImport: () => void
  onExportAll: () => void
  onMove: (id: string, beforeId: string | null) => void
}) {
  const drag = useReorder<string>(onMove, (id, dir) => {
    const next = nudge(entries, id, dir)
    if (next === entries) return
    const at = next.findIndex(e => e.id === id)
    onMove(id, next[at + 1]?.id ?? null)
  })
  return (
    <>
      {current && (
        <button type="button" className="plpPick" aria-expanded={open} aria-controls="plp-list" onClick={onToggle}>
          <span className="plpRowText"><span className="plpRowName">{presetLabel(current)}</span><StatusBadge entry={current} /></span>
          <ChevronDownIcon size={14} />
        </button>
      )}
      <aside id="plp-list" className={`plpList${open ? ' plpList--open' : ''}`} aria-label="Presets">
        <div className="plpListHead">
          <span className="plpListTitle">Presets · {entries.length}</span>
          <button type="button" className="plpBtn plpBtn--small" onClick={onNew}><PlusIcon size={12} /> New</button>
        </div>
        <ul className="plpRows">
          {entries.map(entry => (
            <li
              key={entry.id}
              className={`plpRowItem${drag.overId === entry.id && drag.dragId !== entry.id ? ' plpRowItem--over' : ''}${drag.dragId === entry.id ? ' plpRowItem--dragging' : ''}`}
              {...drag.target(entry.id)}
            >
              <span className="plpGrip" role="button" tabIndex={0} aria-label={`Move ${presetLabel(entry)} (Alt+Up or Down)`} {...drag.grip(entry.id)}><GripIcon size={12} /></span>
              <button
                type="button" className={`plpRow${entry.id === current?.id ? ' plpRow--on' : ''}`} aria-current={entry.id === current?.id}
                onClick={() => onSelect(entry.id)}
              >
                <span className="plpRowText"><span className="plpRowName">{presetLabel(entry)}</span><StatusBadge entry={entry} /></span>
              </button>
            </li>
          ))}
          {drag.dragId !== null && <li className={`plpDropEnd${drag.overId === null ? ' plpDropEnd--over' : ''}`} {...drag.target(null)}>Move here to put it last</li>}
        </ul>
        <div className="plpListFoot">
          <button type="button" className="plpBtn plpBtn--small" onClick={onImport}><ImportIcon size={12} /> Import</button>
          <button type="button" className="plpBtn plpBtn--small" disabled={entries.length === 0} onClick={onExportAll}><ExportIcon size={12} /> Export all</button>
        </div>
      </aside>
    </>
  )
}
