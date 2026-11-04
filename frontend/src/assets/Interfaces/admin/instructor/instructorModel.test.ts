import { describe, expect, it } from 'vitest'
import { seedContent } from '../../../../designSystem/mockTraining'
import {
  LIMITS, add, canAdd, draftOf, exercisesOfCourse, faults, find, inheritedHue, isBlank, kindOf, moveItem, moveTo, newId, nudgeItem, nudgeRef, parentChoices, patch, remove, reorderRefs,
  setMembership, setProjectExercises, takenIds, type Draft,
} from './instructorModel'

const draft = (): Draft => draftOf(seedContent())
const course = (d: Draft, id: string) => d.courses.find(c => c.id === id)!

// A draft with one more exercise and a project in the writer course that names both.
function richer(): Draft {
  let d = draft()
  d = add(d, 'exercise', 'writer-c1-m1-l1').draft
  const ex = course(d, 'writer-c1').modules[0].lessons[0].exercises.map(e => e.id)
  return setProjectExercises(d, 'writer-c1-p1', ex)
}

describe('ids', () => {
  it('makes `<kind>-<six characters>` that matches the server\'s pattern and is not taken', () => {
    const taken = takenIds(draft())
    const id = newId('lesson', taken)
    expect(id).toMatch(/^lesson-[a-z0-9]{6}$/)
    expect(taken.has(id)).toBe(false)
    expect(/^[A-Za-z0-9_-]{1,80}$/.test(id)).toBe(true)
  })

  it('tries again when an id is taken', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let i = 0
    expect(newId('module', new Set(['module-aaaaaa']), () => seq[i++])).toBe('module-ssssss')
  })

  it('knows every id of the draft', () => {
    const ids = takenIds(draft())
    for (const id of ['writer', 'writer-c1', 'writer-c1-m1', 'writer-c1-m1-l1', 'writer-c1-m1-l1-e1', 'writer-c1-m1-l1-q1', 'writer-c1-m1-t1', 'writer-c1-p1', 'writer-c1-x1']) expect(ids.has(id)).toBe(true)
  })
})

describe('adding', () => {
  it('adds each kind last in its list with a title that is not blank, and leaves the old draft alone', () => {
    const d = draft()
    const made: Array<[Parameters<typeof add>[1], string | null]> = [
      ['curriculum', null], ['course', null], ['module', 'writer-c1'], ['project', 'writer-c1'], ['exam', 'writer-c1'], ['lesson', 'writer-c1-m1'], ['test', 'writer-c1-m1'],
      ['exercise', 'writer-c1-m1-l1'], ['quiz', 'writer-c1-m1-l1'],
    ]
    for (const [kind, parent] of made) {
      const r = add(d, kind, parent)
      expect(r.id).toBeTruthy()
      expect(kindOf(r.draft, r.id!)).toBe(kind)
      expect(find(r.draft, r.id!)?.item.title).toBe(`New ${kind}`)
      expect(find(r.draft, r.id!)?.parentId).toBe(parent)
      expect(faults(r.draft)).toEqual([])
      expect(kindOf(d, r.id!)).toBeNull()
    }
    const w = add(d, 'module', 'writer-c1').draft
    expect(course(w, 'writer-c1').modules.map(m => m.title)).toEqual(['Module 1', 'New module'])
  })

  it('puts a new course made inside a curriculum in it, and one made outside in none', () => {
    const inside = add(draft(), 'course', 'writer')
    expect(inside.draft.curricula.find(c => c.id === 'writer')!.courseIds).toEqual(['writer-c1', inside.id])
    const outside = add(draft(), 'course', null)
    expect(outside.draft.curricula.flatMap(c => c.courseIds)).not.toContain(outside.id)
  })

  it('gives a new quiz, test or exam a pass mark of 70', () => {
    const d = add(draft(), 'exam', 'writer-c1')
    expect(course(d.draft, 'writer-c1').exams.at(-1)).toMatchObject({ passMark: 70 })
  })

  it('refuses past a cap, and says so', () => {
    let d = draft()
    d = { ...d, courses: [{ ...d.courses[0], modules: Array.from({ length: LIMITS.modules }, (_, i) => ({ id: `m${i}`, title: 'M', description: '', lessons: [], tests: [] })) }] }
    expect(canAdd(d, 'module', d.courses[0].id)).toMatch(/at most 100 modules/)
    const r = add(d, 'module', d.courses[0].id)
    expect(r.id).toBeNull()
    expect(r.draft).toBe(d)
    expect(canAdd(d, 'exam', d.courses[0].id)).toBeNull()
    expect(canAdd(d, 'lesson', null)).toMatch(/nothing to add/)
  })
})

describe('changing', () => {
  it('patches a field of any kind by id, and ignores an id that is not there', () => {
    const d = patch(patch(draft(), 'writer-c1-x1', { passMark: 55, title: 'Final' }), 'writer', { hue: 90 })
    expect(course(d, 'writer-c1').exams[0]).toMatchObject({ title: 'Final', passMark: 55 })
    expect(d.curricula.find(c => c.id === 'writer')!.hue).toBe(90)
    const same = draft()
    expect(patch(same, 'nope', { title: 'x' })).toBe(same)
  })

  it('keeps ids when a title changes', () => {
    const d = patch(draft(), 'writer-c1-m1-l1', { title: 'Renamed' })
    expect(find(d, 'writer-c1-m1-l1')?.item.title).toBe('Renamed')
    expect(takenIds(d)).toEqual(takenIds(draft()))
  })
})

describe('deleting', () => {
  it('takes a course out of its curricula, with everything inside it', () => {
    const d = remove(draft(), 'writer-c1')
    expect(d.courses.map(c => c.id)).not.toContain('writer-c1')
    expect(d.curricula.find(c => c.id === 'writer')!.courseIds).toEqual([])
    expect(takenIds(d).has('writer-c1-m1-l1')).toBe(false)
  })

  it('leaves the courses of a deleted curriculum, in no curriculum', () => {
    const d = remove(draft(), 'writer')
    expect(d.curricula.map(c => c.id)).not.toContain('writer')
    expect(d.courses.map(c => c.id)).toContain('writer-c1')
  })

  it('takes an exercise out of the projects that name it, also when its lesson, module or course is deleted', () => {
    const r = richer()
    const ex = course(r, 'writer-c1').modules[0].lessons[0].exercises.map(e => e.id)
    expect(ex).toHaveLength(2)
    expect(course(remove(r, ex[1]), 'writer-c1').projects[0].exerciseIds).toEqual([ex[0]])
    expect(course(remove(r, 'writer-c1-m1-l1'), 'writer-c1').projects[0].exerciseIds).toEqual([])
    expect(course(remove(r, 'writer-c1-m1'), 'writer-c1').projects[0].exerciseIds).toEqual([])
  })

  it('ignores an id that is not there', () => {
    const d = draft()
    expect(remove(d, 'nope')).toBe(d)
  })
})

describe('ordering', () => {
  const two = () => add(draft(), 'module', 'writer-c1')

  it('moves an item before another of its list, or to the end', () => {
    const { draft: d, id } = two()
    const first = moveItem(d, id!, 'writer-c1-m1')
    expect(course(first, 'writer-c1').modules.map(m => m.id)).toEqual([id, 'writer-c1-m1'])
    expect(course(moveItem(first, id!, null), 'writer-c1').modules.map(m => m.id)).toEqual(['writer-c1-m1', id])
    expect(moveItem(d, id!, id!)).toBe(d)
  })

  it('moves one place up or down, and not past the ends', () => {
    const { draft: d, id } = two()
    expect(course(nudgeItem(d, id!, -1), 'writer-c1').modules.map(m => m.id)).toEqual([id, 'writer-c1-m1'])
    expect(nudgeItem(d, id!, 1)).toBe(d)
    const courses = nudgeItem(add(draft(), 'course', null).draft, 'writer-c1', 1)
    expect(courses.courses.map(c => c.id).indexOf('writer-c1')).toBe(4)
  })

  it('orders the courses of a curriculum and the exercises of a project', () => {
    const { draft: d, id } = add(draft(), 'course', 'writer')
    expect(d.curricula.find(c => c.id === 'writer')!.courseIds).toEqual(['writer-c1', id])
    expect(reorderRefs(d, 'writer', id!, 'writer-c1').curricula.find(c => c.id === 'writer')!.courseIds).toEqual([id, 'writer-c1'])
    expect(nudgeRef(d, 'writer', id!, -1).curricula.find(c => c.id === 'writer')!.courseIds).toEqual([id, 'writer-c1'])
    expect(nudgeRef(d, 'writer', id!, 1)).toBe(d)
    const r = richer()
    const ids = course(r, 'writer-c1').projects[0].exerciseIds
    expect(course(nudgeRef(r, 'writer-c1-p1', ids[0], 1), 'writer-c1').projects[0].exerciseIds).toEqual([ids[1], ids[0]])
  })
})

describe('moving to another parent', () => {
  it('lists where an item can go, with the path, and never where it is', () => {
    const d = draft()
    expect(parentChoices(d, 'writer-c1-m1').map(c => c.id)).toEqual(['user-c1', 'reader-c1', 'translator-c1', 'admin-c1'])
    expect(parentChoices(d, 'writer-c1-m1-l1').map(c => c.label)).toEqual(['User Course 1 › Module 1', 'Reader Course 1 › Module 1', 'Translator Course 1 › Module 1', 'Admin Course 1 › Module 1'])
    expect(parentChoices(d, 'writer-c1-m1-l1-e1').map(c => c.label)[0]).toBe('User Course 1 › Module 1 › Lesson 1')
    expect(parentChoices(d, 'writer-c1-m1-l1-e1')).toHaveLength(4)
    expect(parentChoices(d, 'writer-c1-x1')).toHaveLength(4)
    expect(parentChoices(d, 'writer-c1')).toEqual([]) // a course goes in curricula instead
    expect(parentChoices(d, 'writer')).toEqual([])
  })

  it('moves an item to the end of the other parent\'s list, keeping its id and what is inside it', () => {
    const d = moveTo(draft(), 'writer-c1-m1-l1', 'reader-c1-m1')
    expect(course(d, 'reader-c1').modules[0].lessons.map(l => l.id)).toEqual(['reader-c1-m1-l1', 'writer-c1-m1-l1'])
    expect(course(d, 'writer-c1').modules[0].lessons).toEqual([])
    expect(find(d, 'writer-c1-m1-l1-e1')?.parentId).toBe('writer-c1-m1-l1')
    expect(takenIds(d)).toEqual(takenIds(draft()))
    const quiz = moveTo(draft(), 'writer-c1-m1-l1-q1', 'reader-c1-m1-l1')
    expect(course(quiz, 'reader-c1').modules[0].lessons[0].quizzes.map(q => q.id)).toEqual(['reader-c1-m1-l1-q1', 'writer-c1-m1-l1-q1'])
  })

  it('stops a project naming an exercise that left its course, and a moved project names only its new course\'s exercises', () => {
    const left = moveTo(richer(), 'writer-c1-m1-l1', 'reader-c1-m1')
    expect(course(left, 'writer-c1').projects[0].exerciseIds).toEqual([])
    const project = moveTo(richer(), 'writer-c1-p1', 'reader-c1')
    expect(course(project, 'reader-c1').projects.map(p => p.id)).toEqual(['reader-c1-p1', 'writer-c1-p1'])
    expect(course(project, 'reader-c1').projects[1].exerciseIds).toEqual([])
  })

  it('keeps a project\'s exercises when an exercise moves inside the same course', () => {
    let d = add(richer(), 'lesson', 'writer-c1-m1').draft
    const lesson = course(d, 'writer-c1').modules[0].lessons[1].id
    d = moveTo(d, 'writer-c1-m1-l1-e1', lesson)
    expect(course(d, 'writer-c1').projects[0].exerciseIds).toContain('writer-c1-m1-l1-e1')
  })

  it('refuses a move to a parent that is not offered', () => {
    const d = draft()
    expect(moveTo(d, 'writer-c1-m1-l1', 'writer-c1-m1')).toBe(d) // where it is
    expect(moveTo(d, 'writer-c1-m1-l1', 'reader-c1')).toBe(d) // a lesson goes in a module
    expect(moveTo(d, 'writer-c1', 'reader')).toBe(d)
  })
})

describe('what a curriculum and a project name', () => {
  it('puts a course in a curriculum and takes it out, once each', () => {
    const on = setMembership(draft(), 'writer-c1', 'reader', true)
    expect(on.curricula.find(c => c.id === 'reader')!.courseIds).toEqual(['reader-c1', 'writer-c1'])
    expect(setMembership(on, 'writer-c1', 'reader', true)).toBe(on)
    expect(setMembership(on, 'writer-c1', 'reader', false).curricula.find(c => c.id === 'reader')!.courseIds).toEqual(['reader-c1'])
    const d = draft()
    expect(setMembership(d, 'writer-c1', 'reader', false)).toBe(d)
    expect(setMembership(d, 'nope', 'reader', true)).toBe(d)
  })

  it('sets the exercises of a project, and lists a course\'s exercises with where they are', () => {
    const r = richer()
    expect(setProjectExercises(r, 'writer-c1-p1', []).courses.find(c => c.id === 'writer-c1')!.projects[0].exerciseIds).toEqual([])
    expect(exercisesOfCourse(course(r, 'writer-c1')).map(e => [e.title, e.lessonTitle, e.moduleTitle])).toEqual([['Exercise 1', 'Lesson 1', 'Module 1'], ['New exercise', 'Lesson 1', 'Module 1']])
    const d = draft()
    expect(setProjectExercises(d, 'writer-c1-x1', [])).toBe(d)
  })

  it('gives a course the colour of its first curriculum with one', () => {
    const d = setMembership(draft(), 'writer-c1', 'reader', true)
    expect(inheritedHue(d, 'writer-c1')).toBe(280) // the Reader curriculum comes before the Writer's
    expect(inheritedHue(patch(d, 'reader', { hue: null }), 'writer-c1')).toBe(30)
    expect(inheritedHue(draft(), 'nope')).toBeNull()
  })
})

describe('what the server would refuse', () => {
  it('finds a blank title on any kind, and says what needs it', () => {
    let d = draft()
    d = patch(d, 'writer-c1-m1-l1-q1', { title: '   ' })
    d = patch(d, 'writer', { title: '' })
    expect(faults(d)).toEqual([{ id: 'writer', message: 'Curriculum needs a title.' }, { id: 'writer-c1-m1-l1-q1', message: 'Quiz needs a title.' }])
    expect(faults(draft())).toEqual([])
  })
})

describe('nothing written yet', () => {
  it('is an item with the title it was made with, or none, and nothing in it', () => {
    const { draft: d, id } = add(draft(), 'lesson', 'writer-c1-m1')
    expect(isBlank(d, id!)).toBe(true)
    expect(isBlank(patch(d, id!, { title: '' }), id!)).toBe(true)
    expect(isBlank(patch(d, id!, { title: 'Acts' }), id!)).toBe(false)
    expect(isBlank(patch(d, id!, { body: 'x' }), id!)).toBe(false)
    expect(isBlank(patch(d, id!, { description: 'x' }), id!)).toBe(false)
    const exercise = add(d, 'exercise', id!)
    expect(isBlank(exercise.draft, id!)).toBe(false)
    expect(isBlank(exercise.draft, exercise.id!)).toBe(true)
    expect(isBlank(draft(), 'writer-c1-m1-l1')).toBe(false)
    expect(isBlank(draft(), 'nope')).toBe(false)
  })
})
