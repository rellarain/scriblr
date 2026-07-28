import { useNavigate, useParams } from 'react-router-dom'
import { useOutline } from '../../api/outline'
import { getChapters, getScenes } from '../outline/outlineTree'
import SceneEditor from './SceneEditor'

function DraftMode() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId?: string }>()
  const { data: outline, isLoading } = useOutline(projectId)
  const navigate = useNavigate()

  if (isLoading) return <p>Loading outline…</p>

  const nodes = outline?.nodes ?? []
  const chapters = getChapters(nodes)
  const selectedScene = nodes.find((n) => n.id === sceneId)

  return (
    <div className="draft-mode">
      <aside className="draft-mode__scenes">
        {chapters.map((chapter) => (
          <div key={chapter.id} className="draft-mode__chapter">
            <p className="draft-mode__chapter-title">{chapter.title}</p>
            {getScenes(nodes, chapter.id).map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={
                  scene.id === sceneId
                    ? 'draft-mode__scene-link is-active'
                    : 'draft-mode__scene-link'
                }
                onClick={() => navigate(`/project/${projectId}/draft/${scene.id}`)}
              >
                {scene.title}
              </button>
            ))}
          </div>
        ))}
        {chapters.length === 0 && <p>No chapters yet. Add some in Outline mode first.</p>}
      </aside>
      <div className="draft-mode__editor">
        {projectId && selectedScene ? (
          <SceneEditor
            key={selectedScene.id}
            projectId={projectId}
            sceneId={selectedScene.id}
            title={selectedScene.title}
          />
        ) : (
          <p>Select a scene from the list to start writing.</p>
        )}
      </div>
    </div>
  )
}

export default DraftMode
