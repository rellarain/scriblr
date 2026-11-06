import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createMap, createMapVersion, deleteMap, getMap, listMaps, putMap } from '../../../../api/mapsApi'
import type { MapCreate, MapDoc, MapSummary } from '../../../../api/types'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { buildMapFile, importMaps, type Choice, type ImportResult, type MapFile } from './mapFile'
import * as model from './mapModel'
import { MapHistory, Stroke, docOf, draftOf, floodFill, metaEdit, summaryOf, type Change, type MapDraft, type MapEdit } from './mapModel'

// The Maps console's state: the project's maps (a list without cells), the open map as a draft (its cells decoded, so painting is direct), and an undo
// log for each map that has been opened (a stroke is one step; kept while the project is open, so going to another map and back keeps its undo).
// Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on (lib/useAutosave.ts). Painting changes the cells in
// place and tells the canvas to draw (`rev`); everything else makes a new draft.
interface Session { draft: MapDraft; history: MapHistory }

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function useMaps(projectId: string | null) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MapDraft | null>(null)
  // Bumped when the open map's cells changed in place (a stroke in progress, an undo): the canvas draws again.
  const [rev, setRev] = useState(0)
  // What the last action could not do (a map that could not be made or opened); cleared by the next action.
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const sessions = useRef(new Map<string, Session>())
  const current = useRef<Session | null>(null)
  const token = useRef(0)

  const autosave = useAutosave<MapDoc>({
    save: async doc => {
      if (!projectId) return
      const saved = await putMap(projectId, doc)
      setMaps(list => list.map(m => (m.id === saved.id ? summaryOf(saved) : m)))
    },
  })
  const autosaveRef = useRef(autosave)
  autosaveRef.current = autosave

  const load = useCallback(async () => {
    if (!projectId) return
    setStatus('loading')
    try {
      const list = await listMaps(projectId)
      setMaps(list)
      setLoadError(undefined)
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The maps could not be loaded.'))
      setStatus('error')
    }
  }, [projectId])

  useEffect(() => {
    sessions.current = new Map()
    current.current = null
    token.current += 1
    setOpenId(null)
    setDraft(null)
    setNotice(undefined)
    void load()
  }, [load])

  const show = useCallback((id: string | null, session: Session | null) => {
    current.current = session
    setOpenId(id)
    setDraft(session ? session.draft : null)
    setRev(r => r + 1)
  }, [])

  // Open a map: what is waiting is saved first, then its draft (kept from before in this session, or read from the server).
  const open = useCallback(async (id: string | null) => {
    const mine = ++token.current
    setNotice(undefined)
    await autosaveRef.current.flush()
    if (mine !== token.current) return
    if (id === null) { show(null, null); return }
    const kept = sessions.current.get(id)
    if (kept) { show(id, kept); return }
    if (!projectId) return
    try {
      const doc = await getMap(projectId, id)
      if (mine !== token.current) return
      const session: Session = { draft: draftOf(doc), history: new MapHistory() }
      sessions.current.set(id, session)
      show(id, session)
    } catch (err) {
      if (mine === token.current) setNotice(message(err, 'The map could not be opened.'))
    }
  }, [projectId, show])

  // A new map. It is opened, unless `open` is false (a map made for a place of the map that is open, which stays open).
  const create = useCallback(async (body: MapCreate, open = true): Promise<string | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const doc = await createMap(projectId, body)
      setMaps(list => [...list, summaryOf(doc)])
      if (!open) return doc.id
      const mine = ++token.current
      const session: Session = { draft: draftOf(doc), history: new MapHistory() }
      sessions.current.set(doc.id, session)
      if (mine === token.current) show(doc.id, session)
      return doc.id
    } catch (err) {
      setNotice(message(err, 'The map could not be made.'))
      return null
    }
  }, [projectId, show])

  // A version of a map as it is now (what is waiting is saved first), from a point of the story; it is opened. Null when it could not be made.
  const createVersion = useCallback(async (sourceId: string, title: string, appliesFrom: string | null): Promise<string | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const doc = await createMapVersion(projectId, sourceId, { title: title.trim() || undefined, appliesFrom })
      setMaps(list => [...list, summaryOf(doc)])
      const mine = ++token.current
      const session: Session = { draft: draftOf(doc), history: new MapHistory() }
      sessions.current.set(doc.id, session)
      if (mine === token.current) show(doc.id, session)
      return doc.id
    } catch (err) {
      setNotice(message(err, 'The version could not be made.'))
      return null
    }
  }, [projectId, show])

  // The file of a map and the maps inside it (what is saved: what is waiting is saved first). Null when it cannot be made.
  const exportFile = useCallback(async (rootId: string): Promise<MapFile | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const inside = model.descendantIds(await listMaps(projectId), rootId)
      const docs = await Promise.all([rootId, ...inside].map(id => getMap(projectId, id)))
      return buildMapFile(rootId, docs)
    } catch (err) {
      setNotice(message(err, 'The map could not be exported.'))
      return null
    }
  }, [projectId])

  // Bring the maps of a file in (see mapFile.ts); the list is read again, and the first map made is opened.
  const importFile = useCallback(async (file: MapFile, choices: Map<string, Choice>, parentId: string | null): Promise<ImportResult | null> => {
    if (!projectId) return null
    setNotice(undefined)
    await autosaveRef.current.flush()
    const result = await importMaps(file, choices, await listMaps(projectId), parentId, {
      create: body => createMap(projectId, body),
      put: doc => putMap(projectId, doc),
    })
    // What was written over is read again when it is next opened.
    for (const id of result.replaced) sessions.current.delete(id)
    setMaps(await listMaps(projectId))
    if (result.error) setNotice(result.error)
    return result
  }, [projectId])

  // Delete a map. The maps inside it move up to its parent (the list is read again for that).
  const remove = useCallback(async (id: string) => {
    if (!projectId) return
    setNotice(undefined)
    try {
      if (current.current && openId === id) { autosaveRef.current.cancel() }
      await deleteMap(projectId, id)
      sessions.current.delete(id)
      if (openId === id) { token.current += 1; show(null, null) }
      setMaps(await listMaps(projectId))
    } catch (err) {
      setNotice(message(err, 'The map could not be deleted.'))
    }
  }, [projectId, openId, show])

  // Keep the draft as it is now and save it (after the wait, or at the Save button).
  const touched = useCallback((next: MapDraft) => {
    const session = current.current
    if (!session) return
    session.draft = next
    setDraft(next)
    setRev(r => r + 1)
    autosaveRef.current.saveNow(docOf(next)).catch(() => undefined)
  }, [])

  // A change of the map's fields (a title, a terrain, a layer ...): one undo step.
  const apply = useCallback((change: Change): boolean => {
    const session = current.current
    if (!session || !change) return false
    session.history.push(change.edit)
    touched(change.draft)
    return true
  }, [touched])

  // A paint stroke: begin it with a terrain and a brush, paint along it (the cells change in place), then end it.
  const beginStroke = useCallback((terrain: number, size: number): Stroke | null => {
    const session = current.current
    return session && model.terrainEditable(session.draft) ? new Stroke(session.draft, terrain, size) : null
  }, [])
  const endStroke = useCallback((stroke: Stroke) => {
    const session = current.current
    const edit = stroke.finish()
    if (!session || !edit) return
    session.history.push(edit)
    touched({ ...session.draft })
  }, [touched])

  // The fill: a change of the cells in one step. False when the terrain cannot be painted now (its layer is hidden or locked).
  const fill = useCallback((x: number, y: number, terrain: number): boolean => {
    const session = current.current
    if (!session || !model.terrainEditable(session.draft)) return false
    const edit: MapEdit | null = floodFill(session.draft, x, y, terrain)
    if (edit) {
      session.history.push(edit)
      touched({ ...session.draft })
    }
    return true
  }, [touched])

  // A drag of something on the map is shown as it goes (no undo entry, nothing saved) ...
  const preview = useCallback((next: MapDraft) => {
    const session = current.current
    if (!session) return
    session.draft = next
    setDraft(next)
    setRev(r => r + 1)
  }, [])
  // ... and, when it ends, is one undo step (a change of what was there before) that waits to be saved.
  const commitMove = useCallback((before: MapDraft, after: MapDraft) => {
    const session = current.current
    if (!session) return
    session.history.push(metaEdit(before, after))
    touched(after)
  }, [touched])

  const undo = useCallback(() => {
    const session = current.current
    const next = session?.history.undo(session.draft)
    if (next) touched(next)
  }, [touched])
  const redo = useCallback(() => {
    const session = current.current
    const next = session?.history.redo(session.draft)
    if (next) touched(next)
  }, [touched])

  // Read at every render; `rev` changes after every edit, so these are new then.
  const canUndo = current.current?.history.canUndo ?? false
  const canRedo = current.current?.history.canRedo ?? false

  return useMemo(() => ({
    status, loadError, reload: load, maps, openId, draft, rev, notice,
    open, create, createVersion, remove, exportFile, importFile, apply, beginStroke, endStroke, fill, preview, commitMove, undo, redo,
    canUndo, canRedo,
    saveStatus: combineSaveStatus(autosave),
    saveCountdown: combineCountdown(autosave),
    saveNow: autosave.flush,
  }), [status, loadError, load, maps, openId, draft, rev, notice, open, create, createVersion, remove, exportFile, importFile, apply, beginStroke, endStroke, fill, preview, commitMove, undo, redo, canUndo, canRedo, autosave])
}

export type Maps = ReturnType<typeof useMaps>
