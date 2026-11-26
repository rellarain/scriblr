import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mainOf, redirectOf } from './App'
import NavSwitcher from './NavSwitcher'

const props = {
  active: 'learning' as const, onSelect: vi.fn(), vuiOpen: false,
  isAdmin: true, auiOn: false, onToggleAui: vi.fn(), huiOn: false, onToggleHui: vi.fn(), waitingChats: 0,
}

describe('NavSwitcher, the interface container', () => {
  it('holds the side interfaces (Admin, Helper), then the pages (Writer, Reader, Learning), and marks the page that is on', async () => {
    const onSelect = vi.fn()
    render(<NavSwitcher {...props} onSelect={onSelect} />)
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Admin', 'Helper', 'Writer', 'Reader', 'Learning'])
    expect(screen.getByRole('group', { name: 'Side interfaces' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Learning' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Writer' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Reader' }))
    expect(onSelect).toHaveBeenCalledWith('reader')
  })

  it('shows no page as active while the base layer is open', () => {
    render(<NavSwitcher {...props} vuiOpen />)
    expect(screen.getByRole('button', { name: 'Learning' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers Admin only to admins', () => {
    render(<NavSwitcher {...props} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Helper', 'Writer', 'Reader', 'Learning'])
  })

  it('turns Admin and Helper on and off, each on its own', async () => {
    const onToggleAui = vi.fn(), onToggleHui = vi.fn()
    const { rerender } = render(<NavSwitcher {...props} onToggleAui={onToggleAui} onToggleHui={onToggleHui} />)
    await userEvent.click(screen.getByRole('button', { name: 'Admin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Helper' }))
    expect(onToggleAui).toHaveBeenCalledTimes(1)
    expect(onToggleHui).toHaveBeenCalledTimes(1)
    rerender(<NavSwitcher {...props} auiOn huiOn />)
    expect(screen.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Helper' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("counts the waiting chats on Helper while it is off, and not once it is on (the band's queue meter shows them)", () => {
    const { rerender } = render(<NavSwitcher {...props} waitingChats={3} />)
    expect(screen.getByRole('button', { name: 'Helper, 3 waiting' })).toHaveTextContent('3')
    rerender(<NavSwitcher {...props} waitingChats={3} huiOn />)
    expect(screen.getByRole('button', { name: 'Helper' })).toHaveTextContent('')
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
