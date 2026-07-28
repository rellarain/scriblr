import { useNavigate, useParams } from 'react-router-dom'
import MomentPickerSidebar from '../../components/shared/MomentPickerSidebar'
import { useOutline } from '../../api/outline'
import MomentEditor from './MomentEditor'

function DraftMode() {
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
        onSelect={(id) => navigate(`/project/${projectId}/draft/${id}`)}
      />
      <div className="draft-mode__editor">
        {projectId && selectedMoment ? (
          <MomentEditor
            key={selectedMoment.id}
            projectId={projectId}
            momentId={selectedMoment.id}
            title={selectedMoment.title}
          />
        ) : (
          <p>Select a moment from the list to start writing.</p>
        )}
      </div>
    </div>
  )
}

export default DraftMode
