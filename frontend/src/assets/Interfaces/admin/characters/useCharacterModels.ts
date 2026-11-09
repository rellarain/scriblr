import { useEffect, useRef, useState } from 'react'
import { discardModelChanges, getModels, publishModel, putModels, restoreModelVersion, unpublishModel } from '../../../../api/characterModelsApi'
import type { ModelCatalog, ModelContent, ModelDraftList, ModelEntry } from '../../../../api/types'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { blankContent, copyName, moveBefore, normalizeContent, randomId, type MakeId } from './modelContent'

type LoadStatus = 'loading' | 'ready' | 'error'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

// What a save sends: every draft, cleaned the way the server cleans it.
function draftsOf(entries: ModelEntry[]): ModelDraftList {
  return { models: entries.map(e => ({ id: e.id, draft: normalizeContent(e.draft) })) }
}

// The server's answer to a save carries the published copies; the drafts stay as they are in the page (the server only trimmed them, and a stray
// space typed since must not be taken away).
function adoptPublished(local: ModelEntry[], server: ModelEntry[]): ModelEntry[] {
  const byId = new Map(server.map(e => [e.id, e]))
  return local.map(e => {
    const s = byId.get(e.id)
    return s ? { ...e, published: s.published, history: s.history, nextVersion: s.nextVersion } : e
  })
}

// The Characters page's state: the catalog (every model's draft, published copy and versions), edits that autosave like the Writer's
// (lib/useAutosave.ts: structural edits and text edits both wait for the user's autosave interval, or for Save), and Publish, Unpublish, Discard
// and Restore, which save what is waiting first. The same shape as usePlotPresets.
export function useCharacterModels(makeId: MakeId = randomId) {
  const [entries, setEntries] = useState<ModelEntry[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>(undefined)

  const ref = useRef(entries)
  ref.current = entries

  const draftSave = useAutosave<ModelDraftList>({
    save: async list => {
      const catalog = await putModels(list)
      setEntries(prev => {
        const next = adoptPublished(prev, catalog.models)
        ref.current = next
        return next
      })
    },
  })

  function commit(next: ModelEntry[], immediate: boolean) {
    ref.current = next
    setEntries(next)
    setActionError(undefined)
    if (immediate) void draftSave.saveNow(draftsOf(next))
    else draftSave.schedule(draftsOf(next))
  }

  async function load() {
    setStatus('loading')
    setLoadError(undefined)
    try {
      const catalog = await getModels()
      ref.current = catalog.models
      setEntries(catalog.models)
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The models could not be loaded.'))
      setStatus('error')
    }
  }
  useEffect(() => { void load() }, [])

  // ---- editing ----

  // Change one model's draft. A text edit waits like typing; pass `immediate` for a structural one.
  function edit(id: string, change: (draft: ModelContent) => ModelContent, immediate = false) {
    commit(ref.current.map(e => (e.id === id ? { ...e, draft: change(e.draft) } : e)), immediate)
  }

  // Replace a model's draft whole (undo and redo).
  function setDraft(id: string, draft: ModelContent) {
    commit(ref.current.map(e => (e.id === id ? { ...e, draft } : e)), false)
  }

  function addModel(content: ModelContent = blankContent(), afterId?: string): string {
    const id = makeId('model')
    const entry: ModelEntry = { id, draft: content, published: null, history: [], nextVersion: 1 }
    const list = ref.current
    const at = afterId ? list.findIndex(e => e.id === afterId) : -1
    commit(at >= 0 ? [...list.slice(0, at + 1), entry, ...list.slice(at + 1)] : [...list, entry], true)
    return id
  }

  function removeModel(id: string) {
    commit(ref.current.filter(e => e.id !== id), true)
  }

  function moveModel(id: string, beforeId: string | null) {
    commit(moveBefore(ref.current, id, beforeId), true)
  }

  // A copy right after the original, named "(copy)" when the name is taken, and never published.
  function duplicateModel(id: string): string | null {
    const source = ref.current.find(e => e.id === id)
    if (!source) return null
    return addModel({ ...structuredClone(source.draft), name: copyName(source.draft.name, ref.current) }, id)
  }

  // Models read from a file: each added as an unpublished draft (a name that is taken becomes "Name (copy)"), saved at once.
  async function importModels(contents: ModelContent[]): Promise<Array<{ id: string; name: string }>> {
    if (contents.length === 0) return []
    let list = ref.current
    const added: Array<{ id: string; name: string }> = []
    for (const content of contents) {
      const id = makeId('model')
      const name = copyName(content.name, list)
      added.push({ id, name })
      list = [...list, { id, draft: { ...content, name }, published: null, history: [], nextVersion: 1 }]
    }
    commit(list, true)
    await draftSave.flush()
    return added
  }

  // ---- publishing ----

  async function act(run: () => Promise<ModelCatalog>): Promise<boolean> {
    setBusy(true)
    setActionError(undefined)
    try {
      await draftSave.flush()
      if (draftSave.isPending()) throw new Error('The changes could not be saved first, so nothing was done.')
      const catalog = await run()
      ref.current = catalog.models
      setEntries(catalog.models)
      return true
    } catch (err) {
      setActionError(message(err, 'That did not work.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const publish = (id: string) => act(() => publishModel(id))
  const unpublish = (id: string) => act(() => unpublishModel(id))
  const discard = (id: string) => act(() => discardModelChanges(id))
  const restore = (id: string, version: number) => act(() => restoreModelVersion(id, version))

  return {
    entries, status, loadError, reload: load, busy, actionError, clearActionError: () => setActionError(undefined),
    edit, setDraft, addModel, removeModel, moveModel, duplicateModel, importModels,
    publish, unpublish, discard, restore,
    saveStatus: combineSaveStatus(draftSave), saveCountdown: combineCountdown(draftSave), saveNow: draftSave.flush,
  }
}

export type CharacterModels = ReturnType<typeof useCharacterModels>
