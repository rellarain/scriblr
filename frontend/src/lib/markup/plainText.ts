import { inlineText, type LinkToken } from './inline'
import { parseMarkup } from './parse'

// What Copy as plain text copies: the words with no markers, lists with their bullets and numbers, quotes in quotation marks, and each
// question with its options but never its answers, hints or explanations. A link is its label, else `title` of it (its current title), else
// as typed.

export function plainTextOf(text: string, title?: (link: LinkToken) => string | null): string {
  const inline = (nodes: Parameters<typeof inlineText>[0]) => inlineText(nodes, title)
  const parts: string[] = []
  for (const b of parseMarkup(text).blocks) {
    if (b.kind === 'paragraph') parts.push(b.lines.map(l => inline(l)).join('\n'))
    else if (b.kind === 'heading') parts.push(inline(b.inline))
    else if (b.kind === 'list') parts.push(b.items.map(i => `${i.depth >= 3 ? '    ' : ''}${i.label} ${inline(i.inline)}`).join('\n'))
    else if (b.kind === 'quote') parts.push(`“${b.lines.map(l => inline(l)).join('\n')}”`)
    else if (b.kind === 'question') {
      const lines = [inline(b.prompt)]
      if (b.type === 'text') lines.push(b.placeholder ? `____ (${b.placeholder})` : '____')
      else for (const o of b.options) lines.push(`${b.type === 'checkbox' ? '☐' : '○'} ${inline(o.inline)}`)
      parts.push(lines.join('\n'))
    }
  }
  return parts.filter(p => p.trim() !== '').join('\n\n')
}
