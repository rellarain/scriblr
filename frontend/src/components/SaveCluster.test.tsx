import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutosavePill, AutosaveToggle } from './AutosaveToggle'
import { SaveCluster, formatSaveTime, type SaveAutosave, type SaveHistory } from './SaveCluster'
import type { SaveStatus } from '../lib/useAutosave'

const status = (state: SaveStatus['state'], extra: Partial<SaveStatus> = {}): SaveStatus => ({
  state, dirty: state !== 'saved', saving: state === 'saving', error: undefined, lastSavedAt: null, ...extra,
})
const history = (extra: Partial<SaveHistory> = {}): SaveHistory => ({ canUndo: false, canRedo: false, onUndo: () => {}, onRedo: () => {}, ...extra })
const autosave = (extra: Partial<SaveAutosave> = {}): SaveAutosave => ({ mode: 0, onChange: () => {}, nextSaveAt: null, wait: null, ...extra })

const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const undo = () => screen.queryByRole('button', { name: 'Undo' }) as HTMLButtonElement | null
const redo = () => screen.queryByRole('button', { name: 'Redo' }) as HTMLButtonElement | null

describe('SaveCluster: what shows', () => {
  it('saved with nothing to undo: only the disabled Save button and the time of the last save', () => {
    const at = new Date(2026, 0, 15, 15, 42).getTime()
    render(<SaveCluster status={status('saved', { lastSavedAt: at })} onSave={() => {}} history={history()} />)
    expect(save().disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('3:42 PM')
    expect(save().getAttribute('title')).toBe('Last saved at 3:42 PM')
    expect(undo()).toBeNull()
    expect(redo()).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('has no text before anything was saved: no dash, no state', () => {
    render(<SaveCluster status={status('saved')} onSave={() => {}} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(save().textContent).toBe('')
    expect(save().getAttribute('title')).toBe('No changes saved yet')
  })

  it('saved, with a change today: the enabled Undo beside the disabled Save', () => {
    render(<SaveCluster status={status('saved', { lastSavedAt: 1 })} onSave={() => {}} history={history({ canUndo: true })} />)
    expect(undo()!.disabled).toBe(false)
    expect(save().disabled).toBe(true)
    expect(redo()).toBeNull()
    const order = [undo()!, save()]
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('after an Undo: Save is enabled and Redo appears; after a change Redo goes and Save and Undo are enabled', () => {
    const { rerender } = render(<SaveCluster status={status('unsaved')} onSave={() => {}} history={history({ canUndo: false, canRedo: true })} />)
    expect(save().disabled).toBe(false)
    expect(redo()!.disabled).toBe(false)
    expect(undo()).toBeNull()
    rerender(<SaveCluster status={status('unsaved')} onSave={() => {}} history={history({ canUndo: true, canRedo: false })} />)
    expect(redo()).toBeNull()
    expect(undo()!.disabled).toBe(false)
    expect(save().disabled).toBe(false)
  })

  it('enables Save only when there is something to save, and says nothing in words about the state', () => {
    const { rerender } = render(<SaveCluster status={status('unsaved')} onSave={() => {}} />)
    expect(screen.queryByText(/unsaved|saving|failed/i)).toBeNull()
    expect(save().disabled).toBe(false)
    rerender(<SaveCluster status={status('saving')} onSave={() => {}} />)
    expect(screen.queryByText(/unsaved|saving|failed/i)).toBeNull()
    expect(save().disabled).toBe(true)
    rerender(<SaveCluster status={status('error', { error: 'offline' })} onSave={() => {}} />)
    expect(screen.queryByText(/unsaved|saving|failed/i)).toBeNull()
    expect(save().getAttribute('title')).toBe('offline') // the reason is the tooltip
    expect(save().disabled).toBe(false)
  })

  it('has no state bubble or dot', () => {
    render(<SaveCluster status={status('unsaved')} onSave={() => {}} />)
    expect(document.querySelector('.saveState, .saveDot')).toBeNull()
  })

  it('the only text is the time of the last save, even while unsaved, once there has been one', () => {
    const at = new Date(2026, 0, 15, 9, 5).getTime()
    render(<SaveCluster status={status('unsaved', { lastSavedAt: at })} onSave={() => {}} />)
    expect(save().textContent).toBe('9:05 AM')
  })

  it('has no Reset: nothing offers to discard unsaved changes', () => {
    render(<SaveCluster status={status('unsaved')} onSave={() => {}} history={history({ canUndo: true })} />)
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
    expect(screen.queryByText(/discard/i)).toBeNull()
  })

  it('is icon buttons named by label, calls the handlers, and renders extra controls', async () => {
    const onSave = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(<SaveCluster
      status={status('unsaved')} onSave={onSave} label="Save draft" history={history({ canUndo: true, canRedo: true, onUndo, onRedo })}
      extra={<button type="button">Publish</button>}
    />)
    const button = screen.getByRole('button', { name: 'Save draft' })
    expect(button.textContent).toBe('') // an icon; the time of a save appears on hover
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.click(button)
    await userEvent.click(undo()!)
    await userEvent.click(redo()!)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
  })

  it('is one rounded container holding the buttons and the time', () => {
    render(<SaveCluster status={status('saved', { lastSavedAt: 1 })} onSave={() => {}} history={history({ canUndo: true })} />)
    const cluster = document.querySelector('.saveCluster') as HTMLElement
    expect(document.querySelectorAll('.saveCluster')).toHaveLength(1)
    expect(cluster.contains(undo())).toBe(true)
    expect(cluster.contains(save())).toBe(true)
    expect(cluster.contains(screen.getByRole('status'))).toBe(true)
  })

  it('puts the time inside the Save button, on the left of the icon', () => {
    const at = new Date(2026, 0, 15, 15, 42).getTime()
    render(<SaveCluster status={status('saved', { lastSavedAt: at })} onSave={() => {}} />)
    const time = screen.getByRole('status')
    expect(save().contains(time)).toBe(true)
    expect(save().getAttribute('title')).toBe('Last saved at 3:42 PM')
    const icon = save().querySelector('svg')!
    expect(time.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('marks the Save button with the state, for the dot', () => {
    const { rerender } = render(<SaveCluster status={status('saved')} onSave={() => {}} />)
    expect(save().className).toContain('saveBtnState--saved')
    rerender(<SaveCluster status={status('unsaved')} onSave={() => {}} />)
    expect(save().className).toContain('saveBtnState--unsaved')
    rerender(<SaveCluster status={status('error', { error: 'offline' })} onSave={() => {}} />)
    expect(save().className).toContain('saveBtnState--error')
  })
})

describe('SaveCluster: the autosave toggle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('offers Off, 1, 5 and 10 minutes beside Save, and tells which is chosen', () => {
    render(<SaveCluster status={status('saved')} onSave={() => {}} autosave={autosave({ mode: 300 })} />)
    const group = screen.getByRole('radiogroup', { name: 'Autosave' })
    const options = Array.from(group.querySelectorAll('[role=radio]')).map(o => [o.textContent, o.getAttribute('aria-checked')])
    expect(options).toEqual([['Off', 'false'], ['1 min', 'false'], ['5 min', 'true'], ['10 min', 'false']])
  })

  it('changes the autosave from an option', () => {
    const onChange = vi.fn()
    render(<SaveCluster status={status('saved')} onSave={() => {}} autosave={autosave({ onChange })} />)
    fireEvent.click(screen.getByRole('radio', { name: '10 min' }))
    expect(onChange).toHaveBeenCalledWith(600)
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('opens on a long press of Save without saving, and a tap still saves', () => {
    const onSave = vi.fn()
    render(<SaveCluster status={status('unsaved')} onSave={onSave} autosave={autosave()} />)
    const reveal = document.querySelector('.saveReveal') as HTMLElement
    // A tap.
    fireEvent.pointerDown(reveal)
    fireEvent.pointerUp(reveal)
    fireEvent.click(save())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(reveal.className).not.toContain('saveReveal--open')
    // A press and hold.
    fireEvent.pointerDown(reveal)
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.pointerUp(reveal)
    expect(reveal.className).toContain('saveReveal--open')
    fireEvent.click(save()) // the click that ends the hold does not save
    expect(onSave).toHaveBeenCalledTimes(1)
    // Escape closes it.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(reveal.className).not.toContain('saveReveal--open')
  })

  it('shows the 4 x 24 timer pill only when autosave is on', () => {
    const { rerender } = render(<SaveCluster status={status('saved')} onSave={() => {}} autosave={autosave({ mode: 0 })} />)
    expect(document.querySelector('.autosavePill')).toBeNull()
    rerender(<SaveCluster status={status('saved')} onSave={() => {}} autosave={autosave({ mode: 60, wait: 60_000 })} />)
    expect(document.querySelector('.autosavePill')).not.toBeNull()
  })
})

describe('AutosavePill', () => {
  it('is full and still while nothing waits, and starts to deplete over the wait once input has stopped', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { rerender } = render(<AutosavePill mode={60} nextSaveAt={null} wait={60_000} />)
    expect(document.querySelector('.autosavePill--running')).toBeNull()
    rerender(<AutosavePill mode={60} nextSaveAt={Date.now() + 45_000} wait={60_000} />)
    const fill = document.querySelector('.autosavePillFill') as HTMLElement
    expect(document.querySelector('.autosavePill--running')).not.toBeNull()
    expect(fill.style.animationDuration).toBe('60000ms')
    expect(fill.style.animationDelay).toBe('-15000ms') // 15s of the 60s are gone
    vi.useRealTimers()
  })

  it('renders nothing when autosave is off', () => {
    render(<AutosavePill mode={0} nextSaveAt={null} wait={null} />)
    expect(document.querySelector('.autosavePill')).toBeNull()
  })
})

describe('AutosaveToggle', () => {
  it('is a radio group of the four choices', () => {
    render(<AutosaveToggle mode={0} onChange={() => {}} />)
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Off', '1 min', '5 min', '10 min'])
  })
})

describe('SaveCluster: keys', () => {
  it('Ctrl+S saves, Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, for the level the pointer was last in', () => {
    const onSave = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(
      <div>
        <section data-level="project">
          <SaveCluster status={status('unsaved')} onSave={onSave} history={history({ canUndo: true, canRedo: true, onUndo, onRedo })} />
          <p data-testid="inside">text</p>
        </section>
        <p data-testid="outside">elsewhere</p>
      </div>,
    )
    // Nothing has been used yet: the keys do nothing here.
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTestId('inside'))
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(2)

    // The pointer went elsewhere: not this level any more.
    fireEvent.pointerDown(screen.getByTestId('outside'))
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('leaves Ctrl+Z to a text field while typing in it, but still saves on Ctrl+S', () => {
    const onSave = vi.fn()
    const onUndo = vi.fn()
    render(
      <section data-level="outline">
        <SaveCluster status={status('unsaved')} onSave={onSave} history={history({ canUndo: true, onUndo })} />
        <input aria-label="Title" />
      </section>,
    )
    const input = screen.getByLabelText('Title')
    fireEvent.focusIn(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(onUndo).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 's', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('does not save with Ctrl+S when everything is saved', () => {
    const onSave = vi.fn()
    render(<section data-level="dash"><SaveCluster status={status('saved')} onSave={onSave} /><p data-testid="in">x</p></section>)
    fireEvent.pointerDown(screen.getByTestId('in'))
    fireEvent.keyDown(document, { key: 's', ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()
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
