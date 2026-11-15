import { MARKER_CHARS } from './lines'

// Plain text as markup that shows exactly the same characters (the backend's markup_convert.plain_to_markup): stars, link starts and
// backslashes that would escape something are escaped, and a line that would start with a marker gets a backslash before it.

const linkStart = (text: string, i: number) => {
  if (i + 1 >= text.length || !/[A-Za-z0-9_#-]/.test(text[i + 1])) return false
  if (i === 0) return true
  const before = text[i - 1]
  return /\s/.test(before) || (!/[A-Za-z0-9]/.test(before) && !'_-\\'.includes(before))
}

function escapeLine(line: string): string {
  let out = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && i + 1 < line.length && MARKER_CHARS.includes(line[i + 1])) out += '\\\\'
    else if (ch === '*') out += '\\*'
    else if (ch === '@' && linkStart(line, i)) out += '\\@'
    else out += ch
  }
  const body = out.replace(/^[ \t]+/, '')
  if (/^[?!]/.test(body) || /^(#+|>+|")[ \t]/.test(body)) return `${out.slice(0, out.length - body.length)}\\${body}`
  return out
}

export function escapeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(escapeLine).join('\n')
}
