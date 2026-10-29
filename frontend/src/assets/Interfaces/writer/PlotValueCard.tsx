import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { PlotNode } from '../../../api/types'
import { GripIcon, LockIcon } from '../../icons'
import { BODY_MAX, TITLE_MAX, textOf } from './plotFields'
import { valueLook } from './plotCardColors'
import { placedCount } from './plotPlacement'
import { nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import type { WriterWorkspace } from './useWriterWorkspace'

// One value of a field, as a plotpoint card: a plain box with rounded corners, the
// field's name small and bold in the top left, the title and (once there is a
// title and Tab is pressed) the description, a counter (x3) once it is placed, and one icon on the right:
//   own value, not placed      delete
//   reference                  a lock (it is deleted where it was defined)
//   own value, placed          a lock (take its placements away first: on the plot's chapter panel, or in the outline)
// The card stays in its field however often it is placed, and always has a grip that drags it onto another chapter (a new placement; one
// it is already on is left as it is) or, while it is not placed, for an own value, into another of the plotline's own fields.
export function PlotValueCard({ w, point, fieldName, drag, dragging, autoFocus }: {
  w: WriterWorkspace
  point: PlotNode
  fieldName: string
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }
  dragging?: boolean
  autoFocus?: boolean
}) {
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const placed = placedCount(point, outlineById)
  const isRef = Boolean(point.refId)
  const text = textOf(point, w.plotNodeById)
  const original = point.refId ? w.plotNodeById.get(point.refId) : undefined
  const definedOn = original?.parentId ? w.plotNodeById.get(original.parentId) : undefined

  // The description shows once there is text in it, or after Tab from a titled value.
  const [revealed, setRevealed] = useState(false)
  const bodyRef = useRef<HTMLInputElement>(null)
  const showBody = text.body !== '' || revealed
  useEffect(() => { if (revealed) bodyRef.current?.focus() }, [revealed])

  const highlighted = w.highlightedPointId === point.id

  // A new value left without a title is discarded when focus leaves the card.
  function onBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setRevealed(false)
    if (!isRef && placed === 0 && point.title.trim() === '' && point.body.trim() === '') w.removePlotValue(point.id)
  }

  const icon = (() => {
    if (isRef) {
      return (
        <span className="wrPlotValueLock" title={`Defined on ${definedOn ? nodeLabel(definedOn) : 'its category'}. Delete it there.`}>
          <LockIcon size={14} />
        </span>
      )
    }
    if (placed === 0) return <DeleteControl tone="dark" message="Delete value?" onConfirm={() => w.removePlotValue(point.id)} />
    return (
      <span className="wrPlotValueLock" title={`Placed ${placed === 1 ? 'once' : `${placed} times`}. Take its placements away to delete it.`}>
        <LockIcon size={14} />
      </span>
    )
  })()

  return (
    <div
      className={`wrPlotValue${placed === 0 ? '' : ' wrPlotValue--assigned'}${dragging ? ' wrPlotValue--dragging' : ''}${highlighted ? ' wrPlotValue--highlight' : ''}`}
      data-knode={point.id} data-point={point.id} style={valueLook(point, w.plotNodeById)} onBlur={onBlur}
    >
      <span className="wrPlotValueField">{fieldName}</span>
      {drag && (
        <span
          className="wrGrip wrPlotValueGrip" draggable {...drag} aria-label="Drag plotpoint"
          title={isRef || placed > 0 ? 'Drag onto a chapter' : 'Drag onto a chapter, or into another of this plotline\'s fields'}
        >
          <GripIcon size={14} />
        </span>
      )}
      <div className="wrPlotValueBody">
        {isRef ? (
          <>
            <div className="wrPlotValueTitle">{text.title || 'Untitled'}</div>
            {text.body !== '' && <div className="wrPlotValueText">{text.body}</div>}
          </>
        ) : (
          <>
            <input
              className="wrPointTitle" data-kf="" value={point.title} placeholder="Title" maxLength={TITLE_MAX} autoFocus={autoFocus}
              aria-label={`${fieldName} value title`}
              onChange={e => {
                // A description never stands without a title.
                if (e.target.value.trim() === '' && point.body.trim() !== '') return
                w.updatePlotValue(point.id, { title: e.target.value })
              }}
              onKeyDown={e => {
                if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && point.title.trim() !== '' && !showBody) {
                  e.preventDefault()
                  setRevealed(true)
                }
              }}
            />
            {showBody && (
              <input
                ref={bodyRef} className="wrPointBody" data-kf="" value={point.body} placeholder="Description" maxLength={BODY_MAX}
                aria-label={`${fieldName} value description`}
                onChange={e => w.updatePlotValue(point.id, { body: e.target.value })}
              />
            )}
          </>
        )}
      </div>
      {placed > 0 && <span className="wrCount" title={`Placed ${placed === 1 ? 'once' : `${placed} times`}`} aria-label={`Placed ${placed === 1 ? 'once' : `${placed} times`}`}>×{placed}</span>}
      <div className="wrPlotValueIcon">{icon}</div>
    </div>
  )
}

export default PlotValueCard
