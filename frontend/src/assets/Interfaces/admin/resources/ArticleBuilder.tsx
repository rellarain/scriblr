import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getPromotableFeedback, submitFeedback } from '../../../../api/resourcesApi'
import type { PromotableFeedbackMessage, ResourceFaqEntry, ResourceTutorial } from '../../../../api/types'
import { CURRENT_USER } from '../../../../userSeed'
import ResourceTree from './ResourceTree'
import type { ResourcesWorkspace } from './useResources'
import './resources.scss'

const TONE_OPTIONS = [
  { value: 'pleasant', label: 'Pleasant' },
  { value: 'unpleasant', label: 'Unpleasant' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'neutral', label: 'Neutral' },
] as const
type ToneValue = typeof TONE_OPTIONS[number]['value']

function newLocalId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

// AUI's Resources tile, redesigned as an article builder: the shared
// Interface > Console > Component > Feature tree (ResourceTree.tsx) on the
// left, and a Guide/Tutorials/FAQ editor for whichever node is selected on
// the right, with a Preview toggle that renders the same content as it
// would look inside a console's Help panel or Training page (no consoles
// actually read from this yet -- see the plan's "no live wiring this phase").
function ArticleBuilder({ resources, selectedId, onSelectNode }: {
  resources: ResourcesWorkspace
  selectedId: string | null
  onSelectNode: (id: string) => void
}) {
  const [contentTab, setContentTab] = useState<'guide' | 'tutorials' | 'faq'>('guide')
  const [guideView, setGuideView] = useState<'write' | 'rendered'>('write')
  const [previewOn, setPreviewOn] = useState(false)
  const [previewAs, setPreviewAs] = useState<'help' | 'training'>('help')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackTone, setFeedbackTone] = useState<ToneValue | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | undefined>(undefined)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoteCandidates, setPromoteCandidates] = useState<PromotableFeedbackMessage[]>([])

  const node = selectedId ? resources.findNode(selectedId) : undefined
  const content = selectedId ? resources.contentOf(selectedId) : { guide: '', tutorials: [], faq: [] }
  const path = selectedId ? resources.pathTo(selectedId) : []
  const breadcrumb = path.map(n => n.name || `Untitled ${n.kind}`).join(' › ')

  // Local guide text, debounced to the server (typing shouldn't save on
  // every keystroke) -- flushed immediately if the selection changes while
  // an edit is still waiting, so switching nodes quickly never drops it.
  const [guideText, setGuideText] = useState(content.guide)
  const guideTextRef = useRef(content.guide)
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingForId = useRef<string | null>(null)

  useEffect(() => {
    setPreviewOn(false); setFeedbackOpen(false); setFeedbackSubmitted(false); setFeedbackError(undefined)
    setPromoteOpen(false); setContentTab('guide'); setGuideView('write')
  }, [selectedId])

  useEffect(() => {
    const previousId = savingForId.current
    guideTextRef.current = content.guide
    setGuideText(content.guide)
    savingForId.current = selectedId
    return () => {
      if (guideTimer.current && previousId) {
        clearTimeout(guideTimer.current)
        guideTimer.current = null
        void resources.setGuide(previousId, guideTextRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  function onGuideChange(value: string) {
    setGuideText(value)
    guideTextRef.current = value
    if (!selectedId) return
    if (guideTimer.current) clearTimeout(guideTimer.current)
    guideTimer.current = setTimeout(() => {
      guideTimer.current = null
      void resources.setGuide(selectedId, value)
    }, 600)
  }

  async function openPromote() {
    const opening = !promoteOpen
    setPromoteOpen(opening)
    if (opening && selectedId) setPromoteCandidates(await getPromotableFeedback(selectedId))
  }

  function updateTutorial(index: number, patch: Partial<ResourceTutorial>) {
    if (!selectedId) return
    void resources.setTutorials(selectedId, content.tutorials.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }
  function addTutorial() {
    if (!selectedId) return
    void resources.setTutorials(selectedId, [...content.tutorials, { id: newLocalId('tut'), title: '', body: '' }])
  }
  function updateFaq(index: number, patch: Partial<ResourceFaqEntry>) {
    if (!selectedId) return
    void resources.setFaq(selectedId, content.faq.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }
  function addFaq() {
    if (!selectedId) return
    void resources.setFaq(selectedId, [...content.faq, { id: newLocalId('faq'), question: '', answer: '', source: 'authored', sourceMessageId: null }])
  }
  function promoteCandidate(candidate: PromotableFeedbackMessage) {
    if (!selectedId) return
    void resources.setFaq(selectedId, [
      ...content.faq,
      { id: newLocalId('faq'), question: candidate.text, answer: '', source: 'feedback', sourceMessageId: candidate.id },
    ])
    setPromoteOpen(false)
  }

  async function submit() {
    if (!selectedId) return
    setFeedbackError(undefined)
    try {
      await submitFeedback({
        author: CURRENT_USER.displayName, text: feedbackText, senderTone: feedbackTone,
        openPage: path[0]?.name ?? null, openConsole: path[1]?.name ?? null, selectedComponent: path[2]?.name ?? null,
      })
      setFeedbackOpen(false); setFeedbackSubmitted(true); setFeedbackText(''); setFeedbackTone(null)
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Could not submit feedback')
    }
  }

  const tree = (
    <ResourceTree
      childrenOf={resources.childrenOf} selectedId={selectedId} onSelect={onSelectNode}
      onAddChild={(parentId, kind) => { void resources.addNode(parentId, kind).then(id => { if (id) onSelectNode(id) }) }}
      onRename={(id, name) => { void resources.renameNode(id, name) }}
      onDelete={id => { void resources.deleteNode(id) }}
    />
  )

  if (!node || !selectedId) {
    return (
      <div className="resSplit">
        {tree}
        <div className="resPane resPane--empty">Select or add an interface on the left to get started.</div>
      </div>
    )
  }

  return (
    <div className="resSplit">
      {tree}
      <div className="resPane">
        <div className="resBreadcrumb">{breadcrumb}</div>

        {previewOn ? (
          <>
            <div className="resToolbar">
              <div className="resPillGroup">
                <button type="button" className={previewAs === 'help' ? 'resPill resPill--active' : 'resPill'} onClick={() => setPreviewAs('help')}>Preview as Help</button>
                <button type="button" className={previewAs === 'training' ? 'resPill resPill--active' : 'resPill'} onClick={() => setPreviewAs('training')}>Preview as Training</button>
              </div>
              <button type="button" className="resLinkBtn" onClick={() => setPreviewOn(false)}>&larr; Back to editing</button>
            </div>

            <div className="resPreviewCard">
              <div className="resPreviewHead">
                <span className="resBadge">{previewAs === 'help' ? 'Help' : 'Training'}</span>
                <h2>{node.name || `Untitled ${node.kind}`}</h2>
              </div>
              <div className="resMarkdown"><ReactMarkdown>{content.guide || '*No guide written yet.*'}</ReactMarkdown></div>

              {content.tutorials.length > 0 && (
                <>
                  <h3 className="resSubheading">Tutorials</h3>
                  {content.tutorials.map(t => (
                    <div key={t.id} className="resTutorialPreview">
                      <div className="resTutorialTitle">{t.title || 'Untitled tutorial'}</div>
                      <div className="resMarkdown"><ReactMarkdown>{t.body}</ReactMarkdown></div>
                    </div>
                  ))}
                </>
              )}

              {content.faq.length > 0 && (
                <>
                  <h3 className="resSubheading">Frequently asked</h3>
                  {content.faq.map(f => (
                    <div key={f.id} className="resFaqPreview">
                      <div className="resFaqQ">
                        {f.question}
                        <span className={f.source === 'feedback' ? 'resSourceBadge resSourceBadge--feedback' : 'resSourceBadge'}>
                          {f.source === 'feedback' ? 'From feedback' : 'Hand-authored'}
                        </span>
                      </div>
                      <div className="resFaqA">{f.answer}</div>
                    </div>
                  ))}
                </>
              )}

              {previewAs === 'help' ? (
                <div className="resFeedbackSection">
                  <div className="resFeedbackSectionHead">
                    <h3 className="resSubheading">Still stuck?</h3>
                    <span className="resComingSoon">Chat with an admin — coming soon</span>
                  </div>
                  {feedbackSubmitted ? (
                    <p className="resFeedbackThanks">Thanks — your feedback was sent, tagged to {breadcrumb}.</p>
                  ) : feedbackOpen ? (
                    <div className="resFeedbackForm">
                      <div className="resFeedbackMeta">Element channel: <strong>{breadcrumb}</strong></div>
                      <div className="resFeedbackMeta">Tone</div>
                      <div className="resPillGroup">
                        {TONE_OPTIONS.map(t => (
                          <button
                            key={t.value} type="button"
                            className={feedbackTone === t.value ? 'resPill resPill--active' : 'resPill'}
                            onClick={() => setFeedbackTone(t.value)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="resTextarea" rows={3} value={feedbackText}
                        placeholder="Your explicated intention — what should change, and why…"
                        onChange={e => setFeedbackText(e.target.value)}
                      />
                      {feedbackError && <p className="resError">{feedbackError}</p>}
                      <div className="resButtonRow">
                        <button type="button" className="resPrimaryBtn" disabled={!feedbackText.trim()} onClick={() => { void submit() }}>Submit</button>
                        <button type="button" className="resLinkBtn" onClick={() => setFeedbackOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="resPrimaryBtn" onClick={() => setFeedbackOpen(true)}>Submit feedback</button>
                  )}
                </div>
              ) : (
                <div className="resFeedbackSection">
                  <div className="resFeedbackSectionHead">
                    <h3 className="resSubheading">Check your understanding</h3>
                    <span className="resComingSoon">
                      {resources.assessmentOf(selectedId).questions.length > 0 ? 'Assessment preview only' : 'No assessment written yet'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="resToolbar">
              <div className="resPillGroup">
                <button type="button" className={contentTab === 'guide' ? 'resPill resPill--active' : 'resPill'} onClick={() => setContentTab('guide')}>Guide</button>
                <button type="button" className={contentTab === 'tutorials' ? 'resPill resPill--active' : 'resPill'} onClick={() => setContentTab('tutorials')}>Tutorials</button>
                <button type="button" className={contentTab === 'faq' ? 'resPill resPill--active' : 'resPill'} onClick={() => setContentTab('faq')}>FAQ</button>
              </div>
              <button type="button" className="resPrimaryBtn resPrimaryBtn--ghost" onClick={() => setPreviewOn(true)}>Preview ▸</button>
            </div>

            {contentTab === 'guide' && (
              <>
                <div className="resPillGroup resPillGroup--sub">
                  <button type="button" className={guideView === 'write' ? 'resPill resPill--active' : 'resPill'} onClick={() => setGuideView('write')}>Write</button>
                  <button type="button" className={guideView === 'rendered' ? 'resPill resPill--active' : 'resPill'} onClick={() => setGuideView('rendered')}>Rendered</button>
                </div>
                {guideView === 'write' ? (
                  <textarea
                    className="resTextarea resTextarea--guide" value={guideText}
                    placeholder="# Write a markdown guide for this node…"
                    onChange={e => onGuideChange(e.target.value)}
                  />
                ) : (
                  <div className="resMarkdown resMarkdown--card">
                    <ReactMarkdown>{guideText || '*Nothing written yet.*'}</ReactMarkdown>
                  </div>
                )}
              </>
            )}

            {contentTab === 'tutorials' && (
              <>
                {content.tutorials.map((t, i) => (
                  <div key={t.id} className="resCard">
                    <input
                      type="text" className="resCardTitle" value={t.title} placeholder="Tutorial title"
                      onChange={e => updateTutorial(i, { title: e.target.value })}
                    />
                    <textarea
                      className="resTextarea" rows={4} value={t.body} placeholder={'1. Step one\n2. Step two…'}
                      onChange={e => updateTutorial(i, { body: e.target.value })}
                    />
                  </div>
                ))}
                <button type="button" className="resDashedBtn" onClick={addTutorial}>+ Add tutorial</button>
              </>
            )}

            {contentTab === 'faq' && (
              <>
                {content.faq.map((f, i) => (
                  <div key={f.id} className="resCard">
                    <div className="resCardRow">
                      <input
                        type="text" className="resCardTitle" value={f.question} placeholder="Question"
                        onChange={e => updateFaq(i, { question: e.target.value })}
                      />
                      <span className={f.source === 'feedback' ? 'resSourceBadge resSourceBadge--feedback' : 'resSourceBadge'}>
                        {f.source === 'feedback' ? 'From feedback' : 'Hand-authored'}
                      </span>
                    </div>
                    <textarea
                      className="resTextarea" rows={2} value={f.answer} placeholder="Answer"
                      onChange={e => updateFaq(i, { answer: e.target.value })}
                    />
                  </div>
                ))}
                <div className="resButtonRow">
                  <button type="button" className="resDashedBtn" onClick={addFaq}>+ Add FAQ</button>
                  <button type="button" className="resDashedBtn" onClick={() => { void openPromote() }}>Promote from feedback ▾</button>
                </div>
                {promoteOpen && (
                  <div className="resCard resPromoteCard">
                    <div className="resPromoteHeading">Real feedback messages tagged to this channel</div>
                    {promoteCandidates.length === 0 ? (
                      <p className="resEmptyNote">No matching feedback yet.</p>
                    ) : promoteCandidates.map(cand => (
                      <div key={cand.id} className="resPromoteRow">
                        <span>{cand.text}</span>
                        <button type="button" className="resSmallBtn" onClick={() => promoteCandidate(cand)}>Promote</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ArticleBuilder
