import { useState } from 'react'
import { exportFile } from '../../../../api/export'
import type { ExportFormat, ExportOptions, ExportScope, PageSize } from '../../../../api/export'
import { ExportIcon } from '../../../icons'
import { useStoredState } from '../shared'

// The Preview's Export tool: the project, this book or this chapter, as a PDF, an EPUB or JSON, made by the backend
// (`GET /api/projects/{id}/export`, backend/app/api/export.py) and saved under a name made from the titles. The choices are remembered.

export interface ExportTarget { id: string; title: string; number: number }

interface Choices {
  scope: ExportScope
  format: ExportFormat
  pageSize: PageSize
  titlePage: boolean
  contents: boolean
  footnotes: boolean
  marginFlags: boolean
  cover: boolean
  split: boolean
  plot: boolean
  flags: boolean
  revisions: boolean
}

const DEFAULTS: Choices = {
  scope: 'book', format: 'pdf', pageSize: '6x9', titlePage: true, contents: true, footnotes: true, marginFlags: false,
  cover: true, split: true, plot: true, flags: true, revisions: false,
}

const PAGE_SIZES: Array<[PageSize, string]> = [['6x9', '6 × 9 in'], ['a5', 'A5'], ['letter', 'US Letter'], ['a4', 'A4']]

const FORMATS: Array<{ key: ExportFormat; name: string; detail: string }> = [
  { key: 'pdf', name: 'PDF', detail: 'To print or share, as the preview lays it out.' },
  { key: 'epub', name: 'EPUB', detail: 'For e-readers: chapters, cover and formatting.' },
  { key: 'json', name: 'JSON', detail: 'The outline, plot and drafts, as data.' },
]

// A file name from a title: lower case, accents dropped, anything but letters and digits made a hyphen. Letters of any script are kept.
export function slug(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled'
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="wrExportCheck">
      <input type="checkbox" className="wrExportBox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Cards<K extends string>({ label, cards, chosen, onChoose }: {
  label: string
  cards: Array<{ key: K; name: string; detail: string }>
  chosen: K
  onChoose: (key: K) => void
}) {
  return (
    <div className="wrExportSection" role="group" aria-label={label}>
      <span className="wrLabel">{label}</span>
      <div className="wrExportCards">
        {cards.map(card => (
          <button
            key={card.key} type="button" aria-pressed={card.key === chosen}
            className={card.key === chosen ? 'wrExportCard wrExportCard--chosen' : 'wrExportCard'} onClick={() => onChoose(card.key)}
          >
            <span className="wrExportCardName">{card.name}</span>
            <span className="wrExportCardDetail">{card.detail}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ExportTool({ projectId, projectTitle, bookCount, book, chapter }: {
  projectId: string
  projectTitle: string
  bookCount: number
  // The chapter's book, with its place among the project's books; none for a chapter outside any book.
  book: (ExportTarget & { chapterCount: number }) | null
  chapter: ExportTarget
}) {
  const [stored, setStored] = useStoredState<Partial<Choices>>('scriblr.writer.export', {})
  const c: Choices = { ...DEFAULTS, ...stored }
  const set = (patch: Partial<Choices>) => setStored(prev => ({ ...prev, ...patch }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scope: ExportScope = c.scope === 'book' && !book ? 'chapter' : c.scope
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const scopes: Array<{ key: ExportScope; name: string; detail: string }> = [
    { key: 'project', name: 'The project', detail: `${projectTitle || 'Untitled'} · ${plural(bookCount, 'book')}` },
    ...(book ? [{ key: 'book' as const, name: 'This book', detail: `Book ${book.number} · ${book.title || 'Untitled'} · ${plural(book.chapterCount, 'chapter')}` }] : []),
    { key: 'chapter', name: 'This chapter', detail: `Chapter ${chapter.number} · ${chapter.title || 'Untitled'}` },
  ]

  // A project of several books in PDF or EPUB: a file per book (in a zip) or one file with every book.
  const perBook = scope === 'project' && c.format !== 'json' && bookCount > 1
  const zipped = perBook && c.split
  const base = scope === 'project' ? slug(projectTitle)
    : scope === 'book' && book ? slug(book.title)
      : book ? `${slug(book.title)}-chapter-${chapter.number}` : slug(chapter.title)
  const fileName = `${base}.${zipped ? 'zip' : c.format}`

  function options(): ExportOptions {
    const split = perBook ? { split: c.split } : {}
    if (c.format === 'pdf') return { pageSize: c.pageSize, titlePage: c.titlePage, contents: c.contents, footnotes: c.footnotes, marginFlags: c.marginFlags, ...split }
    if (c.format === 'epub') return { cover: c.cover, contents: c.contents, footnotes: c.footnotes, ...split }
    return { plot: c.plot, flags: c.flags, revisions: c.revisions }
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const id = scope === 'project' ? undefined : scope === 'book' ? book?.id : chapter.id
      await exportFile(projectId, { scope, id, format: c.format, options: options() }, fileName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed.')
    } finally {
      setBusy(false)
    }
  }

  // A chapter alone has no contents page or list (the export draws one only for more than one chapter).
  const contents = scope !== 'chapter'

  return (
    <div className="wrExportTool">
      <Cards label="What to export" cards={scopes} chosen={scope} onChoose={key => set({ scope: key })} />
      <Cards label="Format" cards={FORMATS} chosen={c.format} onChoose={key => set({ format: key })} />
      <div className="wrExportOptions" role="group" aria-label="Options">
        <span className="wrLabel">Options</span>
        {perBook && (
          <div className="wrToolGroup">
            <span className="wrExportOptName">The books</span>
            <div className="wrSegmented" role="group" aria-label="How many files">
              <button type="button" aria-pressed={c.split} className={c.split ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => set({ split: true })}>A file per book</button>
              <button type="button" aria-pressed={!c.split} className={c.split ? 'wrSegBtn' : 'wrSegBtn wrSegBtn--active'} onClick={() => set({ split: false })}>One file with every book</button>
            </div>
          </div>
        )}
        {c.format === 'pdf' && (
          <>
            <div className="wrExportChecks">
              <label className="wrExportCheck">
                <span className="wrExportOptName">Page size</span>
                <select className="wrPreviewSelect" aria-label="Page size" value={c.pageSize} onChange={e => set({ pageSize: e.target.value as PageSize })}>
                  {PAGE_SIZES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </label>
              <Check label="Title page" checked={c.titlePage} onChange={v => set({ titlePage: v })} />
              {contents && <Check label="Contents" checked={c.contents} onChange={v => set({ contents: v })} />}
              <Check label="Footnotes" checked={c.footnotes} onChange={v => set({ footnotes: v })} />
              <Check label="Revision flags in the margin" checked={c.marginFlags} onChange={v => set({ marginFlags: v })} />
            </div>
            <span className="wrHint">Laid out in the book&rsquo;s preview formatting. Any script prints (accents, Greek, Cyrillic, Arabic, Hebrew, Hindi, Thai, Chinese, Japanese, Korean, symbols and emoji): the fonts come with the app.</span>
          </>
        )}
        {c.format === 'epub' && (
          <>
            <div className="wrExportChecks">
              <Check label="Cover (the book's title and colour)" checked={c.cover} onChange={v => set({ cover: v })} />
              {contents && <Check label="Contents" checked={c.contents} onChange={v => set({ contents: v })} />}
              <Check label="Footnotes, at each chapter's end" checked={c.footnotes} onChange={v => set({ footnotes: v })} />
            </div>
            <span className="wrHint">A section for each chapter, in the book&rsquo;s preview formatting; it reflows on any e-reader.</span>
          </>
        )}
        {c.format === 'json' && (
          <>
            <div className="wrExportChecks">
              <Check label="Plot" checked={c.plot} onChange={v => set({ plot: v })} />
              <Check label="Revision flags" checked={c.flags} onChange={v => set({ flags: v })} />
              <Check label="Chapter revisions" checked={c.revisions} onChange={v => set({ revisions: v })} />
            </div>
            <span className="wrHint">Always the outline and the drafts, readable by other tools or kept as a backup.</span>
          </>
        )}
      </div>
      <div className="wrToolGroup wrExportGo">
        <span className="wrLabel">File</span>
        <span className="wrExportFile">{fileName}</span>
        {zipped && <span className="wrHint">{c.format === 'epub' ? 'an EPUB' : 'a PDF'} for each book</span>}
        <button type="button" className="wrSmallBtn wrSmallBtn--accent wrExportBtn" disabled={busy} onClick={() => void run()}>
          <ExportIcon size={14} /> {busy ? 'Exporting…' : 'Export'}
        </button>
      </div>
      {error && <span className="wrError" role="alert">{error}</span>}
    </div>
  )
}

export default ExportTool
