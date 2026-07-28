import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useDraft } from '../../api/draft'
import { analyzeText } from '../../lib/textAnalytics'
import type { DraftMoment, OutlineNode } from '../../types'
import { ancestorOfKind, momentsInSubtree } from '../outline/outlineTree'

type Scope = 'moment' | 'chapter' | 'book'

interface Props {
  projectId: string
  nodes: OutlineNode[]
  momentId?: string
  chapterId?: string
}

// Moment scope reads the existing useDraft cache (refreshes ~1.5s after
// typing pauses, via MomentEditor's autosave) -- no live-per-keystroke wiring
// into MomentEditor. Chapter/Book scope uses useQueries to collect every
// moment's body in one place for aggregation, which per-moment rendering
// (as Read mode does) doesn't need.
function DraftAnalyticsPanel({ projectId, nodes, momentId, chapterId }: Props) {
  const [scope, setScope] = useState<Scope>('moment')

  const momentDraft = useDraft(projectId, momentId)
  const book = chapterId ? ancestorOfKind(nodes, chapterId, 'book') : undefined

  const chapterMomentIds = useMemo(
    () => (chapterId ? momentsInSubtree(nodes, chapterId).map((m) => m.id) : []),
    [nodes, chapterId]
  )
  const bookMomentIds = useMemo(
    () => (book ? momentsInSubtree(nodes, book.id).map((m) => m.id) : []),
    [nodes, book]
  )

  const scopedMomentIds = scope === 'chapter' ? chapterMomentIds : scope === 'book' ? bookMomentIds : []

  const rollupQueries = useQueries({
    queries: scopedMomentIds.map((id) => ({
      queryKey: ['projects', projectId, 'draft', id] as const,
      queryFn: () => api.get<DraftMoment>(`/projects/${projectId}/draft/${id}`),
    })),
  })

  const rollupLoading = scope !== 'moment' && rollupQueries.some((q) => q.isLoading)
  const rollupText = rollupQueries.map((q) => q.data?.body ?? '').join('\n\n')

  const text = scope === 'moment' ? momentDraft.data?.body ?? '' : rollupText
  const analytics = useMemo(() => analyzeText(text), [text])
  const isLoading = scope === 'moment' ? momentDraft.isLoading : rollupLoading

  const noMomentSelected = scope === 'moment' && !momentId

  return (
    <div className="draft-analytics">
      <div className="draft-analytics__tabs">
        <button
          type="button"
          className={scope === 'moment' ? 'is-active' : ''}
          onClick={() => setScope('moment')}
          disabled={!momentId}
        >
          Moment
        </button>
        <button
          type="button"
          className={scope === 'chapter' ? 'is-active' : ''}
          onClick={() => setScope('chapter')}
          disabled={!chapterId}
        >
          Chapter
        </button>
        <button
          type="button"
          className={scope === 'book' ? 'is-active' : ''}
          onClick={() => setScope('book')}
          disabled={!book}
        >
          Book
        </button>
      </div>

      {noMomentSelected ? (
        <p className="draft-analytics__empty">Select a moment to see its analytics.</p>
      ) : isLoading ? (
        <p>Loading analytics…</p>
      ) : (
        <div className="draft-analytics__stats">
          <div className="draft-analytics__row">
            <span>Words</span>
            <strong>{analytics.wordCount}</strong>
          </div>
          <div className="draft-analytics__row">
            <span>Sentences</span>
            <strong>{analytics.sentenceCount}</strong>
          </div>
          <div className="draft-analytics__row">
            <span>Avg sentence length</span>
            <strong>{analytics.avgSentenceLength} words</strong>
          </div>
          <div className="draft-analytics__row">
            <span>Longest sentence</span>
            <strong>{analytics.longestSentence} words</strong>
          </div>
          <div className="draft-analytics__row">
            <span>Readability</span>
            <strong>
              Grade {analytics.fleschKincaidGrade} ({analytics.fleschReadingEase} ease)
            </strong>
          </div>
          {analytics.topWords.length > 0 && (
            <div className="draft-analytics__top-words">
              <span>Most used words</span>
              <div className="draft-analytics__word-chips">
                {analytics.topWords.map((w) => (
                  <span key={w.word} className="draft-analytics__word-chip">
                    {w.word} ({w.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DraftAnalyticsPanel
