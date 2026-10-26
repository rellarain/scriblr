import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeWorkspace } from '../../../test/makeWorkspace'
import ProjectEditor from './ProjectEditor'
import { PROJECT_NAME_MAX } from './useWriterWorkspace'

// The colour slider and the time systems have their own tests; here only the project's name.
vi.mock('./HueSlider', () => ({ default: () => <div>colour slider</div> }))
vi.mock('./TimeSystemEditor', () => ({ default: () => <div>time systems</div> }))

function editor() {
  const renameProject = vi.fn()
  render(<ProjectEditor w={makeWorkspace({ activeProject: { projectId: 'p1', title: 'First' }, projectHue: 200, renameProject })} />)
  return { renameProject, field: screen.getByRole('textbox', { name: 'Project name' }) as HTMLInputElement }
}

describe('ProjectEditor: the project\'s name', () => {
  it('shows the name the project has, in a field that stops at the longest name', () => {
    const { field } = editor()
    expect(field.value).toBe('First')
    expect(field.maxLength).toBe(PROJECT_NAME_MAX)
  })

  it('renames the project as a name is typed', () => {
    const { field, renameProject } = editor()
    fireEvent.change(field, { target: { value: 'Second' } })
    expect(renameProject).toHaveBeenLastCalledWith('Second')
    expect(field.value).toBe('Second')
  })

  it('lets the field be cleared on the way to another name, says the project keeps its name, and puts the name back on leaving', () => {
    const { field } = editor()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.change(field, { target: { value: '   ' } })
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('status').textContent).toMatch(/needs a name.*“First”/)

    fireEvent.blur(field)
    expect(field.value).toBe('First')
    expect(field.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
