import { useCallback, useEffect, useState } from 'react'
import {
  createRevisionFlag, deleteRevisionFlag, getRevisionFlags, resolveRevisionFlag, updateRevisionFlag,
  type NewRevisionFlag, type RevisionFlag, type RevisionFlagType,
} from './schedule/scheduleApi'

// A project's revision flags (the open ones and the resolved), looked at while `active` (the Preview's Flag tool is open; the flags follow the text as it
// is edited, so they are read again each time it opens). A change is made on the backend and then shown.
export function useRevisionFlags(projectId: string | null, active: boolean) {
  const [flags, setFlags] = useState<RevisionFlag[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  const reload = useCallback(async () => {
    if (!projectId) { setFlags([]); return }
    try { setFlags(await getRevisionFlags(projectId, true)); setError(undefined) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the flags.') }
  }, [projectId])
  useEffect(() => { if (active) void reload() }, [active, reload])

  const change = useCallback(async (run: (id: string) => Promise<void>) => {
    if (!projectId) return
    setError(undefined)
    try { await run(projectId) } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the flag.') }
  }, [projectId])
  const swap = (next: RevisionFlag) => setFlags(prev => prev.map(f => (f.id === next.id ? next : f)))

  return {
    flags, error, reload,
    add: (body: NewRevisionFlag) => change(async id => { const made = await createRevisionFlag(id, body); setFlags(prev => [...prev, made]) }),
    update: (flagId: string, body: { type?: RevisionFlagType; note?: string }) => change(async id => swap(await updateRevisionFlag(id, flagId, body))),
    resolve: (flagId: string, outcome: string) => change(async id => swap(await resolveRevisionFlag(id, flagId, outcome))),
    remove: (flagId: string) => change(async id => { await deleteRevisionFlag(id, flagId); setFlags(prev => prev.filter(f => f.id !== flagId)) }),
  }
}
