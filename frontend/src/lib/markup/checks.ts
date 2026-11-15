import { parseMarkup, type Parsed } from './parse'

// What the editor's checks panel lists, each with the line it is on (clicking one goes there): a marker that is not one, a hint, option,
// explanation or answer outside a question, an explanation with no option above it, a question with no right option or accepted answer,
// and a question id used twice. (Links, anchors and pulled-in questions are checked from the next slice.)

export interface MarkupCheck { line: number; message: string }

const PART: Record<string, string> = {
  '???!': 'A hint', '???': 'An option', '??!': 'An option', '??': 'An option', '?!': 'An option',
  '?!!': 'An explanation', '!!': 'An explanation', '?': 'A text field', '!': 'An answer',
}

export function checksOf(text: string, parsed: Parsed = parseMarkup(text)): MarkupCheck[] {
  const out: MarkupCheck[] = []
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
