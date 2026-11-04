import type { ReactNode } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ParentKeywords } from './PlotParents'
import { plotColors, plotColorVars } from './plotColors'
import { nodeLabel, plotTrail } from './plotTree'

// A plot node as a row under another: a button that opens it (its title), then all its keywords and its whole description, in the colour the node
// has in the plot (a subcategory's or a cluster's own fill, a plotline on its category's, with the stripes of its place in the tree at the left).
// The child rows of a category, subcategory or cluster editor are these (PlotView.tsx), and so are the links of a node (LinkedSection.tsx), which also
// say what kind of node it is and where it sits, and carry a button of their own (`actions`, beside the title).
export function PlotNodeChip({ w, node, meta, kind, place, actions, below }: {
  w: WriterWorkspace
  node: PlotNode
  // What is quietly counted beside the title ("3 plotlines").
  meta?: string
  // Say what the node is (a link can be of any kind).
  kind?: boolean
  // Say where the node sits (its categories, subcategories and clusters).
  place?: boolean
  actions?: ReactNode
  // What goes under the description (a link's confirmation).
  below?: ReactNode
}) {
  const label = nodeLabel(node)
  const trail = place ? plotTrail(node, w.plotNodeById).map(nodeLabel).join(' › ') : ''
  const body = node.body.trim()
  return (
    <div className={`wrChildRow wrChildRow--${node.kind}`} style={plotColorVars(plotColors(node, w.plotNodeById, w.projectHue))} data-node-chip={node.id}>
      <div className="wrChildRowHead">
        <button type="button" className="wrChildRowOpen" aria-label={`Open ${label}`} title={`Open ${label}`} onClick={() => w.focusPlotNode(node.id)}>
          {kind && <span className="wrChildRowKind">{node.kind}</span>}
          <span className="wrChildRowTitle">{label}</span>
        </button>
        {meta && <span className="wrChildRowMeta">{meta}</span>}
        {actions}
      </div>
      {trail !== '' && <span className="wrChildRowPlace">{trail}</span>}
      <ParentKeywords parent={node} label={label} />
      {body !== '' && <p className="wrParentBody">{body}</p>}
      {below}
    </div>
  )
}
