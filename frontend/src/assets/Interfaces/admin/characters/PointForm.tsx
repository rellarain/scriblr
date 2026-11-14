import type { ModelPointMode } from '../../../../api/types'
import { CanvasForm } from './CanvasForm'
import { MODES, MODE_NAMES } from './engine/geometry'

// The point form of the shape editor (shape types T2): a right-click on a point opens it there. It holds the point's type (its curve: sharp, curve, curve then sharp, sharp then
// curve); a choice is made at once and closes the form. The point types of the later slices (anchor, slider, posable, a pivot here) join it.

export function PointForm({ at, mode, onMode, onClose }: { at: { left: number; top: number }; mode: ModelPointMode; onMode: (m: ModelPointMode) => void; onClose: () => void }) {
  return (
    <CanvasForm at={at} label="Point type" className="cmPointForm" onClose={onClose}>
      <div className="cmPointFormRow" role="group" aria-label="Curve of the point">
        {MODES.map(m => (
          <button key={m} type="button" className={`cmChip${mode === m ? ' cmChip--on' : ''}`} aria-pressed={mode === m} data-choice={mode === m ? 'on' : undefined} onClick={() => onMode(m)}>{MODE_NAMES[m]}</button>
        ))}
      </div>
    </CanvasForm>
  )
}
