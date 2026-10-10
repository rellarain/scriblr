import {
  redoSettings, saveSettingsNow, setAutosaveMode, undoSettings, useSettings, useSettingsCountdown, useSettingsHistory, useSettingsSaveStatus,
} from '../settings/settingsStore'
import { autosaveModeOf } from '../theme/types'
import { SaveCluster } from './SaveCluster'

// The Save component for the user's settings (theme, UI and autosave): the Dash, the Theme panel and Account > Settings.
export function SettingsSaveCluster({ buttonClassName = 'saveBtn', showHistory = true }: { buttonClassName?: string; showHistory?: boolean }) {
  const { ui } = useSettings()
  const status = useSettingsSaveStatus()
  const history = useSettingsHistory()
  const countdown = useSettingsCountdown()
  return (
    <SaveCluster
      status={status} onSave={() => { void saveSettingsNow() }} buttonClassName={buttonClassName}
      history={showHistory ? { canUndo: history.canUndo, canRedo: history.canRedo, onUndo: undoSettings, onRedo: redoSettings } : undefined}
      autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: countdown.nextSaveAt, wait: countdown.wait }}
    />
  )
}

export default SettingsSaveCluster
