import { describe, expect, it } from 'vitest'
import type { ResourceNode, ResourcesFile, TrainingContent } from '../../api/types'
import { checksOf } from './checks'
import { inlineText, linksIn, parseInline, type LinkToken } from './inline'
import { headingsOf, resolveLink, type LinkContext } from './links'
import { parseMarkup } from './parse'
import { insertLink, linkOptions, linkQueryAt } from './picker'
import { plainTextOf } from './plainText'

const node = (id: string, kind: ResourceNode['kind'], parentId: string | null, name: string): ResourceNode => ({ id, kind, parentId, name, order: 0 })
const resources: ResourcesFile = {
  schemaVersion: 2,
  nodes: [node('writer', 'interface', null, 'Writer'), node('writer/draft', 'console', 'writer', 'Draft'), node('writer/draft/3f9c21ab', 'component', 'writer/draft', 'Autosave'), node('training', 'interface', null, 'Training'), node('training/lesson', 'console', 'training', 'Lesson')],
  content: { 'writer/draft': { guide: '###### Saving work\n\ntext', tutorials: [], faq: [] } },
  assessments: {},
}
const training: TrainingContent = {
  schemaVersion: 2, curricula: [],
  courses: [{ id: 'c1', title: 'Plotting', description: '', hue: null, projects: [], exams: [], modules: [{ id: 'm1', title: 'Acts', description: '', tests: [], lessons: [{ id: 'l1', title: 'Three acts', description: '', body: '#### The middle\n\ntext', exercises: [], quizzes: [] }] }] }],
}
const ctx = (over: Partial<LinkContext> = {}): LinkContext => ({ resources, training, headings: [], ...over })
const link = (text: string) => linksIn(parseInline(text))[0]

describe('link tokens', () => {
  it('read names joined by @, a heading after #, and a label in brackets', () => {
    expect(link('see @writer@draft@3f9c21ab now')).toEqual({ t: 'link', path: ['writer', 'draft', '3f9c21ab'], anchor: null, label: null, raw: '@writer@draft@3f9c21ab' })
    expect(link('@#Saving-work')).toMatchObject({ path: [], anchor: 'Saving-work', raw: '@#Saving-work' })
    expect(link('@writer@draft#Saving-work[how to save] ok')).toMatchObject({ path: ['writer', 'draft'], anchor: 'Saving-work', raw: '@writer@draft#Saving-work' })
    expect(inlineText(link('@writer@draft[**how** to save]').label!)).toBe('how to save')
  })

  it('start only at the start or after a space or punctuation, and end at anything else', () => {
    expect(parseInline('mail name@mail.com').some(n => n.t === 'link')).toBe(false)
    expect(link('(@writer).')).toMatchObject({ raw: '@writer' })
    expect(parseInline('\\@writer')).toEqual([{ t: 'text', text: '@writer' }])
    expect(parseInline('a @ b').some(n => n.t === 'link')).toBe(false)
    expect(link('**@writer@draft**')).toMatchObject({ path: ['writer', 'draft'] })
  })
})

describe('resolving a link', () => {
  it('finds a channel node by its ids, with its current name as the title', () => {
    expect(resolveLink(link('@writer@draft@3f9c21ab'), ctx())).toEqual({ status: 'ok', target: { kind: 'article', nodeId: 'writer/draft/3f9c21ab', anchor: null }, title: 'Autosave' })
    expect(resolveLink(link('@writer@nothing'), ctx())).toMatchObject({ status: 'missing' })
  })

  it('finds a Training course, module or lesson by the deepest id; courses win after training', () => {
    expect(resolveLink(link('@training@c1@m1@l1'), ctx())).toMatchObject({ status: 'ok', target: { kind: 'training', itemKind: 'lesson', id: 'l1' }, title: 'Three acts' })
    expect(resolveLink(link('@training@c1'), ctx())).toMatchObject({ status: 'ok', title: 'Plotting' })
    expect(resolveLink(link('@training@c1@gone'), ctx())).toMatchObject({ status: 'missing' })
    // not a course: the channel node, else the Training interface's article
    expect(resolveLink(link('@training@lesson'), ctx())).toMatchObject({ status: 'ok', target: { kind: 'article', nodeId: 'training/lesson' } })
    expect(resolveLink(link('@training@whatever'), ctx())).toMatchObject({ status: 'ok', target: { kind: 'article', nodeId: 'training' } })
    expect(resolveLink(link('@training'), ctx())).toMatchObject({ status: 'ok', target: { kind: 'article', nodeId: 'training' } })
  })

  it('finds headings by their words, here and in another text', () => {
    const here = headingsOf('#### Getting started\n\n## Next')
    expect(resolveLink(link('@#getting-STARTED'), ctx({ headings: here }))).toEqual({ status: 'ok', target: { kind: 'heading', anchor: 'getting-started' }, title: 'Getting started' })
    expect(resolveLink(link('@#nope'), ctx({ headings: here }))).toMatchObject({ status: 'missing' })
    expect(resolveLink(link('@writer@draft#saving-work'), ctx())).toMatchObject({ status: 'ok', target: { kind: 'article', nodeId: 'writer/draft', anchor: 'saving-work' }, title: 'Saving work' })
    expect(resolveLink(link('@training@c1@m1@l1#the-middle'), ctx())).toMatchObject({ status: 'ok', target: { anchor: 'the-middle' } })
    expect(resolveLink(link('@writer@draft#gone'), ctx())).toMatchObject({ status: 'missing' })
  })

  it('waits while what it points at is loading', () => {
    expect(resolveLink(link('@writer@draft'), ctx({ resources: null }))).toEqual({ status: 'pending' })
    expect(resolveLink(link('@training@c1'), ctx({ training: null }))).toEqual({ status: 'pending' })
  })
})

describe('links in the checks and the plain text', () => {
  it('lists a link that goes nowhere, by line, and waits for what is loading', () => {
    const text = 'Fine @writer@draft\n\nBroken @writer@gone\n\n@#nowhere'
    expect(checksOf(text, parseMarkup(text), ctx({ headings: headingsOf(text) })).map(c => [c.line, c.message.split(':')[0]])).toEqual([[3, '@writer@gone goes nowhere'], [5, '@#nowhere goes nowhere']])
    expect(checksOf(text, parseMarkup(text), ctx({ resources: null, headings: headingsOf(text) })).map(c => c.line)).toEqual([5])
    expect(checksOf(text)).toEqual([])
  })

  it('copies a link as its label or its title', () => {
    const title = (l: LinkToken) => { const r = resolveLink(l, ctx()); return r.status === 'ok' ? r.title : null }
    expect(plainTextOf('See @writer@draft and @training@c1[the course] or @writer@gone.', title)).toBe('See Draft and the course or @writer@gone.')
  })
})

describe('the link picker', () => {
  it('opens on a link being typed, not on an e-mail address', () => {
    expect(linkQueryAt('see @', 5)).toEqual({ start: 4, query: '' })
    expect(linkQueryAt('see @writer@dr', 14)).toEqual({ start: 4, query: 'writer@dr' })
    expect(linkQueryAt('name@ma', 7)).toBeNull()
    expect(linkQueryAt('see @writer and', 15)).toBeNull()
  })

  it('lists articles, Training items and headings by title, and puts the id path in', () => {
    const all = linkOptions('', resources, training, headingsOf('#### Intro'))
    expect(all.map(o => o.insert)).toContain('@#intro')
    expect(linkOptions('autosave', resources, training, []).map(o => [o.label, o.insert])).toEqual([['Writer › Draft › Autosave', '@writer@draft@3f9c21ab']])
    expect(linkOptions('three acts', resources, training, []).map(o => o.insert)).toEqual(['@training@c1@m1@l1'])
    const q = linkQueryAt('see @auto now', 9)!
    expect(insertLink('see @auto now', q, 9, linkOptions('auto', resources, training, [])[0])).toEqual({ text: 'see @writer@draft@3f9c21ab now', caret: 26 })
  })
})
