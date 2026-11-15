import { useEffect, useState, type ReactNode } from 'react'
import { getResources } from '../../../../api/resourcesApi'
import type { ResourceContent, ResourceNode, ResourcesFile } from '../../../../api/types'
import type { HelpTarget } from '../../../../channels/helpTargets'
import CopyPlainText from '../../../../components/markup/CopyPlainText'
import Markup from '../../../../components/markup/Markup'
import { escapeText } from '../../../../lib/markup/escape'

export interface Article { node: ResourceNode; content: ResourceContent }

const hasContent = (c: ResourceContent | undefined): c is ResourceContent =>
  !!c && (c.guide.trim() !== '' || c.tutorials.length > 0 || c.faq.length > 0)

// The resource articles for a Help tile: its channel node and everything nested under it, then every node named one of its
// older aliases (case-insensitive) and what is under that, in tree order, leaving out the ones with nothing written.
export function articlesFor(file: ResourcesFile, target: HelpTarget): Article[] {
  const wanted = new Set(target.aliases.map(n => n.trim().toLowerCase()))
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
  const own = file.nodes.find(n => n.id === target.id)
  if (own) walk(own)
  for (const node of file.nodes) if (wanted.has(node.name.trim().toLowerCase())) walk(node)
  return out
}

// An article as one markup text, for Copy as plain text: the guide, then each tutorial and FAQ entry under its title.
export function articleText(content: ResourceContent): string {
  const parts = [content.guide]
  for (const t of content.tutorials) parts.push(`##### ${escapeText(t.title || 'Tutorial')}`, t.body)
  for (const f of content.faq) parts.push(`##### ${escapeText(f.question)}`, f.answer)
  return parts.filter(p => p.trim() !== '').join('\n\n')
}

// A level's Help tab: the resource articles written for it (the Resources builder in the AUI), formatted from the markup, or its
// short default text (or what the panel shows instead) while none are authored.
export function HelpArticles({ target, fallback }: { target: HelpTarget; fallback: ReactNode }) {
  const [articles, setArticles] = useState<Article[] | null>(null)
  const key = `${target.id}|${target.aliases.join('|')}`
  useEffect(() => {
    let live = true
    getResources().then(file => { if (live) setArticles(articlesFor(file, target)) }).catch(() => { if (live) setArticles([]) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (articles === null) return <p className="wrMuted">Loading help…</p>
  if (articles.length === 0) return typeof fallback === 'string' ? <p className="wrHelpText">{fallback}</p> : <>{fallback}</>
  return (
    <div className="wrHelp">
      {articles.map(({ node, content }) => (
        <article key={node.id} className="wrHelpArticle">
          <div className="wrHelpHead"><h4>{node.name}</h4><CopyPlainText text={articleText(content)} label={`Copy ${node.name} as plain text`} /></div>
          {content.guide.trim() && <Markup text={content.guide} baseLevel={4} />}
          {content.tutorials.map(t => (
            <details key={t.id}><summary>{t.title || 'Tutorial'}</summary><Markup text={t.body} baseLevel={5} /></details>
          ))}
          {content.faq.map(f => (
            <details key={f.id}><summary>{f.question}</summary><Markup text={f.answer} baseLevel={5} /></details>
          ))}
        </article>
      ))}
    </div>
  )
}

export default HelpArticles
