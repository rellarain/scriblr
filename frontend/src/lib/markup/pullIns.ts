import type { ResourcesFile, TrainingContent } from '../../api/types'
import { readLink } from './inline'
import type { LinkContext } from './links'
import { parseCached, type QuestionBlock } from './parse'

// `?????` pulls in a question written in a quiz, test or exam, by the assessment's link path and the question's id:
// - `?????@writer@draft#q7f3a`: the assessment of a channel node (a console's Exam, a component's Test, a feature's Quiz);
// - `?????@training@<course>#id`: a course's exam; `@<module>` after it a module's test, `@<module>@<lesson>` a lesson's quiz.

export type PulledIn =
  | { status: 'ok'; question: QuestionBlock; from: string }
  | { status: 'missing'; why: string }
  | { status: 'pending' }

const ASSESSMENT: Record<string, string> = { console: 'Exam', component: 'Test', feature: 'Quiz' }

// An assessment's text and what to call it, by the names of its link path.
export function assessmentAt(path: string[], resources: ResourcesFile | null, training: TrainingContent | null): { status: 'ok'; text: string; title: string } | { status: 'missing'; why: string } | { status: 'pending' } {
  if (path[0] === 'training' && path.length >= 2) {
    if (!training) return { status: 'pending' }
    const course = training.courses.find(c => c.id === path[1])
    if (course) {
      const mod = path[2] ? course.modules.find(m => m.id === path[2]) : undefined
      const lesson = mod && path[3] ? mod.lessons.find(l => l.id === path[3]) : undefined
      if (path.length >= 4) return lesson?.quizzes[0] ? { status: 'ok', text: lesson.quizzes[0].text, title: `Quiz of ${lesson.title}` } : { status: 'missing', why: 'That lesson has no quiz.' }
      if (path.length === 3) return mod?.tests[0] ? { status: 'ok', text: mod.tests[0].text, title: `Test of ${mod.title}` } : { status: 'missing', why: 'That module has no test.' }
      return course.exams[0] ? { status: 'ok', text: course.exams[0].text, title: `Exam of ${course.title}` } : { status: 'missing', why: 'That course has no exam.' }
    }
  }
  if (!resources) return { status: 'pending' }
  const node = resources.nodes.find(n => n.id === path.join('/'))
  if (!node) return { status: 'missing', why: `There is no ${path.join(' › ')}.` }
  const kind = ASSESSMENT[node.kind]
  if (!kind) return { status: 'missing', why: `${node.name} holds no quiz, test or exam.` }
  return { status: 'ok', text: resources.assessments[node.id]?.text ?? '', title: `${kind} of ${node.name}` }
}

export function resolvePullIn(ref: string, ctx: LinkContext): PulledIn {
  const at = ref.trim()
  if (!at.startsWith('@')) return { status: 'missing', why: 'A question is pulled in by a link to its quiz, test or exam and its id (@path#id).' }
  const { token } = readLink(at, 0, false)
  if (token.path.length === 0) return { status: 'missing', why: 'It names no quiz, test or exam.' }
  if (!token.anchor) return { status: 'missing', why: 'It names no question (add # and its id).' }
  const found = assessmentAt(token.path, ctx.resources, ctx.training)
  if (found.status !== 'ok') return found
  const question = parseCached(found.text).blocks.find((b): b is QuestionBlock => b.kind === 'question' && b.id === token.anchor)
  return question ? { status: 'ok', question, from: found.title } : { status: 'missing', why: `There is no question ${token.anchor} in the ${found.title}.` }
}
