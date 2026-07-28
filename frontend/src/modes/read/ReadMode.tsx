import ReactMarkdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import { useDraft } from '../../api/draft'
import { useOutline } from '../../api/outline'
import { documentOrder } from '../outline/outlineTree'

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

function ReadMode() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: outline, isLoading } = useOutline(projectId)

  if (isLoading) return <p>Loading manuscript…</p>
  if (!projectId || !outline) return null

  const ordered = documentOrder(outline.nodes)

  return (
    <div className="read-mode">
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
      {ordered.length === 0 && <p>Nothing to read yet — add structure in Outline mode.</p>}
    </div>
  )
}

export default ReadMode
