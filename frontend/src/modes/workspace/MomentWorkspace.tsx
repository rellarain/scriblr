import { useState } from 'react'
import type { OutlineNode, OutlineNodeKind } from '../../types'
import MomentEditor from '../draft/MomentEditor'
import DraftAnalyticsPanel from '../draft/DraftAnalyticsPanel'
import MomentRevisions from '../revise/MomentRevisions'
import ChapterReadView from './ChapterReadView'

type MomentTab = 'draft' | 'read' | 'history'

interface Props {
  projectId: string
  nodes: OutlineNode[]
  chapterId: string
  momentId: string
  readLevels: OutlineNodeKind[]
}

// The moment-level view within a chapter workspace: draft editor + text
// analytics, a whole-chapter read view toggle, and embedded revision
// history -- folded in from the old separate Read/Revise pages instead of
// being routed destinations of their own.
function MomentWorkspace({ projectId, nodes, chapterId, momentId, readLevels }: Props) {
  const [tab, setTab] = useState<MomentTab>('draft')
  const moment = nodes.find((n) => n.id === momentId && n.kind === 'moment')

  if (!moment) return <p className="moment-workspace__error">Moment not found.</p>

  return (
    <div className="moment-workspace">
      <nav className="moment-workspace__tabs">
        <button type="button" className={tab === 'draft' ? 'is-active' : ''} onClick={() => setTab('draft')}>
          Draft
        </button>
        <button type="button" className={tab === 'read' ? 'is-active' : ''} onClick={() => setTab('read')}>
          Read
        </button>
        <button type="button" className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </nav>
      <div className="moment-workspace__panel">
        {tab === 'draft' && (
          <div className="moment-workspace__draft">
            <MomentEditor projectId={projectId} momentId={moment.id} title={moment.title} />
            <DraftAnalyticsPanel projectId={projectId} nodes={nodes} momentId={moment.id} chapterId={chapterId} />
          </div>
        )}
        {tab === 'read' && (
          <ChapterReadView projectId={projectId} nodes={nodes} chapterId={chapterId} readLevels={readLevels} />
        )}
        {tab === 'history' && <MomentRevisions projectId={projectId} momentId={moment.id} title={moment.title} />}
      </div>
    </div>
  )
}

export default MomentWorkspace
