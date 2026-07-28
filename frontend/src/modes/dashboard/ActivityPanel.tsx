import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useActivity } from '../../api/activity'
import { useOutlineHistory, useRevertOutline } from '../../api/outline'
import { usePlotHistory, useRevertPlot } from '../../api/plot'
import type { ActivityLogEntry } from '../../types'
import Heatmap from './Heatmap'
import TreeDiffView from './TreeDiffView'

function ActivityPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useActivity(projectId)
  const [selected, setSelected] = useState<ActivityLogEntry | null>(null)

  const outlineHistory = useOutlineHistory(projectId)
  const plotHistory = usePlotHistory(projectId)
  const revertOutline = useRevertOutline(projectId ?? '')
  const revertPlot = useRevertPlot(projectId ?? '')

  if (isLoading) return <p>Loading activity…</p>
  if (!data) return null

  function fromSnapshotIdFor(entry: ActivityLogEntry): string | undefined {
    const history = entry.type === 'outline' ? outlineHistory.data : entry.type === 'plot' ? plotHistory.data : undefined
    if (!history) return undefined
    const index = history.findIndex((s) => s.snapshotId === entry.id)
    return index >= 0 ? history[index + 1]?.snapshotId : undefined
  }

  function handleSelect(entry: ActivityLogEntry) {
    if (entry.type === 'draft' && entry.momentId) {
      navigate(`/project/${projectId}/revise/${entry.momentId}`)
      return
    }
    setSelected(entry)
  }

  function handleRevert() {
    if (!selected) return
    const ok = confirm(`Revert the ${selected.type} tree to this version? A safety snapshot is kept if needed.`)
    if (!ok) return
    if (selected.type === 'outline') revertOutline.mutate(selected.id)
    else if (selected.type === 'plot') revertPlot.mutate(selected.id)
  }

  return (
    <div className="activity-panel">
      <Heatmap daily={data.daily} />
      <div className="activity-panel__body">
        <ul className="activity-panel__timeline">
          {data.log.length === 0 && <li className="activity-panel__empty">No activity yet.</li>}
          {data.log.map((entry) => (
            <li key={`${entry.type}-${entry.id}`}>
              <button
                type="button"
                className={`activity-panel__entry activity-panel__entry--${entry.type}${
                  selected?.id === entry.id ? ' is-active' : ''
                }`}
                onClick={() => handleSelect(entry)}
              >
                <span className="activity-panel__entry-type">{entry.type}</span>
                <span className="activity-panel__entry-label">{entry.label}</span>
                <span className="activity-panel__entry-date">{new Date(entry.createdAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="activity-panel__detail">
          {selected && (selected.type === 'outline' || selected.type === 'plot') && (
            <>
              <TreeDiffView
                projectId={projectId}
                treeType={selected.type}
                fromSnapshotId={fromSnapshotIdFor(selected)}
                toSnapshotId={selected.id}
              />
              <button type="button" className="activity-panel__revert" onClick={handleRevert}>
                Revert to this version
              </button>
            </>
          )}
          {!selected && <p>Select an entry to see details.</p>}
        </div>
      </div>
    </div>
  )
}

export default ActivityPanel
