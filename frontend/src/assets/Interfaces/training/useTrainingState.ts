import { useMemo } from 'react'
import { useStoredState } from '../writer/storage'
import {
  DESK, openCourse, openExercise, openLesson, openModule, openProject, promote, resolvePath,
  type SizeOverrides, type TrainingLevel, type TrainingPath,
} from './trainingPath'

// Training's own state, kept on this machine like the Writer's (`scriblr.training.*`): where the user is (the open course, module, lesson
// and exercise or project), the courses enrolled in, and the Min/Mid toggles of the levels.
export function useTrainingState(startAt: TrainingPath = DESK) {
  const [stored, setPath] = useStoredState<TrainingPath>('scriblr.training.path', startAt)
  const [enrolled, setEnrolled] = useStoredState<string[]>('scriblr.training.enrolled', [])
  const [overrides, setOverrides] = useStoredState<SizeOverrides>('scriblr.training.levelSizes', {})
  // A stored path that names something no longer there is cut to what is.
  const path = useMemo(() => resolvePath(stored), [stored])

  return {
    path,
    enrolled,
    overrides,
    isEnrolled: (courseId: string) => enrolled.includes(courseId),
    toggleEnrolled: (courseId: string) => setEnrolled(prev => (prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId])),
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
