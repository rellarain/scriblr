// A quiz's, test's or exam's questions get permanent ids when it is saved (`????#q7f3a`), so a lesson or an article can pull one in by its id
// however the question is reworded. A question with no id gets one, and so does a later copy of an id already used in the text (a pasted
// question), so each id names one question. Practice questions elsewhere get none. Pure, and by default the same text always gets the same
// ids (each made from its question's line), so a save and the field showing the ids a moment later agree.

const QUESTION_LINE = /^([ \t]*)\?\?\?\?(?!\?)(#[A-Za-z0-9_-]{1,40})?(.*)$/

export function newQuestionId(taken: Set<string>, random: () => number = Math.random): string {
  for (;;) {
    const id = `q${Math.floor(random() * 0x10000).toString(16).padStart(4, '0')}`
    if (!taken.has(id)) return id
  }
}

// A number from 0 to 1 made from some words (FNV-1a), for ids that are the same each time.
function seeded(seed: string): () => number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return () => { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return h / 0x100000000 }
}

export function assignQuestionIds(text: string, random?: () => number): string {
  const lines = text.split('\n')
  const taken = new Set<string>()
  for (const line of lines) {
    const m = QUESTION_LINE.exec(line.replace(/\r$/, ''))
    if (m?.[2]) taken.add(m[2].slice(1))
  }
  const seen = new Set<string>()
  let changed = false
  const out = lines.map(line => {
    const cr = line.endsWith('\r') ? '\r' : ''
    const m = QUESTION_LINE.exec(cr ? line.slice(0, -1) : line)
    if (!m) return line
    const [, indent, idPart, rest] = m
    const id = idPart?.slice(1)
    if (id && !seen.has(id)) { seen.add(id); return line }
    const fresh = newQuestionId(taken, random ?? seeded(`${line}:${taken.size}`))
    taken.add(fresh)
    seen.add(fresh)
    changed = true
    return `${indent}????#${fresh}${rest && !/^\s/.test(rest) ? ' ' : ''}${rest}${cr}`
  })
  return changed ? out.join('\n') : text
}
