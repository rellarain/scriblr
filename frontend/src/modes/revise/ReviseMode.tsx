import { useNavigate, useParams } from 'react-router-dom'
import MomentPickerSidebar from '../../components/shared/MomentPickerSidebar'
import { useOutline } from '../../api/outline'
import MomentRevisions from './MomentRevisions'

function ReviseMode() {
  const { projectId, momentId } = useParams<{ projectId: string; momentId?: string }>()
  const { data: outline, isLoading } = useOutline(projectId)
  const navigate = useNavigate()

  if (isLoading) return <p>Loading outline…</p>

  const nodes = outline?.nodes ?? []
  const selectedMoment = nodes.find((n) => n.id === momentId && n.kind === 'moment')

  return (
    <div className="draft-mode">
      <MomentPickerSidebar
        nodes={nodes}
        selectedMomentId={momentId}
        onSelect={(id) => navigate(`/project/${projectId}/revise/${id}`)}
      />
      <div className="draft-mode__editor">
        {projectId && selectedMoment ? (
          <MomentRevisions
            key={selectedMoment.id}
            projectId={projectId}
            momentId={selectedMoment.id}
            title={selectedMoment.title}
          />
        ) : (
          <p>Select a moment from the list to view its revision history.</p>
        )}
      </div>
    </div>
  )
}

export default ReviseMode
