import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import type { HistoryScope, WriterWorkspace } from '../useWriterWorkspace'

// The Save component of a level that edits the open project: Save and autosave are level-wide (the outline, plot and project settings),
// Undo and Redo act on one document, `scope` (the one the focused tile edits; none = no Undo here).
export function WorkspaceSaveCluster({ w, scope }: { w: WriterWorkspace; scope?: HistoryScope }) {
  const { ui } = useSettings()
  return (
    <SaveCluster
      status={w.saveStatus} onSave={() => { void w.saveNow() }} buttonClassName="wrSmallBtn wrSaveBtn"
      history={scope ? {
        canUndo: w.history.canUndo(scope), canRedo: w.history.canRedo(scope),
        onUndo: () => w.history.undo(scope), onRedo: () => w.history.redo(scope),
      } : undefined}
      autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: w.saveCountdown.nextSaveAt, wait: w.saveCountdown.wait }}
    />
  )
}

export default WorkspaceSaveCluster
