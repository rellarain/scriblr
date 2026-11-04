import type { TrainingContent, TrainingContentDraft, TrainingCourse, TrainingCurriculum, TrainingLesson, TrainingModule } from '../../../../api/types'
import { indexOf, type TrainingItemKind } from '../../training/trainingContent'
import { moveBefore, nudge } from '../plot/presetModel'

// The Instructor console's model, pure: the Training courses as the builder edits them (the draft the server saves whole), the operations on it, and
// what the server would refuse. Every operation returns a new draft (the old one is left as it was), or the same draft when there is nothing to do.
// An id is the key of what a learner did (enrolled, completed, results), so it is made once and never changed: a move keeps it, a rename changes the title.

export type Draft = TrainingContentDraft
export type Kind = TrainingItemKind
export type MakeRandom = () => number

export const LIMITS = { curricula: 50, courses: 500, modules: 100, lessons: 200, exercises: 100, projects: 50, assessments: 50 } as const
export const FIELD_MAX = { title: 200, description: 2000, body: 100_000 } as const

export const KIND_LABEL: Record<Kind, string> = {
  curriculum: 'Curriculum', course: 'Course', module: 'Module', lesson: 'Lesson', exercise: 'Exercise', project: 'Project', quiz: 'Quiz', test: 'Test', exam: 'Exam',
}

export const draftOf = (content: TrainingContent): Draft => ({ curricula: content.curricula, courses: content.courses })

// What can be added inside each kind of thing (a new course may also be made inside a curriculum).
export const CHILD_KINDS: Partial<Record<Kind, Kind[]>> = {
  curriculum: ['course'], course: ['module', 'project', 'exam'], module: ['lesson', 'test'], lesson: ['exercise', 'quiz'],
}

// ---- ids ----

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function takenIds(draft: Draft): Set<string> {
  return new Set(indexOf({ schemaVersion: 1, ...draft }).keys())
}

// `<kind>-<six characters>`, one no other item has (ids are unique across the whole of the courses).
export function newId(kind: Kind, taken: Set<string>, random: MakeRandom = Math.random): string {
  for (;;) {
    let tail = ''
    for (let i = 0; i < 6; i++) tail += CHARS[Math.floor(random() * CHARS.length) % CHARS.length]
    const id = `${kind}-${tail}`
    if (!taken.has(id)) return id
  }
}

// ---- finding things ----

interface Located {
  kind: Kind
  // The thing itself, in the draft it was found in.
  item: { id: string; title: string }
  // The id of what holds it (null for a curriculum and a course).
  parentId: string | null
  // The list it is in, and where to put a changed list back.
  list: Array<{ id: string }>
  put: (list: Array<{ id: string }>) => void
}

function locate(draft: Draft, id: string): Located | null {
  const curriculum = draft.curricula.find(c => c.id === id)
  if (curriculum) return { kind: 'curriculum', item: curriculum, parentId: null, list: draft.curricula, put: l => { draft.curricula = l as TrainingCurriculum[] } }
  for (const course of draft.courses) {
    if (course.id === id) return { kind: 'course', item: course, parentId: null, list: draft.courses, put: l => { draft.courses = l as TrainingCourse[] } }
    const inCourse = (kind: Kind, key: 'projects' | 'exams'): Located | null => {
      const item = course[key].find(x => x.id === id)
      return item ? { kind, item, parentId: course.id, list: course[key], put: l => { course[key] = l as never } } : null
    }
    const found = inCourse('project', 'projects') ?? inCourse('exam', 'exams')
    if (found) return found
    for (const mod of course.modules) {
      if (mod.id === id) return { kind: 'module', item: mod, parentId: course.id, list: course.modules, put: l => { course.modules = l as TrainingModule[] } }
      const test = mod.tests.find(x => x.id === id)
      if (test) return { kind: 'test', item: test, parentId: mod.id, list: mod.tests, put: l => { mod.tests = l as never } }
      for (const lesson of mod.lessons) {
        if (lesson.id === id) return { kind: 'lesson', item: lesson, parentId: mod.id, list: mod.lessons, put: l => { mod.lessons = l as TrainingLesson[] } }
        const exercise = lesson.exercises.find(x => x.id === id)
        if (exercise) return { kind: 'exercise', item: exercise, parentId: lesson.id, list: lesson.exercises, put: l => { lesson.exercises = l as never } }
        const quiz = lesson.quizzes.find(x => x.id === id)
        if (quiz) return { kind: 'quiz', item: quiz, parentId: lesson.id, list: lesson.quizzes, put: l => { lesson.quizzes = l as never } }
      }
    }
  }
  return null
}

export const kindOf = (draft: Draft, id: string): Kind | null => locate(draft, id)?.kind ?? null

export function find(draft: Draft, id: string): { kind: Kind; item: { id: string; title: string }; parentId: string | null } | null {
  const found = locate(draft, id)
  return found ? { kind: found.kind, item: found.item, parentId: found.parentId } : null
}

export const labelOf = (kind: Kind, title: string): string => title.trim() || `Untitled ${KIND_LABEL[kind].toLowerCase()}`

const clone = (draft: Draft): Draft => structuredClone(draft)

// ---- adding ----

const count = (n: number, cap: number, what: string): string | null => (n >= cap ? `There can be at most ${cap} ${what} here.` : null)

// Why a thing of this kind cannot be added inside `parentId` (a cap), or null when it can.
export function canAdd(draft: Draft, kind: Kind, parentId: string | null): string | null {
  switch (kind) {
    case 'curriculum': return count(draft.curricula.length, LIMITS.curricula, 'curricula')
    case 'course': return count(draft.courses.length, LIMITS.courses, 'courses in all')
    default: {
      const parent = parentId ? locate(draft, parentId) : null
      if (!parent) return 'There is nothing to add it to.'
      const course = parent.item as TrainingCourse, mod = parent.item as TrainingModule, lesson = parent.item as TrainingLesson
      if (kind === 'module') return count(course.modules.length, LIMITS.modules, 'modules')
      if (kind === 'project') return count(course.projects.length, LIMITS.projects, 'projects')
      if (kind === 'exam') return count(course.exams.length, LIMITS.assessments, 'exams')
      if (kind === 'lesson') return count(mod.lessons.length, LIMITS.lessons, 'lessons')
      if (kind === 'test') return count(mod.tests.length, LIMITS.assessments, 'tests')
      if (kind === 'exercise') return count(lesson.exercises.length, LIMITS.exercises, 'exercises')
      return count(lesson.quizzes.length, LIMITS.assessments, 'quizzes')
    }
  }
}

// A new item of `kind`, last in its list, with a title that is not blank (the server refuses a blank one). A new course made inside a curriculum joins
// it. Returns the new draft and the new id (the draft itself when it could not be added).
export function add(draft: Draft, kind: Kind, parentId: string | null, random: MakeRandom = Math.random): { draft: Draft; id: string | null } {
  if (canAdd(draft, kind, parentId)) return { draft, id: null }
  const next = clone(draft)
  const id = newId(kind, takenIds(next), random)
  const title = `New ${KIND_LABEL[kind].toLowerCase()}`
  if (kind === 'curriculum') next.curricula.push({ id, title, description: '', hue: null, courseIds: [] })
  else if (kind === 'course') {
    next.courses.push({ id, title, description: '', hue: null, modules: [], projects: [], exams: [] })
    const curriculum = parentId ? next.curricula.find(c => c.id === parentId) : undefined
    if (curriculum) curriculum.courseIds.push(id)
  } else {
    const parent = locate(next, parentId as string)!.item as TrainingCourse & TrainingModule & TrainingLesson
    if (kind === 'module') parent.modules.push({ id, title, description: '', lessons: [], tests: [] })
    else if (kind === 'project') parent.projects.push({ id, title, description: '', exerciseIds: [] })
    else if (kind === 'exam') parent.exams.push({ id, title, description: '', passMark: 70 })
    else if (kind === 'lesson') parent.lessons.push({ id, title, description: '', body: '', exercises: [], quizzes: [] })
    else if (kind === 'test') parent.tests.push({ id, title, description: '', passMark: 70 })
    else if (kind === 'exercise') parent.exercises.push({ id, title, description: '' })
    else parent.quizzes.push({ id, title, description: '', passMark: 70 })
  }
  return { draft: next, id }
}

// ---- changing ----

export interface Fields { title: string; description: string; hue: number | null; body: string; passMark: number }

export function patch(draft: Draft, id: string, fields: Partial<Fields>): Draft {
  const next = clone(draft)
  const found = locate(next, id)
  if (!found) return draft
  Object.assign(found.item, fields)
  return next
}

// What the server refuses and a change can leave behind: a curriculum naming a course that is gone, a project naming an exercise its course no longer has.
function pruneReferences(draft: Draft): void {
  const courses = new Set(draft.courses.map(c => c.id))
  for (const curriculum of draft.curricula) curriculum.courseIds = curriculum.courseIds.filter(id => courses.has(id))
  for (const course of draft.courses) {
    const exercises = new Set(course.modules.flatMap(m => m.lessons.flatMap(l => l.exercises.map(e => e.id))))
    for (const project of course.projects) project.exerciseIds = project.exerciseIds.filter(id => exercises.has(id))
  }
}

// Deleting a curriculum leaves its courses (they are in no curriculum then); deleting a course, module, lesson or exercise takes what is inside it, and
// takes it out of what names it (a curriculum's courses, a project's exercises).
export function remove(draft: Draft, id: string): Draft {
  const next = clone(draft)
  const found = locate(next, id)
  if (!found) return draft
  found.put(found.list.filter(x => x.id !== id))
  pruneReferences(next)
  return next
}

// ---- ordering ----

// Move an item before another of the same list (null = to the end).
export function moveItem(draft: Draft, id: string, beforeId: string | null): Draft {
  const next = clone(draft)
  const found = locate(next, id)
  if (!found) return draft
  const list = moveBefore(found.list, id, beforeId)
  if (list === found.list) return draft
  found.put(list)
  return next
}

// One place up or down in its list.
export function nudgeItem(draft: Draft, id: string, dir: -1 | 1): Draft {
  const next = clone(draft)
  const found = locate(next, id)
  if (!found) return draft
  const list = nudge(found.list, id, dir)
  if (list === found.list) return draft
  found.put(list)
  return next
}

const moveKey = (list: string[], id: string, before: string | null): string[] => {
  if (!list.includes(id) || id === before) return list
  const rest = list.filter(x => x !== id)
  const at = before ? rest.indexOf(before) : -1
  return at >= 0 ? [...rest.slice(0, at), id, ...rest.slice(at)] : [...rest, id]
}

// The ids a curriculum (its courses) or a project (its exercises) names, in order.
export function reorderRefs(draft: Draft, ownerId: string, refId: string, beforeId: string | null): Draft {
  const next = clone(draft)
  const owner = locate(next, ownerId)?.item as { courseIds?: string[]; exerciseIds?: string[] } | undefined
  const key = owner?.courseIds ? 'courseIds' : owner?.exerciseIds ? 'exerciseIds' : null
  if (!owner || !key) return draft
  const list = owner[key] as string[]
  const moved = moveKey(list, refId, beforeId)
  if (moved === list) return draft
  owner[key] = moved
  return next
}

export function nudgeRef(draft: Draft, ownerId: string, refId: string, dir: -1 | 1): Draft {
  const owner = locate(draft, ownerId)?.item as { courseIds?: string[]; exerciseIds?: string[] } | undefined
  const list = owner?.courseIds ?? owner?.exerciseIds
  if (!list) return draft
  const at = list.indexOf(refId)
  const to = at + dir
  if (at < 0 || to < 0 || to >= list.length) return draft
  return reorderRefs(draft, ownerId, refId, dir < 0 ? list[to] : list[to + 1] ?? null)
}

// ---- what a curriculum and a project name ----

export function setMembership(draft: Draft, courseId: string, curriculumId: string, on: boolean): Draft {
  const curriculum = draft.curricula.find(c => c.id === curriculumId)
  if (!curriculum || !draft.courses.some(c => c.id === courseId) || curriculum.courseIds.includes(courseId) === on) return draft
  if (on && curriculum.courseIds.length >= LIMITS.courses) return draft
  const next = clone(draft)
  const target = next.curricula.find(c => c.id === curriculumId)!
  target.courseIds = on ? [...target.courseIds, courseId] : target.courseIds.filter(id => id !== courseId)
  return next
}

export function setProjectExercises(draft: Draft, projectId: string, exerciseIds: string[]): Draft {
  const next = clone(draft)
  const found = locate(next, projectId)
  if (!found || found.kind !== 'project') return draft
  ;(found.item as unknown as { exerciseIds: string[] }).exerciseIds = exerciseIds.slice(0, LIMITS.exercises)
  return next
}

// A course's exercises, with the lesson each is in: what a project can be made of.
export function exercisesOfCourse(course: TrainingCourse): Array<{ id: string; title: string; lessonTitle: string; moduleTitle: string }> {
  return course.modules.flatMap(m => m.lessons.flatMap(l => l.exercises.map(e => ({ id: e.id, title: e.title, lessonTitle: l.title, moduleTitle: m.title }))))
}

// ---- moving to another parent ----

const PARENT_KIND: Partial<Record<Kind, Kind>> = { module: 'course', lesson: 'module', exercise: 'lesson', quiz: 'lesson', test: 'module', project: 'course', exam: 'course' }

// Where an item can be moved to (never where it is): the other courses for a module, project or exam, the modules of every course for a lesson or a test, the
// lessons for an exercise or a quiz, each with the path to it. A curriculum and a course are not moved: a course is put in curricula (setMembership).
export function parentChoices(draft: Draft, id: string): Array<{ id: string; label: string }> {
  const found = locate(draft, id)
  const want = found ? PARENT_KIND[found.kind] : undefined
  if (!found || !want) return []
  const out: Array<{ id: string; label: string }> = []
  for (const course of draft.courses) {
    const c = labelOf('course', course.title)
    if (want === 'course') out.push({ id: course.id, label: c })
    for (const mod of course.modules) {
      const m = `${c} › ${labelOf('module', mod.title)}`
      if (want === 'module') out.push({ id: mod.id, label: m })
      if (want === 'lesson') for (const lesson of mod.lessons) out.push({ id: lesson.id, label: `${m} › ${labelOf('lesson', lesson.title)}` })
    }
  }
  return out.filter(o => o.id !== found.parentId)
}

const LIST_KEY: Partial<Record<Kind, string>> = { module: 'modules', lesson: 'lessons', exercise: 'exercises', quiz: 'quizzes', test: 'tests', project: 'projects', exam: 'exams' }

// Move an item to the end of another parent's list of the same kind. Its id (and what it holds) stays, so what learners did is kept; what named it from
// the course it left (a project naming an exercise) stops naming it.
export function moveTo(draft: Draft, id: string, parentId: string): Draft {
  if (!parentChoices(draft, id).some(c => c.id === parentId)) return draft
  const next = clone(draft)
  const found = locate(next, id)!
  const key = LIST_KEY[found.kind]!
  const target = locate(next, parentId)!.item as unknown as Record<string, Array<{ id: string }>>
  const moving = found.list.find(x => x.id === id)!
  const cap = key === 'modules' ? LIMITS.modules : key === 'lessons' ? LIMITS.lessons : key === 'exercises' ? LIMITS.exercises : key === 'projects' ? LIMITS.projects : LIMITS.assessments
  if (target[key].length >= cap) return draft
  found.put(found.list.filter(x => x.id !== id))
  // (`found.put` replaced the list inside its owner; the target is another owner, so its list is read again.)
  const refreshed = locate(next, parentId)!.item as unknown as Record<string, Array<{ id: string }>>
  refreshed[key] = [...refreshed[key], moving]
  pruneReferences(next)
  return next
}

// Nothing has been written in it yet: the title it was made with (or none), no description or material, and nothing inside or named. Deleting such an
// item needs no confirmation.
export function isBlank(draft: Draft, id: string): boolean {
  const found = locate(draft, id)
  if (!found) return false
  const item = found.item as unknown as Record<string, unknown>
  const title = String(item.title).trim()
  if (title !== '' && title !== `New ${KIND_LABEL[found.kind].toLowerCase()}`) return false
  if (item.description !== '' || (typeof item.body === 'string' && item.body !== '')) return false
  for (const key of ['courseIds', 'modules', 'projects', 'exams', 'lessons', 'tests', 'exercises', 'quizzes', 'exerciseIds']) {
    const list = item[key]
    if (Array.isArray(list) && list.length > 0) return false
  }
  return true
}

// ---- what the server would refuse ----

export interface Fault { id: string; message: string }

// A blank title is the one thing an edit can leave that the server refuses (every other limit is held by the page: lengths, pass marks, caps).
export function faults(draft: Draft): Fault[] {
  const out: Fault[] = []
  const check = (kind: Kind, item: { id: string; title: string }) => { if (item.title.trim() === '') out.push({ id: item.id, message: `${KIND_LABEL[kind]} needs a title.` }) }
  for (const c of draft.curricula) check('curriculum', c)
  for (const course of draft.courses) {
    check('course', course)
    course.projects.forEach(p => check('project', p))
    course.exams.forEach(x => check('exam', x))
    for (const mod of course.modules) {
      check('module', mod)
      mod.tests.forEach(t => check('test', t))
      for (const lesson of mod.lessons) {
        check('lesson', lesson)
        lesson.exercises.forEach(e => check('exercise', e))
        lesson.quizzes.forEach(q => check('quiz', q))
      }
    }
  }
  return out
}

// A course's colour for the editor: its own hue, else its first curriculum's (null when neither has one).
export function inheritedHue(draft: Draft, courseId: string): number | null {
  return draft.curricula.find(c => c.courseIds.includes(courseId) && c.hue !== null)?.hue ?? null
}
