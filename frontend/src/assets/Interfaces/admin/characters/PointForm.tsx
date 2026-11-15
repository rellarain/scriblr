import type { ModelPointMode } from '../../../../api/types'
import { AnchorIcon, HandIcon, OrbitIcon, SlidersIcon } from '../../../icons'
import { CanvasForm } from './CanvasForm'
import { MODES, MODE_NAMES } from './engine/geometry'

// The point form of the shape editor (shape types T2): a right-click on a point opens it there. It holds the point's type (its curve: sharp, curve, curve then sharp, sharp then
// curve); a choice is made at once and closes the form. Anchor pins the point (T4), Posable makes it a point to pose the figure with and Slider lets a point locked onto a
// segment slide between two stops (T5), Pivot here starts a pivot on it (T3). Opened inside a shape (away from its points) it holds only what can lie inside one: an anchor
// or a posable point there.

export function PointForm({ at, mode, onMode, onPivotHere, anchored, onAnchor, posable, onPosable, slider, onSlider, onClose }: {
  at: { left: number; top: number }; mode?: ModelPointMode; onMode?: (m: ModelPointMode) => void; onPivotHere?: () => void; anchored?: boolean; onAnchor?: () => void
  posable?: boolean; onPosable?: () => void; slider?: boolean; onSlider?: () => void; onClose: () => void
}) {
  return (
    <CanvasForm at={at} label="Point type" className="cmPointForm" onClose={onClose}>
      {mode && onMode && (
        <div className="cmPointFormRow" role="group" aria-label="Curve of the point">
          {MODES.map(m => (
            <button key={m} type="button" className={`cmChip${mode === m ? ' cmChip--on' : ''}`} aria-pressed={mode === m} data-choice={mode === m ? 'on' : undefined} onClick={() => onMode(m)}>{MODE_NAMES[m]}</button>
          ))}
        </div>
      )}
      {(onPivotHere || onAnchor || onPosable || onSlider) && (
        <div className="cmPointFormRow" role="group" aria-label="Point types">
          {onAnchor && (
            <button
              type="button" className={`cmIconBtn${anchored ? ' cmIconBtn--on' : ''}`} aria-pressed={!!anchored} aria-label="Anchor"
              title={anchored ? 'Anchor: take the anchor off' : 'Anchor: pin the shape here'} onClick={onAnchor}
            ><AnchorIcon size={14} /></button>
          )}
          {onPosable && (
            <button
              type="button" className={`cmIconBtn${posable ? ' cmIconBtn--on' : ''}`} aria-pressed={!!posable} aria-label="Posable"
              title={posable ? 'Posable: take the posable point off' : 'Posable: drag this point in Pose mode to pose the figure'} onClick={onPosable}
            ><HandIcon size={14} /></button>
          )}
          {onSlider && (
            <button
              type="button" className={`cmIconBtn${slider ? ' cmIconBtn--on' : ''}`} aria-pressed={!!slider} aria-label="Slider"
              title={slider ? 'Slider: let the point stay where it is put' : 'Slider: the point slides along the segment between two stops'} onClick={onSlider}
            ><SlidersIcon size={14} /></button>
          )}
          {onPivotHere && <button type="button" className="cmIconBtn" aria-label="Pivot here" title="Pivot here: a pivot of two circles round this point" onClick={onPivotHere}><OrbitIcon size={14} /></button>}
        </div>
      )}
    </CanvasForm>
  )
}
