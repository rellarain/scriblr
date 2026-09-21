import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { PlotNode } from '../../../api/types'
import { useThemeState } from '../../../theme/useTheme'
import { CloseIcon, GripIcon, LockIcon } from '../../icons'
import { AwarenessEye } from './AwarenessEye'
import { BODY_MAX, TITLE_MAX, textOf } from './plotFields'
import { pointLook } from './plotCardColors'
import { nodeLabel } from './plotTree'
import { DeleteControl } from './shared'
import type { WriterWorkspace } from './useWriterWorkspace'

// One value of a field, as a plotpoint card: a plain box with rounded corners, the
// field's name small and bold in the top left, the title and (once there is a
// title and Tab is pressed) the description, and one icon on the right:
//   unassigned own value       delete
//   unassigned reference       a lock (it is deleted where it was defined)
//   assigned to a chapter      an x that unassigns it
//   placed on a moment         the awareness eye
//   placed on an act or scene  a lock (unassign it in the chapter outline first)
// An unassigned card has a grip that drags it onto a chapter (or, for an own
// value, into another of the plotline's own fields).
export function PlotValueCard({ w, point, fieldName, drag, dragging, autoFocus }: {
  w: WriterWorkspace
  point: PlotNode
  fieldName: string
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }
  dragging?: boolean
  autoFocus?: boolean
}) {
  const { activeZone } = useThemeState()
  const outlineById = new Map(w.outlineNodes.map(n => [n.id, n]))
  const look = pointLook(point, w.outlineNodes, outlineById, w.plotNodeById, activeZone)
  const isRef = Boolean(point.refId)
  const text = textOf(point, w.plotNodeById)
  const target = point.assignedMomentId ? outlineById.get(point.assignedMomentId) : undefined
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
    if (!isRef && look.level === 'none' && point.title.trim() === '' && point.body.trim() === '') w.removePlotValue(point.id)
  }

  const icon = (() => {
    if (look.level === 'none') {
      if (isRef) {
        return (
          <span className="wrPlotValueLock" title={`Defined on ${definedOn ? nodeLabel(definedOn) : 'its category'}. Delete it there.`}>
            <LockIcon size={14} />
          </span>
        )
      }
      return <DeleteControl tone="dark" message="Delete value?" onConfirm={() => w.removePlotValue(point.id)} />
    }
    if (look.level === 'chapter') {
      return (
        <button type="button" className="wrPlotValueX" aria-label={`Unassign ${text.title || 'plotpoint'}`} title="Remove from the chapter" onClick={() => w.assignPlotpoint(point.id, null)}>
          <CloseIcon size={14} />
        </button>
      )
    }
    if (target?.kind === 'moment' && point.awareness) {
      return <AwarenessEye state={point.awareness} onCycle={() => w.cyclePlotAwareness(point.id)} />
    }
    return (
      <span className="wrPlotValueLock" title="Placed in the chapter outline. Unassign it there first.">
        <LockIcon size={14} />
      </span>
    )
  })()

  return (
    <div
      className={`wrPlotValue${look.level === 'none' ? '' : ' wrPlotValue--assigned'}${dragging ? ' wrPlotValue--dragging' : ''}${highlighted ? ' wrPlotValue--highlight' : ''}`}
      data-knode={point.id} data-point={point.id} style={look.style} onBlur={onBlur}
    >
      <span className="wrPlotValueField">{fieldName}</span>
      {drag && look.level === 'none' && (
        <span
          className="wrGrip wrPlotValueGrip" draggable {...drag} aria-label="Drag plotpoint"
          title={isRef ? 'Drag onto a chapter' : 'Drag onto a chapter, or into another of this plotline\'s fields'}
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
      <div className="wrPlotValueIcon">{icon}</div>
    </div>
  )
}

export default PlotValueCard
