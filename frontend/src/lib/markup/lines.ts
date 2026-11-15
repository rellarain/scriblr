// Scriblr's markup, line by line (the backend's storage/markup_convert.py MARKERS is the same list, checked by markerParity.test.ts).
// A marker starts a line, after any spaces: headings `######` (largest) to `#` (smallest), lists `>` to `>>>>` and a quote `"`, each
// followed by a space; the knowledge checks `?????` (a question pulled in), `????` (a question), `???!` (a hint), `???` and `??!` (checkbox
// options, wrong and right), `?!!` (explains the checkbox option above), `??` and `?!` (multiple-choice options, wrong and right), `!!`
// (explains the multiple-choice option above), `?` (a text field) and `!` (an accepted answer). A line that starts with a backslash is text.

export const MARKERS = ['######', '#####', '####', '###', '##', '#', '>>>>', '>>>', '>>', '>', '"', '?????', '????', '???!', '???', '??!', '?!!', '??', '?!', '!!', '?', '!'] as const
// The knowledge-check markers, longest first, the order a line is matched in.
export const CHECK_MARKERS = ['?????', '????', '???!', '???', '??!', '?!!', '??', '?!', '!!', '?', '!'] as const
export type CheckMarker = (typeof CHECK_MARKERS)[number]
// The characters a backslash shows as text.
export const MARKER_CHARS = '*>@?!#"[]\\'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6
export type ListDepth = 1 | 2 | 3 | 4

export type Line =
  | { kind: 'blank' }
  | { kind: 'heading'; level: HeadingLevel; text: string }
  | { kind: 'list'; depth: ListDepth; text: string }
  | { kind: 'quote'; text: string }
  // `id` is a question's own id (`????#q7f3a`); for `?????` the text is the question it pulls in.
  | { kind: 'check'; marker: CheckMarker; text: string; id: string | null }
  // A run of `#` or `>` longer than any marker.
  | { kind: 'unknown'; marker: string; text: string }
  | { kind: 'text'; text: string }

const QUESTION_ID = /^#([A-Za-z0-9_-]{1,40})/

export function classifyLine(raw: string): Line {
  const line = raw.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
  if (line === '') return { kind: 'blank' }
  if (line.startsWith('\\')) return { kind: 'text', text: line }
  const run = /^(#+|>+)[ \t]+(.*)$/.exec(line)
  if (run) {
    const [, marker, rest] = run
    const text = rest.trim()
    if (marker[0] === '#') return marker.length <= 6 ? { kind: 'heading', level: marker.length as HeadingLevel, text } : { kind: 'unknown', marker, text }
    return marker.length <= 4 ? { kind: 'list', depth: marker.length as ListDepth, text } : { kind: 'unknown', marker, text }
  }
  const quote = /^"[ \t]+(.*)$/.exec(line)
  if (quote) return { kind: 'quote', text: quote[1].trim() }
  if (line[0] === '?' || line[0] === '!') {
    const marker = CHECK_MARKERS.find(m => line.startsWith(m))!
    let rest = line.slice(marker.length)
    let id: string | null = null
    if (marker === '????') {
      const m = QUESTION_ID.exec(rest)
      if (m) { id = m[1]; rest = rest.slice(m[0].length) }
    }
    return { kind: 'check', marker, text: rest.trim(), id }
  }
  return { kind: 'text', text: line }
}
