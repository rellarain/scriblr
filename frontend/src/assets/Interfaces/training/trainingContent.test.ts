import { describe, expect, it } from 'vitest'
import { emptyProgress, seedContent } from '../../../designSystem/mockTraining'
import {
  assessmentResult, courseById, courseHue, courseProgress, curriculaOf, exerciseOf, indexOf, lessonOf, looseCourses, moduleOf, progressText, projectOf, resultText,
} from './trainingContent'

const content = () => seedContent()
const writer = () => courseById(content(), 'writer-c1')!

describe('looking things up', () => {
  it('finds a course, module, lesson, exercise and project by id, and nothing for an id that is not there or null', () => {
    const c = content()
    const course = courseById(c, 'writer-c1')
    const mod = moduleOf(course, 'writer-c1-m1')
    const lesson = lessonOf(mod, 'writer-c1-m1-l1')
    expect(course?.title).toBe('Writer Course 1')
    expect(mod?.title).toBe('Module 1')
    expect(lesson?.title).toBe('Lesson 1')
    expect(exerciseOf(lesson, 'writer-c1-m1-l1-e1')?.title).toBe('Exercise 1')
    expect(projectOf(course, 'writer-c1-p1')?.title).toBe('Project 1')
    expect(courseById(c, 'nope')).toBeUndefined()
    expect(courseById(c, null)).toBeUndefined()
    expect(moduleOf(undefined, 'x')).toBeUndefined()
    expect(lessonOf(mod, 'reader-c1-m1-l1')).toBeUndefined()
  })

  it('says what every id is and what it sits in', () => {
    const index = indexOf(content())
    expect(index.get('writer')).toEqual({ kind: 'curriculum', parent: null })
    expect(index.get('writer-c1')).toEqual({ kind: 'course', parent: null })
    expect(index.get('writer-c1-m1')).toEqual({ kind: 'module', parent: 'writer-c1' })
    expect(index.get('writer-c1-m1-l1')).toEqual({ kind: 'lesson', parent: 'writer-c1-m1' })
    expect(index.get('writer-c1-m1-l1-e1')).toEqual({ kind: 'exercise', parent: 'writer-c1-m1-l1' })
    expect(index.get('writer-c1-m1-l1-q1')).toEqual({ kind: 'quiz', parent: 'writer-c1-m1-l1' })
    expect(index.get('writer-c1-m1-t1')).toEqual({ kind: 'test', parent: 'writer-c1-m1' })
    expect(index.get('writer-c1-x1')).toEqual({ kind: 'exam', parent: 'writer-c1' })
    expect(index.get('writer-c1-p1')).toEqual({ kind: 'project', parent: 'writer-c1' })
    expect(index.get('nope')).toBeUndefined()
  })
})

describe('curricula, which collect courses', () => {
  it('lists the curricula a course is in, in their order, and the courses that are in none', () => {
    const c = content()
    c.curricula.push({ id: 'craft', title: 'Craft', description: '', hue: 90, courseIds: ['writer-c1'] })
    c.courses.push({ id: 'loose', title: 'Loose', description: '', hue: null, modules: [], projects: [], exams: [] })
    expect(curriculaOf(c, 'writer-c1').map(x => x.id)).toEqual(['writer', 'craft'])
    expect(curriculaOf(c, 'loose')).toEqual([])
    expect(looseCourses(c).map(x => x.id)).toEqual(['loose'])
  })

  it('colours a course with its own hue, else its first curriculum\'s that has one, else none', () => {
    const c = content()
    expect(courseHue(c, writer())).toBe(30)
    c.courses.find(x => x.id === 'writer-c1')!.hue = 200
    expect(courseHue(c, courseById(c, 'writer-c1'))).toBe(200)
    const hueless = { id: 'h', title: 'H', description: '', hue: null, courseIds: ['reader-c1'] }
    c.curricula.unshift(hueless)
    expect(courseHue(c, courseById(c, 'reader-c1'))).toBe(280) // skips the curriculum with no hue
    c.curricula = [hueless]
    expect(courseHue(c, courseById(c, 'reader-c1'))).toBeUndefined()
    expect(courseHue(c, undefined)).toBeUndefined()
  })
})

describe('progress', () => {
  it('counts the lessons, modules, exercises and projects marked complete', () => {
    const progress = { ...emptyProgress(), completed: { 'writer-c1-m1-l1': 'x', 'writer-c1-p1': 'x', 'reader-c1-m1': 'x', 'writer-c1-m1-l1-e1': 'x' } }
    expect(courseProgress(writer(), progress)).toEqual({ lessons: 1, lessonsDone: 1, modules: 1, modulesDone: 0, exercises: 1, exercisesDone: 1, projects: 1, projectsDone: 1 })
    expect(courseProgress(writer(), emptyProgress()).lessonsDone).toBe(0)
  })

  it('says how far through a course is, or that it is complete', () => {
    expect(progressText(writer(), emptyProgress())).toBe('0 of 1 lesson complete')
    expect(progressText(writer(), { ...emptyProgress(), completed: { 'writer-c1-m1-l1': 'x' } })).toBe('1 of 1 lesson complete')
    expect(progressText(writer(), { ...emptyProgress(), completed: { 'writer-c1': 'x' } })).toBe('Complete')
    const none = { ...writer(), modules: [] }
    expect(progressText(none, emptyProgress())).toBe('No lessons yet')
  })

  it('reads the results of an assessment: attempts, best, latest, and whether it was ever passed', () => {
    const progress = { ...emptyProgress(), attempts: { q: [{ score: 40, passed: false, at: 'a' }, { score: 90, passed: true, at: 'b' }, { score: 60, passed: false, at: 'c' }] } }
    expect(assessmentResult(progress, 'q')).toEqual({ attempts: 3, best: 90, latest: { score: 60, passed: false, at: 'c' }, passed: true })
    expect(assessmentResult(progress, 'none')).toEqual({ attempts: 0, best: null, latest: null, passed: false })
  })

  it('words a result', () => {
    expect(resultText({ attempts: 0, best: null, latest: null, passed: false })).toBe('Not tried yet')
    expect(resultText({ attempts: 1, best: 85.55, latest: null, passed: true })).toBe('Best 85.6%, passed')
    expect(resultText({ attempts: 1, best: 40, latest: null, passed: false })).toBe('Best 40%, not passed')
  })
})
