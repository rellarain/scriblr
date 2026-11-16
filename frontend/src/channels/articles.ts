import type { ResourceContent, ResourceNode, ResourcesFile } from '../api/types'
import { escapeText } from '../lib/markup/escape'
import type { HelpTarget } from './helpTargets'

// The Resources articles a Help tile shows, and an article as one text for copying. Pure.

export interface Article { node: ResourceNode; content: ResourceContent }

export const hasContent = (c: ResourceContent | undefined): c is ResourceContent =>
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
