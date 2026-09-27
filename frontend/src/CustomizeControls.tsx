import { SwapIcon } from './assets/icons'
import { SaveControl } from './components/SaveControl'
import { restoreSettings, saveSettingsNow, setUi, useSettings, useSettingsSaveStatus } from './settings/settingsStore'
import ThemeSettingsPanel from './theme/ThemeSettingsPanel'
import { AUTOSAVE_MAX_SECONDS, AUTOSAVE_STEP_SECONDS } from './theme/types'
import './theme/themeSettings.scss'

// UUI Account > Settings: handedness, autosave, and the theme tool (colors,
// brightness, time-of-day zones), all saved by the one shared Save/Restore
// control at the top -- they're all the same settings store underneath.
// 30 seconds up to 10 minutes, in 30-second steps.
const AUTOSAVE_OPTIONS = Array.from({ length: AUTOSAVE_MAX_SECONDS / AUTOSAVE_STEP_SECONDS }, (_, i) => (i + 1) * AUTOSAVE_STEP_SECONDS)

export function formatInterval(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const m = minutes === 1 ? '1 minute' : `${minutes} minutes`
  if (minutes === 0) return `${rest} seconds`
  return rest === 0 ? m : `${m} ${rest} seconds`
}

function CustomizeControls() {
  const { ui } = useSettings()
  const saveStatus = useSettingsSaveStatus()
  const handedness = ui.handedness
  return (
    <div className="customize">
      <div className="themeHeader">
        <h2>Customize</h2>
        <SaveControl status={saveStatus} onSave={() => { void saveSettingsNow() }} onRestore={restoreSettings} buttonClassName="themeBtn themeBtn--primary" />
      </div>

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

      <ThemeSettingsPanel showHeader={false} />
    </div>
  )
}

export default CustomizeControls
