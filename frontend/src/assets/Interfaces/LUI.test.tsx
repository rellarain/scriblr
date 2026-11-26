import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getKv, setKv } from '../../settings/settingsStore'
import { emptyProgress, seedContent, learningBackend } from '../../test/learningBackend'
import LUI from './LUI'

// A row's second line, read whole (its description's words are drawn in an element of their own).
const detail = (text: string) => (_: string, el: Element | null) => !!el && el.classList.contains('lrRowDetail') && el.textContent === text

const level = (name: string) => screen.getByRole('region', { name })
const tab = (levelName: string, label: string) => within(level(levelName)).getByRole('button', { name: label })
type User = ReturnType<typeof userEvent.setup>

// The Desk, once the courses have loaded.
async function desk() {
  await screen.findByRole('region', { name: 'Learning Desk (max)' })
}

// Opens a course from the Desk's catalog.
async function openFromCatalog(user: User, title: string) {
  await user.click(tab('Learning Desk (max)', 'Catalog'))
  await user.click(screen.getByRole('button', { name: `Open ${title}` }))
}

describe('Learning (LUI): loading', () => {
  it('says it is loading until the courses arrive, then shows the Desk', async () => {
    const backend = learningBackend()
    backend.hold()
    render(<LUI />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading courses')
    backend.release()
    await desk()
    expect(screen.queryByRole('status')).toBeNull()
    expect(backend.calls).toContain('GET /training')
  })

  it('says why it could not load, and tries again from the button', async () => {
    const user = userEvent.setup()
    const backend = learningBackend()
    backend.failNext('/training', 500, 'The courses could not be read.')
    render(<LUI />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The courses could not be read.')
    await user.click(screen.getByRole('button', { name: 'Try loading again' }))
    await desk()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Learning (LUI)', () => {
  it('opens on the Desk alone, with the Courses tab open and nothing enrolled', async () => {
    learningBackend()
    render(<LUI />)
    await desk()
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label')).filter(n => /^Learning Desk/.test(n ?? ''))).toEqual(['Learning Desk (max)'])
    expect(screen.queryByRole('region', { name: /\((mid|min)\)$/ })).toBeNull()
    expect(within(level('Learning Desk (max)')).getByText('Your learning desk, with all the courses you are enrolled in.')).toBeInTheDocument()
    expect(screen.getByText(/not enrolled in any course yet/)).toBeInTheDocument()
    expect(within(level('Learning Desk (max)')).getAllByRole('button').map(b => b.getAttribute('aria-label')).filter(Boolean)).toEqual(expect.arrayContaining(['Courses', 'Catalog', 'Settings', 'Help']))
  })

  it('lists the courses of the curricula in the Catalog, grouped by curriculum, and enrols in one through the backend', async () => {
    const user = userEvent.setup()
    const backend = learningBackend()
    render(<LUI />)
    await desk()
    await user.click(tab('Learning Desk (max)', 'Catalog'))
    const groups = screen.getAllByRole('region').filter(r => r.classList.contains('lrGroup'))
    expect(groups.map(g => g.querySelector('.lrGroupTitle')?.textContent)).toEqual(['User Training', 'Reader Training', 'Translator Training', 'Writer Training', 'Admin Training'])
    expect(groups.map(g => [...g.querySelectorAll('.lrRowTitle')].map(t => t.textContent))).toEqual([['User Course 1'], ['Reader Course 1'], ['Translator Course 1'], ['Writer Course 1'], ['Admin Course 1']])
    const catalog = within(screen.getByRole('list', { name: 'Courses of Writer Training' }))
    await user.click(catalog.getByRole('button', { name: 'Enrol in Writer Course 1' }))
    expect(await catalog.findByRole('button', { name: 'Leave Writer Course 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(backend.calls).toContain('PUT /training/enrolments/writer-c1')
    expect(Object.keys(backend.state.progress.enrolled)).toEqual(['writer-c1'])
    const enrolled = within(screen.getByRole('list', { name: 'Enrolled courses' }))
    expect(enrolled.getAllByRole('listitem')).toHaveLength(1)
    await user.click(catalog.getByRole('button', { name: 'Leave Writer Course 1' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Enrolled courses' })).toBeNull())
    expect(backend.state.progress.enrolled).toEqual({})
  })

  it('shows the courses enrolled in, with how far through each is', async () => {
    const user = userEvent.setup()
    const backend = learningBackend(undefined, { ...emptyProgress(), enrolled: { 'reader-c1': '2026-11-02T00:00:00Z' } })
    render(<LUI />)
    await desk()
    const list = within(screen.getByRole('list', { name: 'Enrolled courses' }))
    expect(list.getByText(detail('The first reader course. · 0 of 1 lesson complete'))).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Open Reader Course 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(await screen.findByRole('button', { name: 'Mark Lesson 1 complete' }))
    expect(backend.calls).toContain('PUT /training/completions/reader-c1-m1-l1')
    await user.click(screen.getByRole('button', { name: 'Learning Desk', description: 'Open Learning Desk' }))
    expect(await within(await screen.findByRole('list', { name: 'Enrolled courses' })).findByText(detail('The first reader course. · 1 of 1 lesson complete'))).toBeInTheDocument()
  })

  it('stacks a level for each thing opened: course, module, lesson, exercise, with the focus on the deepest', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    expect(level('Writer Course 1 (max)')).toBeInTheDocument()
    expect(level('Learning Desk (mid)')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Modules')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Exams')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Projects')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    expect(level('Module 1 (max)')).toBeInTheDocument()
    expect(level('Writer Course 1 (mid)')).toBeInTheDocument()
    expect(level('Learning Desk (min)')).toBeInTheDocument()
    expect(tab('Module 1 (max)', 'Lessons')).toBeInTheDocument()
    expect(tab('Module 1 (max)', 'Tests')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    expect(level('Lesson 1 (max)')).toBeInTheDocument()
    expect(['Material', 'Quizzes', 'Exercises'].map(n => tab('Lesson 1 (max)', n))).toHaveLength(3)
    await user.click(tab('Lesson 1 (max)', 'Exercises'))
    await user.click(screen.getByRole('button', { name: 'Open Exercise 1' }))
    expect(level('Exercise 1 (max)')).toBeInTheDocument()
    expect(within(level('Exercise 1 (max)')).getByText('Repeated practice on specific tasks.')).toBeInTheDocument()
    expect(level('Lesson 1 (mid)')).toBeInTheDocument()
  })

  it('takes a project from the course straight to Practice, with its exercises and no Module or Lesson level', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Reader Course 1')
    await user.click(tab('Reader Course 1 (max)', 'Projects'))
    await user.click(screen.getByRole('button', { name: 'Open Project 1' }))
    expect(level('Project 1 (max)')).toBeInTheDocument()
    expect(level('Reader Course 1 (mid)')).toBeInTheDocument()
    expect(level('Learning Desk (min)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^(Module|Lesson) 1/ })).toBeNull()
    expect(within(level('Project 1 (max)')).getByText(/produces a working product on completion/)).toBeInTheDocument()
    expect(within(within(level('Project 1 (max)')).getByRole('list', { name: 'Exercises of Project 1' })).getByText('Exercise 1')).toBeInTheDocument()
  })

  it('brings a level back with its title, closing what is below it, and toggles a level between Min and Mid', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Admin Course 1')
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    // The Desk is Min here: its chevron opens it to Mid, and folds it back.
    await user.click(screen.getByRole('button', { name: 'Expand Learning Desk' }))
    expect(level('Learning Desk (mid)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Minimize Learning Desk' }))
    expect(level('Learning Desk (min)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Admin Course 1', description: 'Open Admin Course 1' }))
    expect(level('Admin Course 1 (max)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^(Module|Lesson) 1/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Learning Desk', description: 'Open Learning Desk' }))
    expect(level('Learning Desk (max)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Admin Course 1 \(/ })).toBeNull()
  })

  it('keeps where you are, and what you enrolled in, when it is opened again', async () => {
    const user = userEvent.setup()
    learningBackend()
    const first = render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Translator Course 1')
    await user.click(screen.getByRole('button', { name: 'Enrol in Translator Course 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    first.unmount()
    render(<LUI />)
    expect(await screen.findByRole('region', { name: 'Module 1 (max)' })).toBeInTheDocument()
    expect(level('Translator Course 1 (mid)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Learning Desk', description: 'Open Learning Desk' }))
    expect(within(screen.getByRole('list', { name: 'Enrolled courses' })).getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('Learning (LUI): what the courses hold', () => {
  it('marks a module and the course itself complete, and unmarks it', async () => {
    const user = userEvent.setup()
    const backend = learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    await user.click(screen.getByRole('button', { name: 'Mark Writer Course 1 complete' }))
    expect(await screen.findByRole('button', { name: 'Mark Writer Course 1 not complete' })).toHaveAttribute('aria-pressed', 'true')
    expect(backend.calls).toContain('PUT /training/completions/writer-c1')
    await user.click(screen.getByRole('button', { name: 'Mark Module 1 complete' }))
    await waitFor(() => expect(backend.state.progress.completed['writer-c1-m1']).toBeTruthy())
    await user.click(await screen.findByRole('button', { name: 'Mark Module 1 not complete' }))
    await waitFor(() => expect(backend.state.progress.completed['writer-c1-m1']).toBeUndefined())
    expect(backend.calls).toContain('DELETE /training/completions/writer-c1-m1')
  })

  it('shows a lesson\'s material formatted from the markup, and its description', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    const material = within(level('Lesson 1 (max)'))
    expect(await material.findByRole('heading', { name: 'Lesson 1', level: 6 })).toBeInTheDocument()
    expect(material.getByText('Placeholder material for the writer course.')).toBeInTheDocument()
    expect(material.getByText('Placeholder lesson.')).toBeInTheDocument()
  })

  it('lists the quizzes, tests and exams with their pass mark and how the learner did', async () => {
    const user = userEvent.setup()
    learningBackend(undefined, {
      ...emptyProgress(),
      attempts: { 'writer-c1-x1': [{ score: 40, passed: false, at: 'x' }, { score: 85.5, passed: true, at: 'y' }], 'writer-c1-m1-t1': [{ score: 50, passed: false, at: 'z' }] },
    })
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    await user.click(tab('Writer Course 1 (max)', 'Exams'))
    expect(within(screen.getByRole('list', { name: 'Exams of Writer Course 1' })).getByText(detail('Placeholder exam. · Pass mark 70% · Best 85.5%, passed'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(tab('Module 1 (max)', 'Tests'))
    expect(within(screen.getByRole('list', { name: 'Tests of Module 1' })).getByText(detail('Placeholder test. · Pass mark 70% · Best 50%, not passed'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    await user.click(tab('Lesson 1 (max)', 'Quizzes'))
    expect(within(screen.getByRole('list', { name: 'Quizzes of Lesson 1' })).getByText(detail('Placeholder quiz. · Pass mark 70% · Not tried yet'))).toBeInTheDocument()
  })

  it('takes a lesson\'s quiz on one page, keeps the result, and passing it completes the lesson', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    await user.click(tab('Lesson 1 (max)', 'Quizzes'))
    await user.click(screen.getByRole('button', { name: 'Take Quiz 1' }))
    const quiz = within(screen.getByRole('region', { name: 'Quiz 1' }))
    await user.click(quiz.getByRole('radio', { name: 'A quarrel that ends a friendship' }))
    await user.click(quiz.getByRole('button', { name: 'Submit' }))
    expect(await quiz.findByText('Score 100% · passed (pass mark 70%)')).toBeInTheDocument()
    expect(quiz.getByText('Something is different afterwards.')).toBeInTheDocument()
    await user.click(quiz.getByRole('button', { name: 'Back' }))
    expect(await within(screen.getByRole('list', { name: 'Quizzes of Lesson 1' })).findByText(detail('Placeholder quiz. · Pass mark 70% · Best 100%, passed'))).toBeInTheDocument()
    for (const done of screen.getAllByRole('button', { name: 'Mark Lesson 1 not complete' })) expect(done).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a curriculum with no courses, and courses that are in no curriculum', async () => {
    const user = userEvent.setup()
    const content = seedContent()
    content.curricula.push({ id: 'empty', title: 'Empty Training', description: 'Nothing in it yet.', hue: null, courseIds: [] })
    content.courses.push({ id: 'loose-1', title: 'A Loose Course', description: 'In no curriculum.', hue: 120, modules: [], projects: [], exams: [] })
    learningBackend(content)
    render(<LUI />)
    await desk()
    await user.click(tab('Learning Desk (max)', 'Catalog'))
    const empty = within(screen.getByRole('region', { name: 'Empty Training' }))
    expect(empty.getByText('No courses in it yet.')).toBeInTheDocument()
    const other = within(screen.getByRole('region', { name: 'Other courses' }))
    expect(other.getByText('A Loose Course')).toBeInTheDocument()
    await user.click(other.getByRole('button', { name: 'Open A Loose Course' }))
    const course = level('A Loose Course (max)')
    expect(within(course).getByText('No modules yet.')).toBeInTheDocument()
    expect(course.getAttribute('style')).toContain('--wr-level-h: 120') // its own colour
    await user.click(tab('A Loose Course (max)', 'Exams'))
    expect(within(course).getByText('No exams yet.')).toBeInTheDocument()
  })

  it('takes a course\'s colour from its first curriculum when it has none of its own', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    expect(level('Writer Course 1 (max)').getAttribute('style')).toContain('--wr-level-h: 30')
  })

  it('says so when a change could not be saved, and leaves things as they were', async () => {
    const user = userEvent.setup()
    const backend = learningBackend()
    render(<LUI />)
    await desk()
    await user.click(tab('Learning Desk (max)', 'Catalog'))
    backend.failNext('/training/enrolments/user-c1', 500, 'The progress could not be saved.')
    await user.click(screen.getByRole('button', { name: 'Enrol in User Course 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The progress could not be saved.')
    expect(screen.getByRole('button', { name: 'Enrol in User Course 1' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Learning (LUI): the courses an earlier version kept on this machine', () => {
  it('carries them over to the backend once, and clears them', async () => {
    const backend = learningBackend()
    setKv('scriblr.training.enrolled', ['writer-c1', 'gone-c1'])
    render(<LUI />)
    await desk()
    await waitFor(() => expect(Object.keys(backend.state.progress.enrolled)).toEqual(['writer-c1']))
    expect(getKv('scriblr.training.enrolled')).toEqual([])
    expect(within(screen.getByRole('list', { name: 'Enrolled courses' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('leaves what the backend already has alone', async () => {
    const backend = learningBackend(undefined, { ...emptyProgress(), enrolled: { 'admin-c1': '2026-11-02T00:00:00Z' } })
    setKv('scriblr.training.enrolled', ['writer-c1'])
    render(<LUI />)
    await desk()
    expect(Object.keys(backend.state.progress.enrolled)).toEqual(['admin-c1'])
    expect(backend.calls.filter(c => c.startsWith('PUT'))).toEqual([])
  })
})

describe('Learning (LUI): what it kept on this machine as Training', () => {
  it('opens where the user was, saved under the old name', async () => {
    learningBackend()
    setKv('scriblr.training.path', { courseId: 'writer-c1', moduleId: 'writer-c1-m1', lessonId: 'writer-c1-m1-l1', work: null })
    render(<LUI />)
    expect(await screen.findByRole('region', { name: 'Lesson 1 (max)' })).toBeInTheDocument()
    expect(level('Module 1 (mid)')).toBeInTheDocument()
  })

  it('keeps saving where the user is under the old name', async () => {
    const user = userEvent.setup()
    learningBackend()
    render(<LUI />)
    await desk()
    await openFromCatalog(user, 'Writer Course 1')
    expect(getKv('scriblr.training.path')).toMatchObject({ courseId: 'writer-c1' })
  })
})
