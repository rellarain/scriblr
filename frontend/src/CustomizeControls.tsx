import { SwapIcon } from './assets/icons'
import { AutosaveToggle } from './components/AutosaveToggle'
import { SettingsSaveCluster } from './components/SettingsSaveCluster'
import { setAutosaveMode, setUi, useSettings } from './settings/settingsStore'
import ThemeSettingsPanel from './theme/ThemeSettingsPanel'
import { autosaveModeOf } from './theme/types'
import './theme/themeSettings.scss'

// UUI Account > Settings: handedness, autosave, and the theme tool (colors,
// brightness, time-of-day zones), all saved by the one shared Save/Restore
// control at the top -- they're all the same settings store underneath.
export function formatInterval(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const m = minutes === 1 ? '1 minute' : `${minutes} minutes`
  if (minutes === 0) return `${rest} seconds`
  return rest === 0 ? m : `${m} ${rest} seconds`
}

function CustomizeControls() {
  const { ui } = useSettings()
  const handedness = ui.handedness
  return (
    <div className="customize">
      <div className="themeHeader">
        <h2>Customize</h2>
        <SettingsSaveCluster buttonClassName="themeBtn themeBtn--primary" />
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
        <AutosaveToggle mode={autosaveModeOf(ui)} onChange={setAutosaveMode} />
        <p className="customizeNote">
          Off by default. With autosave on, an editor saves once you have stopped changing it for the time you choose, and a timer beside the
          floppy disk shows how long is left. Editors also save when you leave a page. Undo and Redo step back and forward through your changes.
        </p>
      </div>

      <ThemeSettingsPanel showHeader={false} />
    </div>
  )
}

export default CustomizeControls
