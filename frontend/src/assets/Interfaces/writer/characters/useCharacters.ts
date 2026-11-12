import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertCharacter, createCharacter, deleteCharacter, getCharacter, listAllCharacters, listCharacters, putCharacter, revertCharacter } from '../../../../api/charactersApi'
import type { CharacterDoc, CharacterFigure, CharacterPortrait, CharacterSummary, ConvertBody, LegacyLook } from '../../../../api/types'
import { notifyCastChanged } from './castStore'
import { buildCharacterFile, figureKeys, importCharacters, type CharacterChoice, type CharacterFile, type CharacterImportResult } from './charFile'
import { ensureFigureModel, figureCopiesFor } from './figure/figureModelStore'
import { startFigure } from './figure/figureStart'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'

// The Characters console's state: the cast (a list of names), the open character as a document, and an undo log for each character that has been opened (kept while
// the project is open, so going to another character and back keeps its undo). Edits save the way the Writer's do: the Save button, and autosave when the user has turned
// it on. A slider moves through many values: edits with the same `group` within a moment are one undo step.

const COALESCE_MS = 900
interface Session { doc: CharacterDoc; past: CharacterDoc[]; future: CharacterDoc[]; group: string | null; at: number }

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)
const summaryOf = (c: CharacterDoc): CharacterSummary => ({ id: c.id, name: c.name, order: c.order, updatedAt: c.updatedAt, portrait: c.portrait, figure: c.figure ?? null })

export function useCharacters(projectId: string | null) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [cast, setCast] = useState<CharacterSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [doc, setDoc] = useState<CharacterDoc | null>(null)
  const [rev, setRev] = useState(0)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const sessions = useRef(new Map<string, Session>())
  const current = useRef<Session | null>(null)
  const token = useRef(0)

  const autosave = useAutosave<CharacterDoc>({
    save: async d => {
      if (!projectId) return
      const saved = await putCharacter(projectId, d)
      setCast(list => list.map(c => (c.id === saved.id ? summaryOf(saved) : c)))
      notifyCastChanged()
    },
  })
  const autosaveRef = useRef(autosave)
  autosaveRef.current = autosave

  const load = useCallback(async () => {
    if (!projectId) return
    setStatus('loading')
    try {
      setCast(await listCharacters(projectId))
      setLoadError(undefined)
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The characters could not be loaded.'))
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

  const startSession = (d: CharacterDoc): Session => {
    const session: Session = { doc: d, past: [], future: [], group: null, at: 0 }
    sessions.current.set(d.id, session)
    return session
  }

  // Open a character: what is waiting is saved first, then its document (kept from before in this session, or read from the server).
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
      const d = await getCharacter(projectId, id)
      if (mine !== token.current) return
      show(id, startSession(d))
    } catch (err) {
      if (mine === token.current) setNotice(message(err, 'The character could not be opened.'))
    }
  }, [projectId, show])

  // A new character (from a portrait, to copy one or to keep an aged one). It is opened.
  const create = useCallback(async (name?: string, start?: { portrait?: CharacterPortrait; figure?: CharacterFigure | null; look?: LegacyLook }): Promise<string | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const d = await createCharacter(projectId, { name, portrait: start?.portrait, figure: start?.figure ?? undefined, look: start?.look })
      setCast(list => [...list, summaryOf(d)])
      const mine = ++token.current
      const session = startSession(d)
      if (mine === token.current) show(d.id, session)
      return d.id
    } catch (err) {
      setNotice(message(err, 'The character could not be made.'))
      return null
    }
  }, [projectId, show])

  // A new character the way the plus makes one (phase 6c-5): a mannequin of the basic model with a look rolled within `genre` (null: any). When the mannequin cannot be made (no
  // basic model is published, or the models cannot be read) the character starts with the plain portrait, as before; a failure is said, no model is not.
  const createStarted = useCallback(async (genre: string | null): Promise<string | null> => {
    if (!projectId) return null
    let figure: CharacterFigure | null = null
    let failed = false
    try {
      figure = await startFigure(projectId, genre)
    } catch {
      failed = true
    }
    const id = await create(undefined, figure ? { figure } : undefined)
    if (id && failed) setNotice('The mannequin could not be made, so this character starts with a portrait. A mannequin can be made in the Portrait section.')
    return id
  }, [projectId, create])

  // A copy of a character (its portrait and its figure, and a name that says so). It is opened. The figure's model copy is shared, so nothing else is copied.
  const duplicate = useCallback(async (id: string): Promise<string | null> => {
    if (!projectId) return null
    try {
      await autosaveRef.current.flush()
      const source = sessions.current.get(id)?.doc ?? (await getCharacter(projectId, id))
      return await create(`${source.name} (copy)`.slice(0, 120), { portrait: source.portrait, figure: source.figure, look: source.look })
    } catch (err) {
      setNotice(message(err, 'The character could not be copied.'))
      return null
    }
  }, [projectId, create])

  // The file of some characters (all of them when `ids` is null): what is waiting is saved first. Null when it cannot be made.
  const exportFile = useCallback(async (ids: string[] | null): Promise<CharacterFile | null> => {
    if (!projectId) return null
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      const all = await listAllCharacters(projectId)
      return buildCharacterFile(all, ids, new Date(), await figureCopiesFor(projectId, figureKeys(all)))
    } catch (err) {
      setNotice(message(err, 'The characters could not be exported.'))
      return null
    }
  }, [projectId])

  // Bring the characters of a file in (see charFile.ts); the list is read again.
  const importFile = useCallback(async (file: CharacterFile, choices: Map<string, CharacterChoice>): Promise<CharacterImportResult | null> => {
    if (!projectId) return null
    setNotice(undefined)
    await autosaveRef.current.flush()
    const result = await importCharacters(file, choices, await listCharacters(projectId), {
      create: body => createCharacter(projectId, body),
      put: d => putCharacter(projectId, d),
      keepCopy: m => ensureFigureModel(projectId, { modelId: m.modelId || 'imported', version: m.version, name: m.name, content: m.content }),
    })
    // What was written over is read again when it is next opened.
    for (const id of result.replaced) sessions.current.delete(id)
    setCast(await listCharacters(projectId))
    if (result.replaced.includes(openId ?? '')) { token.current += 1; show(null, null) }
    notifyCastChanged()
    if (result.error) setNotice(result.error)
    else if (result.note) setNotice(result.note)
    return result
  }, [projectId, openId, show])

  // Delete a character.
  const remove = useCallback(async (id: string) => {
    if (!projectId) return
    setNotice(undefined)
    try {
      if (current.current && openId === id) autosaveRef.current.cancel()
      await deleteCharacter(projectId, id)
      sessions.current.delete(id)
      if (openId === id) { token.current += 1; show(null, null) }
      setCast(await listCharacters(projectId))
      notifyCastChanged()
    } catch (err) {
      setNotice(message(err, 'The character could not be deleted.'))
    }
  }, [projectId, openId, show])

  const touched = useCallback((next: CharacterDoc) => {
    const session = current.current
    if (!session) return
    session.doc = next
    setDoc(next)
    setRev(r => r + 1)
    autosaveRef.current.saveNow(next).catch(() => undefined)
  }, [])

  // Change the open character: `change` gets the document and returns the new one. Edits with the same `group` in quick succession are one undo step.
  const edit = useCallback((change: (d: CharacterDoc) => CharacterDoc, group: string | null = null) => {
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

  // A change of the portrait: `patch` is merged into it.
  const setPortrait = useCallback((patch: Partial<CharacterPortrait> | ((portrait: CharacterPortrait) => CharacterPortrait), group: string | null = null) => {
    edit(d => ({ ...d, portrait: typeof patch === 'function' ? patch(d.portrait) : { ...d.portrait, ...patch } }), group)
  }, [edit])
  // A change of the figure (the art mannequin): a new one, none (back to the portrait), or a function of the figure the character has (nothing happens without one).
  const setFigure = useCallback((next: CharacterFigure | null | ((figure: CharacterFigure) => CharacterFigure), group: string | null = null) => {
    edit(d => {
      if (typeof next === 'function') return d.figure ? { ...d, figure: next(d.figure) } : d
      return { ...d, figure: next }
    }, group)
  }, [edit])
  const rename = useCallback((name: string) => edit(d => (name.trim() === '' || name === d.name ? d : { ...d, name: name.trim().slice(0, 120) }), 'name'), [edit])

  // Convert the open character's portrait to a mannequin, or go back to the old portrait (phase 6c-4): the server keeps the figures of the character, of its story looks and of its
  // editions in one write and answers with the character; what was waiting is saved first, and the undo of this character starts again (it is a change of more than the open
  // document). True when it was done.
  const settled = useCallback((saved: CharacterDoc) => {
    const session = current.current
    if (!session || session.doc.id !== saved.id) return
    session.doc = saved
    session.past = []
    session.future = []
    session.group = null
    setDoc(saved)
    setRev(r => r + 1)
    setCast(list => list.map(c => (c.id === saved.id ? summaryOf(saved) : c)))
    notifyCastChanged()
  }, [])
  const convert = useCallback(async (body: ConvertBody): Promise<boolean> => {
    const id = current.current?.doc.id
    if (!projectId || !id) return false
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      settled(await convertCharacter(projectId, id, body))
      return true
    } catch (err) {
      setNotice(message(err, 'The portrait could not be converted.'))
      return false
    }
  }, [projectId, settled])
  const revert = useCallback(async (): Promise<boolean> => {
    const id = current.current?.doc.id
    if (!projectId || !id) return false
    setNotice(undefined)
    try {
      await autosaveRef.current.flush()
      settled(await revertCharacter(projectId, id))
      return true
    } catch (err) {
      setNotice(message(err, 'The portrait could not be brought back.'))
      return false
    }
  }, [projectId, settled])

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
    status, loadError, reload: load, cast, openId, doc, rev, notice,
    open, create, createStarted, duplicate, remove, exportFile, importFile, edit, setPortrait, setFigure, convert, revert, rename, undo, redo, canUndo, canRedo,
    saveStatus: combineSaveStatus(autosave),
    saveCountdown: combineCountdown(autosave),
    saveNow: autosave.flush,
  }), [status, loadError, load, cast, openId, doc, rev, notice, open, create, createStarted, duplicate, remove, exportFile, importFile, edit, setPortrait, setFigure, convert, revert, rename, undo, redo, canUndo, canRedo, autosave])
}

export type Characters = ReturnType<typeof useCharacters>
