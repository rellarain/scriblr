import { MARKER_CHARS } from './lines'

// The markup inside a line: `***bold italic***`, `**bold**` and `*italic*`. Escapes are read first (a backslash before one of MARKER_CHARS
// shows it as text; any other backslash stays as typed, so `C:\Users` is safe), then runs of stars are paired, three, two and one alike:
// a run opens when a letter follows it and closes when one comes before it, so `2 * 3 * 4` keeps its stars. A star with no partner stays as
// typed. A link is one token, read where it starts: `@` at the start of the text or after a space or punctuation (so `name@mail.com` is
// not one), then names of letters, digits, `_` and `-` joined by `@` (`@writer@draft@3f9c21ab`, `@training@course@module@lesson`), then
// optionally `#` and a heading's words (`@#Heading-words` alone is a heading of the same text), then optionally `[text]` shown instead of
// the title.

export interface LinkToken {
  t: 'link'
  // The names after each `@` (none for `@#Heading`).
  path: string[]
  // The heading's words after `#`, as typed (matched with any capitals).
  anchor: string | null
  // `[text]` after the link, shown instead of its title.
  label: Inline[] | null
  // The link as typed, without its label.
  raw: string
}

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'em' | 'strong' | 'strongEm'; children: Inline[] }
  | LinkToken

const NAME = /[A-Za-z0-9_-]/

// Whether a `@` at `i` starts a link (the backend's markup_convert._is_link_start says the same).
export function isLinkStart(text: string, i: number): boolean {
  const next = text[i + 1]
  if (next === undefined || !(NAME.test(next) || (next === '#' && NAME.test(text[i + 2] ?? '')))) return false
  if (i === 0) return true
  const before = text[i - 1]
  return /\s/.test(before) || (!/[A-Za-z0-9]/.test(before) && !'_-\\'.includes(before))
}

// The link that starts at `i` (a `@` where isLinkStart is true), and where it ends.
export function readLink(text: string, i: number, withLabel = true): { token: LinkToken; end: number } {
  let j = i + 1
  const path: string[] = []
  while (j < text.length && NAME.test(text[j])) {
    let k = j
    while (k < text.length && NAME.test(text[k])) k++
    path.push(text.slice(j, k))
    j = k
    if (text[j] === '@' && NAME.test(text[j + 1] ?? '')) j++
    else break
  }
  let anchor: string | null = null
  if (text[j] === '#' && NAME.test(text[j + 1] ?? '')) {
    let k = j + 1
    while (k < text.length && NAME.test(text[k])) k++
    anchor = text.slice(j + 1, k)
    j = k
  }
  const raw = text.slice(i, j)
  let label: Inline[] | null = null
  if (withLabel && text[j] === '[') {
    let k = j + 1, body = ''
    while (k < text.length && text[k] !== ']') {
      if (text[k] === '\\' && k + 1 < text.length) { body += text[k] + text[k + 1]; k += 2 } else { body += text[k]; k++ }
    }
    if (k < text.length) {
      label = parseInline(body, false)
      j = k + 1
    }
  }
  return { token: { t: 'link', path, anchor, label, raw }, end: j }
}

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

export function parseInline(text: string, links = true): Inline[] {
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
    if (links && ch === '@' && isLinkStart(text, i)) {
      const { token, end } = readLink(text, i)
      top().children.push(token)
      i = end
      continue
    }
    if (ch !== '*') {
      let j = i + 1
      while (j < text.length && text[j] !== '*' && text[j] !== '\\' && text[j] !== '@') j++
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

// The words of inline markup, with no styling; a link is its label, else `title` of it (its title where it is known), else as typed.
export function inlineText(nodes: Inline[], title?: (link: LinkToken) => string | null): string {
  return nodes.map(n => {
    if (n.t === 'text') return n.text
    if (n.t === 'link') return n.label ? inlineText(n.label, title) : (title?.(n) ?? n.raw)
    return inlineText(n.children, title)
  }).join('')
}

// Every link in inline markup, in order.
export function linksIn(nodes: Inline[]): LinkToken[] {
  return nodes.flatMap(n => (n.t === 'link' ? [n] : n.t === 'text' ? [] : linksIn(n.children)))
}
