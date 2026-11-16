import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../api/resourcesApi'
import * as trainingApi from '../../api/trainingApi'
import type { ResourceNode, ResourcesFile, TrainingState } from '../../api/types'
import HelpArticles from '../../assets/Interfaces/writer/levels/HelpArticles'
import Markup, { MarkupInline } from './Markup'
import MarkupEditor from './MarkupEditor'

// Links in the markup (K2): titles from the permanent ids, a "not found" mark, opening in place with Back, and the editor's picker and checks.

const node = (id: string, kind: ResourceNode['kind'], parentId: string | null, name: string): ResourceNode => ({ id, kind, parentId, name, order: 0 })
const FILE: ResourcesFile = {
  schemaVersion: 2,
  nodes: [node('writer', 'interface', null, 'Writer'), node('writer/draft', 'console', 'writer', 'Draft'), node('writer/shelf', 'console', 'writer', 'Shelf')],
  content: {
    'writer/draft': { guide: 'Start on the @writer@shelf, then read @writer@shelf#putting-books-away[how to tidy].\n\nAlso @writer@gone.', tutorials: [], faq: [] },
    'writer/shelf': { guide: '###### The shelf\n\nBooks live here.\n\n#### Putting books away\n\nTidy.', tutorials: [], faq: [] },
  },
  assessments: {},
}
const TRAINING: TrainingState = {
  content: { schemaVersion: 2, curricula: [], courses: [{ id: 'c1', title: 'Plotting', description: '', hue: null, projects: [], exams: [], modules: [{ id: 'm1', title: 'Acts', description: '', tests: [], lessons: [{ id: 'l1', title: 'Three acts', description: 'About acts.', body: '###### The middle\n\nThe long part.', exercises: [], quizzes: [] }] }] }] },
  progress: { schemaVersion: 2, enrolled: {}, completed: {}, attempts: {} },
}
const serve = () => {
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(FILE)
  vi.spyOn(trainingApi, 'getTraining').mockResolvedValue(TRAINING)
}

describe('links', () => {
  it('read as the current title, or the label, with a "not found" mark on one that goes nowhere', async () => {
    serve()
    render(<Markup text={'See @writer@shelf, @training@c1@m1@l1, @writer@draft[the draft guide] and @writer@gone.'} />)
    expect(await screen.findByText('Shelf')).toHaveClass('mkLink')
    expect(await screen.findByText('Three acts')).toBeInTheDocument()
    expect(screen.getByText('the draft guide')).toBeInTheDocument()
    const missing = screen.getByText('@writer@gone').closest('.mkLink--missing')!
    expect(missing).toHaveTextContent('not found')
    expect(missing).toHaveAttribute('title', 'There is no writer › gone.')
  })

  it('show as text inside a row, never as a button', async () => {
    serve()
    render(<button type="button"><MarkupInline text={'Read @writer@shelf first'} /></button>)
    expect(await screen.findByText(/Shelf/)).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('open in place in a Help tile, with Back, and the focus goes back to the link', async () => {
    serve()
    const user = userEvent.setup()
    render(<HelpArticles target={{ id: 'writer/draft', aliases: [] }} fallback="none" />)
    const link = await screen.findByRole('button', { name: 'Shelf' })
    await user.click(link)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(document.activeElement).toBe(back)
    expect(screen.getByRole('heading', { name: 'The shelf' })).toBeInTheDocument()
    // what was there is kept, hidden
    expect(screen.getByText(/Start on the/)).not.toBeVisible()
    await user.click(back)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Shelf' }))
  })

  it('to a heading in another article opens it there and goes to the heading', async () => {
    serve()
    const user = userEvent.setup()
    render(<HelpArticles target={{ id: 'writer/draft', aliases: [] }} fallback="none" />)
    await user.click(await screen.findByRole('button', { name: 'how to tidy' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Putting books away' })))
  })
})

function Editor({ start }: { start: string }) {
  const [text, setText] = useState(start)
  return <MarkupEditor value={text} onChange={setText} label="Guide" />
}

describe('the editor and links', () => {
  it('picks a link by title as it is typed, and puts its id path in', async () => {
    serve()
    render(<Editor start="" />)
    const field = screen.getByRole('textbox', { name: 'Guide' }) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'Read @sh', selectionStart: 8, selectionEnd: 8 } })
    const list = await screen.findByRole('listbox', { name: 'Link to' })
    expect(field).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(within(list).getByRole('option', { name: /Writer › Shelf/ })).toBeInTheDocument())
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('Read @writer@shelf')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes the picker with Escape, and lists a broken link among the checks', async () => {
    serve()
    render(<Editor start={'Fine @writer@shelf\n\nBroken @writer@gone'} />)
    expect(await screen.findByRole('button', { name: /Line 3 @writer@gone goes nowhere/ })).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Guide' }) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: `${field.value} @`, selectionStart: field.value.length + 2, selectionEnd: field.value.length + 2 } })
    expect(await screen.findByRole('listbox', { name: 'Link to' })).toBeInTheDocument()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
