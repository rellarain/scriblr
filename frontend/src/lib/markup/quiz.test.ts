import { describe, expect, it } from 'vitest'
import type { ResourceNode, ResourcesFile, TrainingContent } from '../../api/types'
import { checksOf } from './checks'
import { inlineText } from './inline'
import type { LinkContext } from './links'
import { parseMarkup } from './parse'
import { insertLink, pullInQueryAt, questionOptions } from './picker'
import { resolvePullIn } from './pullIns'
import { assignQuestionIds } from './questionIds'

const node = (id: string, kind: ResourceNode['kind'], parentId: string | null, name: string): ResourceNode => ({ id, kind, parentId, name, order: 0 })
const resources: ResourcesFile = {
  schemaVersion: 2,
  nodes: [node('writer', 'interface', null, 'Writer'), node('writer/draft', 'console', 'writer', 'Draft')],
  content: {},
  assessments: { 'writer/draft': { text: '????#q7f3a Which saves your work?\n?! Save\n?? Undo' } },
}
const training: TrainingContent = {
  schemaVersion: 2, curricula: [],
  courses: [{
    id: 'c1', title: 'Plotting', description: '', hue: null, projects: [],
    exams: [{ id: 'x1', title: 'Exam', description: '', passMark: 70, text: '????#qe1 Exam question\n! yes' }],
    modules: [{
      id: 'm1', title: 'Acts', description: '', tests: [{ id: 't1', title: 'Test', description: '', passMark: 70, text: '????#qt1 Test question\n?! a' }],
      lessons: [{ id: 'l1', title: 'Three acts', description: '', body: '', exercises: [], quizzes: [{ id: 'q1', title: 'Quiz', description: '', passMark: 70, text: '????#qq1 Quiz question\n??! a' }] }],
    }],
  }],
}
const ctx = (over: Partial<LinkContext> = {}): LinkContext => ({ resources, training, headings: [], ...over })

describe('question ids', () => {
  it('give each question of a quiz an id once, keep the ones it has, and renew a repeated one', () => {
    const ided = assignQuestionIds('???? First\n?! a\n\n????#q1 Second\n\n????#q1 Pasted\n\n?????@writer@draft#q7f3a')
    const ids = parseMarkup(ided).blocks.flatMap(b => (b.kind === 'question' ? [b.id] : []))
    expect(ids[1]).toBe('q1')
    expect(ids[0]).toMatch(/^q[0-9a-f]{4}$/)
    expect(ids[2]).toMatch(/^q[0-9a-f]{4}$/)
    expect(new Set(ids).size).toBe(3)
    expect(ided).toContain('?????@writer@draft#q7f3a')
    // the same text gets the same ids, and a text whose questions all have ids is left as it is
    expect(assignQuestionIds('???? First\n?! a\n\n????#q1 Second\n\n????#q1 Pasted\n\n?????@writer@draft#q7f3a')).toBe(ided)
    expect(assignQuestionIds(ided)).toBe(ided)
    expect(assignQuestionIds('????Close')).toMatch(/^\?\?\?\?#q[0-9a-f]{4} Close$/)
  })
})

describe('pulling a question in', () => {
  it('finds a question of a channel node’s assessment, and of a course’s exam, a module’s test or a lesson’s quiz', () => {
    const r = resolvePullIn('@writer@draft#q7f3a', ctx())
    expect(r.status === 'ok' && [inlineText(r.question.prompt), r.from]).toEqual(['Which saves your work?', 'Exam of Draft'])
    expect(resolvePullIn('@training@c1#qe1', ctx())).toMatchObject({ status: 'ok', from: 'Exam of Plotting' })
    expect(resolvePullIn('@training@c1@m1#qt1', ctx())).toMatchObject({ status: 'ok', from: 'Test of Acts' })
    expect(resolvePullIn('@training@c1@m1@l1#qq1', ctx())).toMatchObject({ status: 'ok', from: 'Quiz of Three acts' })
  })

  it('says why one pulls in nothing, and waits while loading', () => {
    expect(resolvePullIn('@writer@draft#nope', ctx())).toMatchObject({ status: 'missing' })
    expect(resolvePullIn('@writer@draft', ctx())).toMatchObject({ status: 'missing', why: 'It names no question (add # and its id).' })
    expect(resolvePullIn('@writer#q1', ctx())).toMatchObject({ status: 'missing', why: 'Writer holds no quiz, test or exam.' })
    expect(resolvePullIn('just words', ctx())).toMatchObject({ status: 'missing' })
    expect(resolvePullIn('@writer@draft#q7f3a', ctx({ resources: null }))).toEqual({ status: 'pending' })
  })

  it('lists one that pulls in nothing among the checks', () => {
    const text = '?????@writer@draft#q7f3a\n\n?????@writer@draft#gone'
    expect(checksOf(text, parseMarkup(text), ctx()).map(c => [c.line, c.message.split(':')[0]])).toEqual([[3, '?????@writer@draft#gone pulls in nothing']])
  })

  it('picks the question on a ????? line by its words', () => {
    expect(pullInQueryAt('text\n?????sav', 13)).toEqual({ start: 10, query: 'sav', mode: 'pullin' })
    expect(pullInQueryAt('???? not', 8)).toBeNull()
    const options = questionOptions('saves', resources, training)
    expect(options.map(o => [o.label, o.insert])).toEqual([['Draft › Which saves your work?', '@writer@draft#q7f3a']])
    expect(questionOptions('', resources, training).map(o => o.insert)).toEqual(['@writer@draft#q7f3a', '@training@c1#qe1', '@training@c1@m1#qt1', '@training@c1@m1@l1#qq1'])
    const q = pullInQueryAt('?????sav', 8)!
    expect(insertLink('?????sav', q, 8, options[0]).text).toBe('?????@writer@draft#q7f3a')
  })
})
