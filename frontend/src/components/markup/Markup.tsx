import type { ReactNode } from 'react'
import type { TrainingContentDraft } from '../../api/types'
import { linksOf } from '../../lib/markup/checks'
import { classifyLine } from '../../lib/markup/lines'
import { linksIn, parseInline } from '../../lib/markup/inline'
import { parseCached, type Block, type ListItem, type QuestionBlock } from '../../lib/markup/parse'
import { LinkCtx, useLinkContext } from './linkContext'
import { QuestionIcon } from '../../assets/icons'
import { renderInline, renderLines } from './renderInline'
import './markup.scss'

// The read-only view of Scriblr's markup (lib/markup). Headings are real headings whose levels follow the container's own: `######` is
// one below `baseLevel` (the heading of what holds the text), each smaller marker one further down, never past h6. Lists are lists, a
// number read with its item; quotes are quotes. Knowledge checks show their question and options (they become practice in a later slice).

type Heading = 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

function headingTag(baseLevel: number, level: number): Heading {
  return `h${Math.max(2, Math.min(6, baseLevel + 7 - level))}` as Heading
}

interface Group { top: ListItem | null; subs: ListItem[] }

function groupsOf(items: ListItem[]): Group[] {
  const out: Group[] = []
  for (const item of items) {
    if (item.depth <= 2) out.push({ top: item, subs: [] })
    else if (out.length) out[out.length - 1].subs.push(item)
    else out.push({ top: null, subs: [item] })
  }
  return out
}

function Item({ item, children }: { item: ListItem; children?: ReactNode }) {
  return (
    <li className={`mkItem mkItem--d${item.depth}`}>
      <span className="mkLabel" aria-hidden={item.numbered ? undefined : true}>{item.label}</span>
      <span className="mkItemText">{renderInline(item.inline)}{children}</span>
    </li>
  )
}

function List({ items }: { items: ListItem[] }) {
  return (
    <ul className="mkList" role="list">
      {groupsOf(items).map((g, k) => {
        const subs = g.subs.length > 0 ? <ul className="mkList mkList--sub" role="list">{g.subs.map(s => <Item key={s.line} item={s} />)}</ul> : null
        if (!g.top) return <li key={k} className="mkItem mkItem--bare">{subs}</li>
        return <Item key={g.top.line} item={g.top}>{subs}</Item>
      })}
    </ul>
  )
}

function StaticQuestion({ q }: { q: QuestionBlock }) {
  return (
    <div className="mkQuestion" role="group" aria-label="Practice question">
      <p className="mkPrompt">{renderInline(q.prompt)}</p>
      {q.type === 'text'
        ? <input className="mkAnswerField" type="text" disabled placeholder={q.placeholder} aria-label="Your answer" />
        : q.options.length > 0 && (
          <ul className="mkOptions" role="list">
            {q.options.map(o => (
              <li key={o.line} className="mkOption"><span className={`mkMark mkMark--${q.type}`} aria-hidden="true" />{renderInline(o.inline)}</li>
            ))}
          </ul>
        )}
    </div>
  )
}

function BlockView({ block, baseLevel }: { block: Block; baseLevel: number }) {
  switch (block.kind) {
    case 'paragraph': return <p className="mkP">{renderLines(block.lines)}</p>
    case 'heading': {
      const Tag = headingTag(baseLevel, block.level)
      return <Tag className={`mkH mkH${block.level}`} data-anchor={block.anchor}>{renderInline(block.inline)}</Tag>
    }
    case 'list': return <List items={block.items} />
    case 'quote': return <blockquote className="mkQuote"><p>{renderLines(block.lines)}</p></blockquote>
    case 'question': return <StaticQuestion q={block} />
    case 'pullin': return <p className="mkPullin"><QuestionIcon size={14} /> {block.ref}</p>
  }
}

export interface MarkupProps {
  text: string
  // The level of the heading of what holds the text (an article's title is h4: `######` is then h5).
  baseLevel?: number
  className?: string
  // What shows when the text is empty.
  empty?: ReactNode
  // The Training courses being edited, for links to them (the Instructor's draft); else the saved ones.
  training?: TrainingContentDraft
}

export function Markup({ text, baseLevel = 2, className, empty = null, training }: MarkupProps) {
  const { blocks } = parseCached(text)
  const links = useLinkContext(text, linksOf(blocks).length > 0, training)
  if (blocks.length === 0) return <>{empty}</>
  return (
    <LinkCtx.Provider value={links}>
      <div className={`mk${className ? ` ${className}` : ''}`}>
        {blocks.map((b, k) => <BlockView key={`${b.kind}${b.line}:${k}`} block={b} baseLevel={baseLevel} />)}
      </div>
    </LinkCtx.Provider>
  )
}

// The first line's words only, styled, for a row's details (no headings, lists or questions); a link is its title, as text (the row is a
// button itself).
export function MarkupInline({ text, className }: { text: string; className?: string }) {
  const first = text.split(/\r?\n/).map(classifyLine).find(l => l.kind !== 'blank')
  const inline = first ? parseInline(first.kind === 'unknown' ? `${first.marker} ${first.text}` : first.text) : []
  const links = useLinkContext(text, linksIn(inline).length > 0)
  if (!first) return null
  return <LinkCtx.Provider value={links}><span className={`mkInline${className ? ` ${className}` : ''}`}>{renderInline(inline, true)}</span></LinkCtx.Provider>
}

export default Markup
