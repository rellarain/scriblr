import type { TrainingAttempt, TrainingContent, TrainingCourse, TrainingCurriculum, TrainingExercise, TrainingLesson, TrainingModule, TrainingProgress, TrainingProject } from '../../../api/types'

// Looking things up in Training's courses, and what the learner's progress says about them. Pure: the content and the progress are passed in.

export type TrainingItemKind = 'curriculum' | 'course' | 'module' | 'lesson' | 'exercise' | 'project' | 'quiz' | 'test' | 'exam'
// What can be marked complete by hand (an assessment is passed with an attempt).
export const COMPLETABLE: TrainingItemKind[] = ['course', 'module', 'lesson', 'exercise', 'project']

// Every id in the courses: what it is and what it sits in (a quiz sits in a lesson, a test in a module, an exam in a course).
export function indexOf(content: TrainingContent): Map<string, { kind: TrainingItemKind; parent: string | null }> {
  const out = new Map<string, { kind: TrainingItemKind; parent: string | null }>()
  for (const c of content.curricula) out.set(c.id, { kind: 'curriculum', parent: null })
  for (const course of content.courses) {
    out.set(course.id, { kind: 'course', parent: null })
    for (const m of course.modules) {
      out.set(m.id, { kind: 'module', parent: course.id })
      for (const t of m.tests) out.set(t.id, { kind: 'test', parent: m.id })
      for (const l of m.lessons) {
        out.set(l.id, { kind: 'lesson', parent: m.id })
        for (const e of l.exercises) out.set(e.id, { kind: 'exercise', parent: l.id })
        for (const q of l.quizzes) out.set(q.id, { kind: 'quiz', parent: l.id })
      }
    }
    for (const p of course.projects) out.set(p.id, { kind: 'project', parent: course.id })
    for (const x of course.exams) out.set(x.id, { kind: 'exam', parent: course.id })
  }
  return out
}

export const courseById = (content: TrainingContent, id: string | null): TrainingCourse | undefined => content.courses.find(c => c.id === id)
export const moduleOf = (course: TrainingCourse | undefined, id: string | null): TrainingModule | undefined => course?.modules.find(m => m.id === id)
export const lessonOf = (mod: TrainingModule | undefined, id: string | null): TrainingLesson | undefined => mod?.lessons.find(l => l.id === id)
export const exerciseOf = (lesson: TrainingLesson | undefined, id: string | null): TrainingExercise | undefined => lesson?.exercises.find(e => e.id === id)
export const projectOf = (course: TrainingCourse | undefined, id: string | null): TrainingProject | undefined => course?.projects.find(p => p.id === id)

// The curricula a course is in, in the curricula's order.
export const curriculaOf = (content: TrainingContent, courseId: string): TrainingCurriculum[] => content.curricula.filter(c => c.courseIds.includes(courseId))

// The courses that are in no curriculum.
export function looseCourses(content: TrainingContent): TrainingCourse[] {
  const named = new Set(content.curricula.flatMap(c => c.courseIds))
  return content.courses.filter(c => !named.has(c.id))
}

// A course's colour: its own, else its first curriculum's, else none (the theme's).
export function courseHue(content: TrainingContent, course: TrainingCourse | undefined): number | undefined {
  if (!course) return undefined
  return course.hue ?? curriculaOf(content, course.id).find(c => c.hue !== null)?.hue ?? undefined
}

export interface CourseProgress {
  lessons: number; lessonsDone: number
  modules: number; modulesDone: number
  exercises: number; exercisesDone: number
  projects: number; projectsDone: number
}

export function courseProgress(course: TrainingCourse, progress: TrainingProgress): CourseProgress {
  const done = (id: string) => id in progress.completed
  const lessons = course.modules.flatMap(m => m.lessons)
  const exercises = lessons.flatMap(l => l.exercises)
  return {
    lessons: lessons.length, lessonsDone: lessons.filter(l => done(l.id)).length,
    modules: course.modules.length, modulesDone: course.modules.filter(m => done(m.id)).length,
    exercises: exercises.length, exercisesDone: exercises.filter(e => done(e.id)).length,
    projects: course.projects.length, projectsDone: course.projects.filter(p => done(p.id)).length,
  }
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

// "2 of 5 lessons complete", or "Complete" when the course is marked so.
export function progressText(course: TrainingCourse, progress: TrainingProgress): string {
  const p = courseProgress(course, progress)
  if (course.id in progress.completed) return 'Complete'
  if (p.lessons === 0) return 'No lessons yet'
  return `${p.lessonsDone} of ${plural(p.lessons, 'lesson')} complete`
}

export interface AssessmentResult { attempts: number; best: number | null; latest: TrainingAttempt | null; passed: boolean }

export function assessmentResult(progress: TrainingProgress, id: string): AssessmentResult {
  const attempts = progress.attempts[id] ?? []
  return {
    attempts: attempts.length,
    best: attempts.length ? Math.max(...attempts.map(a => a.score)) : null,
    latest: attempts.at(-1) ?? null,
    passed: attempts.some(a => a.passed),
  }
}

// "Not tried yet", "Best 80%, passed", "Best 40%, not passed".
export function resultText(result: AssessmentResult): string {
  if (result.best === null) return 'Not tried yet'
  const best = `${Math.round(result.best * 10) / 10}%`
  return `Best ${best}, ${result.passed ? 'passed' : 'not passed'}`
}
