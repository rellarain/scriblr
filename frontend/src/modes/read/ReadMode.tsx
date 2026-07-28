import ReactMarkdown from 'react-markdown'
import { useNavigate, useParams } from 'react-router-dom'
import ChapterNav from '../../components/shared/ChapterNav'
import { useDraft } from '../../api/draft'
import { useOutline } from '../../api/outline'
import { useProject, useUpdateProject } from '../../api/projects'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNodeKind } from '../../types'
import { subtreeOrder } from '../outline/outlineTree'

function MomentBody({ projectId, momentId }: { projectId: string; momentId: string }) {
  const { data, isLoading } = useDraft(projectId, momentId)
  if (isLoading) return null
  if (!data?.body.trim()) return <p className="read-mode__body read-mode__body--empty">(empty)</p>
  return (
    <div className="read-mode__body">
      <ReactMarkdown>{data.body}</ReactMarkdown>
    </div>
  )
}

// Same .level-config checkbox-row pattern used for outlineLevels/plotLevels,
// but pinning "chapter" (not "book") as the always-on kind, since Read mode
// navigates at the chapter level.
function ReadLevelConfig({ projectId, levels }: { projectId: string; levels: OutlineNodeKind[] }) {
  const updateProject = useUpdateProject(projectId)

  function toggleLevel(kind: OutlineNodeKind) {
    if (kind === 'chapter') return
    const set = new Set(levels)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    const ordered = OUTLINE_KIND_ORDER.filter((k) => k === 'chapter' || set.has(k))
    updateProject.mutate({ readLevels: ordered })
  }

  return (
    <div className="level-config">
      <span className="level-config__label">Levels:</span>
      {OUTLINE_KIND_ORDER.map((kind) => (
        <label key={kind} className="level-config__option">
          <input
            type="checkbox"
            checked={levels.includes(kind)}
            disabled={kind === 'chapter'}
            onChange={() => toggleLevel(kind)}
          />
          {kind}
        </label>
      ))}
    </div>
  )
}

function ReadMode() {
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId?: string }>()
  const navigate = useNavigate()
  const { data: outline, isLoading } = useOutline(projectId)
  const { data: project } = useProject(projectId)

  if (isLoading) return <p>Loading manuscript…</p>
  if (!projectId || !outline) return null

  const nodes = outline.nodes
  const readLevels = project?.index.settings.readLevels ?? OUTLINE_KIND_ORDER
  const selectedChapter = nodes.find((n) => n.id === chapterId && n.kind === 'chapter')

  const ordered = selectedChapter
    ? subtreeOrder(nodes, selectedChapter.id).filter((n) => readLevels.includes(n.kind))
    : []

  function handleSelectChapter(id: string) {
    navigate(`/project/${projectId}/read/${id}`)
  }

  return (
    <div className="read-mode-shell">
      <ChapterNav nodes={nodes} selectedChapterId={chapterId} onSelect={handleSelectChapter} />
      <div className="read-mode">
        <ReadLevelConfig projectId={projectId} levels={readLevels} />
        {!selectedChapter && <p className="read-mode__placeholder">Select a chapter to read.</p>}
        {selectedChapter && (
          <>
            <h2 className="read-mode__heading read-mode__heading--chapter">
              {selectedChapter.title || 'Untitled'}
            </h2>
            {ordered.map((node) =>
              node.kind === 'moment' ? (
                <article key={node.id} className="read-mode__moment">
                  <h4 className="read-mode__moment-title">{node.title}</h4>
                  <MomentBody projectId={projectId} momentId={node.id} />
                </article>
              ) : (
                <h2 key={node.id} className={`read-mode__heading read-mode__heading--${node.kind}`}>
                  {node.title}
                </h2>
              )
            )}
            {ordered.length === 0 && <p>Nothing to read yet in this chapter.</p>}
          </>
        )}
      </div>
    </div>
  )
}

export default ReadMode
