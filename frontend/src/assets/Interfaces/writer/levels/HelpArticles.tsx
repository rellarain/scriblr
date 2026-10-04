import { useEffect, useState } from 'react'
import { getResources } from '../../../../api/resourcesApi'
import type { ResourceContent, ResourceNode, ResourcesFile } from '../../../../api/types'

export interface Article { node: ResourceNode; content: ResourceContent }

const hasContent = (c: ResourceContent | undefined): c is ResourceContent =>
  !!c && (c.guide.trim() !== '' || c.tutorials.length > 0 || c.faq.length > 0)

// The resource articles for a level: every node whose name is one of `names` (case-insensitive), then
// everything nested under it, in tree order, leaving out the ones with nothing written.
export function articlesFor(file: ResourcesFile, names: string[]): Article[] {
  const wanted = new Set(names.map(n => n.trim().toLowerCase()))
  const children = new Map<string | null, ResourceNode[]>()
  for (const n of [...file.nodes].sort((a, b) => a.order - b.order)) {
    const list = children.get(n.parentId) ?? []
    list.push(n)
    children.set(n.parentId, list)
  }
  const out: Article[] = []
  const seen = new Set<string>()
  const walk = (node: ResourceNode) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const content = file.content[node.id]
    if (hasContent(content)) out.push({ node, content })
    for (const child of children.get(node.id) ?? []) walk(child)
  }
  for (const node of file.nodes) if (wanted.has(node.name.trim().toLowerCase())) walk(node)
  return out
}

// A level's Help tab: the resource articles written for it (the Resources builder in the AUI), or its
// short default text while none are authored.
export function HelpArticles({ names, fallback }: { names: string[]; fallback: string }) {
  const [articles, setArticles] = useState<Article[] | null>(null)
  const key = names.join('|')
  useEffect(() => {
    let live = true
    getResources().then(file => { if (live) setArticles(articlesFor(file, names)) }).catch(() => { if (live) setArticles([]) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (articles === null) return <p className="wrMuted">Loading help…</p>
  if (articles.length === 0) return <p className="wrHelpText">{fallback}</p>
  return (
    <div className="wrHelp">
      {articles.map(({ node, content }) => (
        <article key={node.id} className="wrHelpArticle">
          <h4>{node.name}</h4>
          {content.guide.trim() && <p className="wrHelpText">{content.guide}</p>}
          {content.tutorials.map(t => (
            <details key={t.id}><summary>{t.title || 'Tutorial'}</summary><p className="wrHelpText">{t.body}</p></details>
          ))}
          {content.faq.map(f => (
            <details key={f.id}><summary>{f.question}</summary><p className="wrHelpText">{f.answer}</p></details>
          ))}
        </article>
      ))}
    </div>
  )
}

export default HelpArticles
