import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import type { HelperChats } from './helper/useHelperChats'
import HUI from './HUI'
import { mockFetch } from '../../test/mockFetch'

vi.mock('./helper/inbox/InboxSection', () => ({ default: () => <div>inbox console</div> }))
vi.mock('./helper/ChatsSection', () => ({ default: () => <div>chat console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const helper = (selectedChatId: string | null = null) => ({ selectedChatId } as unknown as HelperChats)
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('HUI (the Helper panel as tiles)', () => {
  it('opens the tile the sidebar buttons chose, and a chosen chat wins', () => {
    const { rerender } = render(<HUI side="right" helper={helper()} panel="settings" />)
    expect(tile('settings')).toBeTruthy()
    expect(tile('inbox')).toBeNull()
    rerender(<HUI side="right" helper={helper()} panel="inbox" />)
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeTruthy()
    expect(screen.getByText('inbox console')).toBeTruthy()
    expect(tile('settings')).toBeNull()
    rerender(<HUI side="right" helper={helper('chat-1')} panel="inbox" />)
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('chat console')).toBeTruthy()
    expect(tile('inbox')).toBeNull()
  })

  it('opens the other tiles from the tab bar, which keeps the others where they were', async () => {
    const user = userEvent.setup()
    render(<HUI side="right" helper={helper()} panel="inbox" />)
    const bar = screen.getByRole('toolbar', { name: 'Helper tiles tabs' })
    expect(within(bar).getAllByRole('button').map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([['Inbox', 'true'], ['Queue', 'false'], ['Settings', 'false']])
    await user.click(within(bar).getByRole('button', { name: 'Queue' }))
    expect(tile('inbox')).toBeTruthy()
    expect(tile('queue')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Minimize/ })).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Inbox' }))
    expect(tile('inbox')).toBeNull()
    expect(tile('queue')).toBeTruthy()
  })

  it('follows the sidebar again when its choice changes after the user opened another tile', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<HUI side="right" helper={helper()} panel="inbox" />)
    await user.click(within(screen.getByRole('toolbar', { name: 'Helper tiles tabs' })).getByRole('button', { name: 'Settings' }))
    expect(tile('settings')).toBeTruthy()
    rerender(<HUI side="right" helper={helper()} panel="queue" />)
    expect(tile('queue')).toBeTruthy()
    expect(tile('settings')).toBeNull()
    expect(tile('inbox')).toBeNull()
  })

  it('lists the conversation tile only while a chat is selected', () => {
    const { rerender } = render(<HUI side="right" helper={helper()} panel="inbox" />)
    expect(screen.queryByRole('button', { name: 'Conversation' })).toBeNull()
    rerender(<HUI side="right" helper={helper('chat-1')} panel="inbox" />)
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeTruthy()
  })
})
