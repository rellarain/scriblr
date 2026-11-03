import { describe, expect, it } from 'vitest'
import { seedContent } from '../../../designSystem/mockTraining'
import { DESK, focusOf, levelsOf, openCourse, openExercise, openLesson, openModule, openProject, promote, resolvePath, sizesFor } from './trainingPath'

const content = seedContent()
const lesson = () => openLesson(openModule(openCourse('writer-c1'), 'writer-c1-m1'), 'writer-c1-m1-l1')

describe('the levels on the path', () => {
  it('is the Desk alone until a course is open, then adds a level for each thing opened', () => {
    expect(levelsOf(DESK)).toEqual(['desk'])
    expect(levelsOf(openCourse('writer-c1'))).toEqual(['desk', 'course'])
    expect(levelsOf(openModule(openCourse('writer-c1'), 'writer-c1-m1'))).toEqual(['desk', 'course', 'module'])
    expect(levelsOf(lesson())).toEqual(['desk', 'course', 'module', 'lesson'])
    expect(levelsOf(openExercise(lesson(), 'writer-c1-m1-l1-e1'))).toEqual(['desk', 'course', 'module', 'lesson', 'practice'])
  })

  it('takes a project straight from the course to Practice, with no module or lesson on its path', () => {
    const p = openProject(lesson(), 'writer-c1-p1')
    expect(p).toEqual({ courseId: 'writer-c1', moduleId: null, lessonId: null, work: { kind: 'project', id: 'writer-c1-p1' } })
    expect(levelsOf(p)).toEqual(['desk', 'course', 'practice'])
    expect(focusOf(p)).toBe('practice')
  })

  it('closes what is below the level opened', () => {
    expect(openModule(lesson(), 'writer-c1-m1').lessonId).toBeNull()
    expect(openCourse('reader-c1')).toEqual({ ...DESK, courseId: 'reader-c1' })
    const deep = openExercise(lesson(), 'writer-c1-m1-l1-e1')
    expect(promote(deep, 'lesson').work).toBeNull()
    expect(levelsOf(promote(deep, 'module'))).toEqual(['desk', 'course', 'module'])
    expect(levelsOf(promote(deep, 'course'))).toEqual(['desk', 'course'])
    expect(promote(deep, 'desk')).toEqual(DESK)
    expect(promote(deep, 'practice')).toBe(deep)
  })
})

describe('the size of each level', () => {
  it('gives the deepest level Max, the one above it Mid and the rest Min', () => {
    expect(sizesFor(DESK)).toEqual({ desk: 'max' })
    expect(sizesFor(openCourse('writer-c1'))).toEqual({ desk: 'mid', course: 'max' })
    expect(sizesFor(lesson())).toEqual({ desk: 'min', course: 'min', module: 'mid', lesson: 'max' })
  })

  it('lets a level above the focus be toggled, never the focused one', () => {
    expect(sizesFor(lesson(), { course: 'mid', desk: 'mid' })).toEqual({ desk: 'mid', course: 'mid', module: 'mid', lesson: 'max' })
    expect(sizesFor(lesson(), { lesson: 'min', module: 'min' })).toEqual({ desk: 'min', course: 'min', module: 'min', lesson: 'max' })
  })
})

describe('resolving a stored path', () => {
  it('cuts the path where an id is not a course, module, lesson, exercise or project of the courses', () => {
    expect(resolvePath({ ...DESK, courseId: 'nope' }, content)).toEqual(DESK)
    expect(resolvePath({ courseId: 'writer-c1', moduleId: 'nope', lessonId: 'writer-c1-m1-l1', work: null }, content)).toEqual(openCourse('writer-c1'))
    expect(resolvePath({ courseId: 'writer-c1', moduleId: 'writer-c1-m1', lessonId: 'nope', work: null }, content)).toEqual(openModule(openCourse('writer-c1'), 'writer-c1-m1'))
    expect(resolvePath({ ...lesson(), work: { kind: 'exercise', id: 'nope' } }, content)).toEqual(lesson())
    expect(resolvePath({ ...lesson(), work: { kind: 'project', id: 'reader-c1-p1' } }, content)).toEqual(lesson())
  })

  it('keeps a good path as it is', () => {
    const deep = openExercise(lesson(), 'writer-c1-m1-l1-e1')
    expect(resolvePath(deep, content)).toEqual(deep)
    const project = openProject(openCourse('admin-c1'), 'admin-c1-p1')
    expect(resolvePath(project, content)).toEqual(project)
  })
})
