import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Mark } from '../../../api/reader'
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, CrackedHeartIcon, FlagIcon, HeartIcon, HighlighterIcon, MoonIcon, NoteIcon, PlusIcon, ReactionHeartIcon, ScrollIcon, SpoilerIcon, SunIcon, TurnIcon } from '../../icons'
import { splitSentences } from '../writer/sentences'
import { Meter } from './ReaderBits'
import type { PagesSession } from './PagesSession'
import type { ReaderCtx } from './readerContext'
import { EMPTY_MARK, flagsAt, nextLevel, parseKey, sentenceKey, strictest } from './pagesLogic'
import { LEVEL_TEXT } from './readerSocial'

// The e-reader's page: one column of text with the reaction tracks to its left (the crease runs between them and the copy), the author's
// footnotes and the reader's own notes in the page's right margin, and the controls under it. Sentences can be reacted to, flagged and noted.

interface Rect { top: number; height: number }

function Paragraph({ ctx, session, index, text, revealed, reveal }: {
  ctx: ReaderCtx
  session: PagesSession
  index: number
  text: string
  revealed: Set<string>
  reveal: (key: string) => void
}) {
  const { reader } = ctx.data
  const { chapter, marks, selected, n } = session
  const boxRef = useRef<HTMLDivElement>(null)
  const spans = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [rects, setRects] = useState<Record<string, Rect>>({})
  const sentences = useMemo(() => splitSentences(text), [text])

  // Each sentence's reaction bars sit in the tracks at that sentence's own height, so measure where the text wrapped.
  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current
      if (!box) return
      const base = box.getBoundingClientRect().top
      const next: Record<string, Rect> = {}
      spans.current.forEach((el, key) => { const r = el.getBoundingClientRect(); next[key] = { top: r.top - base, height: r.height } })
      setRects(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    if (boxRef.current) observer.observe(boxRef.current)
    return () => observer.disconnect()
  }, [sentences, session.pageStyle['--rd-pg-size'], session.tracks])

  if (!reader || !chapter) return null
  const classOf = (flagKey: string, fallback: Parameters<typeof flagsAt>[3] extends (a: string, b: infer F) => unknown ? F : never) => reader.flagClasses[flagKey] ?? fallback
  const notes = reader.notes.filter(note => note.bookId === session.book.id && note.chapter === n)
  const details: { key: string; name: string; detail: string; spoiler: boolean }[] = []

  const parts = sentences.map((s, i) => {
    const key = sentenceKey(n, index, i)
    const mark: Mark | undefined = marks[key]
    const flags = flagsAt(key, chapter.flags, mark, classOf, reader.myFlags)
    const top = strictest(flags)
    if (top?.cls === 'hidden' && !revealed.has(key)) {
      return <button key={key} type="button" className="rdHiddenSn" onClick={() => reveal(key)}><FlagIcon size={14} />Hidden · {top.name} · tap to reveal </button>
    }
    if (top?.cls === 'highlight') details.push({ key, name: top.name, detail: top.detail || 'Flagged by you.', spoiler: false })
    if (top?.cls === 'spoiler') details.push({ key, name: top.name, detail: top.detail || 'A spoiler you flagged.', spoiler: true })
    const footnote = chapter.footnotes.findIndex(f => f.key === key)
    const noted = notes.some(note => note.key === key && note.kind !== 'bookmark')
    const classes = ['rdSn']
    if (selected === key) classes.push('rdSn--sel')
    if (mark?.like) classes.push(`rdSn--p${mark.like}`)
    if (mark?.dislike) classes.push(`rdSn--u${mark.dislike}`)
    if (top && (top.cls === 'highlight' || top.cls === 'marked')) classes.push('rdSn--flag')
    return (
      <span key={key} ref={el => { if (el) spans.current.set(key, el); else spans.current.delete(key) }} className={classes.join(' ')} data-key={key} onClick={() => session.select(key)}>
        {s}
        {top && <sup className="rdFlagMark" title={`${top.name}: ${top.cls}`}><FlagIcon size={11} /></sup>}
        {footnote >= 0 && <sup className="rdFn" title={chapter.footnotes[footnote].title}>{footnote + 1}</sup>}
        {noted && <sup className="rdNt" title="You made a note here">n</sup>}
      </span>
    )
  })

  const cycle = (key: string, kind: 'like' | 'dislike') => {
    const mark = marks[key] ?? EMPTY_MARK
    void session.setMark(key, { [kind]: nextLevel(mark[kind]) })
    session.select(key)
  }
  const bar = (key: string, kind: 'like' | 'dislike', rect: Rect) => {
    const level = (marks[key] ?? EMPTY_MARK)[kind]
    if (level === 0 && selected !== key) return null
    return (
      <button key={kind} type="button" className={`rdReactBar rdReactBar--${kind} rdReactBar--level${level}`}
        style={{ top: rect.top, height: Math.max(rect.height, 22), left: kind === 'like' ? 0 : 25 }}
        aria-label={`${kind === 'like' ? 'Pleasant' : 'Unpleasant'} reaction, level ${level}. Click to change.`}
        title={`${kind === 'like' ? 'Pleasant' : 'Unpleasant'}: each click raises the level, three levels, then off`} onClick={() => cycle(key, kind)}>
        {level > 0 ? <ReactionHeartIcon kind={kind} level={level as 1 | 2 | 3} size={16} /> : <span className="rdReactPlus">{kind === 'like' ? '+' : '−'}</span>}
      </button>
    )
  }

  return (
    <div className="rdProw" ref={boxRef}>
      {session.tracks && (
        <div className="rdTracks" aria-label="Reactions">
          {sentences.map((_, i) => {
            const key = sentenceKey(n, index, i)
            const rect = rects[key]
            if (!rect) return null
            const mark = marks[key] ?? EMPTY_MARK
            return (
              <span key={key}>
                {bar(key, 'like', rect)}{bar(key, 'dislike', rect)}
                {mark.flags.length > 0 && <span className="rdFlagBar" style={{ top: rect.top, height: Math.max(rect.height, 22) }} title="Flagged"><FlagIcon size={14} /></span>}
              </span>
            )
          })}
        </div>
      )}
      <div className="rdPtext">
        <p className="rdParagraph">{parts}</p>
        {details.map(d => (
          d.spoiler && !revealed.has(`${d.key}:detail`)
            ? <button key={d.key} type="button" className="rdFhid" onClick={() => reveal(`${d.key}:detail`)}><SpoilerIcon size={14} />Spoiler description · tap to reveal</button>
            : <div key={d.key} className="rdFbox"><b>{d.name}:</b> {d.detail}</div>
        ))}
      </div>
    </div>
  )
}

// The tools for the selected sentence: react, flag, highlight, note, bookmark.
function SelectionBar({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const { selected, chapter, marks, n, book } = session
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!reader || !chapter || !selected) return null
  const at = parseKey(selected)
  const sentence = at ? splitSentences(chapter.paragraphs[at.paragraph] ?? '')[at.sentence]?.trim() ?? '' : ''
  const mark = marks[selected] ?? EMPTY_MARK
  const choices = [...chapter.flags.map(f => ({ key: f.flagKey, name: f.name })), ...reader.myFlags].filter((f, i, all) => all.findIndex(o => o.key === f.key) === i)
  const keep = async (kind: 'highlight' | 'note' | 'bookmark', text = '') => {
    setError(null)
    try { await actions.addNote(book.id, kind === 'bookmark' ? '' : sentence, text, { kind, chapter: n, key: selected }); setNote('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not keep that.') }
  }
  return (
    <div className="rdSelBar" role="group" aria-label="Selected sentence">
      <span className="rdSelText" title={sentence}>&ldquo;{sentence.length > 70 ? `${sentence.slice(0, 70)}…` : sentence}&rdquo;</span>
      <button type="button" className="rdBtn rdBtn--small" aria-label={`Pleasant, level ${mark.like}`} onClick={() => void session.setMark(selected, { like: nextLevel(mark.like) })}><HeartIcon size={16} />Pleasant {mark.like > 0 ? mark.like : ''}</button>
      <button type="button" className="rdBtn rdBtn--small" aria-label={`Unpleasant, level ${mark.dislike}`} onClick={() => void session.setMark(selected, { dislike: nextLevel(mark.dislike) })}><CrackedHeartIcon size={16} />Unpleasant {mark.dislike > 0 ? mark.dislike : ''}</button>
      <select className="rdField" aria-label="Flag this sentence" value="" onChange={e => {
        const key = e.target.value
        if (!key) return
        void session.setMark(selected, { flags: mark.flags.includes(key) ? mark.flags.filter(f => f !== key) : [...mark.flags, key] })
      }}>
        <option value="">Flag…</option>
        {choices.map(c => <option key={c.key} value={c.key}>{mark.flags.includes(c.key) ? '✓ ' : ''}{c.name}</option>)}
      </select>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => void keep('highlight')}><HighlighterIcon size={16} />Highlight</button>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => void keep('bookmark')}><BookmarkIcon size={16} />Bookmark</button>
      <input className="rdField" aria-label="Write a note on this sentence" placeholder="Write a note" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
      <button type="button" className="rdBtn rdBtn--small" disabled={!note.trim()} onClick={() => void keep('note', note)}><NoteIcon size={16} />Add note</button>
      <button type="button" className="rdIconBtn rdIconBtn--small" aria-label="Clear selection" onClick={() => session.select(null)}><CloseIcon size={16} /></button>
      {error && <span className="rdError" role="alert">{error}</span>}
    </div>
  )
}

// The right margin, inside the page: the author's footnotes, the reader's notes, and (for an alpha reader) the plan, read-only.
function Margin({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, details } = ctx.data
  const { chapter, n, book, totals, marks } = session
  if (!reader || !chapter) return null
  const notes = reader.notes.filter(note => note.bookId === book.id && note.chapter === n)
  const trail = (key: string, what: string) => { const at = parseKey(key); return at ? `${what} › Chapter ${n} › paragraph ${at.paragraph + 1}, sentence ${at.sentence + 1}` : what }
  const planning = chapter.level === 'alpha' ? details[book.id]?.planning : undefined
  const mine = Object.entries(marks).filter(([k]) => parseKey(k)?.chapter === n)
  return (
    <aside className="rdMargin" aria-label="Margin notes">
      <div className="rdMarginCard">
        <h3><NoteIcon size={14} />Author&rsquo;s footnotes</h3>
        {chapter.footnotes.length === 0 ? <span className="rdMuted">No footnotes in this chapter.</span> : chapter.footnotes.map((f, i) => (
          <button key={f.id} type="button" className="rdPnote" style={{ ['--st' as string]: 'var(--accent)' } as CSSProperties} onClick={() => { const at = parseKey(f.key); if (at) { session.jumpTo(at.paragraph); session.select(f.key) } }}>
            <small>{trail(f.key, 'Footnote')}</small><b>{i + 1}. {f.title}</b><span>{f.text}</span>
          </button>
        ))}
      </div>
      <div className="rdMarginCard">
        <h3><NoteIcon size={14} />My annotations</h3>
        {notes.length === 0 ? <span className="rdMuted">Select a sentence to highlight it or write a note.</span> : notes.map(note => (
          <div key={note.id} className="rdPnote rdPnote--mine">
            <small>{note.key ? trail(note.key, note.kind === 'bookmark' ? 'Bookmark' : note.kind === 'highlight' ? 'Highlight' : 'Note') : 'Note'}</small>
            {note.quote && <b>&ldquo;{note.quote.length > 90 ? `${note.quote.slice(0, 90)}…` : note.quote}&rdquo;</b>}
            {note.note && <span>{note.note}</span>}
          </div>
        ))}
      </div>
      {planning && (
        <div className="rdMarginCard">
          <h3><FlagIcon size={14} />Planning, read-only (alpha)</h3>
          {[planning.outline.find(o => o.title.includes(`Chapter ${n}`)) ?? planning.outline[0], planning.plot[0], planning.revisions[0]].filter(Boolean).map(row => (
            <div key={row.title} className="rdPnote"><small>{row.meta}</small><b>{row.title}</b></div>
          ))}
        </div>
      )}
      <div className="rdMarginCard">
        <h3><HeartIcon size={14} />This chapter</h3>
        <span>{mine.filter(([, m]) => m.like || m.dislike).length} sentences marked · {mine.filter(([, m]) => m.like).length} pleasant · {mine.filter(([, m]) => m.dislike).length} unpleasant</span>
        {totals && <span className="rdMuted">{totals.readers.toLocaleString('en-US')} readers marked this chapter: {totals.pleasant} pleasant, {totals.unpleasant} unpleasant.</span>}
        <span className="rdMuted">{book.source === 'local' ? 'Your own book: reactions you share are counted in the Readers part of your Writer.' : ctx.data.reader?.settings.shareReactions ? `Shared with ${book.authorName} without your name.` : 'Not shared: your reactions stay with you.'}</span>
      </div>
    </aside>
  )
}

export function ReadingPage({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const { chapter, text, error, loading, n, page, starts } = session
  if (!reader) return null
  const settings = reader.settings
  const reveal = (key: string) => setRevealed(prev => new Set(prev).add(key))
  if (loading && !text) return <p className="rdMuted" role="status">Opening the book…</p>
  if (error && !chapter) {
    return (
      <div className="rdCard">
        <p role="alert">{error}</p>
        {text && !text.canRead && <div className="rdRow"><button type="button" className="rdBtn rdBtn--pri" onClick={() => ctx.borrow(session.book)}>Borrow or buy</button></div>}
        {text?.canRead && <div className="rdRow">{text.chapters.filter(c => c.available).slice(0, 1).map(c => <button key={c.n} type="button" className="rdBtn" onClick={() => ctx.openPages(session.book.id, c.n)}>Open chapter {c.n}</button>)}</div>}
      </div>
    )
  }
  if (!chapter || !text) return <p className="rdMuted" role="status">Opening the chapter…</p>
  const flip = (patch: Partial<typeof settings>) => void actions.setSettings({ ...settings, ...patch })
  const total = text.chapters.length
  const last = starts.length - 1
  return (
    <div className={`rdReader rdReader--${settings.tone}${settings.highContrast ? ' rdReader--hc' : ''}${settings.font === 'easy' ? ' rdReader--easy' : ''}`} style={session.pageStyle as CSSProperties}
      tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowRight') session.next(); else if (e.key === 'ArrowLeft') session.previous() }} aria-label={`Chapter ${n}: ${chapter.title}`}>
      <div className="rdReaderBar">
        <div className="rdPtitle"><b>{session.book.title}</b><span>Chapter {n} of {total} · {chapter.title} · {chapter.words.toLocaleString('en-US')} words · {LEVEL_TEXT[chapter.level].name}</span></div>
        <div className="rdRow">
          <button type="button" className="rdBtn rdBtn--small" aria-pressed={settings.mode === 'turn'} aria-label="Turn pages" title="Turn pages" onClick={() => flip({ mode: 'turn' })}><TurnIcon size={16} />Turn</button>
          <button type="button" className="rdBtn rdBtn--small" aria-pressed={settings.mode === 'scroll'} aria-label="Scroll" title="Scroll the chapter" onClick={() => flip({ mode: 'scroll' })}><ScrollIcon size={16} />Scroll</button>
          <button type="button" className="rdBtn rdBtn--small" aria-label={settings.tone === 'day' ? 'Night page' : 'Day page'} title="Page tone" onClick={() => flip({ tone: settings.tone === 'day' ? 'night' : 'day' })}>
            {settings.tone === 'day' ? <MoonIcon size={16} /> : <SunIcon size={16} />}{settings.tone === 'day' ? 'Day' : 'Night'}
          </button>
        </div>
      </div>
      {chapter.draft && <p className="rdDraftNote" role="note">{chapter.draftNote}</p>}
      <SelectionBar ctx={ctx} session={session} />
      <div className="rdSheet">
        <div className="rdSheetText" data-tracks={session.tracks}>
          <h2 className="rdChapterTitle">Chapter {n} · {chapter.title}</h2>
          {session.tracks && (
            <div className="rdLegend" title="Pleasant, unpleasant, my flags">
              <span aria-label="Pleasant"><HeartIcon size={14} /></span><span aria-label="Unpleasant"><CrackedHeartIcon size={14} /></span><span aria-label="My flags"><FlagIcon size={14} /></span>
            </div>
          )}
          {session.visible.map(p => <Paragraph key={p.index} ctx={ctx} session={session} index={p.index} text={p.text} revealed={revealed} reveal={reveal} />)}
          {session.error && <p className="rdError" role="alert">{session.error}</p>}
        </div>
        <Margin ctx={ctx} session={session} />
      </div>
      <div className="rdTurn">
        {settings.mode === 'turn' ? (
          <>
            <button type="button" className="rdBtn" aria-label="Previous page" onClick={session.previous} disabled={page === 0 && !text.chapters.some(c => c.available && c.n < n)}><ChevronLeftIcon size={16} />Previous</button>
            <span className="rdTurnInfo">Page {page + 1} of {last + 1}</span>
            <button type="button" className="rdBtn" aria-label="Next page" onClick={session.next} disabled={page === last && !text.chapters.some(c => c.available && c.n > n)}>Next<ChevronRightIcon size={16} /></button>
          </>
        ) : <span className="rdTurnInfo">Scrolling the whole chapter</span>}
        <span className="rdGrow"><Meter percent={((n - 1 + (settings.mode === 'turn' ? (page + 1) / (last + 1) : 1)) / Math.max(1, total)) * 100} accent label="How far through the book" /></span>
        <button type="button" className="rdBtn rdBtn--small" aria-pressed={session.tracks} onClick={() => session.setTracks(!session.tracks)}><PlusIcon size={16} />{session.tracks ? 'Hide' : 'Show'} reactions</button>
      </div>
    </div>
  )
}
