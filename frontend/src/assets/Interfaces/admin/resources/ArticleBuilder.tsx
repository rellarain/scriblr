import { useEffect, useState } from 'react'
import { getPromotableFeedback } from '../../../../api/resourcesApi'
import type { PromotableFeedbackMessage, ResourceFaqEntry, ResourceTutorial } from '../../../../api/types'
import Markup from '../../../../components/markup/Markup'
import MarkupEditor from '../../../../components/markup/MarkupEditor'
import ResourceTree from './ResourceTree'
import { useNodeText } from './useNodeText'
import type { ResourcesWorkspace } from './useResources'
import './resources.scss'

function newLocalId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

// AUI's Resources tile, redesigned as an article builder: the shared
// Interface > Console > Component > Feature tree (ResourceTree.tsx) on the
// left, and a Guide/Tutorials/FAQ editor for whichever node is selected on
// the right (each written in the markup editor), with a Preview toggle that
// shows the same content as a console's Help panel or Learning page would.
function ArticleBuilder({ resources, selectedId, onSelectNode }: {
  resources: ResourcesWorkspace
  selectedId: string | null
  onSelectNode: (id: string) => void
}) {
  const [contentTab, setContentTab] = useState<'guide' | 'tutorials' | 'faq'>('guide')
  const [previewOn, setPreviewOn] = useState(false)
  const [previewAs, setPreviewAs] = useState<'help' | 'learning'>('help')
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoteCandidates, setPromoteCandidates] = useState<PromotableFeedbackMessage[]>([])

  const node = selectedId ? resources.findNode(selectedId) : undefined
  const content = selectedId ? resources.contentOf(selectedId) : { guide: '', tutorials: [], faq: [] }
  const path = selectedId ? resources.pathTo(selectedId) : []
  const breadcrumb = path.map(n => n.name || `Untitled ${n.kind}`).join(' › ')

  // The guide's text while typing, saved a moment after the last key (and at once to its own node when another is chosen).
  const [guideText, onGuideChange] = useNodeText(selectedId, content.guide, (id, text) => { void resources.setGuide(id, text) })

  useEffect(() => {
    setPreviewOn(false)
    setPromoteOpen(false); setContentTab('guide')
  }, [selectedId])

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

  const tree = (
    <ResourceTree
      childrenOf={resources.childrenOf} selectedId={selectedId} onSelect={onSelectNode}
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
                <button type="button" className={previewAs === 'learning' ? 'resPill resPill--active' : 'resPill'} onClick={() => setPreviewAs('learning')}>Preview as Learning</button>
              </div>
              <button type="button" className="resLinkBtn" onClick={() => setPreviewOn(false)}>&larr; Back to editing</button>
            </div>

            <div className="resPreviewCard">
              <div className="resPreviewHead">
                <span className="resBadge">{previewAs === 'help' ? 'Help' : 'Learning'}</span>
                <h2>{node.name || `Untitled ${node.kind}`}</h2>
              </div>
              <div className="resArticle"><Markup text={content.guide} baseLevel={2} empty={<p className="mkEmpty">No guide written yet.</p>} /></div>

              {content.tutorials.length > 0 && (
                <>
                  <h3 className="resSubheading">Tutorials</h3>
                  {content.tutorials.map(t => (
                    <div key={t.id} className="resTutorialPreview">
                      <div className="resTutorialTitle">{t.title || 'Untitled tutorial'}</div>
                      <div className="resArticle"><Markup text={t.body} baseLevel={3} /></div>
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
                      <div className="resFaqA"><Markup text={f.answer} baseLevel={3} /></div>
                    </div>
                  ))}
                </>
              )}

              {previewAs === 'learning' && (
                <div className="resFeedbackSection">
                  <div className="resFeedbackSectionHead">
                    <h3 className="resSubheading">Check your understanding</h3>
                    <span className="resComingSoon">
                      {resources.assessmentOf(selectedId).text.trim() !== '' ? 'Assessment preview only' : 'No assessment written yet'}
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
              <MarkupEditor value={guideText} onChange={onGuideChange} label="Guide" baseLevel={2} rows={14} placeholder="###### A guide for this part" />
            )}

            {contentTab === 'tutorials' && (
              <>
                {content.tutorials.map((t, i) => (
                  <div key={t.id} className="resCard">
                    <input
                      type="text" className="resCardTitle" value={t.title} placeholder="Tutorial title"
                      onChange={e => updateTutorial(i, { title: e.target.value })}
                    />
                    <MarkupEditor
                      value={t.body} onChange={body => updateTutorial(i, { body })} label={`${t.title || 'Tutorial'} steps`} baseLevel={3} rows={4}
                      placeholder={'>> Step one\n>> Step two'}
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
                    <MarkupEditor value={f.answer} onChange={answer => updateFaq(i, { answer })} label={`Answer to ${f.question || 'the question'}`} baseLevel={3} rows={2} placeholder="Answer" />
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
