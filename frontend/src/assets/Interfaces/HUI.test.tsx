import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import type { HelperChats } from './helper/useHelperChats'
import HUI from './HUI'

vi.mock('./helper/inbox/InboxSection', () => ({ default: () => <div>inbox console</div> }))
vi.mock('./helper/ChatsSection', () => ({ default: () => <div>chat console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const helper = (selectedChatId: string | null = null) => ({ selectedChatId } as unknown as HelperChats)
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('HUI (the Helper panel as tiles)', () => {
  it('opens the console the sidebar buttons chose, and a chosen chat wins', () => {
    const { rerender } = render(<HUI side="right" helper={helper()} panel="settings" />)
    expect(screen.getByRole('region', { name: 'Settings' })).toBeTruthy()
    rerender(<HUI side="right" helper={helper()} panel="inbox" />)
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeTruthy()
    expect(screen.getByText('inbox console')).toBeTruthy()
    rerender(<HUI side="right" helper={helper('chat-1')} panel="inbox" />)
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('chat console')).toBeTruthy()
  })

  it('shows Inbox, Queue and Settings tiles after Back, and switching with a mini tile', async () => {
    const user = userEvent.setup()
    render(<HUI side="right" helper={helper()} panel="inbox" />)
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    expect(document.querySelector('.tileConsole')).toBeNull()
    expect(['inbox', 'queue', 'settings'].map(id => tile(id).getAttribute('data-shape'))).toEqual(['landscape', 'landscape', 'link'])
    expect(tile('chat')).toBeNull()
    await user.click(within(tile('queue')).getByRole('button', { name: 'Queue' }))
    expect(screen.getByRole('region', { name: 'Queue' })).toBeTruthy()
    await user.click(within(screen.getByRole('tablist', { name: 'Tiles' })).getByRole('tab', { name: /Settings/ }))
    expect(screen.getByRole('region', { name: 'Settings' })).toBeTruthy()
  })

  it('follows the sidebar again when its choice changes after the user went back', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<HUI side="right" helper={helper()} panel="inbox" />)
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    expect(document.querySelector('.tileConsole')).toBeNull()
    rerender(<HUI side="right" helper={helper()} panel="queue" />)
    expect(screen.getByRole('region', { name: 'Queue' })).toBeTruthy()
  })

  it('lists the conversation tile only while a chat is selected', () => {
    render(<HUI side="right" helper={helper('chat-1')} panel="inbox" />)
    expect(screen.getAllByRole('tab').map(t => t.textContent?.trim())).toEqual(['Inbox', 'Queue', 'Settings', 'Conversation'])
  })
})
