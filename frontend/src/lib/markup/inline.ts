import { MARKER_CHARS } from './lines'

// The markup inside a line: `***bold italic***`, `**bold**` and `*italic*`. Escapes are read first (a backslash before one of MARKER_CHARS
// shows it as text; any other backslash stays as typed, so `C:\Users` is safe), then runs of stars are paired, three, two and one alike:
// a run opens when a letter follows it and closes when one comes before it, so `2 * 3 * 4` keeps its stars. A star with no partner stays as
// typed. (Links, which start with `@`, are read in a later slice; until then they are text.)

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'em' | 'strong' | 'strongEm'; children: Inline[] }

type Frame = { n: number; children: Inline[] }

const STYLE: Record<number, 'em' | 'strong' | 'strongEm'> = { 1: 'em', 2: 'strong', 3: 'strongEm' }
const space = (ch: string | undefined) => ch === undefined || /\s/.test(ch)

function pushText(into: Inline[], text: string) {
  if (!text) return
  const last = into[into.length - 1]
  if (last && last.t === 'text') last.text += text
  else into.push({ t: 'text', text })
}

function pushAll(into: Inline[], nodes: Inline[]) {
  for (const n of nodes) {
    if (n.t === 'text') pushText(into, n.text)
    else into.push(n)
  }
}

export function parseInline(text: string): Inline[] {
  const root: Frame = { n: 0, children: [] }
  const stack: Frame[] = [root]
  const top = () => stack[stack.length - 1]
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length && MARKER_CHARS.includes(text[i + 1])) {
      pushText(top().children, text[i + 1])
      i += 2
      continue
    }
    if (ch !== '*') {
      let j = i + 1
      while (j < text.length && text[j] !== '*' && text[j] !== '\\') j++
      pushText(top().children, text.slice(i, j))
      i = j
      continue
    }
    let j = i
    while (j < text.length && text[j] === '*') j++
    const n = j - i
    const before = i > 0 ? text[i - 1] : undefined
    const after = j < text.length ? text[j] : undefined
    const canClose = !space(before), canOpen = !space(after)
    const at = canClose ? stack.findLastIndex((f, k) => k > 0 && f.n === n) : -1
    if (at > 0) {
      // frames opened after the partner never closed: their stars are text again
      while (stack.length - 1 > at) {
        const open = stack.pop()!
        pushText(top().children, '*'.repeat(open.n))
        pushAll(top().children, open.children)
      }
      const frame = stack.pop()!
      top().children.push({ t: STYLE[n], children: frame.children })
    } else if (canOpen && n <= 3) {
      stack.push({ n, children: [] })
    } else {
      pushText(top().children, '*'.repeat(n))
    }
    i = j
  }
  while (stack.length > 1) {
    const open = stack.pop()!
    pushText(top().children, '*'.repeat(open.n))
    pushAll(top().children, open.children)
  }
  return root.children
}

// The words of inline markup, with no styling.
export function inlineText(nodes: Inline[]): string {
  return nodes.map(n => (n.t === 'text' ? n.text : inlineText(n.children))).join('')
}
