import { SwapIcon } from './assets/icons'
import { setUi, useSettings } from './settings/settingsStore'
import { AUTOSAVE_MAX_SECONDS, AUTOSAVE_STEP_SECONDS } from './theme/types'
import './theme/themeSettings.scss'

interface CustomizeControlsProps {
  // Jump to the theme customization tool (UUI Dashboard > Settings).
  onOpenThemeSettings: () => void
}

// UUI Account > Settings: handedness, autosave, plus a pointer to the theme tool (the
// color, brightness and time-of-day controls live in Dashboard > Settings).
// 30 seconds up to 10 minutes, in 30-second steps.
const AUTOSAVE_OPTIONS = Array.from({ length: AUTOSAVE_MAX_SECONDS / AUTOSAVE_STEP_SECONDS }, (_, i) => (i + 1) * AUTOSAVE_STEP_SECONDS)

export function formatInterval(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const m = minutes === 1 ? '1 minute' : `${minutes} minutes`
  if (minutes === 0) return `${rest} seconds`
  return rest === 0 ? m : `${m} ${rest} seconds`
}

function CustomizeControls({ onOpenThemeSettings }: CustomizeControlsProps) {
  const { ui } = useSettings()
  const handedness = ui.handedness
  return (
    <div className="customize">
      <h2>Customize</h2>

      <div className="customizeGroup">
        <div className="customizeGroupHeader">
          <span>Handedness</span>
        </div>
        <button
          type="button" className="toneBtn"
          aria-label={`Handedness: ${handedness} (click to switch)`}
          onClick={() => setUi(prev => ({ ...prev, handedness: prev.handedness === 'right' ? 'left' : 'right' }))}
        >
          <SwapIcon size={16} /> {handedness === 'right' ? 'Right' : 'Left'}
        </button>
      </div>

      <div className="customizeGroup">
        <div className="customizeGroupHeader">
          <span>Autosave</span>
        </div>
        <label className="themeSwitch">
          <input
            type="checkbox" role="switch" checked={ui.autosaveEnabled}
            onChange={e => setUi(prev => ({ ...prev, autosaveEnabled: e.target.checked }))}
          />
          <span>{ui.autosaveEnabled ? 'Save automatically' : 'Save only when I press Save'}</span>
        </label>
        <div className="customizeAutosaveRow">
          <span>Save after</span>
          <select
            value={ui.autosaveSeconds} disabled={!ui.autosaveEnabled} aria-label="Autosave interval"
            onChange={e => setUi(prev => ({ ...prev, autosaveSeconds: Number(e.target.value) }))}
          >
            {AUTOSAVE_OPTIONS.map(sec => <option key={sec} value={sec}>{formatInterval(sec)}</option>)}
          </select>
          <span>without changes</span>
        </div>
        <p className="customizeNote">
          Editors also save when you leave a page, and changing this saves anything waiting. With autosave off, the floppy disk saves
          and the arrow beside the time goes back to the last saved version.
        </p>
      </div>

      <div className="customizeGroup themeLinkRow">
        <span>Colors, brightness and time-of-day themes</span>
        <button type="button" className="themeBtn" onClick={onOpenThemeSettings}>Open theme settings</button>
      </div>
    </div>
  )
}

export default CustomizeControls
