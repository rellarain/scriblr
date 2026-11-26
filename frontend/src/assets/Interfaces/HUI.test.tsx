import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import type { HelperChats } from './helper/useHelperChats'
import HUI from './HUI'
import { mockFetch } from '../../test/mockFetch'

vi.mock('./helper/QueueSection', () => ({ default: () => <div>queue console</div> }))
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
  it("opens the tile the band's buttons chose, and a chosen chat wins", () => {
    const { rerender } = render(<HUI side="right" helper={helper()} panel="settings" />)
    expect(tile('settings')).toBeTruthy()
    expect(tile('queue')).toBeNull()
    rerender(<HUI side="right" helper={helper()} panel="queue" />)
    expect(screen.getByRole('region', { name: 'Queue' })).toBeTruthy()
    expect(screen.getByText('queue console')).toBeTruthy()
    expect(tile('settings')).toBeNull()
    rerender(<HUI side="right" helper={helper('chat-1')} panel="queue" />)
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('chat console')).toBeTruthy()
    expect(tile('queue')).toBeNull()
  })

  it('has no Inbox: it is in the Office', () => {
    render(<HUI side="right" helper={helper()} panel="queue" />)
    const bar = screen.getByRole('toolbar', { name: 'Helper tiles tabs' })
    expect(within(bar).queryByRole('button', { name: 'Inbox' })).toBeNull()
  })

  it('opens the other tiles from the tab bar, which keeps the others where they were', async () => {
    const user = userEvent.setup()
    render(<HUI side="right" helper={helper()} panel="queue" />)
    const bar = screen.getByRole('toolbar', { name: 'Helper tiles tabs' })
    expect(within(bar).getAllByRole('button').map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([['Queue', 'true'], ['Help', 'false'], ['Settings', 'false']])
    await user.click(within(bar).getByRole('button', { name: 'Help' }))
    expect(tile('queue')).toBeTruthy()
    expect(tile('help')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Minimize/ })).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Queue' }))
    expect(tile('queue')).toBeNull()
    expect(tile('help')).toBeTruthy()
  })

  it('follows the band again when its choice changes after the user opened another tile', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<HUI side="right" helper={helper()} panel="queue" />)
    await user.click(within(screen.getByRole('toolbar', { name: 'Helper tiles tabs' })).getByRole('button', { name: 'Help' }))
    expect(tile('help')).toBeTruthy()
    rerender(<HUI side="right" helper={helper()} panel="settings" />)
    expect(tile('settings')).toBeTruthy()
    expect(tile('help')).toBeNull()
    expect(tile('queue')).toBeNull()
  })

  it('lists the conversation tile only while a chat is selected', () => {
    const { rerender } = render(<HUI side="right" helper={helper()} panel="queue" />)
    expect(screen.queryByRole('button', { name: 'Conversation' })).toBeNull()
    rerender(<HUI side="right" helper={helper('chat-1')} panel="queue" />)
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeTruthy()
  })
})
