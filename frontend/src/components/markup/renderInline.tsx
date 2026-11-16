import type { ReactNode } from 'react'
import type { Inline, LinkToken } from '../../lib/markup/inline'
import { resolveLink } from '../../lib/markup/links'
import { useLinks, usePlace } from './linkContext'

// A link: its label, else the current title of what it points at, else as typed while that is loading. In a place (a Help tile's guides, a
// lesson) it is a button that opens its target there; elsewhere it is text. One that points at nothing is its text with a "not found" mark.
// `plain`: only its words (inside a row, which is a button itself).
export function LinkView({ link, plain = false }: { link: LinkToken; plain?: boolean }) {
  const links = useLinks()
  const place = usePlace()
  const r = links ? resolveLink(link, links) : { status: 'pending' as const }
  const words: ReactNode = link.label ? renderInline(link.label, true) : r.status === 'ok' ? r.title : link.raw
  if (plain) return <>{words}</>
  if (r.status === 'missing') {
    return <span className="mkLink mkLink--missing" title={r.why}>{words}<span className="mkMissing">not found</span></span>
  }
  if (r.status === 'ok' && place) {
    return <button type="button" className="mkLink" onClick={e => place.open(r.target, e.currentTarget)}>{words}</button>
  }
  return <span className={`mkLink mkLink--${r.status === 'ok' ? 'static' : 'pending'}`}>{words}</span>
}

// Inline markup as React: bold, italic, both, and links. Keys are positions, the list never reorders.
export function renderInline(nodes: Inline[], plainLinks = false): ReactNode[] {
  return nodes.map((n, k) => {
    if (n.t === 'text') return n.text
    if (n.t === 'link') return <LinkView key={k} link={n} plain={plainLinks} />
    if (n.t === 'em') return <em key={k}>{renderInline(n.children, plainLinks)}</em>
    if (n.t === 'strong') return <strong key={k}>{renderInline(n.children, plainLinks)}</strong>
    return <strong key={k}><em>{renderInline(n.children, plainLinks)}</em></strong>
  })
}

// Lines of inline markup with a line break between each.
export function renderLines(lines: Inline[][]): ReactNode[] {
  return lines.flatMap((l, k) => (k === 0 ? [<span key={k}>{renderInline(l)}</span>] : [<br key={`b${k}`} />, <span key={k}>{renderInline(l)}</span>]))
}
