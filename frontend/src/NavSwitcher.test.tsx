import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mainOf, redirectOf } from './App'
import NavSwitcher from './NavSwitcher'

describe('NavSwitcher', () => {
  it('offers Reader, Learning and Writer, and marks the active one', async () => {
    const onSelect = vi.fn()
    render(<NavSwitcher active="learning" onSelect={onSelect} vuiOpen={false} />)
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Reader', 'Learning', 'Writer'])
    expect(screen.getByRole('button', { name: 'Learning' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Writer' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Reader' }))
    expect(onSelect).toHaveBeenCalledWith('reader')
  })

  it('shows no page as active while the base layer is open', () => {
    render(<NavSwitcher active="learning" onSelect={() => {}} vuiOpen />)
    expect(screen.getByRole('button', { name: 'Learning' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('mainOf', () => {
  it('reads the page from the address: /read, /learn, and the Writer for anything else', () => {
    expect(mainOf('/read')).toBe('reader')
    expect(mainOf('/read/nook/stack')).toBe('reader')
    expect(mainOf('/learn')).toBe('learning')
    expect(mainOf('/learn/anything')).toBe('learning')
    expect(mainOf('/write')).toBe('writer')
    expect(mainOf('/')).toBe('writer')
    expect(mainOf('/translate')).toBe('writer') // the Translator is gone: its old address opens the Writer
    expect(mainOf('/learner')).toBe('writer')
  })

  it("takes Learning's old address, /train, as Learning's (so nothing else shows before it moves)", () => {
    expect(mainOf('/train')).toBe('learning')
    expect(mainOf('/train/anything')).toBe('learning')
    expect(mainOf('/trainer')).toBe('writer')
  })
})

describe('redirectOf', () => {
  it("sends the bare address to the Writer, and Learning's old address to its new one", () => {
    expect(redirectOf('/')).toBe('/write')
    expect(redirectOf('/train')).toBe('/learn')
    expect(redirectOf('/train/anything')).toBe('/learn/anything')
  })

  it("leaves a page's own address alone", () => {
    expect(redirectOf('/learn')).toBeNull()
    expect(redirectOf('/write')).toBeNull()
    expect(redirectOf('/read')).toBeNull()
    expect(redirectOf('/trainer')).toBeNull()
  })
})
