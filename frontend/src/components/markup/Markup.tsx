import type { ReactNode } from 'react'
import { classifyLine } from '../../lib/markup/lines'
import { parseInline } from '../../lib/markup/inline'
import { parseCached, type Block, type ListItem, type QuestionBlock } from '../../lib/markup/parse'
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
}

export function Markup({ text, baseLevel = 2, className, empty = null }: MarkupProps) {
  const { blocks } = parseCached(text)
  if (blocks.length === 0) return <>{empty}</>
  return (
    <div className={`mk${className ? ` ${className}` : ''}`}>
      {blocks.map((b, k) => <BlockView key={`${b.kind}${b.line}:${k}`} block={b} baseLevel={baseLevel} />)}
    </div>
  )
}

// The first line's words only, styled, for a row's details (no headings, lists or questions).
export function MarkupInline({ text, className }: { text: string; className?: string }) {
  const first = text.split(/\r?\n/).map(classifyLine).find(l => l.kind !== 'blank')
  if (!first) return null
  const words = first.kind === 'unknown' ? `${first.marker} ${first.text}` : first.text
  return <span className={`mkInline${className ? ` ${className}` : ''}`}>{renderInline(parseInline(words))}</span>
}

export default Markup
