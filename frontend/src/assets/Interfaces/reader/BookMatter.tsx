import { useState, type CSSProperties } from 'react'
import type { CatalogBook } from '../../../api/reader'
import { Card, Chip, Meter } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { wordsText } from './readerFormat'
import { currentChapter } from './readerSocial'

// The Book page's reference consoles: Frontmatter (author's note, warnings, contents) and Backmatter (glossary, bibliography, index, appendix), the
// alpha reader's read-only Outline, Plot, Plan and Revisions, and the edge tabs down the page's right edge.

const loading = <p className="rdMuted" role="status">Loading…</p>

function FlagRow({ ctx, book, flagKey }: { ctx: ReaderCtx; book: CatalogBook; flagKey: string }) {
  const [shown, setShown] = useState(false)
  const reader = ctx.data.reader
  const flag = book.flags.find(f => f.key === flagKey)
  if (!reader || !flag) return null
  const cls = reader.flagClasses[flag.key] ?? flag.defaultClass
  return (
    <li className="rdItem">
      <div className="rdItemMain">
        <b>{flag.name}</b>
        {cls === 'highlight' && <span className="rdMuted">{flag.detail}</span>}
        {cls === 'spoiler' && (shown
          ? <button type="button" className="rdLink rdMuted" onClick={() => setShown(false)}>{flag.detail}</button>
          : <button type="button" className="rdLink rdMuted" onClick={() => setShown(true)}>Spoiler description · tap to reveal</button>)}
        {cls === 'hidden' && <span className="rdMuted">Hidden in the text, as you set it</span>}
        {cls === 'marked' && <span className="rdMuted">Marked in the text, without details</span>}
      </div>
      <Chip title="Set in your account (User > Account > Flags)">{cls}</Chip>
    </li>
  )
}

export function FrontmatterConsole({ ctx, book, size }: { ctx: ReaderCtx; book: CatalogBook; size: 'tile' | 'full' }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  return (
    <>
      <Card title="Author's note"><p className="rdQuote">{detail.authorNote}</p></Card>
      {size === 'full' && (
        <div className="rdGrid2">
          <Card title="Warnings and flags">
            {book.flags.length === 0 ? <p className="rdMuted">The author set no content flags.</p> : <ul className="rdList">{book.flags.map(f => <FlagRow key={f.key} ctx={ctx} book={book} flagKey={f.key} />)}</ul>}
            <p className="rdMuted">Each flag takes one of four classes (hidden, marked, highlight or spoiler). You set them for every book in your account: User &rsaquo; Account &rsaquo; Flags.</p>
          </Card>
          <Card title="Contents">
            <ul className="rdList">
              {detail.contents.map(c => (
                <li key={c.n} className="rdItem">
                  <span className="rdAv" aria-hidden="true">{c.n}</span>
                  <button type="button" className="rdLink rdGrow" onClick={() => ctx.openPages(book.id, c.n)}>{c.title}</button>
                  <span className="rdMuted">{wordsText(c.words)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  )
}

export function BackmatterConsole({ ctx, book, size }: { ctx: ReaderCtx; book: CatalogBook; size: 'tile' | 'full' }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  return (
    <>
      <Card title="Glossary">
        <ul className="rdList">{detail.glossary.map(g => <li key={g.title} className="rdItem"><div className="rdItemMain"><b>{g.title}</b><span className="rdMuted">{g.meta}</span></div></li>)}</ul>
      </Card>
      {size === 'full' && (
        <div className="rdGrid2">
          <Card title="Bibliography"><ul className="rdList">{detail.bibliography.map(b => <li key={b} className="rdMuted">{b}</li>)}</ul></Card>
          <Card title="Index and appendix">
            <div className="rdRow">{detail.index.map(i => <Chip key={i}>{i}</Chip>)}</div>
            <span className="rdMuted">{detail.appendix.join(' · ')}</span>
          </Card>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------------- the alpha reader's read-only planning

const ReadOnly = () => <Chip>Read-only</Chip>

export function OutlineConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  return (
    <>
      <ReadOnly />
      <ul className="rdList">{detail.planning.outline.map((o, i) => <li key={i} className="rdItem" style={{ marginLeft: o.indent }}><div className="rdItemMain"><b>{o.title}</b><span className="rdMuted">{o.meta}</span></div></li>)}</ul>
    </>
  )
}

export function PlotConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  return (
    <>
      <ReadOnly />
      <Card title={detail.planning.plotPath}>
        <ul className="rdList">{detail.planning.plot.map(p => <li key={p.title} className="rdItem"><div className="rdItemMain"><b>{p.title}</b><span className="rdMuted">{p.meta}</span></div></li>)}</ul>
      </Card>
    </>
  )
}

export function PlanConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  const p = detail.planning
  return (
    <>
      <ReadOnly />
      <Card>
        <div className="rdRow"><span className="rdGrow">Word-count goal</span><span>{p.wordsNow.toLocaleString('en-US')} / {p.goalWords.toLocaleString('en-US')}</span></div>
        <Meter percent={(p.wordsNow / Math.max(1, p.goalWords)) * 100} accent />
        <div className="rdRow"><span className="rdGrow">Chapters outlined</span><span>{p.chaptersOutlined} of {p.chaptersTotal}</span></div>
        <Meter percent={(p.chaptersOutlined / Math.max(1, p.chaptersTotal)) * 100} />
        <div className="rdRow"><span className="rdGrow">Publish target</span><span>{p.publishTarget}</span></div>
      </Card>
    </>
  )
}

export function RevisionsConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const detail = ctx.data.details[book.id]
  if (!detail) return loading
  return (
    <>
      <ReadOnly />
      <ul className="rdList">{detail.planning.revisions.map(r => <li key={r.title} className="rdItem"><div className="rdItemMain"><b>{r.title}</b><span className="rdMuted">{r.meta}</span></div></li>)}</ul>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------------- edge tabs

// A tab for each chapter down the page's right edge, as in the Writer's book: the chapter the reader has reached stands out; a click opens it.
// In the e-reader the tabs are the chapters the reader may open (the rest are dimmed) and the open chapter is the one that stands out.
export function EdgeTabs({ ctx, book, current, chapters }: { ctx: ReaderCtx; book: CatalogBook; current?: number; chapters?: { n: number; title: string; available: boolean }[] }) {
  const detail = ctx.data.details[book.id]
  const position = ctx.data.reader?.progress[book.id]
  const list = chapters ?? detail?.contents.map(c => ({ n: c.n, title: c.title, available: true }))
  if (!list) return null
  const here = current ?? currentChapter(position?.pct ?? 0, list.length)
  return (
    <div className="rdEdge" role="navigation" aria-label="Chapters">
      {list.map(c => (
        <button key={c.n} type="button" className={c.n === here ? 'rdEdgeTab rdEdgeTab--on' : 'rdEdgeTab'} style={{ ['--rd-tab' as string]: `${(c.n % 5) * 6}%` } as CSSProperties}
          title={`Chapter ${c.n}: ${c.title}${c.available ? '' : ' (not open at your level)'}`} aria-label={`Chapter ${c.n}: ${c.title}`} aria-current={c.n === here ? 'true' : undefined}
          disabled={!c.available} onClick={() => ctx.openPages(book.id, c.n)}>
          {c.n}
        </button>
      ))}
    </div>
  )
}
