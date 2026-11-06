import { useState } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { CloseIcon } from '../../icons'
import { PlotNodeChip } from './PlotNodeChip'
import { linkChoices, linksOf } from './plotLinks'
import { nodeLabel } from './plotTree'
import { WorldLinks } from './links/WorldLinks'

// One link of the node: the other node as a row (PlotNodeChip), opened by its title, with a button to take the link away that asks first, in place.
// Taking it away is from both ends, which the confirmation says.
function LinkRow({ w, node, other }: { w: WriterWorkspace; node: PlotNode; other: PlotNode }) {
  const [confirming, setConfirming] = useState(false)
  const label = nodeLabel(other)
  return (
    <li>
      <PlotNodeChip
        w={w} node={other} kind place
        actions={confirming ? undefined : (
          <button type="button" className="wrChildRowTool" aria-label={`Remove the link to ${label}`} title={`Remove the link to ${label}`} onClick={() => setConfirming(true)}><CloseIcon size={14} /></button>
        )}
        below={confirming && (
          <span className="wrConfirm wrConfirm--dark" role="group" aria-label={`Remove the link to ${label}?`}>
            <span className="wrConfirmText">Remove the link to {label}? It also leaves {label}&apos;s Linked list.</span>
            <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={() => { setConfirming(false); w.removePlotLink(node.id, other.id) }}>Confirm</button>
            <button type="button" className="wrSmallBtn" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        )}
      />
    </li>
  )
}

// The Linked section of a category, subcategory, cluster or plotline: what it is linked to (each opens that node), and a picker, grouped by kind, to
// link it to another. A link is on both ends, so the other node lists this one too.
export function LinkedSection({ w, node }: { w: WriterWorkspace; node: PlotNode }) {
  const linked = linksOf(node).flatMap(id => w.plotNodeById.get(id) ?? [])
  const choices = linkChoices(node, w.plotNodes)
  const label = nodeLabel(node)
  return (
    <div className="wrLinked">
      <div className="wrLabel">Linked</div>
      {linked.length === 0 && <p className="wrMuted">Nothing linked yet.</p>}
      {linked.length > 0 && (
        <ul className="wrLinkedList" aria-label={`Linked to ${label}`}>
          {linked.map(other => <LinkRow key={other.id} w={w} node={node} other={other} />)}
        </ul>
      )}
      <select
        className="wrSelect" aria-label="Add link" value="" disabled={choices.length === 0}
        onChange={e => { if (e.target.value !== '') w.addPlotLink(node.id, e.target.value) }}
      >
        <option value="">{choices.length === 0 ? 'Nothing else to link' : 'Add link…'}</option>
        {choices.map(group => (
          <optgroup key={group.kind} label={group.heading}>
            {group.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </optgroup>
        ))}
      </select>
      <WorldLinks projectId={w.activeProjectId} self={`plot:${node.id}`} plotNodes={w.plotNodes} onOpenPlot={w.focusPlotNode} heading="Characters and places" />
    </div>
  )
}
