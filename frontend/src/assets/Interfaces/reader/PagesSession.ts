import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../../../api/reader'
import type { BookText, CatalogBook, ChapterText, Mark, ReactionTotals } from '../../../api/reader'
import type { ReaderCtx } from './readerContext'
import { EMPTY_MARK, FONT_STACK, pageBudget, pageOfParagraph, paginate, progressPercent, resumeAt } from './pagesLogic'

// The e-reader's state for one book: what may be read, the open chapter, the reader's marks and the chapter's totals, which sentence is selected,
// the page in turn mode, and where the reader is (saved as they turn pages, so another device can resume). Every console of PAGES shares it.

export interface PagesSession {
  book: CatalogBook
  text: BookText | null
  chapter: ChapterText | null
  // Why the book or chapter cannot be opened (a loan is needed, the chapter is not published at this level).
  error: string | null
  loading: boolean
  n: number
  marks: Record<string, Mark>
  totals: ReactionTotals | null
  selected: string | null
  select: (key: string | null) => void
  setMark: (key: string, patch: Partial<Mark>) => Promise<void>
  // The first paragraph of each page (one page holding everything in scroll mode), and the page the reader is on.
  starts: number[]
  page: number
  visible: { index: number; text: string }[]
  goPage: (page: number) => void
  next: () => void
  previous: () => void
  jumpTo: (paragraph: number) => void
  // Read aloud, with the browser's speech.
  speaking: boolean
  canSpeak: boolean
  speak: () => void
  stopSpeaking: () => void
  // The reaction margin: shown or hidden.
  tracks: boolean
  setTracks: (on: boolean) => void
  pageStyle: Record<string, string>
}

const device = (): string => (typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 'Phone' : 'This computer')

export function usePagesSession(ctx: ReaderCtx, book: CatalogBook, chapterParam: number | null): PagesSession {
  const { reader, actions } = ctx.data
  const settings = reader?.settings
  const [text, setText] = useState<BookText | null>(null)
  const [chapter, setChapter] = useState<ChapterText | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [totals, setTotals] = useState<ReactionTotals | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [tracks, setTracks] = useState(true)
  const pendingLast = useRef(false)
  const startAt = useRef<number | null>(null)
  const moved = useRef(false)
  const startedSession = useRef(false)

  const level = reader?.levels[book.id]?.level ?? 'omega'
  const held = reader?.holdings.some(h => h.bookId === book.id && h.status === 'active') ?? false
  const available = useMemo(() => text?.chapters.filter(c => c.available).map(c => c.n) ?? [], [text])
  const position = reader?.positions[book.id]
  const n = chapterParam ?? resumeAt(position, available).chapter

  // What may be read, and the reader's marks: again when the level or a loan changes.
  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    Promise.all([api.getBookText(book.id), api.getMarks(book.id)])
      .then(([t, m]) => { if (live) { setText(t); setMarks(m); if (!t.canRead) setError(t.reason) } })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not open the book.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [book.id, level, held])

  // The open chapter.
  useEffect(() => {
    if (!text || !text.canRead) { setChapter(null); return undefined }
    let live = true
    setError(null)
    api.getChapter(book.id, n)
      .then(c => { if (live) { setChapter(c); setSelected(null) } })
      .catch((e: unknown) => { if (live) { setChapter(null); setError(e instanceof Error ? e.message : 'Could not open the chapter.') } })
    api.getReactions(book.id, n).then(t => { if (live) setTotals(t) }).catch(() => undefined)
    return () => { live = false }
  }, [text, book.id, n])

  const mode = settings?.mode ?? 'turn'
  const starts = useMemo(
    () => (chapter ? (mode === 'scroll' ? [0] : paginate(chapter.paragraphs, pageBudget(settings?.textSize ?? 18, settings?.margins ?? 'narrow'))) : [0]),
    [chapter, mode, settings?.textSize, settings?.margins],
  )

  // Open at the paragraph the reader stopped at (only when the chapter was not asked for), or at the last page after turning back.
  useEffect(() => {
    if (!chapter) return
    if (pendingLast.current) { pendingLast.current = false; setPage(starts.length - 1); return }
    const resume = chapterParam === null && position && position.chapter === chapter.n ? position.paragraph : 0
    setPage(pageOfParagraph(starts, resume))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter])
  useEffect(() => { setPage(p => Math.min(p, starts.length - 1)) }, [starts])

  // Save where the reader is, a moment after they stop turning pages.
  useEffect(() => {
    if (!chapter || !text || !moved.current) return undefined
    const timer = window.setTimeout(() => {
      const now = Date.now()
      const minutes = startAt.current === null ? 0 : Math.min(30, Math.round((now - startAt.current) / 60000))
      startAt.current = now
      const paragraph = starts[page] ?? 0
      const pct = progressPercent(chapter.n, text.chapters.length, paragraph + (mode === 'scroll' ? chapter.paragraphs.length - 1 : 0), chapter.paragraphs.length)
      const first = !startedSession.current
      startedSession.current = true
      void actions.recordReading(book.id, { chapter: chapter.n, paragraph, pct, pages: 1, minutes, newSession: first, device: device() }).catch(() => undefined)
    }, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.n, page])

  const goPage = useCallback((p: number) => { moved.current = true; setPage(Math.max(0, Math.min(starts.length - 1, p))) }, [starts.length])
  const goChapter = useCallback((to: number, last: boolean) => { moved.current = true; pendingLast.current = last; ctx.openPages(book.id, to) }, [ctx, book.id])
  const next = useCallback(() => {
    if (page < starts.length - 1) { goPage(page + 1); return }
    const after = available.find(c => c > n)
    if (after) goChapter(after, false)
  }, [page, starts.length, available, n, goPage, goChapter])
  const previous = useCallback(() => {
    if (page > 0) { goPage(page - 1); return }
    const before = [...available].reverse().find(c => c < n)
    if (before) goChapter(before, true)
  }, [page, available, n, goPage, goChapter])
  const jumpTo = useCallback((paragraph: number) => { moved.current = true; setPage(pageOfParagraph(starts, paragraph)) }, [starts])

  const refreshTotals = useCallback(() => { api.getReactions(book.id, n).then(setTotals).catch(() => undefined) }, [book.id, n])
  const setMark = useCallback(async (key: string, patch: Partial<Mark>) => {
    const before = marks[key] ?? EMPTY_MARK
    const next: Mark = { ...before, ...patch }
    setMarks(prev => {
      const copy = { ...prev }
      if (next.like === 0 && next.dislike === 0 && next.flags.length === 0) delete copy[key]
      else copy[key] = next
      return copy
    })
    try {
      setMarks(await api.putMark(book.id, key, next))
      refreshTotals()
    } catch (e) {
      setMarks(prev => ({ ...prev, [key]: before }))
      setError(e instanceof Error ? e.message : 'Could not save that.')
    }
  }, [marks, book.id, refreshTotals])

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  const visible = useMemo(() => {
    if (!chapter) return []
    const from = starts[page] ?? 0
    const to = starts[page + 1] ?? chapter.paragraphs.length
    return chapter.paragraphs.slice(from, to).map((t, i) => ({ index: from + i, text: t }))
  }, [chapter, starts, page])
  const stopSpeaking = useCallback(() => { if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false) }, [canSpeak])
  const speak = useCallback(() => {
    if (!canSpeak || !chapter) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(visible.map(v => v.text).join('\n\n'))
    utterance.rate = settings?.readAloudRate ?? 1
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [canSpeak, chapter, visible, settings?.readAloudRate])
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel() }, [canSpeak])

  const pageStyle = useMemo(() => ({
    '--rd-pg-font': FONT_STACK[settings?.font ?? 'serif'],
    '--rd-pg-size': `${settings?.textSize ?? 18}px`,
    '--rd-pg-line': settings?.spacing === 'tight' ? '1.5' : settings?.font === 'easy' ? '2.1' : '1.85',
    '--rd-pg-pad': settings?.margins === 'wide' ? '56px' : '18px',
    '--rd-pg-track': tracks ? '86px' : '0px',
  }), [settings?.font, settings?.textSize, settings?.spacing, settings?.margins, tracks])

  return {
    book, text, chapter, error, loading, n, marks, totals, selected, select: setSelected, setMark, starts, page, visible, goPage, next, previous, jumpTo,
    speaking, canSpeak, speak, stopSpeaking, tracks, setTracks, pageStyle,
  }
}
