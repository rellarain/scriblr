import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubjectField } from './SubjectField'
import { TAXONOMY } from './inboxTestData'

const field = () => screen.getByRole('combobox')
const options = () => screen.queryAllByRole('option').map(o => o.textContent)
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const key = (k: string) => fireEvent.keyDown(field(), { key: k })

function setup(start: { page?: string | null; console?: string | null; component?: string | null } = {}) {
  const onAdd = vi.fn()
  render(<SubjectField taxonomy={TAXONOMY} start={start} disabled={false} onAdd={onAdd} />)
  return { onAdd }
}

describe('SubjectField', () => {
  it('starts at the page, with suggestions below the field when it is focused', () => {
    setup()
    expect(field()).toHaveAttribute('placeholder', 'Add a page…')
    fireEvent.focus(field())
    expect(options()).toEqual(['Reader', 'Writer'])
  })

  it('filters the suggestions as you type', () => {
    setup()
    fireEvent.focus(field())
    type('wr')
    expect(options()).toEqual(['Writer'])
    type('r')
    expect(options()).toEqual(['Reader', 'Writer'])   // starts-with first, then contains
  })

  it('"/" takes the typed text when it matches, clears the field and moves the level into the small text above', () => {
    setup()
    fireEvent.focus(field())
    type('writer/')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Writer')
    expect(field()).toHaveValue('')
    expect(field()).toHaveAttribute('placeholder', 'Add a console…')
    expect(options()).toEqual(['Shelf'])
    type('shelf/')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Writer / Shelf')
    expect(options()).toEqual(['Sidebar Shelf'])
  })

  it('"/" with text that matches nothing just drops the slash', () => {
    setup()
    type('zzz/')
    expect(field()).toHaveValue('zzz')
    expect(screen.queryByLabelText('Chosen so far')).not.toBeInTheDocument()
  })

  it('Enter takes the top suggestion and the arrows choose another', () => {
    setup()
    fireEvent.focus(field())
    key('Enter')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Reader')
    key('Backspace')
    expect(screen.queryByLabelText('Chosen so far')).not.toBeInTheDocument()
    key('ArrowDown')
    key('Enter')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Writer')
  })

  it('Backspace in an empty field steps back up a level; Escape closes the list', () => {
    setup()
    fireEvent.focus(field())
    type('reader/')
    type('library/')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Reader / Library')
    key('Backspace')
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Reader')
    expect(screen.getByLabelText('Chosen so far').textContent).not.toContain('Library')
    key('Escape')
    expect(options()).toEqual([])
  })

  it('a click on a suggestion works like Enter', () => {
    setup()
    fireEvent.focus(field())
    fireEvent.click(screen.getByRole('option', { name: 'Writer' }).querySelector('button')!)
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Writer')
  })

  it('choosing a feature adds the subject, then a plus button offers another', () => {
    const { onAdd } = setup()
    fireEvent.focus(field())
    type('reader/')
    type('library/')
    type('browse/')
    expect(options()).toEqual(['Search', 'Shelves'])
    type('sea')
    key('Enter')
    expect(onAdd).toHaveBeenCalledWith({ page: 'Reader', console: 'Library', component: 'Browse', feature: 'Search' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add another subject' }))
    expect(field()).toHaveAttribute('placeholder', 'Add a page…')
  })

  it('starts where the sender was, as far as that exists', () => {
    setup({ page: 'Writer', console: 'Shelf', component: 'Sidebar Shelf' })
    expect(screen.getByLabelText('Chosen so far')).toHaveTextContent('Writer / Shelf / Sidebar Shelf')
    expect(field()).toHaveAttribute('placeholder', 'Add a feature…')
  })

  it('stops at the first level that is not in the tree', () => {
    setup({ page: 'Writer', console: 'Nowhere', component: 'Sidebar Shelf' })
    expect(screen.getByLabelText('Chosen so far').textContent).toBe('Writer')
  })

  it('is disabled with the rest of a locked stage', () => {
    render(<SubjectField taxonomy={TAXONOMY} start={{}} disabled onAdd={() => {}} />)
    expect(field()).toBeDisabled()
  })
})
