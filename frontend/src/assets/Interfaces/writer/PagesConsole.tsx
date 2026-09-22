import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { PAGES_COMPONENTS } from './consoleDefs'
import { ChapterTabs, ConsoleTitleRow, Placeholder, useStoredState } from './shared'
import { buildChildIndex, descendantsOf } from './outlineTree'
import { nodeLabel } from './plotTree'
import { splitParagraphs, splitSentences } from './sentences'
import { useChapterDraft } from './useChapterDraft'
import { exportChapterPdf } from '../../../api/export'
import { HeartHalvedIcon, HeartIcon, MoonIcon, SunIcon } from '../../icons'
import { ChapterModeButtons, chapterHasDraft } from './PageConsole'
import { usePublications } from './usePublications'
import { fullDate, shortDate } from './chapterDates'

const FLAGS = ['Add', 'Remove', 'Merge', 'Change', 'Simplify', 'Expand'] as const
type FlagName = (typeof FLAGS)[number]

// Reactions and flags are kept per sentence in this browser (no backend
// model for them yet), keyed by the sentence's position in its moment.
interface SentenceMark { like: number; dislike: number; flag?: FlagName }
type Marks = Record<string, SentenceMark>

const cycle = (level: number) => (level + 1) % 4

interface Rect { top: number; height: number }

function Paragraph({ paragraphKey, sentences, marks, selected, onSelect, onCycle }: {
  paragraphKey: string
  sentences: string[]
  marks: Marks
  selected: string | null
  onSelect: (key: string) => void
  onCycle: (key: string, kind: 'like' | 'dislike') => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spanRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [rects, setRects] = useState<Record<string, Rect>>({})

  // Each sentence's reaction bars sit in the margin at that sentence's own
  // vertical position, so measure where the sentences actually wrapped.
  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current
      if (!container) return
      const base = container.getBoundingClientRect().top
      const next: Record<string, Rect> = {}
      spanRefs.current.forEach((el, key) => {
        const box = el.getBoundingClientRect()
        next[key] = { top: box.top - base, height: box.height }
      })
      setRects(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [sentences])

  const keyOf = (i: number) => `${paragraphKey}:${i}`

  return (
    <div className="wrPreviewPara" ref={containerRef}>
      <div className="wrReactGutter" aria-hidden={false}>
        {sentences.map((_, i) => {
          const key = keyOf(i)
          const rect = rects[key]
          if (!rect) return null
          const mark = marks[key] ?? { like: 0, dislike: 0 }
          const isSelected = selected === key
          const cell = (kind: 'like' | 'dislike') => {
            const level = mark[kind]
            if (level === 0 && !isSelected) return null
            const Heart = kind === 'like' ? HeartIcon : HeartHalvedIcon
            return (
              <button
                key={kind} type="button"
                className={`wrReactBar wrReactBar--${kind} wrReactBar--level${level}`}
                style={{ top: rect.top, height: Math.max(rect.height, 22), left: kind === 'like' ? 0 : 22 }}
                aria-label={`${kind === 'like' ? 'Like' : 'Dislike'}, level ${level}. Click to change.`}
                title={kind === 'like' ? 'Like: click to raise the level (three levels, then off)' : 'Dislike: click to raise the level (three levels, then off)'}
                onClick={() => onCycle(key, kind)}
              >
                {Array.from({ length: level }, (_, h) => <Heart key={h} size={14} />)}
                {level === 0 && <span className="wrReactPlus">{kind === 'like' ? '+' : '−'}</span>}
              </button>
            )
          }
          return <span key={key}>{cell('like')}{cell('dislike')}</span>
        })}
      </div>
      <p className="wrPreviewText">
        {sentences.map((s, i) => {
          const key = keyOf(i)
          const mark = marks[key]
          return (
            <span
              key={key}
              ref={el => { if (el) spanRefs.current.set(key, el); else spanRefs.current.delete(key) }}
              className={`wrSentence${selected === key ? ' wrSentence--selected' : ''}${mark?.flag ? ' wrSentence--flagged' : ''}`}
              title={mark?.flag ? `Flagged: ${mark.flag}` : undefined}
              onClick={() => onSelect(key)}
            >
              {s}
            </span>
          )
        })}
      </p>
    </div>
  )
}

function PagePreview({ w, chapter, component, label, onComponent }: { w: WriterWorkspace; chapter: OutlineNode; component: string; label: string; onComponent: (key: string) => void }) {
  const draft = useChapterDraft(w.activeProjectId, chapter.id)
  const [marks, setMarks] = useStoredState<Marks>(`scriblr.writer.marks.${w.activeProjectId}.${chapter.id}`, {})
  const [selected, setSelected] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  // Day: a white page with black text; night: a dark page with light text.
  const [tone, setTone] = useStoredState<'day' | 'night'>('scriblr.writer.previewTone', 'day')
  // The current draft, or one of the chapter's kept publications (read-only).
  const pubs = usePublications(w.activeProjectId, chapter.id)
  const [version, setVersion] = useState<string>('current')
  const published = version === 'current' ? undefined : pubs.publications.find(p => p.id === version)

  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const moments = useMemo(() => descendantsOf(index, chapter.id).filter(n => n.kind === 'moment'), [index, chapter.id])
  const chapterNumber = w.activeBookChapters.findIndex(c => c.id === chapter.id) + 1

  const paragraphs = moments.flatMap(m =>
    splitParagraphs(draft.bodies[m.id] ?? '').map((text, pi) => ({ key: `${m.id}:${pi}`, sentences: splitSentences(text) })))

  function cycleMark(key: string, kind: 'like' | 'dislike') {
    setSelected(key)
    setMarks(prev => {
      const current = prev[key] ?? { like: 0, dislike: 0 }
      return { ...prev, [key]: { ...current, [kind]: cycle(current[kind]) } }
    })
  }

  function toggleFlag(flag: FlagName) {
    if (!selected) return
    setMarks(prev => {
      const current = prev[selected] ?? { like: 0, dislike: 0 }
      return { ...prev, [selected]: { ...current, flag: current.flag === flag ? undefined : flag } }
    })
  }

  function exportJson() {
    const payload = {
      chapter: { id: chapter.id, number: chapterNumber, title: chapter.title },
      moments: moments.map(m => ({ id: m.id, synopsis: m.synopsis, body: draft.bodies[m.id] ?? '' })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `chapter-${chapterNumber}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function exportPdf() {
    if (!w.activeProjectId) return
    setExportMessage(null)
    try {
      await exportChapterPdf(w.activeProjectId, chapter.id, `chapter-${chapterNumber}.pdf`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'PDF export failed')
    }
  }

  const publishedParagraphs = published
    ? published.sections.flatMap(sec => splitParagraphs(sec.body).map((text, pi) => ({ key: `${sec.momentId}:${pi}`, text })))
    : []

  const selectedFlag = selected ? marks[selected]?.flag : undefined

  return (
    <>
    <ConsoleTitleRow
      console="Pages" component={`${label} · Chapter ${chapterNumber}`}
      right={(
        <>
          <div className="wrSegmented" role="group" aria-label="Pages editor">
            {PAGES_COMPONENTS.map(c => (
              <button
                key={c.key} type="button" title={c.label} aria-label={c.label} aria-pressed={c.key === component}
                className={c.key === component ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => onComponent(c.key)}
              >
                <c.Icon size={16} />
                <span className="wrSegLabel">{c.label}</span>
              </button>
            ))}
          </div>
          <ChapterModeButtons mode="preview" hasDraft={chapterHasDraft(draft.bodies)} onMode={w.showChapter} onPreview={w.showPreview} />
        </>
      )}
    />
    <div className="wrPagesBody">
      <div className="wrPreviewToolbar">
        <div className="wrToolGroup">
          <span className="wrLabel">Version</span>
          <select className="wrPreviewSelect" aria-label="Version" value={published ? version : 'current'} onChange={e => setVersion(e.target.value)}>
            <option value="current">Current draft</option>
            {pubs.publications.map(p => (
              <option key={p.id} value={p.id}>Published {fullDate(p.publishedAt)} · {p.wordCount.toLocaleString()} words</option>
            ))}
          </select>
        </div>
        <div className="wrToolGroup" role="group" aria-label="Page tone">
          {(['day', 'night'] as const).map(t => (
            <button
              key={t} type="button" aria-pressed={tone === t} aria-label={t === 'day' ? 'Day mode' : 'Night mode'} title={t === 'day' ? 'Day mode' : 'Night mode'}
              className={tone === t ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'} onClick={() => setTone(t)}
            >
              {t === 'day' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
            </button>
          ))}
        </div>
        {component === 'flag' && (
          <div className="wrToolGroup">
            <span className="wrLabel">Flag</span>
            {FLAGS.map(f => (
              <button
                key={f} type="button" disabled={!selected}
                className={selectedFlag === f ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'}
                title={selected ? undefined : 'Click a sentence first'} onClick={() => toggleFlag(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {component === 'export' && (
          <div className="wrToolGroup">
            <span className="wrLabel">Export</span>
            <button type="button" className="wrSmallBtn" onClick={exportJson}>JSON</button>
            <button type="button" className="wrSmallBtn" disabled title="Not available yet">EPUB</button>
            <button type="button" className="wrSmallBtn" onClick={() => void exportPdf()}>PDF</button>
            <button type="button" className="wrSmallBtn" disabled title="Not available yet">DOC</button>
            {exportMessage && <span className="wrError">{exportMessage}</span>}
          </div>
        )}
        {component === 'reaction' && (
          <span className="wrHint">Click a sentence, then click the hearts in the left margin. Each click raises the reaction one level; a fourth click clears it.</span>
        )}
      </div>
      <div className="wrPageWrap">
      <div className={`wrPage wrPage--preview wrPage--${tone}`}>
        <div className="wrPreviewHead">
          <span className="wrPageKicker">Chapter {chapterNumber}</span>
          <span className="wrPreviewTitle">{published ? published.title || nodeLabel(chapter) : nodeLabel(chapter)}</span>
          {published && <span className="wrPageMuted" title={fullDate(published.publishedAt)}>Published {shortDate(published.publishedAt)}, a saved copy (read-only)</span>}
        </div>
        {draft.error && <p className="wrPageError">{draft.error}</p>}
        {!published && draft.status === 'loading' && <p className="wrPageMuted">Loading…</p>}
        {!published && draft.status === 'idle' && paragraphs.length === 0 && <p className="wrPageMuted wrPreviewIndent">Nothing drafted in this chapter yet.</p>}
        {published && publishedParagraphs.length === 0 && <p className="wrPageMuted wrPreviewIndent">This publication has no text.</p>}
        {publishedParagraphs.map(p => (
          <div key={p.key} className="wrPreviewPara"><p className="wrPreviewText">{p.text}</p></div>
        ))}
        {!published && paragraphs.map(p => (
          <Paragraph
            key={p.key} paragraphKey={p.key} sentences={p.sentences} marks={marks}
            selected={selected} onSelect={setSelected} onCycle={cycleMark}
          />
        ))}
      </div>
      <ChapterTabs variant="page" chapters={w.activeBookChapters} activeId={chapter.id} onSelect={w.selectChapter} />
      </div>
    </div>
    </>
  )
}

function PagesConsole({ w, component, onComponent }: { w: WriterWorkspace; component: string; onComponent: (key: string) => void }) {
  const chapter = w.activeChapter
  if (!chapter) return <Placeholder title="Pages" body="Open a chapter to preview it." />
  const label = PAGES_COMPONENTS.find(c => c.key === component)?.label ?? ''
  return <PagePreview key={chapter.id} w={w} chapter={chapter} component={component} label={label} onComponent={onComponent} />
}

export default PagesConsole
