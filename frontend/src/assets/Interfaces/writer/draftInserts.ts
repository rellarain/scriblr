import { getChapterDraft, putMomentDraft } from '../../../api/draftFetch'

// Changes to a chapter's draft made from elsewhere. When the chapter is open in the Draft, its draft (useChapterDraft) is registered here:
// - a change to one moment (a Scratchpad note turned into draft text) goes into the open draft as if it had been typed, so it is saved with
//   the rest and nothing the editor holds is lost; otherwise the moment is read from the backend, changed and written back at once;
// - a change to the whole chapter on the backend (History's Restore) waits for the open draft to save what it holds, and the draft reads the
//   chapter again afterwards.

type Taker = (momentId: string, change: (body: string) => string) => void
export interface OpenDraft {
  take: Taker
  // Save what it holds now.
  save: () => Promise<void>
  // Read the chapter from the backend again.
  reload: () => void
}
const open = new Map<string, OpenDraft>()
const key = (projectId: string, chapterId: string) => `${projectId}\u0000${chapterId}`

// An open chapter draft, once it has loaded, takes the changes for its chapter until it closes (the returned function).
export function registerOpenDraft(projectId: string, chapterId: string, draft: OpenDraft): () => void {
  const k = key(projectId, chapterId)
  open.set(k, draft)
  return () => { if (open.get(k) === draft) open.delete(k) }
}

// Whether the change went into the open draft (to be saved with it) or was saved to the backend.
export async function changeMomentDraft(projectId: string, chapterId: string, momentId: string, change: (body: string) => string): Promise<'open' | 'saved'> {
  const draft = open.get(key(projectId, chapterId))
  if (draft) {
    draft.take(momentId, change)
    return 'open'
  }
  const chapter = await getChapterDraft(projectId, chapterId)
  await putMomentDraft(projectId, chapterId, momentId, change(chapter.moments[momentId]?.body ?? ''))
  return 'saved'
}

// A change to the whole chapter on the backend: an open draft saves first, and reads the chapter again after (whether the change worked or not).
export async function changeChapterOnBackend<T>(projectId: string, chapterId: string, write: () => Promise<T>): Promise<T> {
  const k = key(projectId, chapterId)
  await open.get(k)?.save()
  try {
    return await write()
  } finally {
    open.get(k)?.reload()
  }
}
