import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockFetch } from '../../test/mockFetch'
import TUI from './TUI'

beforeEach(() => { mockFetch() })

const level = (name: string) => screen.getByRole('region', { name })
const tab = (levelName: string, label: string) => within(level(levelName)).getByRole('button', { name: label })

// Opens a course from the Desk's catalog.
async function openFromCatalog(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(tab('Training Desk (max)', 'Catalog'))
  await user.click(screen.getByRole('button', { name: `Open ${title}` }))
}

describe('Training (TUI)', () => {
  it('opens on the Desk alone, with the Courses tab open and nothing enrolled', () => {
    render(<TUI />)
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label')).filter(n => /^Training Desk/.test(n ?? ''))).toEqual(['Training Desk (max)'])
    expect(screen.queryByRole('region', { name: /\((mid|min)\)$/ })).toBeNull()
    expect(within(level('Training Desk (max)')).getByText('Your training dash, with all the courses you are enrolled in.')).toBeInTheDocument()
    expect(screen.getByText(/not enrolled in any course yet/)).toBeInTheDocument()
    expect(within(level('Training Desk (max)')).getAllByRole('button').map(b => b.getAttribute('aria-label')).filter(Boolean)).toEqual(expect.arrayContaining(['Courses', 'Catalog', 'Settings', 'Help']))
  })

  it('lists the courses of the five curricula in the Catalog, grouped by curriculum, and enrols in one onto the Courses tab', async () => {
    const user = userEvent.setup()
    render(<TUI />)
    await user.click(tab('Training Desk (max)', 'Catalog'))
    const groups = screen.getAllByRole('region').filter(r => r.classList.contains('trGroup'))
    expect(groups.map(g => g.querySelector('.trGroupTitle')?.textContent)).toEqual(['User Training', 'Reader Training', 'Translator Training', 'Writer Training', 'Admin Training'])
    expect(groups.map(g => [...g.querySelectorAll('.trRowTitle')].map(t => t.textContent))).toEqual([['User Course 1'], ['Reader Course 1'], ['Translator Course 1'], ['Writer Course 1'], ['Admin Course 1']])
    const catalog = within(screen.getByRole('list', { name: 'Courses of Writer Training' }))
    await user.click(catalog.getByRole('button', { name: 'Enrol in Writer Course 1' }))
    expect(catalog.getByRole('button', { name: 'Leave Writer Course 1' })).toHaveAttribute('aria-pressed', 'true')
    const enrolled = within(screen.getByRole('list', { name: 'Enrolled courses' }))
    expect(enrolled.getAllByRole('listitem')).toHaveLength(1)
    await user.click(catalog.getByRole('button', { name: 'Leave Writer Course 1' }))
    expect(screen.queryByRole('list', { name: 'Enrolled courses' })).toBeNull()
  })

  it('stacks a level for each thing opened: course, module, lesson, exercise, with the focus on the deepest', async () => {
    const user = userEvent.setup()
    render(<TUI />)
    await openFromCatalog(user, 'Writer Course 1')
    expect(level('Writer Course 1 (max)')).toBeInTheDocument()
    expect(level('Training Desk (mid)')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Modules')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Exams')).toBeInTheDocument()
    expect(tab('Writer Course 1 (max)', 'Projects')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    expect(level('Module 1 (max)')).toBeInTheDocument()
    expect(level('Writer Course 1 (mid)')).toBeInTheDocument()
    expect(level('Training Desk (min)')).toBeInTheDocument()
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

  it('takes a project from the course straight to Practice, with no Module or Lesson level', async () => {
    const user = userEvent.setup()
    render(<TUI />)
    await openFromCatalog(user, 'Reader Course 1')
    await user.click(tab('Reader Course 1 (max)', 'Projects'))
    await user.click(screen.getByRole('button', { name: 'Open Project 1' }))
    expect(level('Project 1 (max)')).toBeInTheDocument()
    expect(level('Reader Course 1 (mid)')).toBeInTheDocument()
    expect(level('Training Desk (min)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^(Module|Lesson) 1/ })).toBeNull()
    expect(within(level('Project 1 (max)')).getByText(/produces a working product on completion/)).toBeInTheDocument()
  })

  it('brings a level back with its title, closing what is below it, and toggles a level between Min and Mid', async () => {
    const user = userEvent.setup()
    render(<TUI />)
    await openFromCatalog(user, 'Admin Course 1')
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Lesson 1' }))
    // The Desk is Min here: its chevron opens it to Mid, and folds it back.
    await user.click(screen.getByRole('button', { name: 'Expand Training Desk' }))
    expect(level('Training Desk (mid)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Minimize Training Desk' }))
    expect(level('Training Desk (min)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Admin Course 1', description: 'Open Admin Course 1' }))
    expect(level('Admin Course 1 (max)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^(Module|Lesson) 1/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Training Desk', description: 'Open Training Desk' }))
    expect(level('Training Desk (max)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Admin Course 1 \(/ })).toBeNull()
  })

  it('keeps where you are and what you enrolled in when it is opened again', async () => {
    const user = userEvent.setup()
    const first = render(<TUI />)
    await openFromCatalog(user, 'Translator Course 1')
    await user.click(screen.getByRole('button', { name: 'Enrol in Translator Course 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Module 1' }))
    first.unmount()
    render(<TUI />)
    expect(level('Module 1 (max)')).toBeInTheDocument()
    expect(level('Translator Course 1 (mid)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Training Desk', description: 'Open Training Desk' }))
    expect(within(screen.getByRole('list', { name: 'Enrolled courses' })).getAllByRole('listitem')).toHaveLength(1)
  })
})
