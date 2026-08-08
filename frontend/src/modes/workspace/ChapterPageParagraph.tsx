import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { PlotNode } from '../../types'
import { clampParagraphIndex, splitParagraphs } from '../../lib/paragraphs'
import { useAutosaveDraft } from '../draft/useAutosaveDraft'

interface Props {
  projectId: string
  chapterId: string
  momentId: string
  title: string
  showTitle: boolean
  /** Preview mode renders clean read-only markdown prose (successor to the
   * old Read tab) with no editing affordances or plotpoint pins at all. */
  preview: boolean
  plotNodes: PlotNode[]
  onAssignPlotpointToParagraph: (plotpointId: string, paragraphIndex: number) => void
  onUnassignPlotpoint: (plotpointId: string) => void
  highlighted?: boolean
}

// One moment's content within the continuous chapter page. Default state
// (not editing, not preview) renders paragraphs as plain read-only <p>
// blocks -- each a real drop target for a plotpoint dragged from the plot
// drawer -- and clicking any of them swaps the whole moment into a
// textarea (today's MomentEditor behavior) via useAutosaveDraft; blurring
// swaps back. This intentionally shows plain text (not markdown) in both
// states so there's no visual "pop" between them -- markdown rendering is
// reserved for preview mode.
function ChapterPageParagraph({
  projectId,
  chapterId,
  momentId,
  title,
  showTitle,
  preview,
  plotNodes,
  onAssignPlotpointToParagraph,
  onUnassignPlotpoint,
  highlighted,
}: Props) {
  const { body, setBody, flush, isSaving, dirty } = useAutosaveDraft(projectId, chapterId, momentId)
  const [editing, setEditing] = useState(false)

  const momentPlotpoints = plotNodes.filter((n) => n.kind === 'plotpoint' && n.assignedMomentId === momentId)
  const wholeMomentPlotpoints = momentPlotpoints.filter((p) => p.assignedParagraphIndex == null)
  const paragraphPlotpoints = momentPlotpoints.filter((p) => p.assignedParagraphIndex != null)

  function handleDrop(e: React.DragEvent, paragraphIndex: number) {
    const plotpointId = e.dataTransfer.getData('application/x-plotpoint-id')
    if (!plotpointId) return
    e.preventDefault()
    onAssignPlotpointToParagraph(plotpointId, paragraphIndex)
  }

  if (preview) {
    return (
      <article
        id={`moment-${momentId}`}
        className={`chapter-page__moment${highlighted ? ' is-highlighted' : ''}`}
      >
        {showTitle && <h4 className="chapter-page__moment-title">{title}</h4>}
        {body.trim() ? (
          <div className="chapter-page__preview-body">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        ) : (
          <p className="chapter-page__paragraph chapter-page__paragraph--empty">(empty)</p>
        )}
      </article>
    )
  }

  if (editing) {
    return (
      <article
        id={`moment-${momentId}`}
        className={`chapter-page__moment is-editing${highlighted ? ' is-highlighted' : ''}`}
      >
        {showTitle && <h4 className="chapter-page__moment-title">{title}</h4>}
        <textarea
          className="chapter-page__textarea"
          value={body}
          autoFocus
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => {
            flush()
            setEditing(false)
          }}
          placeholder="Start writing…"
        />
        <span className="chapter-page__status">{isSaving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
      </article>
    )
  }

  const paragraphs = splitParagraphs(body)

  return (
    <article
      id={`moment-${momentId}`}
      className={`chapter-page__moment${highlighted ? ' is-highlighted' : ''}`}
    >
      {showTitle && <h4 className="chapter-page__moment-title">{title}</h4>}

      {wholeMomentPlotpoints.length > 0 && (
        <div className="chapter-page__plotpoint-chips">
          {wholeMomentPlotpoints.map((pp) => (
            <span key={pp.id} className="chapter-page__plotpoint-chip">
              {pp.title || 'Untitled'}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onUnassignPlotpoint(pp.id)
                }}
                aria-label="Unassign plotpoint"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {paragraphs.length === 0 && (
        <p
          className="chapter-page__paragraph chapter-page__paragraph--empty"
          onClick={() => setEditing(true)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, 0)}
        >
          Start writing…
        </p>
      )}
      {paragraphs.map((paragraph, index) => {
        const pins = paragraphPlotpoints.filter(
          (pp) => clampParagraphIndex(pp.assignedParagraphIndex ?? 0, paragraphs.length) === index
        )
        return (
          <p
            key={index}
            className="chapter-page__paragraph"
            onClick={() => setEditing(true)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, index)}
          >
            {paragraph}
            {pins.map((pp) => (
              <span key={pp.id} className="chapter-page__pin" title={pp.title || 'Untitled'}>
                📌
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnassignPlotpoint(pp.id)
                  }}
                  aria-label="Unassign plotpoint"
                >
                  ×
                </button>
              </span>
            ))}
          </p>
        )
      })}
    </article>
  )
}

export default ChapterPageParagraph
