import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mainOf } from './App'
import NavSwitcher from './NavSwitcher'

describe('NavSwitcher', () => {
  it('offers Reader, Training and Writer, and marks the active one', async () => {
    const onSelect = vi.fn()
    render(<NavSwitcher active="training" onSelect={onSelect} vuiOpen={false} />)
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Reader', 'Training', 'Writer'])
    expect(screen.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Writer' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Reader' }))
    expect(onSelect).toHaveBeenCalledWith('reader')
  })

  it('shows no page as active while the base layer is open', () => {
    render(<NavSwitcher active="training" onSelect={() => {}} vuiOpen />)
    expect(screen.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('mainOf', () => {
  it('reads the page from the address: /read, /train, and the Writer for anything else', () => {
    expect(mainOf('/read')).toBe('reader')
    expect(mainOf('/read/nook/stack')).toBe('reader')
    expect(mainOf('/train')).toBe('training')
    expect(mainOf('/train/anything')).toBe('training')
    expect(mainOf('/write')).toBe('writer')
    expect(mainOf('/')).toBe('writer')
    expect(mainOf('/translate')).toBe('writer') // the Translator is gone: its old address opens the Writer
    expect(mainOf('/trainer')).toBe('writer')
  })
})
