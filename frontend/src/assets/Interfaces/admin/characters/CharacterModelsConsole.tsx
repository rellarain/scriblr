import { useState } from 'react'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import type { ModelEntry } from '../../../../api/types'
import { ModelList } from './ModelList'
import { ModelPane } from './ModelPane'
import { blankContent, randomId } from './modelContent'
import { useCharacterModels } from './useCharacterModels'
import './characterModels.scss'

// AUI > Configuration > Characters: the models the character designer is built from. A list of models and, beside it, the open one: a tree of its
// groups, objects and shapes, a canvas to draw the shapes on, an inspector, and previews under it. Edits save to the draft the way the Writer's do (the
// Save button, and autosave when the user has turned it on); each model is published on its own.
function CharacterModelsConsole() {
  const models = useCharacterModels()
  const { ui } = useSettings()
  const { entries } = models
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const current: ModelEntry | undefined = entries.find(e => e.id === selectedId) ?? entries[0]

  function select(id: string) {
    setSelectedId(id)
    setListOpen(false)
  }

  function create() {
    select(models.addModel(blankContent()))
  }

  function duplicate(id: string) {
    const copy = models.duplicateModel(id)
    if (copy) select(copy)
  }

  function remove(id: string) {
    const at = entries.findIndex(e => e.id === id)
    const next = entries[at + 1] ?? entries[at - 1]
    models.removeModel(id)
    setSelectedId(next?.id ?? null)
  }

  if (models.status === 'loading') return <p className="cmNote" role="status">Loading the models…</p>
  if (models.status === 'error') {
    return (
      <div className="cmNote" role="alert">
        <p>{models.loadError ?? 'The models could not be loaded.'}</p>
        <button type="button" className="cmBtn" onClick={() => void models.reload()}>Try again</button>
      </div>
    )
  }

  return (
    <div className="cmPage">
      <div className="cmBar">
        <h2 className="cmBarTitle">Character models</h2>
        <SaveCluster
          status={models.saveStatus} onSave={() => { void models.saveNow() }} scope=".cmPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: models.saveCountdown.nextSaveAt, wait: models.saveCountdown.wait }}
        />
      </div>
      {entries.length === 0 ? (
        <div className="cmEmpty">
          <h3>No models yet</h3>
          <p>A model is the set of shapes a character is drawn from: its body, its clothes and its hair, arranged in groups and objects. Create one, then draw its first shape from a template.</p>
          <div className="cmFoot">
            <button type="button" className="cmBtn cmBtn--primary" onClick={create}>New model</button>
          </div>
        </div>
      ) : (
        <div className="cmSplit">
          <ModelList entries={entries} current={current} open={listOpen} onToggle={() => setListOpen(o => !o)} onSelect={select} onNew={create} onMove={models.moveModel} />
          {current && <ModelPane key={current.id} entry={current} models={models} makeId={randomId} onRemove={remove} onDuplicate={duplicate} />}
        </div>
      )}
    </div>
  )
}

export default CharacterModelsConsole
