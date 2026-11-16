import type { ResourcesFile, TrainingContent } from '../../api/types'
import { headingWords } from './anchors'
import type { LinkToken } from './inline'
import { parseCached } from './parse'

// What a link points at, by permanent ids, so a reader always sees the current title:
// - `@writer@draft@3f9c21ab`: a channel node's article (the names joined by `/` are its id);
// - `@training@<course>[@<module>[@<lesson>]]`: a Training course, module or lesson (Training ids are unique, so the deepest one is the item);
//   after `training` a course's id wins over a channel node, and `@training` alone, or with a name that is neither, is the Training interface's
//   article;
// - `#Heading-words` after either: a heading in that text; `@#Heading-words` alone: a heading in the same text.
// A link whose place is not loaded yet is `pending` (shown as typed, with no mark); one that points at nothing is `missing`.

export type LinkTarget =
  | { kind: 'article'; nodeId: string; anchor: string | null }
  | { kind: 'training'; itemKind: 'course' | 'module' | 'lesson'; id: string; anchor: string | null }
  | { kind: 'heading'; anchor: string }

export type Resolved =
  | { status: 'ok'; target: LinkTarget; title: string }
  | { status: 'missing'; why: string }
  | { status: 'pending' }

export interface Heading { anchor: string; text: string }

export interface LinkContext {
  // The channel nodes and their articles (null until loaded).
  resources: ResourcesFile | null
  // The Training courses (null until loaded).
  training: TrainingContent | null
  // The headings of the text the link is in (for `@#Heading`).
  headings: Heading[]
}

// The headings of a markup text, with their anchors.
export function headingsOf(text: string): Heading[] {
  return parseCached(text).blocks.flatMap(b => (b.kind === 'heading' ? [{ anchor: b.anchor, text: b.text }] : []))
}

// An article as one markup text: the guide, then each tutorial and FAQ entry under its title (the titles' own words are not markup).
export function articleMarkup(file: ResourcesFile, nodeId: string): string {
  const c = file.content[nodeId]
  if (!c) return ''
  return [c.guide, ...c.tutorials.map(t => t.body), ...c.faq.map(f => f.answer)].filter(p => p.trim() !== '').join('\n\n')
}

// The heading an anchor names among some headings: the same words, any capitals; a repeat is `-2`, `-3`.
export function findHeading(headings: Heading[], anchor: string): Heading | null {
  const want = anchor.toLowerCase()
  return headings.find(h => h.anchor === want) ?? headings.find(h => headingWords(h.text) === headingWords(anchor)) ?? null
}

type Found = { itemKind: 'course' | 'module' | 'lesson'; id: string; title: string; body: string }

function trainingItem(content: TrainingContent, id: string): Found | null {
  for (const course of content.courses) {
    if (course.id === id) return { itemKind: 'course', id, title: course.title, body: course.description }
    for (const mod of course.modules) {
      if (mod.id === id) return { itemKind: 'module', id, title: mod.title, body: mod.description }
      for (const lesson of mod.lessons) if (lesson.id === id) return { itemKind: 'lesson', id, title: lesson.title, body: lesson.body }
    }
  }
  return null
}

function withAnchor(target: LinkTarget, title: string, anchor: string | null, text: () => string): Resolved {
  if (!anchor) return { status: 'ok', target, title }
  const heading = findHeading(headingsOf(text()), anchor)
  if (!heading) return { status: 'missing', why: `No heading “${anchor.replace(/-/g, ' ')}” in ${title}.` }
  return { status: 'ok', target: { ...target, anchor: heading.anchor } as LinkTarget, title: heading.text }
}

export function resolveLink(link: LinkToken, ctx: LinkContext): Resolved {
  const { path, anchor } = link
  if (path.length === 0) {
    if (!anchor) return { status: 'missing', why: 'An empty link.' }
    const heading = findHeading(ctx.headings, anchor)
    return heading ? { status: 'ok', target: { kind: 'heading', anchor: heading.anchor }, title: heading.text } : { status: 'missing', why: `No heading “${anchor.replace(/-/g, ' ')}” here.` }
  }
  if (path[0] === 'training' && path.length >= 2) {
    if (!ctx.training) return { status: 'pending' }
    if (ctx.training.courses.some(c => c.id === path[1])) {
      const item = trainingItem(ctx.training, path[path.length - 1])
      if (!item) return { status: 'missing', why: `There is no ${path[path.length - 1]} in Training.` }
      return withAnchor({ kind: 'training', itemKind: item.itemKind, id: item.id, anchor: null }, item.title, anchor, () => item.body)
    }
  }
  if (!ctx.resources) return { status: 'pending' }
  const nodes = ctx.resources.nodes
  let id = path.join('/')
  if (path[0] === 'training' && !nodes.some(n => n.id === id)) id = 'training'
  const node = nodes.find(n => n.id === id)
  if (!node) return { status: 'missing', why: `There is no ${path.join(' › ')}.` }
  const file = ctx.resources
  return withAnchor({ kind: 'article', nodeId: node.id, anchor: null }, node.name || 'Untitled', anchor, () => articleMarkup(file, node.id))
}

// What a link reads as: its label, else its title where it is found, else as typed.
export function linkTitle(link: LinkToken, ctx: LinkContext): string | null {
  const r = resolveLink(link, ctx)
  return r.status === 'ok' ? r.title : null
}
