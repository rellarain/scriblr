import { useEffect, useRef, useState } from 'react'
import { discardBiomeChanges, getBiomeCatalog, publishBiomes, putBiomeDraft, restoreBiomeVersion } from '../../../../api/mapBiomesApi'
import type { MapBiome, MapBiomeCatalog } from '../../../../api/types'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { loadPublishedBiomes } from '../../writer/maps/mapBiomes'

type LoadStatus = 'loading' | 'ready' | 'error'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

// The Maps page's state: the admin's biome list (one draft, published as a whole, with its earlier versions). Edits autosave like the Writer's
// (lib/useAutosave.ts: they wait for the user's autosave interval, or for Save); Publish, Discard and Restore save what is waiting first. After a publish
// the maps of every open project are drawn with the new list.
export function useMapBiomes() {
  const [catalog, setCatalog] = useState<MapBiomeCatalog | null>(null)
  const [draft, setDraft] = useState<MapBiome[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const ref = useRef(draft)
  ref.current = draft

  const save = useAutosave<MapBiome[]>({
    save: async list => {
      const next = await putBiomeDraft(list)
      // The published list and versions come back; the draft in the page stays as it is (it may have changed since).
      setCatalog(next)
    },
  })

  async function load() {
    setStatus('loading')
    setLoadError(undefined)
    try {
      const next = await getBiomeCatalog()
      setCatalog(next)
      setDraft(next.draft)
      ref.current = next.draft
      setStatus('ready')
    } catch (err) {
      setLoadError(message(err, 'The biomes could not be loaded.'))
      setStatus('error')
    }
  }
  useEffect(() => { void load() }, [])

  // Change the draft. A typed change waits like typing; pass `immediate` for one made with a button.
  function edit(change: (list: MapBiome[]) => MapBiome[], immediate = false) {
    const next = change(ref.current)
    if (next === ref.current) return
    ref.current = next
    setDraft(next)
    setActionError(undefined)
    if (immediate) void save.saveNow(next)
    else save.schedule(next)
  }

  async function act(run: () => Promise<MapBiomeCatalog>, published = false): Promise<boolean> {
    setBusy(true)
    setActionError(undefined)
    try {
      await save.flush()
      if (save.isPending()) throw new Error('The changes could not be saved first, so nothing was done.')
      const next = await run()
      setCatalog(next)
      setDraft(next.draft)
      ref.current = next.draft
      if (published) void loadPublishedBiomes(true)
      return true
    } catch (err) {
      setActionError(message(err, 'That did not work.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    catalog, draft, status, loadError, reload: load, busy, actionError, clearActionError: () => setActionError(undefined),
    edit,
    publish: () => act(publishBiomes, true),
    discard: () => act(discardBiomeChanges),
    restore: (version: number) => act(() => restoreBiomeVersion(version)),
    saveStatus: combineSaveStatus(save), saveCountdown: combineCountdown(save), saveNow: save.flush,
  }
}

export type MapBiomes = ReturnType<typeof useMapBiomes>
