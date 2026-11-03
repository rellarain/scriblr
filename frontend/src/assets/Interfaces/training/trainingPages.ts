// The pages of the Training interface and what each is, in the words shown on it (the first line of its tab, and under a level folded to Min).
export type TrainingPageKey =
  | 'desk' | 'catalog' | 'course' | 'curriculum' | 'module' | 'lesson' | 'exercise' | 'quizzes' | 'tests' | 'exams' | 'project'

export const TRAINING_PAGES: Record<TrainingPageKey, { label: string; definition: string }> = {
  desk: { label: 'Desk', definition: 'Your training dash, with all the courses you are enrolled in.' },
  catalog: { label: 'Catalog', definition: 'All the courses, grouped in the curricula they belong to.' },
  course: { label: 'Course', definition: 'One course’s content: its exam, modules and tests, lessons and quizzes, exercises and projects.' },
  curriculum: { label: 'Curriculum', definition: 'A collection of courses.' },
  module: { label: 'Module', definition: 'A collection of specific topics within a course.' },
  lesson: { label: 'Lesson', definition: 'Focused learning material on a specific topic within a module.' },
  exercise: { label: 'Exercise', definition: 'Repeated practice on specific tasks.' },
  quizzes: { label: 'Quizzes', definition: 'Learning checks for the content of a lesson, to mark it complete.' },
  tests: { label: 'Tests', definition: 'Learning checks for the content of a module.' },
  exams: { label: 'Exams', definition: 'Learning checks for the content of a course.' },
  project: { label: 'Project', definition: 'A system of exercises within a course that produces a working product on completion.' },
}
