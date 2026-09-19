import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SaveControl, formatSaveTime } from './SaveControl'
import type { SaveStatus } from '../lib/useAutosave'

const status = (state: SaveStatus['state'], extra: Partial<SaveStatus> = {}): SaveStatus => ({
  state, dirty: state !== 'saved', saving: state === 'saving', error: undefined, lastSavedAt: null, ...extra,
})

const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement

describe('SaveControl', () => {
  it('shows the time of the last save once everything is saved', () => {
    const at = new Date(2026, 0, 15, 15, 42).getTime()
    const { rerender } = render(<SaveControl status={status('saved', { lastSavedAt: at })} onSave={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('3:42 PM')
    expect(screen.getByRole('status').getAttribute('title')).toBe('Last saved at 3:42 PM')
    expect(save().disabled).toBe(true)

    // Nothing saved yet this session.
    rerender(<SaveControl status={status('saved')} onSave={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('—')
    expect(screen.getByRole('status').getAttribute('title')).toBe('No changes saved yet')
  })

  it('shows the other states, and enables Save only when there is something to save', () => {
    const { rerender } = render(<SaveControl status={status('unsaved')} onSave={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes')
    expect(save().disabled).toBe(false)

    rerender(<SaveControl status={status('saving')} onSave={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('Saving…')
    expect(save().disabled).toBe(true)

    rerender(<SaveControl status={status('error', { error: 'offline' })} onSave={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('Save failed')
    expect(screen.getByRole('status').getAttribute('title')).toBe('offline')
    expect(save().disabled).toBe(false)
  })

  it('is an icon button named by its label, calls onSave, and renders extra controls', async () => {
    const onSave = vi.fn()
    render(<SaveControl status={status('unsaved')} onSave={onSave} label="Save draft" extra={<button type="button">Publish</button>} />)
    const button = screen.getByRole('button', { name: 'Save draft' })
    expect(button.textContent).toBe('') // an icon, no text
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.click(button)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
  })
})

describe('SaveControl restore', () => {
  const restoreBtn = () => screen.getByRole('button', { name: 'Restore last saved version' }) as HTMLButtonElement

  it('has no restore button unless the editor supports it, and it needs unsaved changes', () => {
    const { rerender } = render(<SaveControl status={status('unsaved')} onSave={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Restore last saved version' })).toBeNull()
    rerender(<SaveControl status={status('saved')} onSave={() => {}} onRestore={() => {}} />)
    expect(restoreBtn().disabled).toBe(true)
    rerender(<SaveControl status={status('unsaved')} onSave={() => {}} onRestore={() => {}} />)
    expect(restoreBtn().disabled).toBe(false)
  })

  it('sits on the other side of the time from the Save button', () => {
    render(<SaveControl status={status('saved', { lastSavedAt: 1 })} onSave={() => {}} onRestore={() => {}} />)
    const order = [restoreBtn(), screen.getByRole('status'), save()]
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('asks before discarding, and restores on confirmation', async () => {
    const onRestore = vi.fn(async () => {})
    render(<SaveControl status={status('unsaved')} onSave={() => {}} onRestore={onRestore} />)
    await userEvent.click(restoreBtn())
    expect(onRestore).not.toHaveBeenCalled()
    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()

    await userEvent.click(restoreBtn())
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
  })
})

describe('formatSaveTime', () => {
  it('uses a 12-hour clock with AM/PM', () => {
    expect(formatSaveTime(new Date(2026, 0, 15, 0, 5).getTime())).toBe('12:05 AM')
    expect(formatSaveTime(new Date(2026, 0, 15, 9, 30).getTime())).toBe('9:30 AM')
    expect(formatSaveTime(new Date(2026, 0, 15, 12, 0).getTime())).toBe('12:00 PM')
    expect(formatSaveTime(new Date(2026, 0, 15, 23, 59).getTime())).toBe('11:59 PM')
  })
})
