import { useOutlineDiff } from '../../api/outline'
import { usePlotDiff } from '../../api/plot'
import type { TreeType } from '../../types'

interface Props {
  projectId: string | undefined
  treeType: TreeType
  fromSnapshotId: string | undefined
  toSnapshotId: string
}

// Shared outline/plot diff renderer -- the entries shape (added/removed/
// modified node list with changed field names) is identical for both trees,
// only the underlying query hook differs.
function TreeDiffView({ projectId, treeType, fromSnapshotId, toSnapshotId }: Props) {
  const outlineDiff = useOutlineDiff(treeType === 'outline' ? projectId : undefined, fromSnapshotId, toSnapshotId)
  const plotDiff = usePlotDiff(treeType === 'plot' ? projectId : undefined, fromSnapshotId, toSnapshotId)
  const diff = treeType === 'outline' ? outlineDiff : plotDiff

  if (!fromSnapshotId) {
    return <p className="tree-diff-view__empty">Initial snapshot — nothing earlier to compare against.</p>
  }
  if (diff.isLoading) return <p>Loading diff…</p>
  if (!diff.data) return null

  const entries = diff.data.entries.filter((e) => e.kind !== 'unchanged')

  return (
    <ul className="tree-diff-view">
      {entries.length === 0 && <li className="tree-diff-view__empty">No changes.</li>}
      {entries.map((entry) => (
        <li key={entry.nodeId} className={`tree-diff-view__entry tree-diff-view__entry--${entry.kind}`}>
          <span className="tree-diff-view__kind">{entry.kind}</span>
          <span className="tree-diff-view__title">{entry.title || 'Untitled'}</span>
          {entry.changedFields.length > 0 && (
            <span className="tree-diff-view__fields">({entry.changedFields.join(', ')})</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default TreeDiffView
