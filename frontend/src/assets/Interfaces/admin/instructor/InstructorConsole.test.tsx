import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TrainingContent, TrainingCourse } from '../../../../api/types'
import { emptyProgress, trainingBackend, type TrainingBackend } from '../../../../test/trainingBackend'
import { getTrainingData } from '../../training/trainingStore'
import InstructorConsole from './InstructorConsole'

const tree = () => within(screen.getByRole('tree', { name: 'Curricula and courses' }))
const row = (name: string) => tree().getByRole('button', { name })
const editor = (kind: string) => within(screen.getByRole('region', { name: `${kind} editor` }))
const head = () => within(screen.getByRole('complementary', { name: 'Courses' }))
const save = () => screen.getByRole('button', { name: 'Save' })
const grip = (name: string) => screen.getByRole('button', { name: `Move ${name} (Alt+Up or Down)` })

// Two curricula with a course each, and a course in neither; every title is its own, so a row is found by its name.
function course(key: string, role: string): TrainingCourse {
  const c = `${key}-c1`, m = `${c}-m1`, l = `${m}-l1`
  return {
    id: c, title: `${role} Course`, description: '', hue: null,
    modules: [{
      id: m, title: `${role} Module`, description: '',
      lessons: [{ id: l, title: `${role} Lesson`, description: '', body: '', exercises: [{ id: `${l}-e1`, title: `${role} Exercise`, description: '' }], quizzes: [{ id: `${l}-q1`, title: `${role} Quiz`, description: '', passMark: 70 }] }],
      tests: [{ id: `${m}-t1`, title: `${role} Test`, description: '', passMark: 70 }],
    }],
    projects: [{ id: `${c}-p1`, title: `${role} Project`, description: '', exerciseIds: [`${l}-e1`] }],
    exams: [{ id: `${c}-x1`, title: `${role} Exam`, description: '', passMark: 70 }],
  }
}
const fixture = (): TrainingContent => ({
  schemaVersion: 1,
  curricula: [
    { id: 'writer', title: 'Writer Training', description: '', hue: 200, courseIds: ['writer-c1'] },
    { id: 'reader', title: 'Reader Training', description: '', hue: null, courseIds: ['reader-c1'] },
  ],
  courses: [course('writer', 'Writer'), course('reader', 'Reader'), course('extra', 'Extra')],
})

async function open(backend: TrainingBackend = trainingBackend(fixture())) {
  render(<InstructorConsole />)
  await screen.findByRole('heading', { name: 'Instructor' })
  return backend
}

// The courses as the backend holds them now.
const stored = (b: TrainingBackend, id: string) => b.state.content.courses.find(c => c.id === id)!

describe('the Instructor console: loading', () => {
  it('says it is loading, then shows the tree with the first curriculum open for editing', async () => {
    const backend = trainingBackend(fixture())
    backend.hold()
    render(<InstructorConsole />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading the courses')
    backend.release()
    expect(await screen.findByRole('heading', { name: 'Instructor' })).toBeInTheDocument()
    expect(editor('Curriculum').getByLabelText('Title')).toHaveValue('Writer Training')
    expect(tree().getAllByRole('group', { name: 'Curricula' })).toHaveLength(1)
  })

  it('says why it could not load, and tries again from the button', async () => {
    const user = userEvent.setup()
    const backend = trainingBackend(fixture())
    backend.failNext('/training', 500, 'The courses could not be read.')
    render(<InstructorConsole />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The courses could not be read.')
    await user.click(screen.getByRole('button', { name: 'Try loading again' }))
    expect(await screen.findByRole('heading', { name: 'Instructor' })).toBeInTheDocument()
  })

  it('groups the courses by curriculum, and the courses in none under Other courses', async () => {
    await open()
    expect(tree().getByRole('heading', { name: 'Other courses' })).toBeInTheDocument()
    expect(within(tree().getByRole('group', { name: 'Other courses' })).getByRole('button', { name: 'Extra Course' })).toBeInTheDocument()
    expect(within(tree().getByRole('group', { name: 'Courses of Writer Training' })).getByRole('button', { name: 'Writer Course' })).toBeInTheDocument()
  })
})

describe('the Instructor console: editing and saving', () => {
  it('renames a course and describes it, and Save sends the courses once, which Training then shows', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Course'))
    fireEvent.change(editor('Course').getByLabelText('Title'), { target: { value: 'Writing Well' } })
    fireEvent.change(editor('Course').getByLabelText('Description'), { target: { value: 'How to write.' } })
    expect(backend.calls.filter(c => c === 'PUT /training/content')).toHaveLength(0) // autosave is off: it waits for Save
    await user.click(save())
    await waitFor(() => expect(backend.calls.filter(c => c === 'PUT /training/content')).toHaveLength(1))
    expect(stored(backend, 'writer-c1')).toMatchObject({ title: 'Writing Well', description: 'How to write.' })
    await waitFor(() => expect(getTrainingData().training!.content.courses.find(c => c.id === 'writer-c1')!.title).toBe('Writing Well'))
    expect(row('Writing Well')).toBeInTheDocument()
  })

  it('keeps the progress of an item that was renamed (its id does not change)', async () => {
    const user = userEvent.setup()
    const backend = await open(trainingBackend(fixture(), { ...emptyProgress(), enrolled: { 'writer-c1': 'x' }, completed: { 'writer-c1-m1-l1': 'x' } }))
    await user.click(row('Writer Lesson'))
    fireEvent.change(editor('Lesson').getByLabelText('Title'), { target: { value: 'Acts' } })
    await user.click(save())
    await waitFor(() => expect(backend.calls).toContain('PUT /training/content'))
    expect(Object.keys(backend.state.progress.completed)).toEqual(['writer-c1-m1-l1'])
    expect(Object.keys(backend.state.progress.enrolled)).toEqual(['writer-c1'])
  })

  it('holds Save, with the reason beside the item, while a title is blank', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Course'))
    fireEvent.change(editor('Course').getByLabelText('Title'), { target: { value: '   ' } })
    expect(editor('Course').getByText('Course needs a title.')).toBeInTheDocument()
    expect(tree().getByText('Course needs a title.')).toBeInTheDocument()
    await user.click(save())
    expect(await screen.findByText(/Cannot save yet: Course needs a title\./)).toBeInTheDocument()
    expect(backend.calls).not.toContain('PUT /training/content')
    fireEvent.change(editor('Course').getByLabelText('Title'), { target: { value: 'Back' } })
    await user.click(save())
    await waitFor(() => expect(backend.calls).toContain('PUT /training/content'))
  })

  it('shows what the server refused as readable text, not as an object', async () => {
    const user = userEvent.setup()
    const backend = await open()
    backend.failNext('/training/content', 422, [{ type: 'value_error', loc: ['body'], msg: "Value error, id 'x' is used twice", input: {} }])
    await user.click(row('Writer Course'))
    fireEvent.change(editor('Course').getByLabelText('Title'), { target: { value: 'Changed' } })
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent("id 'x' is used twice")
    expect(screen.queryByText(/object Object/)).toBeNull()
  })
})

describe('the Instructor console: adding, deleting and ordering', () => {
  it('adds a curriculum and a course (a course inside the selected curriculum), each with the cursor in its title', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(head().getByRole('button', { name: 'Add a curriculum' }))
    const title = editor('Curriculum').getByLabelText('Title')
    expect(title).toHaveValue('New curriculum')
    expect(title).toHaveFocus()
    await user.click(head().getByRole('button', { name: 'Add a course' }))
    expect(editor('Course').getByLabelText('Title')).toHaveValue('New course')
    expect(within(tree().getByRole('group', { name: 'Courses of New curriculum' })).getByRole('button', { name: 'New course' })).toBeInTheDocument()
  })

  it('adds a module, a project and an exam to a course, a lesson and a test to a module, an exercise and a quiz to a lesson', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(row('Writer Course'))
    for (const [kind, text] of [['module', 'New module'], ['project', 'New project'], ['exam', 'New exam']] as const) {
      await user.click(row('Writer Course'))
      await user.click(editor('Course').getByRole('button', { name: `Add ${kind === 'exam' ? 'an' : 'a'} ${kind}` }))
      expect(editor(kind[0].toUpperCase() + kind.slice(1)).getByLabelText('Title')).toHaveValue(text)
      expect(row(text)).toBeInTheDocument()
    }
    await user.click(row('Writer Module'))
    await user.click(editor('Module').getByRole('button', { name: 'Add a lesson' }))
    expect(row('New lesson')).toBeInTheDocument()
    await user.click(row('Writer Module'))
    await user.click(editor('Module').getByRole('button', { name: 'Add a test' }))
    expect(row('New test')).toBeInTheDocument()
    await user.click(row('Writer Lesson'))
    await user.click(editor('Lesson').getByRole('button', { name: 'Add an exercise' }))
    expect(row('New exercise')).toBeInTheDocument()
    await user.click(row('Writer Lesson'))
    await user.click(editor('Lesson').getByRole('button', { name: 'Add a quiz' }))
    expect(row('New quiz')).toBeInTheDocument()
  })

  it('asks before deleting something written, takes what is inside it, and the course leaves its curriculum', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Course'))
    await user.click(editor('Course').getByRole('button', { name: 'Delete Writer Course' }))
    expect(editor('Course').getByRole('group', { name: 'Delete Writer Course?' })).toBeInTheDocument()
    await user.click(editor('Course').getByRole('button', { name: 'Cancel delete' }))
    expect(row('Writer Course')).toBeInTheDocument()
    await user.click(editor('Course').getByRole('button', { name: 'Delete Writer Course' }))
    await user.click(editor('Course').getByRole('button', { name: 'Confirm delete' }))
    expect(tree().queryByRole('button', { name: 'Writer Course' })).toBeNull()
    expect(row('Reader Lesson')).toBeInTheDocument() // other courses stay whole
    await user.click(save())
    await waitFor(() => expect(backend.calls).toContain('PUT /training/content'))
    expect(backend.state.content.courses.map(c => c.id)).not.toContain('writer-c1')
    expect(backend.state.content.curricula.find(c => c.id === 'writer')!.courseIds).toEqual([])
  })

  it('deletes something nothing has been written in at once', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(row('Writer Course'))
    await user.click(editor('Course').getByRole('button', { name: 'Add a module' }))
    await user.click(editor('Module').getByRole('button', { name: 'Delete New module' }))
    expect(screen.queryByRole('group', { name: /^Delete/ })).toBeNull()
    expect(tree().queryByRole('button', { name: 'New module' })).toBeNull()
    expect(editor('Course').getByLabelText('Title')).toHaveValue('Writer Course') // the item it was in is open again
  })

  it('moves an item one place with Alt+Down on its grip, and saves the order', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Course'))
    await user.click(editor('Course').getByRole('button', { name: 'Add a module' }))
    const modules = () => within(tree().getByRole('group', { name: 'Modules of Writer Course' })).getAllByRole('button', { name: /^(Writer Module|New module)$/ }).map(b => b.textContent)
    expect(modules()).toEqual(['Writer Module', 'New module'])
    fireEvent.keyDown(grip('Writer Module'), { key: 'ArrowDown', altKey: true })
    expect(modules()).toEqual(['New module', 'Writer Module'])
    fireEvent.keyDown(grip('Writer Module'), { key: 'ArrowDown', altKey: true }) // already last
    expect(modules()).toEqual(['New module', 'Writer Module'])
    await user.click(save())
    await waitFor(() => expect(stored(backend, 'writer-c1').modules.map(m => m.title)).toEqual(['New module', 'Writer Module']))
  })

  it('folds and unfolds what is under an item', async () => {
    const user = userEvent.setup()
    await open()
    expect(row('Writer Lesson')).toBeInTheDocument()
    const fold = tree().getAllByRole('button', { name: 'Fold Writer Course' })[0]
    await user.click(fold)
    expect(row('Reader Module')).toBeInTheDocument() // other courses are still open
    expect(within(tree().getByRole('group', { name: 'Courses of Writer Training' })).queryByRole('group', { name: 'Modules of Writer Course' })).toBeNull()
    await user.click(tree().getByRole('button', { name: 'Unfold Writer Course' }))
    expect(within(tree().getByRole('group', { name: 'Courses of Writer Training' })).getByRole('group', { name: 'Modules of Writer Course' })).toBeInTheDocument()
  })
})

describe('the Instructor console: the fields of each kind', () => {
  it('moves an item to another parent, keeping it open, and says what else changes', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Lesson'))
    expect(screen.getAllByText(/stops naming/).length).toBeGreaterThan(0)
    const move = editor('Lesson').getByRole('combobox', { name: 'Move to' })
    expect(within(move).getAllByRole('option').map(o => o.textContent)).toContain('Reader Course › Reader Module')
    await user.selectOptions(move, 'Reader Course › Reader Module')
    expect(editor('Lesson').getByLabelText('Title')).toHaveValue('Writer Lesson')
    await user.click(save())
    await waitFor(() => expect(stored(backend, 'reader-c1').modules[0].lessons.map(l => l.id)).toEqual(['reader-c1-m1-l1', 'writer-c1-m1-l1']))
    expect(stored(backend, 'writer-c1').modules[0].lessons).toEqual([])
    expect(stored(backend, 'writer-c1').projects[0].exerciseIds).toEqual([]) // its exercise left the course, so the project lost it
  })

  it('puts a course in curricula with the checkboxes, and a curriculum collects courses and orders them', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Course'))
    await user.click(editor('Course').getByRole('checkbox', { name: 'Reader Training' }))
    expect(within(tree().getByRole('group', { name: 'Courses of Reader Training' })).getAllByRole('button', { name: 'Writer Course' })).toHaveLength(1)
    await user.click(tree().getAllByRole('button', { name: 'Reader Training' })[0])
    const list = within(editor('Curriculum').getByRole('list', { name: 'Courses of Reader Training' }))
    expect(list.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Reader Course', 'Writer Course'])
    fireEvent.keyDown(editor('Curriculum').getByRole('button', { name: 'Move Writer Course (Alt+Up or Down)' }), { key: 'ArrowUp', altKey: true })
    expect(list.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Writer Course', 'Reader Course'])
    await user.selectOptions(editor('Curriculum').getByRole('combobox', { name: 'Add a course to this curriculum' }), 'Extra Course')
    expect(list.getAllByRole('listitem')).toHaveLength(3)
    await user.click(editor('Curriculum').getByRole('button', { name: 'Take Extra Course out of this curriculum' }))
    expect(list.getAllByRole('listitem')).toHaveLength(2)
    await user.click(save())
    await waitFor(() => expect(backend.state.content.curricula.find(c => c.id === 'reader')!.courseIds).toEqual(['writer-c1', 'reader-c1']))
  })

  it('gives a curriculum a colour or takes it away, and lets a course follow its curriculum\'s', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(tree().getAllByRole('button', { name: 'Writer Training' })[0])
    expect(editor('Curriculum').getByRole('slider', { name: 'Curriculum colour' })).toBeInTheDocument()
    await user.click(editor('Curriculum').getByRole('button', { name: 'Remove curriculum colour' }))
    expect(editor('Curriculum').getByText(/No colour of its own/)).toBeInTheDocument()
    await user.click(editor('Curriculum').getByRole('button', { name: 'Choose curriculum colour' }))
    expect(editor('Curriculum').getByRole('slider', { name: 'Curriculum colour' })).toBeInTheDocument()
    await user.click(row('Writer Course'))
    expect(editor('Course').getByRole('button', { name: 'Inherit parent colour' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(editor('Course').getByRole('button', { name: 'Inherit parent colour' }))
    expect(editor('Course').getByRole('button', { name: 'Inherit parent colour' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(save())
    await waitFor(() => expect(stored(backend, 'writer-c1').hue).toBe(200))
    expect(backend.state.content.curricula.find(c => c.id === 'writer')!.hue).toBe(200)
  })

  it('keeps a pass mark between 0 and 100', async () => {
    await open()
    fireEvent.click(row('Writer Exam'))
    const field = editor('Exam').getByLabelText('Pass mark (%)')
    expect(field).toHaveValue(70)
    fireEvent.change(field, { target: { value: '150' } })
    expect(field).toHaveValue(100)
    fireEvent.change(field, { target: { value: '-5' } })
    expect(field).toHaveValue(0)
    fireEvent.change(field, { target: { value: '82.6' } })
    expect(field).toHaveValue(83)
  })

  it('writes a lesson\'s material in Markdown and reads it rendered', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Lesson'))
    fireEvent.change(editor('Lesson').getByLabelText('Material (Markdown)'), { target: { value: '# Acts\n\nThree of them.' } })
    await user.click(editor('Lesson').getByRole('button', { name: 'Read the material as it will look' }))
    const rendered = within(editor('Lesson').getByLabelText('Material, rendered'))
    expect(rendered.getByRole('heading', { name: 'Acts' })).toBeInTheDocument()
    expect(rendered.getByText('Three of them.')).toBeInTheDocument()
    await user.click(editor('Lesson').getByRole('button', { name: 'Write the material' }))
    expect(editor('Lesson').getByLabelText('Material (Markdown)')).toHaveValue('# Acts\n\nThree of them.')
    await user.click(save())
    await waitFor(() => expect(backend.state.content.courses.find(c => c.id === 'writer-c1')!.modules[0].lessons[0].body).toContain('Three of them.'))
  })

  it('makes a project of exercises of its own course, in an order', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(row('Writer Lesson'))
    await user.click(editor('Lesson').getByRole('button', { name: 'Add an exercise' }))
    await user.click(row('Writer Project'))
    const picker = () => editor('Project').getByRole('combobox', { name: 'Add an exercise' })
    expect(within(editor('Project').getByRole('list', { name: 'Exercises of Writer Project' })).getAllByRole('listitem')).toHaveLength(1)
    await user.selectOptions(picker(), within(picker()).getAllByRole('option')[1])
    const names = () => within(editor('Project').getByRole('list', { name: 'Exercises of Writer Project' })).getAllByRole('listitem').map(li => li.textContent)
    expect(names()).toEqual(['Writer Exercise', 'New exercise'])
    expect(picker()).toBeDisabled()
    fireEvent.keyDown(editor('Project').getByRole('button', { name: 'Move New exercise (Alt+Up or Down)' }), { key: 'ArrowUp', altKey: true })
    expect(names()).toEqual(['New exercise', 'Writer Exercise'])
    await user.click(editor('Project').getByRole('button', { name: 'Take Writer Exercise out of the project' }))
    expect(names()).toEqual(['New exercise'])
    await user.click(save())
    await waitFor(() => expect(backend.state.content.courses[0].projects[0].exerciseIds).toHaveLength(1))
  })
})
