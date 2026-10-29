import { useState } from 'react'
import { AwarenessEye } from './AwarenessEye'
import { fieldNameOf, textOf } from './plotFields'
import { nodeLabel, plotTrail, type PlacedPoint } from './plotTree'
import { plotColors, plotColorVars } from './plotColors'
import type { WriterWorkspace } from './useWriterWorkspace'

// The Draft level: the chapter's placements as footnote cards in a column of their own
// in the paper's right margin, beside the draft text (never over it). A closed card shows
// only the plotpoint's title (and its awareness eye on a moment); clicking it opens the card
// in place to show category > subcategory > cluster, plotline and field, title and description.
export function DraftPlotNotes({ w, points, momentIds }: { w: WriterWorkspace; points: PlacedPoint[]; momentIds: Set<string> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (points.length === 0) return null
  return (
    <aside className="wrPlotNotes" aria-label="Plotpoints in this chapter">
      {points.map(({ point: p, placement }) => {
        const text = textOf(p, w.plotNodeById)
        const plotline = p.parentId ? w.plotNodeById.get(p.parentId) : undefined
        const trail = (plotline ? plotTrail(plotline, w.plotNodeById) : []).map(nodeLabel).join(' › ')
        const field = fieldNameOf(p, w.plotNodeById)
        const open = openId === placement.id
        return (
          <div key={placement.id} className={`wrPlotNote${open ? ' wrPlotNote--open' : ''}`} data-point={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))}>
            <button type="button" className="wrPlotNoteHead" aria-expanded={open} onClick={() => setOpenId(open ? null : placement.id)}>
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
              {momentIds.has(placement.targetId) && placement.awareness && <AwarenessEye state={placement.awareness} size={14} />}
            </button>
          </div>
        )
      })}
    </aside>
  )
}

export default DraftPlotNotes
