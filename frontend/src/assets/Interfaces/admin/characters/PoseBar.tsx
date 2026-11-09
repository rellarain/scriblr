import { BookmarkIcon, HandIcon, RestoreIcon } from '../../../icons'

// The bar above the canvas in Pose mode: what the last grab did, Reach (drag a hand or foot and the limb bends, also while Alt is held), Reset pose (the
// sliders back at rest) and Save as preset (keep the pose). A pose is only for looking until it is saved; the Ranges tab's sliders do the same by keyboard.
export function PoseBar({ status, reach, onReach, onReset, onSave, canReset }: { status: string; reach: boolean; onReach: () => void; onReset: () => void; onSave: () => void; canReset: boolean }) {
  return (
    <div className="cmPoseBar" role="group" aria-label="Pose">
      <p className="cmPoseText" role="status">{status}</p>
      <span className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${reach ? ' cmBtn--on' : ''}`} aria-pressed={reach} title="Drag a hand or a foot and the limb bends to follow (or hold Alt while you drag)" onClick={onReach}><HandIcon size={12} /> Reach</button>
        <button type="button" className="cmBtn cmBtn--small" disabled={!canReset} title="Put every slider back at rest" onClick={onReset}><RestoreIcon size={12} /> Reset pose</button>
        <button type="button" className="cmBtn cmBtn--small" title="Keep the sliders as they are as a preset of kind Pose" onClick={onSave}><BookmarkIcon size={12} /> Save as preset</button>
      </span>
    </div>
  )
}
