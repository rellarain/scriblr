import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import { __resetSettingsForTests } from './settings/settingsStore'
import type { HelperChats } from './assets/Interfaces/helper/useHelperChats'

// This file exercises Sidebar's own layout (AUI mounted only for admins, the resize
// handle's placement and drag direction) -- the panels' own content is covered by
// AUI.test.tsx/HUI.test.tsx, and mocking it out here keeps this file from also
// needing their data dependencies (feedback store, chats, etc.) set up.
vi.mock('./assets/Interfaces/AUI', () => ({ default: () => <div>AUI</div> }))
vi.mock('./assets/Interfaces/HUI', () => ({ default: () => <div>HUI</div> }))
vi.mock('./SidebarDivider', () => ({ default: () => <div>divider</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const) {
    if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: vi.fn(() => true), configurable: true })
  }
})

const helper = { conversations: [], selectedChatId: null } as unknown as HelperChats

const baseProps = {
  onActivateChats: vi.fn(),
  onCreateChat: vi.fn(),
  helper,
  panel: 'inbox' as const,
  onSelectPanel: vi.fn(),
  expanded: false,
  onCollapse: vi.fn(),
  activeAdminCount: 0,
  activeStandardCount: 0,
  pendingAdminCount: 0,
  pendingStandardCount: 0,
  auiOpen: true,
  onToggleAui: vi.fn(),
  isAdmin: true,
}

describe('Sidebar', () => {
  it('offers no Admin resize handle unless the panel is both admin and open', () => {
    const { rerender } = render(<Sidebar side="right" {...baseProps} auiOpen={false} auiWidth={800} onSetAuiWidth={vi.fn()} />)
    expect(screen.queryByRole('separator', { name: 'Resize Admin panel' })).toBeNull()
    rerender(<Sidebar side="right" {...baseProps} isAdmin={false} auiWidth={800} onSetAuiWidth={vi.fn()} />)
    expect(screen.queryByRole('separator', { name: 'Resize Admin panel' })).toBeNull()
    rerender(<Sidebar side="right" {...baseProps} auiWidth={800} onSetAuiWidth={vi.fn()} />)
    expect(screen.getByRole('separator', { name: 'Resize Admin panel' })).toBeTruthy()
  })

  it('drags wider toward the left for a right-handed layout (AUI sits on the outer, right edge)', () => {
    const onSetAuiWidth = vi.fn()
    render(<Sidebar side="right" {...baseProps} auiWidth={800} onSetAuiWidth={onSetAuiWidth} />)
    const handle = screen.getByRole('separator', { name: 'Resize Admin panel' })
    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent(handle, Object.assign(new Event('pointermove', { bubbles: true }), { pointerId: 1, movementX: -30 }))
    expect(onSetAuiWidth).toHaveBeenCalledWith(830)
  })

  it('drags wider toward the right for a left-handed layout (AUI sits on the outer, left edge)', () => {
    const onSetAuiWidth = vi.fn()
    render(<Sidebar side="left" {...baseProps} auiWidth={800} onSetAuiWidth={onSetAuiWidth} />)
    const handle = screen.getByRole('separator', { name: 'Resize Admin panel' })
    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent(handle, Object.assign(new Event('pointermove', { bubbles: true }), { pointerId: 1, movementX: 30 }))
    expect(onSetAuiWidth).toHaveBeenCalledWith(830)
  })

  it('nudges the width with the arrow keys, direction following handedness', () => {
    const onSetAuiWidth = vi.fn()
    render(<Sidebar side="right" {...baseProps} auiWidth={800} onSetAuiWidth={onSetAuiWidth} />)
    const handle = screen.getByRole('separator', { name: 'Resize Admin panel' })
    handle.focus()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onSetAuiWidth).toHaveBeenCalledWith(760)
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true })
    expect(onSetAuiWidth).toHaveBeenCalledWith(1200)
  })
})
