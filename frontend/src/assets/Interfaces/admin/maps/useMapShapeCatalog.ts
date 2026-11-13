import { useEffect, useRef, useState } from 'react'
import { discardShapeChanges, getMyShapes, getShapeCatalog, publishShapes, putShapeDraft, restoreShapeVersion } from '../../../../api/mapShapesApi'
import type { MapLibraryShape, MapShapeCatalog, MyMapShape } from '../../../../api/types'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { loadPublishedShapes } from '../../writer/maps/mapShapeStore'

type LoadStatus = 'loading' | 'ready' | 'error'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

// The Shapes tab's state: the admin's default map shapes (one draft, published as a whole, with its earlier versions) and My shapes (to add from). Edits
// autosave as the biome list's do; Publish, Discard and Restore save what is waiting first. After a publish every open project offers the new list.
export function useMapShapeCatalog() {
  const [catalog, setCatalog] = useState<MapShapeCatalog | null>(null)
  const [draft, setDraft] = useState<MapLibraryShape[]>([])
  const [mine, setMine] = useState<MyMapShape[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const ref = useRef(draft)
  ref.current = draft

  const save = useAutosave<MapLibraryShape[]>({
    save: async list => { setCatalog(await putShapeDraft(list)) },
  })

  async function load() {
    setStatus('loading')
    setLoadError(undefined)
    try {
      const [next, own] = await Promise.all([getShapeCatalog(), getMyShapes().catch(() => ({ shapes: [] as MyMapShape[] }))])
      setCatalog(next)
      setDraft(next.draft)
      ref.current = next.draft
      setMine(own.shapes)
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The shapes could not be loaded.'))
      setStatus('error')
    }
  }
  useEffect(() => { void load() }, [])

  // Change the draft. A typed change waits like typing; pass `immediate` for one made with a button.
  function edit(change: (list: MapLibraryShape[]) => MapLibraryShape[], immediate = false) {
    const next = change(ref.current)
    if (next === ref.current) return
    ref.current = next
    setDraft(next)
    setActionError(undefined)
    if (immediate) void save.saveNow(next)
    else save.schedule(next)
  }

  async function act(run: () => Promise<MapShapeCatalog>, published = false): Promise<boolean> {
    setBusy(true)
    setActionError(undefined)
    try {
      await save.flush()
      if (save.isPending()) throw new Error('The changes could not be saved first, so nothing was done.')
      const next = await run()
      setCatalog(next)
      setDraft(next.draft)
      ref.current = next.draft
      if (published) void loadPublishedShapes(true)
      return true
    } catch (err) {
      setActionError(message(err, 'That did not work.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    catalog, draft, mine, status, loadError, reload: load, busy, actionError,
    edit,
    publish: () => act(publishShapes, true),
    discard: () => act(discardShapeChanges),
    restore: (version: number) => act(() => restoreShapeVersion(version)),
    saveStatus: combineSaveStatus(save), saveCountdown: combineCountdown(save), saveNow: save.flush,
  }
}

export type MapShapeCatalogState = ReturnType<typeof useMapShapeCatalog>
