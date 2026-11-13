import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { myModelsApi } from '../../../../api/characterModelsApi'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { useStoredState } from '../../writer/storage'
import { downloadTextFile, readFileText } from '../plot/presetFile'
import { ADMIN_POLICY, DesignerPolicyProvider, policyFor, useWriterLimits } from './designerPolicy'
import { ModelPane } from './ModelPane'
import { ModelFileError, exportFileName, parseModelFile, serializeModels } from './modelFile'
import { MY_ID_PREFIX, copyName, randomId, starterContent } from './modelContent'
import { libraryFull } from './engine/writerLimits'
import { ScriblrPicker } from './ScriblrPicker'
import { useCharacterModels } from './useCharacterModels'
import './characterModels.scss'

// What an import did, shown until it is dismissed.
interface ImportNotice { tone: 'ok' | 'error'; lines: string[] }

// The Designer (an Admin console of its own, beside Configuration): the models character art is drawn from. The canvas fills the console, with the tree of the open model on
// its left, the editor on its right, the view controls under it and the console tools (undo, redo, save, publish) in the console's header (`toolbarHost`; without one they
// sit at the top). Edits save to the draft the way the Writer's do (the Save button, and autosave when the user has turned it on); each model is published on its own.
// The same console serves a writer's own models (`library="mine"`, in the Characters console's Models section): another file of models that start with "my-", a copy of one
// of Scriblr's as a way to begin instead of the basic model's button, and the same drafts, versions and publishing. There it is held to the limits the admin set for writers
// (how big a model may be, and how many a library holds) and keeps the advanced tabs away until the writer asks for them; `openId` is the model to open first.
const MY_LIBRARY = { api: myModelsApi, idPrefix: MY_ID_PREFIX }
function DesignerConsole({ toolbarHost = null, library = 'admin', openId = null }: { toolbarHost?: HTMLElement | null; library?: 'admin' | 'mine'; openId?: string | null }) {
  const mine = library === 'mine'
  const models = useCharacterModels(randomId, mine ? MY_LIBRARY : undefined)
  const { entries } = models
  const { limits } = useWriterLimits(mine)
  const [advanced, setAdvanced] = useStoredState<boolean>('scriblr.designer.advanced', false)
  const policy = useMemo(() => (mine ? policyFor(limits, advanced === true) : ADMIN_POLICY), [mine, limits, advanced])
  // the library holds as many models as the admin allows
  const full = mine && !!limits && entries.length >= limits.models
  const [selectedId, setSelectedId] = useState<string | null>(openId)
  const [listOpen, setListOpen] = useState(false)
  const [notice, setNotice] = useState<ImportNotice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const current: ModelEntry | undefined = entries.find(e => e.id === selectedId) ?? entries[0]

  function select(id: string) {
    setSelectedId(id)
    setListOpen(false)
  }

  // Why another model cannot be added now, said in the notice.
  function refuseWhenFull(): boolean {
    if (!full || !limits) return false
    setNotice({ tone: 'error', lines: [libraryFull(limits.models), 'Delete one before adding another.'] })
    return true
  }

  function create() {
    if (refuseWhenFull()) return
    select(models.addModel(starterContent()))
  }

  // The basic adult that comes with the app: added and published by the server, then opened.
  async function addBasic() {
    if (await models.addBasic()) select('basic')
  }

  // A copy of one of Scriblr's models, kept as a draft of the writer's own (named so that it does not repeat a name here), then opened.
  function addFromScriblr(content: ModelContent) {
    if (refuseWhenFull()) return
    select(models.addModel({ ...content, name: copyName(content.name, entries) }))
  }

  function duplicate(id: string) {
    if (refuseWhenFull()) return
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
    if (!file || refuseWhenFull()) return
    try {
      // a file may hold more models than the library has room for: the first ones that fit are kept
      const { models: found, skipped } = parseModelFile(await readFileText(file))
      const room = mine && limits ? Math.max(0, limits.models - entries.length) : found.length
      const added = await models.importModels(found.slice(0, room))
      if (found.length > room) skipped.push(`${found.length - room} more than the library has room for`)
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

  if (models.status === 'loading' || (mine && !limits)) return <p className="cmNote" role="status">Loading the models…</p>
  if (models.status === 'error') {
    return (
      <div className="cmNote" role="alert">
        <p>{models.loadError ?? 'The models could not be loaded.'}</p>
        <button type="button" className="cmBtn" onClick={() => void models.reload()}>Try again</button>
      </div>
    )
  }

  return (
    <DesignerPolicyProvider value={policy}>
      <div className="cmPage dzConsole" role="region" aria-label={mine ? 'My models' : 'Designer'}>
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
            <h3>{mine ? 'No models of your own yet' : 'No models yet'}</h3>
            <p>
              {mine
                ? 'A model is the set of shapes a character is drawn from: its body, its clothes and its hair, arranged in groups and objects. Yours are kept here for every project. Start from a copy of one of the models that come with Scriblr (the original is never changed), or begin with a blank model and draw its first shape from a template. A model is yours until you publish it; a published one can then be chosen for a character.'
                : 'A model is the set of shapes a character is drawn from: its body, its clothes and its hair, arranged in groups and objects. Start from the basic model that comes with Scriblr (a bare adult with a face, ages, builds and expressions), or create one and draw its first shape from a template.'}
            </p>
            <div className="cmFoot">
              {mine
                ? <ScriblrPicker buttonClassName="cmBtn cmBtn--primary" button="Duplicate a Scriblr model" onPick={addFromScriblr} disabled={full} />
                : <button type="button" className="cmBtn cmBtn--primary" onClick={() => void addBasic()}>Add the basic model</button>}
              <button type="button" className="cmBtn" disabled={full} onClick={create}>New model</button>
              <button type="button" className="cmBtn" disabled={full} onClick={() => fileInput.current?.click()}>Import</button>
            </div>
          </div>
        ) : (
          current && (
            <ModelPane
              key={current.id} entry={current} models={models} makeId={randomId} onRemove={remove} onDuplicate={duplicate} onExport={e => exportEntries([e])} barHost={toolbarHost}
              onAdvanced={mine ? () => setAdvanced(a => a !== true) : undefined}
              nav={{
                entries, currentId: current.id, open: listOpen, onOpen: setListOpen, onSelect: select, onNew: create, onImport: () => fileInput.current?.click(), full,
                ...(mine ? { extraTools: <ScriblrPicker onPick={addFromScriblr} disabled={full} /> } : { onAddBasic: () => void addBasic() }),
                onExportAll: () => exportEntries(entries), onDuplicate: duplicate, onMove: models.moveModel,
              }}
            />
          )
        )}
      </div>
    </DesignerPolicyProvider>
  )
}

export default DesignerConsole
