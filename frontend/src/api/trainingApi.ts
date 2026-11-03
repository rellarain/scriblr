import { api } from './client'
import type { TrainingContentDraft, TrainingState } from './types'

// Training: the courses and one learner's progress. Every call answers with the whole state.
export function getTraining(): Promise<TrainingState> {
  return api.get<TrainingState>('/training')
}

// Replaces the curricula and courses; the progress is kept, minus what names something that is gone.
export function saveTrainingContent(draft: TrainingContentDraft): Promise<TrainingState> {
  return api.put<TrainingState>('/training/content', draft)
}

export function enrol(courseId: string): Promise<TrainingState> {
  return api.put<TrainingState>(`/training/enrolments/${encodeURIComponent(courseId)}`, undefined)
}

export function leave(courseId: string): Promise<TrainingState> {
  return api.delete<TrainingState>(`/training/enrolments/${encodeURIComponent(courseId)}`)
}

// Marks a course, module, lesson, exercise or project complete (a quiz, test or exam is passed with an attempt).
export function setCompleted(itemId: string): Promise<TrainingState> {
  return api.put<TrainingState>(`/training/completions/${encodeURIComponent(itemId)}`, undefined)
}

export function clearCompleted(itemId: string): Promise<TrainingState> {
  return api.delete<TrainingState>(`/training/completions/${encodeURIComponent(itemId)}`)
}

// Keeps a result (a score, 0 to 100); one that reaches the pass mark marks the lesson, module or course it checks complete.
export function recordAttempt(assessmentId: string, score: number): Promise<TrainingState> {
  return api.post<TrainingState>(`/training/attempts/${encodeURIComponent(assessmentId)}`, { score })
}
