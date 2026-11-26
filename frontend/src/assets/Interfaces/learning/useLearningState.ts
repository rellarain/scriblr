import { useMemo } from 'react'
import type { TrainingState } from '../../../api/types'
import { useStoredState } from '../writer/storage'
import {
  DESK, openCourse, openExercise, openLesson, openModule, openProject, promote, resolvePath,
  type SizeOverrides, type LearningLevel, type LearningPath,
} from './learningPath'
import * as store from './learningStore'

// Learning was called Training, and what it keeps on users' machines is saved under that name: the keys keep it, so where each user is and how
// they arranged the levels and tiles survive the rename.
export const LEARNING_KEY_PREFIX = 'scriblr.training'

// What the levels work from: the courses and the learner's progress (from the backend, learningStore.ts), and where the user is in the levels
// (the open course, module, lesson and exercise or project) and the Min/Mid toggles of the levels, which are this machine's (LEARNING_KEY_PREFIX).
export function useLearningState(training: TrainingState, startAt: LearningPath = DESK) {
  const [stored, setPath] = useStoredState<LearningPath>(`${LEARNING_KEY_PREFIX}.path`, startAt)
  const [overrides, setOverrides] = useStoredState<SizeOverrides>(`${LEARNING_KEY_PREFIX}.levelSizes`, {})
  const { content, progress } = training
  // A stored path that names something no longer in the courses is cut to what is.
  const path = useMemo(() => resolvePath(stored, content), [stored, content])

  return {
    content,
    progress,
    path,
    overrides,
    isEnrolled: (courseId: string) => courseId in progress.enrolled,
    toggleEnrolled: (courseId: string) => { void (courseId in progress.enrolled ? store.leave(courseId) : store.enrol(courseId)) },
    isDone: (itemId: string) => itemId in progress.completed,
    toggleDone: (itemId: string) => { void store.setCompleted(itemId, !(itemId in progress.completed)) },
    showDesk: () => setPath(DESK),
    openCourse: (courseId: string) => setPath(openCourse(courseId)),
    openModule: (moduleId: string) => setPath(openModule(path, moduleId)),
    openLesson: (lessonId: string) => setPath(openLesson(path, lessonId)),
    openExercise: (exerciseId: string) => setPath(openExercise(path, exerciseId)),
    openProject: (projectId: string) => setPath(openProject(path, projectId)),
    promote: (level: LearningLevel) => setPath(promote(path, level)),
    setSize: (level: LearningLevel) => (size: 'min' | 'mid') => setOverrides(prev => ({ ...prev, [level]: size })),
  }
}

export type LearningState = ReturnType<typeof useLearningState>
