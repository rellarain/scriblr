import { useMemo, useState } from 'react'
import { getAuthorNotes, putAuthorNotes, type AuthorFlagPassage, type AuthorFootnote } from '../../../../api/bookPublishing'
import { getChapterDraft, putMomentDraft } from '../../../../api/draftFetch'
import { getKv, setKv } from '../../../../settings/settingsStore'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { chapterParagraphs, joinParagraphs, moveParagraph, moveToMoment, paragraphRanges, splitParagraph, type Follow, type Place } from '../paragraphs'

// The Draft's paragraph tools for one chapter: move a paragraph up or down, split one at the caret, join one with the next, and move one to
// another moment (of this chapter or another). The text changes like typed text, and what is pinned to a paragraph goes with it:
// - a plotpoint's placement pinned to it (the workspace's plot);
// - the chapter's footnotes (and, in WUI v2, flagged passages), which count paragraphs across the chapter;
// - the Preview's reactions, kept on this machine per sentence.
// The text and the plot are saved as every edit is (with the Save button, or by autosave when it is on: lib/useAutosave.ts); the footnotes are
// saved at once, as the Footnote tool saves them. Moving to another chapter writes that chapter's moment at once (it has no editor open to
// wait in), so until this chapter is saved the paragraph is in both, never in neither. Revision flags follow their text on the backend when
// the drafts are saved (revision_flags.rescue).

interface Draft {
  bodies: Record<string, string>
  setBody: (momentId: string, body: string) => void
}

type Pinned = AuthorFootnote | AuthorFlagPassage
interface Leaving { place: Place; footnotes: AuthorFootnote[]; flags: AuthorFlagPassage[] }

const marksKey = (projectId: string, chapterId: string) => `scriblr.writer.marks.${projectId}.${chapterId}`

// A reaction's key is `${momentId}:${paragraph}:${sentence}` (the Preview's), read from the end as a moment id may hold a colon.
function parseKey(key: string): Place | null {
  const s = key.lastIndexOf(':')
  const p = key.lastIndexOf(':', s - 1)
  if (p < 0) return null
  const paragraph = Number(key.slice(p + 1, s))
  const sentence = Number(key.slice(s + 1))
  return Number.isInteger(paragraph) && Number.isInteger(sentence) ? { momentId: key.slice(0, p), paragraph, sentence } : null
}
const keyOf = (at: Place) => `${at.momentId}:${at.paragraph}:${at.sentence}`

export function useParagraphTools(w: WriterWorkspace, chapterId: string, draft: Draft) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const momentsOf = (id: string) => descendantsOf(index, id).filter(n => n.kind === 'moment').map(n => n.id)
  const projectId = w.activeProjectId

  // The reactions of a chapter moved by `follow`; those that leave for `otherChapter` go to its reactions.
  function followMarks(follow: Follow, ids: Set<string>, otherChapter?: { id: string; ids: Set<string> }) {
    if (!projectId) return
    const here = getKv<Record<string, unknown>>(marksKey(projectId, chapterId))
    if (otherChapter) {
      // The other chapter's own reactions move too (a paragraph put at the start of a moment pushes its paragraphs down).
      const there = getKv<Record<string, unknown>>(marksKey(projectId, otherChapter.id)) ?? {}
      const nextThere: Record<string, unknown> = {}
      for (const [key, mark] of Object.entries(there)) {
        const at = parseKey(key)
        nextThere[at && otherChapter.ids.has(at.momentId) ? keyOf(follow(at)) : key] = mark
      }
      const nextHere: Record<string, unknown> = {}
      for (const [key, mark] of Object.entries(here ?? {})) {
        const at = parseKey(key)
        const to = at && ids.has(at.momentId) ? follow(at) : null
        if (to && otherChapter.ids.has(to.momentId)) nextThere[keyOf(to)] = mark
        else nextHere[to ? keyOf(to) : key] = mark
      }
      if (here) setKv(marksKey(projectId, chapterId), nextHere)
      if (Object.keys(nextThere).length || Object.keys(there).length) setKv(marksKey(projectId, otherChapter.id), nextThere)
      return
    }
    if (!here) return
    const next: Record<string, unknown> = {}
    for (const [key, mark] of Object.entries(here)) {
      const at = parseKey(key)
      next[at && ids.has(at.momentId) ? keyOf(follow(at)) : key] = mark
    }
    setKv(marksKey(projectId, chapterId), next)
  }

  // A chapter's footnotes and flagged passages moved by `follow` (they count paragraphs across the chapter): those that follow their paragraph
  // out of the chapter are returned, and `incoming` ones (from another chapter) are added. Saved when anything changed.
  async function followNotes(
    chapter: string, ids: string[], before: Record<string, string>, after: Record<string, string>, follow: Follow, incoming: Leaving[] = [],
  ): Promise<Leaving[]> {
    if (!projectId) return []
    const notes = await getAuthorNotes(projectId, chapter).catch(() => null)
    const footnotes = notes?.footnotes ?? []
    const flags = notes?.flags ?? []
    if (footnotes.length === 0 && flags.length === 0 && incoming.length === 0) return []
    const was = chapterParagraphs(ids, before)
    const now = chapterParagraphs(ids, after)
    const leaving: Leaving[] = []
    let changed = incoming.length > 0
    const move = <T extends Pinned>(item: T, kind: 'footnotes' | 'flags'): T | null => {
      const place = was.toPlace(item.paragraph, item.sentence)
      if (!place) return item
      const to = follow(place)
      const paragraph = now.toChapter(to)
      if (paragraph === null) {
        changed = true
        const entry: Leaving = { place: to, footnotes: [], flags: [] }
        ;(entry[kind] as T[]).push(item)
        leaving.push(entry)
        return null
      }
      if (paragraph !== item.paragraph || to.sentence !== item.sentence) changed = true
      return { ...item, paragraph, sentence: to.sentence }
    }
    const nextFootnotes = footnotes.map(f => move(f, 'footnotes')).filter((f): f is AuthorFootnote => f !== null)
    const nextFlags = flags.map(f => move(f, 'flags')).filter((f): f is AuthorFlagPassage => f !== null)
    for (const entry of incoming) {
      const paragraph = now.toChapter(entry.place)
      if (paragraph === null) continue
      nextFootnotes.push(...entry.footnotes.map(f => ({ ...f, paragraph, sentence: entry.place.sentence })))
      nextFlags.push(...entry.flags.map(f => ({ ...f, paragraph, sentence: entry.place.sentence })))
    }
    if (changed) await putAuthorNotes(projectId, chapter, { footnotes: nextFootnotes, flags: nextFlags })
    return leaving
  }

  // A change inside this chapter: the new texts, then everything pinned follows.
  async function applyHere(changes: Record<string, string>, follow: Follow) {
    const ids = momentsOf(chapterId)
    const before = { ...draft.bodies }
    const after = { ...before, ...changes }
    for (const [id, body] of Object.entries(changes)) draft.setBody(id, body)
    w.followPlotParagraphs(follow)
    followMarks(follow, new Set(ids))
    setBusy(true)
    setError(null)
    try {
      await followNotes(chapterId, ids, before, after, follow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The footnotes could not be moved with the paragraph.')
    } finally {
      setBusy(false)
    }
  }

  // Each returns where the caret goes in the moment's new text (null when nothing changed).
  function move(momentId: string, paragraph: number, by: -1 | 1): number | null {
    const body = draft.bodies[momentId] ?? ''
    const changed = moveParagraph(body, momentId, paragraph, by)
    if (!changed) return null
    void applyHere({ [momentId]: changed.body }, changed.follow)
    return paragraphRanges(changed.body)[paragraph + by]?.start ?? null
  }

  function split(momentId: string, offset: number): number | null {
    const changed = splitParagraph(draft.bodies[momentId] ?? '', momentId, offset)
    if (!changed) return null
    void applyHere({ [momentId]: changed.body }, changed.follow)
    return changed.caret
  }

  function join(momentId: string, paragraph: number): number | null {
    const changed = joinParagraphs(draft.bodies[momentId] ?? '', momentId, paragraph)
    if (!changed) return null
    void applyHere({ [momentId]: changed.body }, changed.follow)
    return changed.caret
  }

  // Move a paragraph to the start or the end of another moment, here or in another chapter. Another chapter's moment is written first, so the
  // paragraph is never lost if something fails part way.
  async function moveTo(momentId: string, paragraph: number, toChapterId: string, toMomentId: string, where: 'start' | 'end') {
    if (!projectId) return
    const before = { ...draft.bodies }
    if (toChapterId === chapterId) {
      const moved = moveToMoment(before[momentId] ?? '', momentId, paragraph, before[toMomentId] ?? '', toMomentId, where)
      if (moved) await applyHere({ [momentId]: moved.fromBody, [toMomentId]: moved.toBody }, moved.follow)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const other = await getChapterDraft(projectId, toChapterId)
      const otherBefore = Object.fromEntries(Object.entries(other.moments).map(([id, m]) => [id, m.body]))
      const moved = moveToMoment(before[momentId] ?? '', momentId, paragraph, otherBefore[toMomentId] ?? '', toMomentId, where)
      if (!moved) return
      await putMomentDraft(projectId, toChapterId, toMomentId, moved.toBody)
      draft.setBody(momentId, moved.fromBody)
      const ids = momentsOf(chapterId)
      const otherIds = momentsOf(toChapterId)
      w.followPlotParagraphs(moved.follow)
      followMarks(moved.follow, new Set(ids), { id: toChapterId, ids: new Set(otherIds) })
      const leaving = await followNotes(chapterId, ids, before, { ...before, [momentId]: moved.fromBody }, moved.follow)
      await followNotes(toChapterId, otherIds, otherBefore, { ...otherBefore, [toMomentId]: moved.toBody }, moved.follow, leaving)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The paragraph could not be moved.')
    } finally {
      setBusy(false)
    }
  }

  return { move, split, join, moveTo, busy, error }
}

export type ParagraphTools = ReturnType<typeof useParagraphTools>
