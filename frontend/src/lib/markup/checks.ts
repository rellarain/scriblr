import { linksIn, type Inline, type LinkToken } from './inline'
import { resolveLink, type LinkContext } from './links'
import { parseMarkup, type Block, type Parsed } from './parse'
import { resolvePullIn } from './pullIns'

// What the editor's checks panel lists, each with the line it is on (clicking one goes there): a marker that is not one, a hint, option,
// explanation or answer outside a question, an explanation with no option above it, a question with no right option or accepted answer,
// a question id used twice, and (when a link context is given and what it points at has loaded) a link, heading link or pulled-in question
// that goes nowhere.

export interface MarkupCheck { line: number; message: string }

const PART: Record<string, string> = {
  '???!': 'A hint', '???': 'An option', '??!': 'An option', '??': 'An option', '?!': 'An option',
  '?!!': 'An explanation', '!!': 'An explanation', '?': 'A text field', '!': 'An answer',
}

// Every link in the blocks, with the line it is on.
export function linksOf(blocks: Block[]): Array<{ link: LinkToken; line: number }> {
  const out: Array<{ link: LinkToken; line: number }> = []
  const add = (inline: Inline[], line: number) => { for (const link of linksIn(inline)) out.push({ link, line }) }
  for (const b of blocks) {
    if (b.kind === 'paragraph' || b.kind === 'quote') b.lines.forEach((l, k) => add(l, b.line + k))
    else if (b.kind === 'heading') add(b.inline, b.line)
    else if (b.kind === 'list') b.items.forEach(i => add(i.inline, i.line))
    else if (b.kind === 'question') {
      add(b.prompt, b.line)
      b.hints.forEach(h => add(h, b.line))
      b.options.forEach(o => { add(o.inline, o.line); o.explanation.forEach(e => add(e, o.line)) })
    }
  }
  return out
}

// Whether the text needs the channel list and Training to be drawn (it has links or pulled-in questions).
export function needsLinks(blocks: Block[]): boolean {
  return blocks.some(b => b.kind === 'pullin') || linksOf(blocks).length > 0
}

export function checksOf(text: string, parsed: Parsed = parseMarkup(text), links?: LinkContext): MarkupCheck[] {
  const out: MarkupCheck[] = []
  if (links) {
    for (const { link, line } of linksOf(parsed.blocks)) {
      const r = resolveLink(link, links)
      if (r.status === 'missing') out.push({ line, message: `${link.raw} goes nowhere: ${r.why}` })
    }
    for (const b of parsed.blocks) {
      if (b.kind !== 'pullin') continue
      const r = resolvePullIn(b.ref, links)
      if (r.status === 'missing') out.push({ line: b.line, message: `?????${b.ref} pulls in nothing: ${r.why}` })
    }
  }
  for (const s of parsed.strays) {
    if (s.why === 'unknown') out.push({ line: s.line, message: s.marker[0] === '#' ? `${s.marker} is not a heading: they go from # to ######.` : `${s.marker} is not a list: they go from > to >>>>.` })
    else if (s.why === 'outside') out.push({ line: s.line, message: `${PART[s.marker] ?? 'This line'} outside a question.` })
    else out.push({ line: s.line, message: 'An explanation with no option above it.' })
  }
  const ids = new Map<string, number>()
  for (const b of parsed.blocks) {
    if (b.kind !== 'question') continue
    if (b.type === 'text') {
      if (b.answers.length === 0) out.push({ line: b.line, message: 'This question has no accepted answer.' })
    } else if (b.type === null) {
      out.push({ line: b.line, message: 'This question has no options.' })
    } else if (!b.options.some(o => o.correct)) {
      out.push({ line: b.line, message: 'This question has no right option.' })
    }
    if (b.id) {
      const first = ids.get(b.id)
      if (first !== undefined) out.push({ line: b.line, message: `Question id ${b.id} is used twice (first on line ${first}).` })
      else ids.set(b.id, b.line)
    }
  }
  return out.sort((a, b) => a.line - b.line)
}
