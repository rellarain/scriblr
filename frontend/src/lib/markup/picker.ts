import type { ResourcesFile, TrainingContent } from '../../api/types'
import type { Heading } from './links'

// The editor's link picker: while a link is being typed (a `@` where a link may start, then names, `@`s and `#`, up to the caret), it lists
// what the link could point at by title (the articles of the channel list, the Training courses, modules and lessons, the text's own
// headings) and puts the chosen one's id path in place of what was typed.

export interface LinkQuery { start: number; query: string }

// The link being typed at the caret, if any.
export function linkQueryAt(text: string, caret: number): LinkQuery | null {
  const before = text.slice(0, caret)
  const m = /@[A-Za-z0-9_@#-]*$/.exec(before)
  if (!m) return null
  const start = m.index
  // where a link may start: at the start, or after a space or punctuation (as isLinkStart), so an e-mail address opens nothing
  const prev = text[start - 1]
  if (start > 0 && !/\s/.test(prev) && (/[A-Za-z0-9]/.test(prev) || '_-\\'.includes(prev))) return null
  return { start, query: m[0].slice(1) }
}

export interface PickerOption { id: string; label: string; insert: string; kind: 'article' | 'training' | 'heading' }

export function linkOptions(query: string, resources: ResourcesFile | null, training: TrainingContent | null, headings: Heading[], limit = 8): PickerOption[] {
  const all: PickerOption[] = []
  for (const h of headings) all.push({ id: `h:${h.anchor}`, label: `# ${h.text}`, insert: `@#${h.anchor}`, kind: 'heading' })
  if (resources) {
    const byId = new Map(resources.nodes.map(n => [n.id, n]))
    const names = (id: string): string[] => {
      const out: string[] = []
      let n = byId.get(id)
      const seen = new Set<string>()
      while (n && !seen.has(n.id)) { seen.add(n.id); out.unshift(n.name || 'Untitled'); n = n.parentId ? byId.get(n.parentId) : undefined }
      return out
    }
    for (const n of resources.nodes) all.push({ id: `a:${n.id}`, label: names(n.id).join(' › '), insert: `@${n.id.split('/').join('@')}`, kind: 'article' })
  }
  if (training) {
    for (const c of training.courses) {
      all.push({ id: `t:${c.id}`, label: `Training › ${c.title}`, insert: `@training@${c.id}`, kind: 'training' })
      for (const m of c.modules) {
        all.push({ id: `t:${m.id}`, label: `Training › ${c.title} › ${m.title}`, insert: `@training@${c.id}@${m.id}`, kind: 'training' })
        for (const l of m.lessons) all.push({ id: `t:${l.id}`, label: `Training › ${c.title} › ${m.title} › ${l.title}`, insert: `@training@${c.id}@${m.id}@${l.id}`, kind: 'training' })
      }
    }
  }
  const words = query.toLowerCase().replace(/[@#_-]+/g, ' ').split(/\s+/).filter(Boolean)
  const matches = (o: PickerOption) => {
    if (words.length === 0) return true
    const hay = `${o.label} ${o.insert}`.toLowerCase()
    return words.every(w => hay.includes(w))
  }
  return all.filter(matches).slice(0, limit)
}

// The text with the typed link replaced by the chosen one; the caret goes after it.
export function insertLink(text: string, q: LinkQuery, caret: number, option: PickerOption): { text: string; caret: number } {
  const next = text.slice(0, q.start) + option.insert + text.slice(caret)
  return { text: next, caret: q.start + option.insert.length }
}
