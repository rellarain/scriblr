import { getChapterDraft, putMomentDraft } from '../../../api/draftFetch'

// A change to a moment's draft made from elsewhere (a Scratchpad note turned into draft text). When the moment's chapter is open in the Draft,
// its draft (useChapterDraft) takes the change as if it had been typed, so it is saved with the rest and nothing the editor holds is lost;
// otherwise the moment is read from the backend, changed and written back at once.

type Taker = (momentId: string, change: (body: string) => string) => void
const open = new Map<string, Taker>()
const key = (projectId: string, chapterId: string) => `${projectId}\u0000${chapterId}`

// An open chapter draft, once it has loaded, takes the changes for its chapter until it closes (the returned function).
export function registerOpenDraft(projectId: string, chapterId: string, taker: Taker): () => void {
  const k = key(projectId, chapterId)
  open.set(k, taker)
  return () => { if (open.get(k) === taker) open.delete(k) }
}

// Whether the change went into the open draft (to be saved with it) or was saved to the backend.
export async function changeMomentDraft(projectId: string, chapterId: string, momentId: string, change: (body: string) => string): Promise<'open' | 'saved'> {
  const taker = open.get(key(projectId, chapterId))
  if (taker) {
    taker(momentId, change)
    return 'open'
  }
  const draft = await getChapterDraft(projectId, chapterId)
  await putMomentDraft(projectId, chapterId, momentId, change(draft.moments[momentId]?.body ?? ''))
  return 'saved'
}
