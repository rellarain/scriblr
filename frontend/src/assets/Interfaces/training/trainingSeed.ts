// The courses of the Training interface until a data model exists. A curriculum is a collection of courses: the five that were the pages of the User
// panel's Training console (User, Reader, Translator, Writer, Admin) are curricula here, each with one placeholder course, and each course with one
// placeholder module, lesson, exercise and project, so every level can be opened.
// Nothing here is stored: enrolment and where the user is are (`useTrainingState.ts`).
export interface TrainingExercise { id: string; title: string }
export interface TrainingLesson { id: string; title: string; exercises: TrainingExercise[] }
export interface TrainingModule { id: string; title: string; lessons: TrainingLesson[] }
export interface TrainingProject { id: string; title: string }
export interface TrainingCourse {
  id: string
  title: string
  blurb: string
  curriculumId: string
  // The colour of the course's levels (a hue, 0-360): its curriculum's.
  hue: number
  modules: TrainingModule[]
  projects: TrainingProject[]
}
export interface TrainingCurriculum {
  id: string
  title: string
  blurb: string
  hue: number
  courses: TrainingCourse[]
}

const curriculum = (id: string, role: string, hue: number): TrainingCurriculum => ({
  id, title: `${role} Training`, blurb: `Access ${role.toLowerCase()} training resources here.`, hue,
  courses: [{
    id: `${id}-c1`, title: `${role} Course 1`, blurb: `The first ${role.toLowerCase()} course.`, curriculumId: id, hue,
    modules: [{ id: `${id}-c1-m1`, title: 'Module 1', lessons: [{ id: `${id}-c1-m1-l1`, title: 'Lesson 1', exercises: [{ id: `${id}-c1-m1-l1-e1`, title: 'Exercise 1' }] }] }],
    projects: [{ id: `${id}-c1-p1`, title: 'Project 1' }],
  }],
})

export const CURRICULA: TrainingCurriculum[] = [
  curriculum('user', 'User', 200),
  curriculum('reader', 'Reader', 280),
  curriculum('translator', 'Translator', 160),
  curriculum('writer', 'Writer', 30),
  curriculum('admin', 'Admin', 340),
]

export const COURSES: TrainingCourse[] = CURRICULA.flatMap(c => c.courses)

export const courseById = (id: string | null): TrainingCourse | undefined => COURSES.find(c => c.id === id)
export const moduleOf = (c: TrainingCourse | undefined, id: string | null): TrainingModule | undefined => c?.modules.find(m => m.id === id)
export const lessonOf = (m: TrainingModule | undefined, id: string | null): TrainingLesson | undefined => m?.lessons.find(l => l.id === id)
