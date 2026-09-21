import { useState } from 'react'
import type { PlotNode } from '../../../api/types'
import { AwarenessEye } from './AwarenessEye'
import { fieldNameOf, textOf } from './plotFields'
import { nodeLabel } from './plotTree'
import { plotColors, plotColorVars } from './plotColors'
import type { WriterWorkspace } from './useWriterWorkspace'

// Draft mode: the chapter's placed plotpoints as footnote cards in a column of their own
// in the paper's right margin, beside the draft text (never over it). A closed card shows
// only the plotpoint's title (and its awareness eye on a moment); clicking it opens the card
// in place to show category > subcategory, plotline and field, title and description.
export function DraftPlotNotes({ w, points, momentIds }: { w: WriterWorkspace; points: PlotNode[]; momentIds: Set<string> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (points.length === 0) return null
  return (
    <aside className="wrPlotNotes" aria-label="Plotpoints in this chapter">
      {points.map(p => {
        const text = textOf(p, w.plotNodeById)
        const plotline = p.parentId ? w.plotNodeById.get(p.parentId) : undefined
        const parent = plotline?.parentId ? w.plotNodeById.get(plotline.parentId) : undefined
        const category = parent?.kind === 'subcategory' ? (parent.parentId ? w.plotNodeById.get(parent.parentId) : undefined) : parent
        const trail = [category, parent?.kind === 'subcategory' ? parent : undefined].filter((n): n is PlotNode => Boolean(n)).map(nodeLabel).join(' › ')
        const field = fieldNameOf(p, w.plotNodeById)
        const open = openId === p.id
        return (
          <div key={p.id} className={`wrPlotNote${open ? ' wrPlotNote--open' : ''}`} data-point={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))}>
            <button type="button" className="wrPlotNoteHead" aria-expanded={open} onClick={() => setOpenId(open ? null : p.id)}>
              {open ? (
                <span className="wrPlotNoteBody">
                  {trail && <span className="wrPointTileTrail">{trail}</span>}
                  <span className="wrPointTileLine">{plotline ? nodeLabel(plotline) : ''}{field && <span className="wrPointTileField"> · {field}</span>}</span>
                  <span className="wrPointTileTitle">{text.title || 'Untitled'}</span>
                  {text.body.trim() !== '' && <span className="wrPointTileLine wrPointTileBody">{text.body}</span>}
                </span>
              ) : (
                <span className="wrPlotNoteTitle">{text.title || 'Untitled'}</span>
              )}
              {momentIds.has(p.assignedMomentId ?? '') && p.awareness && <AwarenessEye state={p.awareness} size={14} />}
            </button>
          </div>
        )
      })}
    </aside>
  )
}

export default DraftPlotNotes
