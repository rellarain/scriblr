import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getKv, setKv, __resetSettingsForTests } from '../../../settings/settingsStore'
import { makeWorkspace } from '../../../test/makeWorkspace'
import { mockFetch } from '../../../test/mockFetch'
import { NOTES_KEY, Scratchpad, type Note } from './Dashboard'
import { outlineNode } from './plotTestWorkspace'

// The Dash's Scratchpad with the workspace: a note being edited can be converted into part of a project, and is kept marked with what it became
// or goes.

const OUTLINE = [outlineNode('b1', 'book', null, { title: 'The Lantern Road' }), outlineNode('c1', 'chapter', 'b1', { title: 'The Courier' })]
const workspace = () => makeWorkspace({
  activeProjectId: 'p1', projects: [{ projectId: 'p1', title: 'Harbour Lights' }] as never, outlineNodes: OUTLINE, plotNodes: [],
  addOutlineNode: vi.fn(() => 'new'),
})
const notes = () => getKv<Note[]>(NOTES_KEY) ?? []

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
  setKv(NOTES_KEY, [{ id: 'n1', title: 'The ferryman knows', body: 'He says it first.' }, { id: 'n2', title: 'A bell rung twice', body: '' }])
})

const edit = (title: string) => fireEvent.focus(screen.getByDisplayValue(title))

describe('converting a Scratchpad note', () => {
  it('opens the panel from the note being edited, and keeps the note marked with what it became', async () => {
    const w = workspace()
    render(<Scratchpad bare w={w} />)
    expect(screen.queryByRole('button', { name: /Convert/ })).toBeNull() // only on the note being edited
    edit('The ferryman knows')
    await userEvent.click(screen.getByRole('button', { name: /Convert/ }))
    const panel = screen.getByRole('region', { name: 'Convert this note' })
    await userEvent.selectOptions(within(panel).getByLabelText('A new'), 'chapter')
    await userEvent.click(within(panel).getByRole('button', { name: 'Convert' }))
    expect(w.addOutlineNode).toHaveBeenCalledWith('b1', 'chapter', { title: 'The ferryman knows', synopsis: 'He says it first.' })
    expect(screen.queryByRole('region', { name: 'Convert this note' })).toBeNull()
    expect(screen.getByText('Became an outline node in Harbour Lights')).toBeTruthy()
    expect(notes()[0].became).toMatchObject({ target: 'outline', projectId: 'p1', projectTitle: 'Harbour Lights' })
  })

  it('removes the note when it is not to be kept', async () => {
    render(<Scratchpad bare w={workspace()} />)
    edit('A bell rung twice')
    await userEvent.click(screen.getByRole('button', { name: /Convert/ }))
    const panel = screen.getByRole('region', { name: 'Convert this note' })
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Keep the note, marked with what it became' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Convert' }))
    expect(notes().map(n => n.id)).toEqual(['n1'])
  })

  it('has no Convert without the workspace', () => {
    render(<Scratchpad bare />)
    edit('The ferryman knows')
    expect(screen.queryByRole('button', { name: /Convert/ })).toBeNull()
  })
})
