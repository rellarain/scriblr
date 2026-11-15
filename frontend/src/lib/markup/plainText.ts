import { inlineText } from './inline'
import { parseMarkup } from './parse'

// What Copy as plain text copies: the words with no markers, lists with their bullets and numbers, quotes in quotation marks, and each
// question with its options but never its answers, hints or explanations.

export function plainTextOf(text: string): string {
  const parts: string[] = []
  for (const b of parseMarkup(text).blocks) {
    if (b.kind === 'paragraph') parts.push(b.lines.map(inlineText).join('\n'))
    else if (b.kind === 'heading') parts.push(b.text)
    else if (b.kind === 'list') parts.push(b.items.map(i => `${i.depth >= 3 ? '    ' : ''}${i.label} ${inlineText(i.inline)}`).join('\n'))
    else if (b.kind === 'quote') parts.push(`“${b.lines.map(inlineText).join('\n')}”`)
    else if (b.kind === 'question') {
      const lines = [inlineText(b.prompt)]
      if (b.type === 'text') lines.push(b.placeholder ? `____ (${b.placeholder})` : '____')
      else for (const o of b.options) lines.push(`${b.type === 'checkbox' ? '☐' : '○'} ${inlineText(o.inline)}`)
      parts.push(lines.join('\n'))
    }
  }
  return parts.filter(p => p.trim() !== '').join('\n\n')
}
