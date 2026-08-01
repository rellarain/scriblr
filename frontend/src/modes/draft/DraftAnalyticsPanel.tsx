import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useDraft } from '../../api/draft'
import { usePlot } from '../../api/plot'
import { analyzeSentenceStructure, analyzeText, countPhraseOccurrences } from '../../lib/textAnalytics'
import type { DraftMoment, OutlineNode } from '../../types'
import { ancestorOfKind, momentsInSubtree } from '../outline/outlineTree'
import { getRelevantPlotlines, plotlineKeywords } from '../plan/plotTree'

type Scope = 'moment' | 'chapter' | 'book'

interface Props {
  projectId: string
  nodes: OutlineNode[]
  momentId?: string
  chapterId?: string
}

interface PlotlineMatch {
  plotlineId: string
  plotlineTitle: string
  matches: { keyword: string; count: number }[]
}

const SENTENCE_TYPE_LABELS: Record<string, string> = {
  declarative: 'Declarative',
  interrogative: 'Interrogative',
  exclamatory: 'Exclamatory',
  imperative: 'Imperative',
}

const CLAUSE_STRUCTURE_LABELS: Record<string, string> = {
  simple: 'Simple',
  compound: 'Compound',
  complex: 'Complex',
  compoundComplex: 'Compound-complex',
}

const PHRASE_TYPE_LABELS: Record<string, string> = {
  nounPhrase: 'Noun phrase',
  verbPhrase: 'Verb phrase',
  prepositionalPhrase: 'Prepositional phrase',
}

// Moment scope reads the existing useDraft cache (refreshes ~1.5s after
// typing pauses, via MomentEditor's autosave) -- no live-per-keystroke wiring
// into MomentEditor. Chapter/Book scope uses useQueries to collect every
// moment's body in one place for aggregation, which per-moment rendering
// (as Read mode does) doesn't need.
function DraftAnalyticsPanel({ projectId, nodes, momentId, chapterId }: Props) {
  const [scope, setScope] = useState<Scope>('moment')

  const momentDraft = useDraft(projectId, momentId)
  const { data: plot } = usePlot(projectId)
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
  const sentenceStructure = useMemo(() => analyzeSentenceStructure(text), [text])
  const isLoading = scope === 'moment' ? momentDraft.isLoading : rollupLoading

  // "Relevant plotlines" is a book-level setting, so the same set applies
  // regardless of which scope tab (moment/chapter/book) is active.
  const plotlineMatches = useMemo<PlotlineMatch[]>(() => {
    if (!book || !plot) return []
    return getRelevantPlotlines(plot.nodes, book.plotlineIds)
      .map((plotline) => ({
        plotlineId: plotline.id,
        plotlineTitle: plotline.title || 'Untitled',
        matches: plotlineKeywords(plotline)
          .map((keyword) => ({ keyword, count: countPhraseOccurrences(text, keyword) }))
          .filter((m) => m.count > 0),
      }))
      .filter((p) => p.matches.length > 0)
  }, [book, plot, text])

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

          {sentenceStructure.totalSentences > 0 && (
            <div className="draft-analytics__structure">
              <span className="draft-analytics__structure-title">
                Sentence &amp; phrase patterns (estimates)
              </span>

              <div className="draft-analytics__structure-group">
                <span>Sentence types</span>
                <div className="draft-analytics__word-chips">
                  {Object.entries(sentenceStructure.sentenceTypes)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <span key={type} className="draft-analytics__word-chip">
                        {SENTENCE_TYPE_LABELS[type]} ({count})
                      </span>
                    ))}
                </div>
              </div>

              <div className="draft-analytics__structure-group">
                <span>Clause structure</span>
                <div className="draft-analytics__word-chips">
                  {Object.entries(sentenceStructure.clauseStructure)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <span key={type} className="draft-analytics__word-chip">
                        {CLAUSE_STRUCTURE_LABELS[type]} ({count})
                      </span>
                    ))}
                </div>
              </div>

              <div className="draft-analytics__structure-group">
                <span>Phrase types</span>
                <div className="draft-analytics__word-chips">
                  {Object.entries(sentenceStructure.phraseTypes)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <span key={type} className="draft-analytics__word-chip">
                        {PHRASE_TYPE_LABELS[type]} ({count})
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}

          {plotlineMatches.length > 0 && (
            <div className="draft-analytics__structure">
              <span className="draft-analytics__structure-title">Plotline mentions</span>
              {plotlineMatches.map((p) => (
                <div key={p.plotlineId} className="draft-analytics__structure-group">
                  <span>{p.plotlineTitle}</span>
                  <div className="draft-analytics__word-chips">
                    {p.matches.map((m) => (
                      <span key={m.keyword} className="draft-analytics__word-chip">
                        {m.keyword} ({m.count})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DraftAnalyticsPanel
