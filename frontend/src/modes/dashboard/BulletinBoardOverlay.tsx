import { useState } from 'react'
import type { OutlineNode } from '../../types'
import { momentsInSubtree } from '../outline/outlineTree'
import DraftAnalyticsPanel from '../draft/DraftAnalyticsPanel'
import MomentRevisions from '../revise/MomentRevisions'
import ProjectStatsPanel from '../workspace/ProjectStatsPanel'
import BulletinNote from './BulletinNote'

interface Props {
  projectId: string
  nodes: OutlineNode[]
  /** When absent (opened from the shelf landing, with no book/chapter
   * selected), only the goals/activity note is meaningful -- draft
   * analytics and revisions need a chapter to scope to. */
  chapterId?: string
  initialMomentId?: string
  onClose: () => void
}

// Consolidates draft analytics, activity/goals, and revision history --
// previously scattered across a "Draft" sub-tab, a "Stats" tab, and a
// "History" sub-tab -- into one overlay, reachable from the book face or a
// chapter page. Flat "pinned card" note style, no cork texture.
function BulletinBoardOverlay({ projectId, nodes, chapterId, initialMomentId, onClose }: Props) {
  const chapterMoments = chapterId ? momentsInSubtree(nodes, chapterId) : []
  const [revisionMomentId, setRevisionMomentId] = useState<string | undefined>(initialMomentId)
  const selectedMoment = chapterMoments.find((m) => m.id === revisionMomentId)

  return (
    <div className="bulletin-board">
      <div className="bulletin-board__header">
        <h3>Dashboard</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="bulletin-board__grid">
        <BulletinNote title="Goals & activity">
          <ProjectStatsPanel />
        </BulletinNote>

        {chapterId && (
          <BulletinNote title="Draft analytics">
            <DraftAnalyticsPanel projectId={projectId} nodes={nodes} chapterId={chapterId} momentId={revisionMomentId} />
          </BulletinNote>
        )}

        {chapterId && (
          <BulletinNote title="Revision history">
            <div className="bulletin-board__moment-picker">
              {chapterMoments.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={m.id === revisionMomentId ? 'is-active' : ''}
                  onClick={() => setRevisionMomentId(m.id)}
                >
                  {m.title || 'Untitled'}
                </button>
              ))}
              {chapterMoments.length === 0 && <p>No moments in this chapter yet.</p>}
            </div>
            {selectedMoment ? (
              <MomentRevisions
                projectId={projectId}
                chapterId={chapterId}
                momentId={selectedMoment.id}
                title={selectedMoment.title || 'Untitled'}
              />
            ) : (
              <p>Select a moment above to see its revision history.</p>
            )}
          </BulletinNote>
        )}
      </div>
    </div>
  )
}

export default BulletinBoardOverlay
