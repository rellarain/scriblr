import { useState } from 'react'
import { AwarenessEye } from './AwarenessEye'
import { textOf, valueHeader } from './plotFields'
import type { PlacedPoint } from './plotTree'
import { plotColors, plotColorVars } from './plotColors'
import { PlotValueHead, PlotValuePlace } from './PlotValueHead'
import type { WriterWorkspace } from './useWriterWorkspace'

// The Draft level: the chapter's placements as footnote cards in a column of their own
// in the paper's right margin, beside the draft text (never over it). A closed card shows
// only the plotpoint's title (and its awareness eye on a moment); clicking it opens the card
// in place, headed like the plotpoint's tile (PlotValueHead.tsx: category › subcategory › cluster, then the plotline, fieldset and field), to show the
// title and description.
export function DraftPlotNotes({ w, points, momentIds }: { w: WriterWorkspace; points: PlacedPoint[]; momentIds: Set<string> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (points.length === 0) return null
  return (
    <aside className="wrPlotNotes" aria-label="Plotpoints in this chapter">
      {points.map(({ point: p, placement }) => {
        const text = textOf(p, w.plotNodeById)
        const head = valueHeader(p, w.plotNodeById)
        const open = openId === placement.id
        return (
          <div key={placement.id} className={`wrPlotNote${open ? ' wrPlotNote--open' : ''}`} data-point={p.id} style={plotColorVars(plotColors(p, w.plotNodeById, w.projectHue))}>
            <button type="button" className="wrPlotNoteHead" aria-expanded={open} onClick={() => setOpenId(open ? null : placement.id)}>
              {open ? (
                <span className="wrPlotNoteBody">
                  <PlotValuePlace head={head} />
                  <PlotValueHead head={head} inline />
                  <span className="wrPointTileTitle">{text.title || 'Untitled'}</span>
                  {text.body.trim() !== '' && <span className="wrPointTileBody">{text.body}</span>}
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
