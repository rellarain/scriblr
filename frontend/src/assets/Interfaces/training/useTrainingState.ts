import { useMemo } from 'react'
import type { TrainingState as TrainingData } from '../../../api/types'
import { useStoredState } from '../writer/storage'
import {
  DESK, openCourse, openExercise, openLesson, openModule, openProject, promote, resolvePath,
  type SizeOverrides, type TrainingLevel, type TrainingPath,
} from './trainingPath'
import * as store from './trainingStore'

// What the levels work from: the courses and the learner's progress (from the backend, trainingStore.ts), and where the user is in the levels
// (the open course, module, lesson and exercise or project) and the Min/Mid toggles of the levels, which are this machine's (`scriblr.training.*`).
export function useTrainingState(training: TrainingData, startAt: TrainingPath = DESK) {
  const [stored, setPath] = useStoredState<TrainingPath>('scriblr.training.path', startAt)
  const [overrides, setOverrides] = useStoredState<SizeOverrides>('scriblr.training.levelSizes', {})
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
    promote: (level: TrainingLevel) => setPath(promote(path, level)),
    setSize: (level: TrainingLevel) => (size: 'min' | 'mid') => setOverrides(prev => ({ ...prev, [level]: size })),
  }
}

export type TrainingState = ReturnType<typeof useTrainingState>
