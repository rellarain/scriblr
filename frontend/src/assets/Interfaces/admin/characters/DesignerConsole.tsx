import { useRef, useState, type ChangeEvent } from 'react'
import type { ModelEntry } from '../../../../api/types'
import { downloadTextFile, readFileText } from '../plot/presetFile'
import { ModelPane } from './ModelPane'
import { ModelFileError, exportFileName, parseModelFile, serializeModels } from './modelFile'
import { randomId, starterContent } from './modelContent'
import { useCharacterModels } from './useCharacterModels'
import './characterModels.scss'

// What an import did, shown until it is dismissed.
interface ImportNotice { tone: 'ok' | 'error'; lines: string[] }

// The Designer (an Admin console of its own, beside Configuration): the models character art is drawn from. The canvas fills the console, with the tree of the open model on
// its left, the editor on its right, the view controls under it and the console tools (undo, redo, save, publish) in the console's header (`toolbarHost`; without one they
// sit at the top). Edits save to the draft the way the Writer's do (the Save button, and autosave when the user has turned it on); each model is published on its own.
function DesignerConsole({ toolbarHost = null }: { toolbarHost?: HTMLElement | null }) {
  const models = useCharacterModels()
  const { entries } = models
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [notice, setNotice] = useState<ImportNotice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const current: ModelEntry | undefined = entries.find(e => e.id === selectedId) ?? entries[0]

  function select(id: string) {
    setSelectedId(id)
    setListOpen(false)
  }

  function create() {
    select(models.addModel(starterContent()))
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

  function exportEntries(list: ModelEntry[]) {
    const contents = list.map(e => e.draft)
    downloadTextFile(exportFileName(contents), serializeModels(contents))
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { models: found, skipped } = parseModelFile(await readFileText(file))
      const added = await models.importModels(found)
      if (added[0]) select(added[0].id)
      const skippedLines = skipped.map(s => `Skipped: ${s}`)
      setNotice(added.length === 0
        ? { tone: 'error', lines: ['Nothing in the file could be imported.', ...skippedLines] }
        : {
          tone: 'ok',
          lines: [`Imported ${added.length} model${added.length === 1 ? '' : 's'} as drafts. They stay unpublished until you publish them.`, added.map(a => a.name).join(' · '), ...skippedLines],
        })
    } catch (err) {
      setNotice({ tone: 'error', lines: [err instanceof ModelFileError ? err.message : 'The file could not be read.'] })
    }
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
    <div className="cmPage dzConsole" role="region" aria-label="Designer">
      {notice && (
        <div className={`cmToast${notice.tone === 'error' ? ' cmToast--error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <p><b>{notice.lines[0]}</b></p>
          {notice.lines.slice(1).map(line => <small key={line}>{line}</small>)}
          <button type="button" className="cmLink" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import character models from a file" onChange={e => void onFile(e)} />
      {entries.length === 0 ? (
        <div className="cmEmpty">
          <h3>No models yet</h3>
          <p>A model is the set of shapes a character is drawn from: its body, its clothes and its hair, arranged in groups and objects. Create one, then draw its first shape from a template.</p>
          <div className="cmFoot">
            <button type="button" className="cmBtn cmBtn--primary" onClick={create}>New model</button>
            <button type="button" className="cmBtn" onClick={() => fileInput.current?.click()}>Import</button>
          </div>
        </div>
      ) : (
        current && (
          <ModelPane
            key={current.id} entry={current} models={models} makeId={randomId} onRemove={remove} onDuplicate={duplicate} onExport={e => exportEntries([e])} barHost={toolbarHost}
            nav={{
              entries, currentId: current.id, open: listOpen, onOpen: setListOpen, onSelect: select, onNew: create, onImport: () => fileInput.current?.click(),
              onExportAll: () => exportEntries(entries), onDuplicate: duplicate, onMove: models.moveModel,
            }}
          />
        )
      )}
    </div>
  )
}

export default DesignerConsole
