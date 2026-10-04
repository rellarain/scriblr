import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { fullDate, shortDate, type ChapterMeta } from '../chapterDates'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { nodeLabel } from '../plotTree'
import { formatWords } from '../wordCount'
import ClickToEdit from './ClickToEdit'
import { parentTrail } from './draftModel'

const KIND_WORD: Partial<Record<OutlineNode['kind'], string>> = { series: 'Series', book: 'Book', arc: 'Arc', chapter: 'Chapter' }

// The chapter title tile, across the top of the Draft level: the titles above the chapter (series,
// book, arc, each in its own colour), the chapter's own title and synopsis (click to edit), its dates
// and draft stats, with the page tools (save, publish, Draft | Preview) at the right.
export function ChapterTile({ w, chapter, chapterWords, meta, tools, error }: {
  w: WriterWorkspace
  chapter: OutlineNode
  // The chapter's live draft word count.
  chapterWords: number
  meta: ChapterMeta
  tools: ReactNode
  error?: string
}) {
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const trail = useMemo(() => parentTrail(chapter.id, nodeById), [chapter.id, nodeById])
  const chapterNumber = w.activeBookChapters.findIndex(c => c.id === chapter.id) + 1
  const tint = (node: OutlineNode) => ({ '--wr-node-tint': w.levelTintOf(node) } as CSSProperties)

  const inside = useMemo(() => descendantsOf(index, chapter.id).filter(n => !n.freeDraft), [index, chapter.id])
  const count = (kind: OutlineNode['kind'], one: string) => {
    const n = inside.filter(x => x.kind === kind).length
    return `${n} ${one}${n === 1 ? '' : 's'}`
  }
  const goal = w.activeProject?.settings.chapterWordCountTarget ?? null
  const percent = goal && goal > 0 ? Math.min(100, Math.round((chapterWords / goal) * 100)) : 0

  return (
    <header className="wrChapterTile" style={tint(chapter)} aria-label="Chapter details">
      <div className="wrChapterTileTop">
        <div className="wrParentStack">
          {trail.map(node => (
            <span key={node.id} className="wrParentTag" style={tint(node)}>
              <span className="wrParentKind">{KIND_WORD[node.kind]}</span>
              <span className="wrParentTitle">{nodeLabel(node)}</span>
            </span>
          ))}
        </div>
        {error && <p className="wrError">{error}</p>}
        <div className="wrChapterTileTools">{tools}</div>
      </div>

      <div className="wrChapterTileMain">
        <div className="wrChapterTileName">
          <span className="wrPageKicker">Chapter {chapterNumber}</span>
          <ClickToEdit
            className="wrChapterTitle" label="Chapter title" placeholder="Untitled chapter"
            value={chapter.title} onChange={title => w.updateOutlineNode(chapter.id, { title })}
          />
          <ClickToEdit
            className="wrChapterSynopsis" label="Chapter synopsis" placeholder="Add a synopsis…" multiline
            value={chapter.synopsis} onChange={synopsis => w.updateOutlineNode(chapter.id, { synopsis })}
          />
        </div>

        <section className="wrChapterTileStats" aria-label="Chapter draft stats">
          <div className="wrChapterTileWords">
            <span className="wrStatLabel">Words</span>
            <span className="wrStatValue">{chapterWords.toLocaleString()}{goal ? ` of ${goal.toLocaleString()}` : ''}</span>
          </div>
          {goal ? (
            <span className="wrStatBar" role="progressbar" aria-label="Chapter words" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${percent}%`}>
              <span className="wrStatBarFill" style={{ width: `${percent}%` }} />
            </span>
          ) : null}
          <div className="wrNodeStats">
            <span>{count('act', 'act')}</span>
            <span>{count('scene', 'scene')}</span>
            <span>{count('moment', 'moment')}</span>
            <span>{formatWords(chapterWords)}</span>
          </div>
          <div className="wrPageMetaRow">
            {meta.created && <span title={fullDate(meta.created)}>Created {shortDate(meta.created)}</span>}
            {meta.edited && <span title={fullDate(meta.edited)}>Edited {shortDate(meta.edited)}</span>}
            {meta.published && <span title={fullDate(meta.published)}>Published {shortDate(meta.published)}</span>}
          </div>
        </section>
      </div>
    </header>
  )
}

export default ChapterTile
