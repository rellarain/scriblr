import type { ReactNode } from 'react'
import type { Inline } from '../../lib/markup/parse'

// Inline markup as React: bold, italic and both. Keys are positions, the list never reorders.
export function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, k) => {
    if (n.t === 'text') return n.text
    if (n.t === 'em') return <em key={k}>{renderInline(n.children)}</em>
    if (n.t === 'strong') return <strong key={k}>{renderInline(n.children)}</strong>
    return <strong key={k}><em>{renderInline(n.children)}</em></strong>
  })
}

// Lines of inline markup with a line break between each.
export function renderLines(lines: Inline[][]): ReactNode[] {
  return lines.flatMap((l, k) => (k === 0 ? [<span key={k}>{renderInline(l)}</span>] : [<br key={`b${k}`} />, <span key={k}>{renderInline(l)}</span>]))
}
