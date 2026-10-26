import {
  redoSettings, setAutosaveMode, undoSettings, useSettings, useSettingsCountdown, useSettingsHistory, useSettingsSaveStatus,
} from '../settings/settingsStore'
import { autosaveModeOf } from '../theme/types'
import { discardThemeDraft, redoThemeDraft, saveThemeDraft, undoThemeDraft, useThemeDraftView } from '../theme/themeDraft'
import { SaveCluster } from './SaveCluster'

// The Save component for the user's settings (theme, UI and autosave): the Dash, the Theme panel and Account > Settings.
// The theme panel stages its edits in a draft (theme/themeDraft.ts) that the rest of the app does not see until it is saved: while it
// holds edits Save is lit, Save commits them (and sends everything that is waiting), and Undo steps back through them before it reaches
// the settings' own history.
export function SettingsSaveCluster({ buttonClassName = 'saveBtn', showHistory = true }: { buttonClassName?: string; showHistory?: boolean }) {
  const { ui } = useSettings()
  const stored = useSettingsSaveStatus()
  const history = useSettingsHistory()
  const countdown = useSettingsCountdown()
  const draft = useThemeDraftView()
  const status = draft.dirty && stored.state === 'saved' ? { ...stored, state: 'unsaved' as const, dirty: true } : stored
  const onUndo = () => {
    if (draft.canUndo) { undoThemeDraft(); return }
    discardThemeDraft()
    undoSettings()
  }
  const onRedo = () => {
    if (draft.canRedo) { redoThemeDraft(); return }
    redoSettings()
  }
  return (
    <SaveCluster
      status={status} onSave={() => { void saveThemeDraft() }} buttonClassName={buttonClassName}
      history={showHistory ? { canUndo: draft.canUndo || history.canUndo, canRedo: draft.canRedo || history.canRedo, onUndo, onRedo } : undefined}
      autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: countdown.nextSaveAt, wait: countdown.wait }}
    />
  )
}

export default SettingsSaveCluster
