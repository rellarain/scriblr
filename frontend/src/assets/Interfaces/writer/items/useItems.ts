import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createItem, deleteItem, getItem, listItems, putItem } from '../../../../api/itemsApi'
import type { ItemDoc, ItemSummary } from '../../../../api/types'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { notifyItemsChanged } from './itemStore'

// The Items console's state: the library (a list of names), the open item as a document, and an undo log for each item that has been opened (kept while the project is open).
// Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on. Edits with the same `group` within a moment are one undo step
// (the same plan as the characters, characters/useCharacters.ts).

const COALESCE_MS = 900
interface Session { doc: ItemDoc; past: ItemDoc[]; future: ItemDoc[]; group: string | null; at: number }

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)
const summaryOf = (i: ItemDoc): ItemSummary => ({ id: i.id, name: i.name, kind: i.kind, order: i.order, updatedAt: i.updatedAt })

export function useItems(projectId: string | null) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [list, setList] = useState<ItemSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [doc, setDoc] = useState<ItemDoc | null>(null)
  const [rev, setRev] = useState(0)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const sessions = useRef(new Map<string, Session>())
  const current = useRef<Session | null>(null)
  const token = useRef(0)

  const autosave = useAutosave<ItemDoc>({
    save: async d => {
      if (!projectId) return
      const saved = await putItem(projectId, d)
      setList(rows => rows.map(i => (i.id === saved.id ? summaryOf(saved) : i)))
      notifyItemsChanged()
    },
  })
  const autosaveRef = useRef(autosave)
  autosaveRef.current = autosave

  const load = useCallback(async () => {
    if (!projectId) return
    setStatus('loading')
    try {
      setList(await listItems(projectId))
      setLoadError(undefined)
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The items could not be loaded.'))
      setStatus('error')
    }
  }, [projectId])

  useEffect(() => {
    sessions.current = new Map()
    current.current = null
    token.current += 1
    setOpenId(null)
    setDoc(null)
    setNotice(undefined)
    void load()
  }, [load])

  const show = useCallback((id: string | null, session: Session | null) => {
    current.current = session
    setOpenId(id)
    setDoc(session ? session.doc : null)
    setRev(r => r + 1)
  }, [])

  const startSession = (d: ItemDoc): Session => {
    const session: Session = { doc: d, past: [], future: [], group: null, at: 0 }
    sessions.current.set(d.id, session)
    return session
  }

  // Open an item: what is waiting is saved first, then its document (kept from before in this session, or read from the server).
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
      const d = await getItem(projectId, id)
      if (mine !== token.current) return
      show(id, startSession(d))
    } catch (err) {
      if (mine === token.current) setNotice(message(err, 'The item could not be opened.'))
    }
  }, [projectId, show])

  // A new item. It is opened.
  const create = useCallback(async (name?: string, kind?: string): Promise<string | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const d = await createItem(projectId, { name, kind })
      setList(rows => [...rows, summaryOf(d)])
      const mine = ++token.current
      const session = startSession(d)
      if (mine === token.current) show(d.id, session)
      notifyItemsChanged()
      return d.id
    } catch (err) {
      setNotice(message(err, 'The item could not be made.'))
      return null
    }
  }, [projectId, show])

  // Delete an item (its links go with it).
  const remove = useCallback(async (id: string) => {
    if (!projectId) return
    setNotice(undefined)
    try {
      if (current.current && openId === id) autosaveRef.current.cancel()
      await deleteItem(projectId, id)
      sessions.current.delete(id)
      if (openId === id) { token.current += 1; show(null, null) }
      setList(await listItems(projectId))
      notifyItemsChanged()
    } catch (err) {
      setNotice(message(err, 'The item could not be deleted.'))
    }
  }, [projectId, openId, show])

  const touched = useCallback((next: ItemDoc) => {
    const session = current.current
    if (!session) return
    session.doc = next
    setDoc(next)
    setRev(r => r + 1)
    autosaveRef.current.saveNow(next).catch(() => undefined)
  }, [])

  // Change the open item: `change` gets the document and returns the new one.
  const edit = useCallback((change: (d: ItemDoc) => ItemDoc, group: string | null = null) => {
    const session = current.current
    if (!session) return
    const next = change(session.doc)
    if (next === session.doc) return
    const now = Date.now()
    const joined = group !== null && session.group === group && now - session.at < COALESCE_MS && session.past.length > 0
    if (!joined) session.past.push(session.doc)
    if (session.past.length > 200) session.past.shift()
    session.future = []
    session.group = group
    session.at = now
    touched(next)
  }, [touched])

  const rename = useCallback((name: string) => edit(d => (name.trim() === '' || name === d.name ? d : { ...d, name: name.trim().slice(0, 120) }), 'name'), [edit])

  const undo = useCallback(() => {
    const session = current.current
    const prev = session?.past.pop()
    if (!session || !prev) return
    session.future.push(session.doc)
    session.group = null
    touched(prev)
  }, [touched])
  const redo = useCallback(() => {
    const session = current.current
    const next = session?.future.pop()
    if (!session || !next) return
    session.past.push(session.doc)
    session.group = null
    touched(next)
  }, [touched])

  const canUndo = (current.current?.past.length ?? 0) > 0
  const canRedo = (current.current?.future.length ?? 0) > 0

  return useMemo(() => ({
    status, loadError, reload: load, list, openId, doc, rev, notice,
    open, create, remove, edit, rename, undo, redo, canUndo, canRedo,
    saveStatus: combineSaveStatus(autosave),
    saveCountdown: combineCountdown(autosave),
    saveNow: autosave.flush,
  }), [status, loadError, load, list, openId, doc, rev, notice, open, create, remove, edit, rename, undo, redo, canUndo, canRedo, autosave])
}

export type Items = ReturnType<typeof useItems>
