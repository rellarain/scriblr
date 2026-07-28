import ReactMarkdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import { useDraft } from '../../api/draft'
import { useOutline } from '../../api/outline'
import { getChapters, getScenes } from '../outline/outlineTree'

function SceneBody({ projectId, sceneId }: { projectId: string; sceneId: string }) {
  const { data, isLoading } = useDraft(projectId, sceneId)
  if (isLoading) return null
  if (!data?.body.trim()) return <p className="read-mode__body read-mode__body--empty">(empty)</p>
  return (
    <div className="read-mode__body">
      <ReactMarkdown>{data.body}</ReactMarkdown>
    </div>
  )
}

function ReadMode() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: outline, isLoading } = useOutline(projectId)

  if (isLoading) return <p>Loading manuscript…</p>
  if (!projectId || !outline) return null

  const nodes = outline.nodes
  const chapters = getChapters(nodes)

  return (
    <div className="read-mode">
      {chapters.map((chapter) => (
        <section key={chapter.id}>
          <h2 className="read-mode__chapter-title">{chapter.title}</h2>
          {getScenes(nodes, chapter.id).map((scene) => (
            <article key={scene.id}>
              <h3 className="read-mode__scene-title">{scene.title}</h3>
              <SceneBody projectId={projectId} sceneId={scene.id} />
            </article>
          ))}
        </section>
      ))}
      {chapters.length === 0 && <p>Nothing to read yet — add chapters and scenes in Outline mode.</p>}
    </div>
  )
}

export default ReadMode
