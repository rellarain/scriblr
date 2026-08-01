import ReactMarkdown from 'react-markdown'
import { useDraft } from '../../api/draft'
import { useUpdateProject } from '../../api/projects'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineNodeKind } from '../../types'
import { subtreeOrder } from '../outline/outlineTree'

function MomentBody({ projectId, momentId }: { projectId: string; momentId: string }) {
  const { data, isLoading } = useDraft(projectId, momentId)
  if (isLoading) return null
  if (!data?.body.trim()) return <p className="chapter-read-view__body chapter-read-view__body--empty">(empty)</p>
  return (
    <div className="chapter-read-view__body">
      <ReactMarkdown>{data.body}</ReactMarkdown>
    </div>
  )
}

// Same .level-config checkbox-row pattern used for outlineLevels/plotLevels,
// but pinning "chapter" (not "book") as the always-on kind, since reading
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

interface Props {
  projectId: string
  nodes: OutlineNode[]
  chapterId: string
  readLevels: OutlineNodeKind[]
}

// Continuous, read-only concatenation of a chapter's moments as markdown --
// extracted from the old standalone Read mode so it can be embedded as a
// view toggle inside the chapter/moment workspace instead of a separate page.
function ChapterReadView({ projectId, nodes, chapterId, readLevels }: Props) {
  const selectedChapter = nodes.find((n) => n.id === chapterId && n.kind === 'chapter')
  // Moment bodies are the actual draft content, not a structural heading --
  // they stay visible even when every other level is toggled off.
  const ordered = selectedChapter
    ? subtreeOrder(nodes, chapterId).filter((n) => n.kind === 'moment' || readLevels.includes(n.kind))
    : []

  return (
    <div className="chapter-read-view">
      <ReadLevelConfig projectId={projectId} levels={readLevels} />
      {!selectedChapter && <p className="chapter-read-view__placeholder">Chapter not found.</p>}
      {selectedChapter && (
        <>
          <h2 className="chapter-read-view__heading chapter-read-view__heading--chapter">
            {selectedChapter.title || 'Untitled'}
          </h2>
          {ordered.map((node) =>
            node.kind === 'moment' ? (
              <article key={node.id} className="chapter-read-view__moment">
                {readLevels.includes('moment') && (
                  <h4 className="chapter-read-view__moment-title">{node.title}</h4>
                )}
                <MomentBody projectId={projectId} momentId={node.id} />
              </article>
            ) : (
              <h2 key={node.id} className={`chapter-read-view__heading chapter-read-view__heading--${node.kind}`}>
                {node.title}
              </h2>
            )
          )}
          {ordered.length === 0 && <p>Nothing to read yet in this chapter.</p>}
        </>
      )}
    </div>
  )
}

export default ChapterReadView
