import { anchorsFor } from './anchors'
import { inlineText, parseInline, type Inline } from './inline'
import { classifyLine, type CheckMarker, type HeadingLevel, type Line, type ListDepth } from './lines'

// The lines of a text grouped into blocks. A blank line ends a paragraph and a quote (a single line break stays a line break). Consecutive
// list lines are one list, blank lines between them too; `>>` numbers 1, 2, 3 through the list and starts again after other text; `>>>>`
// numbers 1.1, 1.2 under the nearest `>>` above (2.1 under item 2), or 1, 2, 3 under a `>` dot. A question is a `????` line and the check
// lines after it, blank lines too; any other line ends it. Its kind is set by its first option: `???`/`??!` checkboxes, `??`/`?!` multiple
// choice, `?` a text field (options of the other family are taken as that kind). An explanation belongs to the option above it.
// Line numbers count from 1.

export type QuestionType = 'checkbox' | 'choice' | 'text'

export interface ListItem { depth: ListDepth; label: string; numbered: boolean; inline: Inline[]; line: number }
export interface QuestionOption { inline: Inline[]; correct: boolean; explanation: Inline[][]; line: number }
export interface QuestionBlock {
  kind: 'question'
  // Its permanent id, only in a quiz, test or exam (`????#q7f3a`).
  id: string | null
  prompt: Inline[]
  type: QuestionType | null
  hints: Inline[][]
  options: QuestionOption[]
  placeholder: string
  answers: string[]
  line: number
  // Every line it holds, for the checks.
  lines: number[]
}
export type Block =
  | { kind: 'paragraph'; lines: Inline[][]; line: number }
  | { kind: 'heading'; level: HeadingLevel; inline: Inline[]; text: string; anchor: string; line: number }
  | { kind: 'list'; items: ListItem[]; line: number }
  | { kind: 'quote'; lines: Inline[][]; line: number }
  | QuestionBlock
  | { kind: 'pullin'; ref: string; line: number }

// A line the checks speak about: a check line outside a question, an explanation with no option above, a marker that is not one.
export interface Stray { line: number; marker: string; why: 'outside' | 'no-option' | 'unknown' }

export interface Parsed { blocks: Block[]; strays: Stray[] }

const OPTION: Partial<Record<CheckMarker, { type: QuestionType; correct: boolean }>> = {
  '???': { type: 'checkbox', correct: false },
  '??!': { type: 'checkbox', correct: true },
  '??': { type: 'choice', correct: false },
  '?!': { type: 'choice', correct: true },
}

export function groupBlocks(text: string): Parsed {
  const raw = text.replace(/\r\n?/g, '\n').split('\n')
  const lines: Line[] = raw.map(classifyLine)
  const blocks: Block[] = []
  const strays: Stray[] = []
  let para: Extract<Block, { kind: 'paragraph' }> | null = null
  let quote: Extract<Block, { kind: 'quote' }> | null = null
  let list: Extract<Block, { kind: 'list' }> | null = null
  let question: QuestionBlock | null = null
  let numbered = 0, sub = 0
  let parent: { numbered: boolean; n: number } | null = null
  const end = () => { para = null; quote = null; list = null; question = null }
  const nextKind = (from: number) => { for (let k = from; k < lines.length; k++) if (lines[k].kind !== 'blank') return lines[k]; return null }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], line = i + 1
    if (l.kind === 'blank') {
      para = null
      quote = null
      if (list && nextKind(i + 1)?.kind !== 'list') list = null
      if (question) {
        const next = nextKind(i + 1)
        if (!(next?.kind === 'check' && next.marker !== '????' && next.marker !== '?????')) question = null
      }
      continue
    }
    if (l.kind === 'heading') {
      end()
      blocks.push({ kind: 'heading', level: l.level, inline: parseInline(l.text), text: '', anchor: '', line })
      continue
    }
    if (l.kind === 'list') {
      para = null; quote = null; question = null
      if (!list) { list = { kind: 'list', items: [], line }; blocks.push(list); numbered = 0; sub = 0; parent = null }
      let label: string, isNumbered: boolean
      if (l.depth === 1) { label = '•'; isNumbered = false; parent = { numbered: false, n: 0 }; sub = 0 }
      else if (l.depth === 2) { numbered += 1; label = `${numbered}.`; isNumbered = true; parent = { numbered: true, n: numbered }; sub = 0 }
      else if (l.depth === 3) { label = '◦'; isNumbered = false }
      else { sub += 1; label = parent?.numbered ? `${parent.n}.${sub}` : `${sub}.`; isNumbered = true }
      list.items.push({ depth: l.depth, label, numbered: isNumbered, inline: parseInline(l.text), line })
      continue
    }
    if (l.kind === 'quote') {
      para = null; list = null; question = null
      if (!quote) { quote = { kind: 'quote', lines: [], line }; blocks.push(quote) }
      quote.lines.push(parseInline(l.text))
      continue
    }
    if (l.kind === 'check' && l.marker === '?????') {
      end()
      blocks.push({ kind: 'pullin', ref: l.text, line })
      continue
    }
    if (l.kind === 'check' && l.marker === '????') {
      end()
      question = { kind: 'question', id: l.id, prompt: parseInline(l.text), type: null, hints: [], options: [], placeholder: '', answers: [], line, lines: [line] }
      blocks.push(question)
      continue
    }
    if (l.kind === 'check' && question) {
      const q: QuestionBlock = question
      q.lines.push(line)
      const option = OPTION[l.marker]
      if (option) {
        q.type ??= option.type
        q.options.push({ inline: parseInline(l.text), correct: option.correct, explanation: [], line })
      } else if (l.marker === '?') {
        q.type ??= 'text'
        q.placeholder = inlineText(parseInline(l.text))
      } else if (l.marker === '!') {
        q.type ??= 'text'
        q.answers.push(inlineText(parseInline(l.text)))
      } else if (l.marker === '???!') {
        q.hints.push(parseInline(l.text))
      } else {
        // `?!!` and `!!` explain the option above
        const above = q.options[q.options.length - 1]
        if (above) above.explanation.push(parseInline(l.text))
        else strays.push({ line, marker: l.marker, why: 'no-option' })
      }
      continue
    }
    // text, a check line outside a question, or a marker that is not one: a paragraph line, as typed
    question = null; list = null; quote = null
    if (l.kind === 'check') strays.push({ line, marker: l.marker, why: 'outside' })
    if (l.kind === 'unknown') strays.push({ line, marker: l.marker, why: 'unknown' })
    const shown = l.kind === 'check' ? raw[i].trim() : l.kind === 'unknown' ? `${l.marker} ${l.text}` : l.text
    if (!para) { para = { kind: 'paragraph', lines: [], line }; blocks.push(para) }
    para.lines.push(l.kind === 'text' ? parseInline(shown) : [{ t: 'text', text: shown }])
  }

  const headings = blocks.filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading')
  headings.forEach(h => { h.text = inlineText(h.inline) })
  const anchors = anchorsFor(headings.map(h => h.text))
  headings.forEach((h, k) => { h.anchor = anchors[k] })
  return { blocks, strays }
}
