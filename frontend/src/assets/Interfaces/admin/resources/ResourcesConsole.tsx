import { useState } from 'react'
import ArticleBuilder from './ArticleBuilder'
import QuizBuilder from './QuizBuilder'
import { useResources } from './useResources'
import './resources.scss'

// AUI's redesigned Resources tile: an Interface > Console > Component >
// Feature article/quiz builder, replacing the old Console/Component/Feature
// planning-outline editor (admin/AuiConfigEditor.tsx) that used to live
// here. Real backend persistence (backend/app/storage/resources.py), not
// mock/local state -- see the plan for why.
function ResourcesConsole() {
  const resources = useResources()
  const [view, setView] = useState<'article' | 'quiz'>('article')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (resources.status === 'loading' && resources.nodes.length === 0) {
    return <p className="feedbackCardMeta">Loading Resources…</p>
  }
  if (resources.status === 'error') {
    return <p className="feedbackCardMeta">{resources.error ?? 'Failed to load Resources.'}</p>
  }

  const currentId = selectedId && resources.findNode(selectedId) ? selectedId : (resources.childrenOf(null)[0]?.id ?? null)

  return (
    <div className="resConsole">
      <div className="resTopBar">
        <div className="resPillGroup">
          <button type="button" className={view === 'article' ? 'resPill resPill--active' : 'resPill'} onClick={() => setView('article')}>Article Builder</button>
          <button type="button" className={view === 'quiz' ? 'resPill resPill--active' : 'resPill'} onClick={() => setView('quiz')}>Quiz / Test / Exam Builder</button>
        </div>
      </div>
      {view === 'article' ? (
        <ArticleBuilder resources={resources} selectedId={currentId} onSelectNode={setSelectedId} />
      ) : (
        <QuizBuilder resources={resources} selectedId={currentId} onSelectNode={setSelectedId} />
      )}
    </div>
  )
}

export default ResourcesConsole
