import type { TrainingAttempt, TrainingContent, TrainingContentDraft, TrainingCourse, TrainingProgress, TrainingState } from '../api/types'
import { COMPLETABLE, indexOf } from '../assets/Interfaces/training/trainingContent'
import type { MockAnswer } from './mockPresets'

// A pretend Training API (`/api/training`), shared by the design system's previews (mockBackend.ts) and the tests (test/trainingBackend.ts): the
// courses and one learner's progress live in memory and answer the way the server does, every route with the whole state. A route returns its
// status and JSON body. The first load is seeded as the backend seeds it: five curricula, a placeholder course each.

const ok = (body: unknown): MockAnswer => ({ status: 200, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'

const SEED: Array<[string, string, number]> = [['user', 'User', 200], ['reader', 'Reader', 280], ['translator', 'Translator', 160], ['writer', 'Writer', 30], ['admin', 'Admin', 340]]

export function seedContent(): TrainingContent {
  const courses: TrainingCourse[] = []
  const curricula = SEED.map(([key, role, hue]) => {
    const c = `${key}-c1`, m = `${c}-m1`, l = `${m}-l1`
    courses.push({
      id: c, title: `${role} Course 1`, description: `The first ${role.toLowerCase()} course.`, hue: null,
      modules: [{
        id: m, title: 'Module 1', description: 'Placeholder module.',
        lessons: [{
          id: l, title: 'Lesson 1', description: 'Placeholder lesson.', body: `# Lesson 1\n\nPlaceholder material for the ${role.toLowerCase()} course.`,
          exercises: [{ id: `${l}-e1`, title: 'Exercise 1', description: 'Placeholder exercise.' }],
          quizzes: [{ id: `${l}-q1`, title: 'Quiz 1', description: 'Placeholder quiz.', passMark: 70 }],
        }],
        tests: [{ id: `${m}-t1`, title: 'Test 1', description: 'Placeholder test.', passMark: 70 }],
      }],
      projects: [{ id: `${c}-p1`, title: 'Project 1', description: 'Placeholder project.', exerciseIds: [`${l}-e1`] }],
      exams: [{ id: `${c}-x1`, title: 'Exam 1', description: 'Placeholder exam.', passMark: 70 }],
    })
    return { id: key, title: `${role} Training`, description: `Access ${role.toLowerCase()} training resources here.`, hue, courseIds: [c] }
  })
  return { schemaVersion: 1, curricula, courses }
}

export const emptyProgress = (): TrainingProgress => ({ schemaVersion: 1, enrolled: {}, completed: {}, attempts: {} })

const ASSESSMENT_KINDS = ['quiz', 'test', 'exam']

export function createMockTraining(initial: TrainingContent = seedContent(), progress: TrainingProgress = emptyProgress()) {
  const state: TrainingState = { content: structuredClone(initial), progress: structuredClone(progress) }
  const snapshot = () => structuredClone(state)

  // `parts` is the path after `/training`: [], ['content'], ['enrolments', id], ['completions', id], ['attempts', id].
  function route(method: string, parts: string[], body: unknown): MockAnswer {
    const [what, id] = parts
    const index = indexOf(state.content)
    if (parts.length === 0 && method === 'GET') return ok(snapshot())
    if (what === 'content' && method === 'PUT') {
      const draft = body as TrainingContentDraft
      state.content = { schemaVersion: 1, curricula: structuredClone(draft.curricula), courses: structuredClone(draft.courses) }
      const kept = indexOf(state.content)
      const kind = (i: string) => kept.get(i)?.kind
      state.progress.enrolled = Object.fromEntries(Object.entries(state.progress.enrolled).filter(([i]) => kind(i) === 'course'))
      state.progress.completed = Object.fromEntries(Object.entries(state.progress.completed).filter(([i]) => COMPLETABLE.includes(kind(i)!)))
      state.progress.attempts = Object.fromEntries(Object.entries(state.progress.attempts).filter(([i]) => ASSESSMENT_KINDS.includes(kind(i)!)))
      return ok(snapshot())
    }
    if (!id) return fail(404, 'unknown training route')
    const found = index.get(id)
    if (what === 'enrolments') {
      if (!found) return fail(404, `no course '${id}'`)
      if (found.kind !== 'course') return fail(422, `'${id}' is a ${found.kind}, not a course`)
      if (method === 'PUT') state.progress.enrolled[id] ??= AT
      else if (method === 'DELETE') delete state.progress.enrolled[id]
      else return fail(405, 'method not allowed')
      return ok(snapshot())
    }
    if (what === 'completions') {
      if (!found) return fail(404, `no item '${id}'`)
      if (!COMPLETABLE.includes(found.kind)) return fail(422, `'${id}' is a ${found.kind}, not a course, module, lesson, exercise or project`)
      if (method === 'PUT') state.progress.completed[id] ??= AT
      else if (method === 'DELETE') delete state.progress.completed[id]
      else return fail(405, 'method not allowed')
      return ok(snapshot())
    }
    if (what === 'attempts' && method === 'POST') {
      if (!found) return fail(404, `no assessment '${id}'`)
      if (!ASSESSMENT_KINDS.includes(found.kind)) return fail(422, `'${id}' is a ${found.kind}, not a quiz, test or exam`)
      const score = (body as { score?: number } | undefined)?.score
      if (typeof score !== 'number' || score < 0 || score > 100) return fail(422, 'a score is 0 to 100')
      const all = state.content.courses.flatMap(c => [...c.exams, ...c.modules.flatMap(m => [...m.tests, ...m.lessons.flatMap(l => l.quizzes)])])
      const mark = all.find(a => a.id === id)?.passMark ?? 70
      const attempt: TrainingAttempt = { score, passed: score >= mark, at: AT }
      state.progress.attempts[id] = [...(state.progress.attempts[id] ?? []), attempt].slice(-20)
      if (attempt.passed && found.parent) state.progress.completed[found.parent] ??= AT
      return ok(snapshot())
    }
    return fail(404, 'unknown training route')
  }

  return { state, route }
}
