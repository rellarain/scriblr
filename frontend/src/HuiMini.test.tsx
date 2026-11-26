import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HuiMini from './HuiMini'

// The Outbox's count: two pieces of feedback waiting to be sent.
vi.mock('./feedback/staffStore', () => ({ useStaff: () => ({ bundle: { outbox: [{ id: 'fb-1' }, { id: 'fb-2' }] }, status: 'ready', error: null }) }))

const props = {
  conversations: [{ id: 'c1', label: 'Ada' }, { id: 'c2', label: 'Ben' }],
  selectedChatId: null,
  onActivateChats: vi.fn(),
  onCreateChat: vi.fn(),
  panel: 'settings' as const,
  onSelectPanel: vi.fn(),
  expanded: false,
  activeAdminCount: 1,
  activeStandardCount: 2,
  pendingAdminCount: 0,
  pendingStandardCount: 3,
}

describe("HuiMini, HUI's part of the band", () => {
  it('lays out the queue meter, the chats, New chat, the Outbox and Settings, in that order (the Inbox is in the Office)', () => {
    render(<HuiMini {...props} />)
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
      'Queue console: 3 chats in progress (1 escalated), 3 waiting for you (0 escalated)', 'Ada', 'Ben', 'New chat', 'Outbox, 2 to send', 'Settings',
    ])
  })

  it('opens a console, a chat, or a new chat', () => {
    const onSelectPanel = vi.fn(), onActivateChats = vi.fn(), onCreateChat = vi.fn()
    render(<HuiMini {...props} onSelectPanel={onSelectPanel} onActivateChats={onActivateChats} onCreateChat={onCreateChat} />)
    fireEvent.click(screen.getByRole('button', { name: /^Queue console/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Outbox/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ben' }))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(onSelectPanel.mock.calls).toEqual([['queue'], ['outbox'], ['settings']])
    expect(onActivateChats).toHaveBeenCalledWith('c2')
    expect(onCreateChat).toHaveBeenCalledTimes(1)
  })

  it('marks what the open panel shows, and nothing while the panel is folded into the band', () => {
    const { rerender } = render(<HuiMini {...props} panel="queue" />)
    expect(screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0)
    rerender(<HuiMini {...props} panel="queue" expanded />)
    expect(screen.getByRole('button', { name: /^Queue console/ })).toHaveAttribute('aria-pressed', 'true')
    rerender(<HuiMini {...props} expanded selectedChatId="c1" />)
    expect(screen.getByRole('button', { name: 'Ada' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('gives each chat a 5px block of the meter below 30 chats, and shares the width out from 30 on', () => {
    const { container, rerender } = render(<HuiMini {...props} />)
    const widths = () => [...container.querySelectorAll<HTMLElement>('.queueButtonSegment')].map(s => s.style.width)
    expect(widths()).toEqual(['15px', '5px', '10px'])
    rerender(<HuiMini {...props} pendingStandardCount={30} />)
    expect(widths()).toEqual(['auto', 'auto', 'auto'])
  })

  it('leaves out the chat row when there are no chats', () => {
    render(<HuiMini {...props} conversations={[]} />)
    expect(screen.queryByRole('group', { name: 'Active chats' })).toBeNull()
  })
})
