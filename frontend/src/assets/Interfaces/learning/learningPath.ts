import type { TrainingContent } from '../../../api/types'
import { courseById, lessonOf, moduleOf } from './learningContent'

// Where the user is in Learning: the open course, module, lesson and, deepest, the exercise or project being worked on. Learning is
// stacked levels (Desk, Course, Module, Lesson, Practice) like the Writer's; the levels shown are the ones on this path, the deepest
// has the focus (Max), the one above it is Mid and the rest Min (the same rule as writer/levels/levelSizes.ts).
export type LearningLevel = 'desk' | 'course' | 'module' | 'lesson' | 'practice'
export type WorkKind = 'exercise' | 'project'
export interface LearningPath {
  courseId: string | null
  moduleId: string | null
  lessonId: string | null
  work: { kind: WorkKind; id: string } | null
}
export type LevelSize = 'min' | 'mid' | 'max'
// A level's own Min/Mid toggle (the focused level is always Max).
export type SizeOverrides = Partial<Record<LearningLevel, 'min' | 'mid'>>

export const DESK: LearningPath = { courseId: null, moduleId: null, lessonId: null, work: null }
export const LEVELS: LearningLevel[] = ['desk', 'course', 'module', 'lesson', 'practice']

// The path cut to what exists in the courses: a module with no course, or an id the courses do not have, ends the path where it stops making sense.
export function resolvePath(p: LearningPath, content: TrainingContent): LearningPath {
  const course = courseById(content, p.courseId)
  if (!course) return DESK
  const mod = moduleOf(course, p.moduleId)
  const lesson = mod ? lessonOf(mod, p.lessonId) : undefined
  const base = { courseId: course.id, moduleId: mod?.id ?? null, lessonId: lesson?.id ?? null }
  const w = p.work
  if (!w) return { ...base, work: null }
  if (w.kind === 'project') return course.projects.some(x => x.id === w.id) ? { ...base, moduleId: null, lessonId: null, work: w } : { ...base, work: null }
  return lesson?.exercises.some(x => x.id === w.id) ? { ...base, work: w } : { ...base, work: null }
}

// The levels on the path, top-down.
export function levelsOf(p: LearningPath): LearningLevel[] {
  const out: LearningLevel[] = ['desk']
  if (!p.courseId) return out
  out.push('course')
  if (p.moduleId) out.push('module')
  if (p.moduleId && p.lessonId) out.push('lesson')
  if (p.work) out.push('practice')
  return out
}

export const focusOf = (p: LearningPath): LearningLevel => levelsOf(p).at(-1)!

// The size of each level shown: the deepest Max, the level above it Mid, the rest Min, unless the user toggled a level.
export function sizesFor(p: LearningPath, overrides: SizeOverrides = {}): Partial<Record<LearningLevel, LevelSize>> {
  const shown = levelsOf(p)
  const sizes: Partial<Record<LearningLevel, LevelSize>> = {}
  shown.forEach((level, i) => {
    const fromEnd = shown.length - 1 - i
    const base: LevelSize = fromEnd === 0 ? 'max' : fromEnd === 1 ? 'mid' : 'min'
    sizes[level] = fromEnd === 0 ? 'max' : overrides[level] ?? base
  })
  return sizes
}

export const openCourse = (courseId: string): LearningPath => ({ ...DESK, courseId })
export const openModule = (p: LearningPath, moduleId: string): LearningPath => ({ courseId: p.courseId, moduleId, lessonId: null, work: null })
export const openLesson = (p: LearningPath, lessonId: string): LearningPath => ({ courseId: p.courseId, moduleId: p.moduleId, lessonId, work: null })
export const openExercise = (p: LearningPath, id: string): LearningPath => ({ ...p, work: { kind: 'exercise', id } })
// A project belongs to the course, not to a lesson: opened from the course it skips the module and lesson levels.
export const openProject = (p: LearningPath, id: string): LearningPath => ({ courseId: p.courseId, moduleId: null, lessonId: null, work: { kind: 'project', id } })

// Bring a level to the focus: everything below it is closed.
export function promote(p: LearningPath, level: LearningLevel): LearningPath {
  switch (level) {
    case 'desk': return DESK
    case 'course': return { ...DESK, courseId: p.courseId }
    case 'module': return { ...p, lessonId: null, work: null }
    case 'lesson': return { ...p, work: null }
    case 'practice': return p
  }
}
