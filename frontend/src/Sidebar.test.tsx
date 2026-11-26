import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar, { AuiResize } from './Sidebar'
import { __resetSettingsForTests } from './settings/settingsStore'
import type { HelperChats } from './assets/Interfaces/helper/useHelperChats'
import { mockFetch } from './test/mockFetch'
import { snapAui, auiWidth, type AuiSize } from './lib/auiSize'

// This file exercises Sidebar's own layout (AUI mounted only for admins, given its mode) and AUI's resize handle (its drag
// direction, snapping through the modes, its keys) -- the panels' own content is covered by AUI.test.tsx/HUI.test.tsx, and
// mocking it out here keeps this file from also needing their data dependencies (feedback store, chats, etc.) set up.
vi.mock('./assets/Interfaces/AUI', () => ({ default: ({ mode }: { mode: string }) => <div>AUI {mode}</div> }))
vi.mock('./assets/Interfaces/HUI', () => ({ default: () => <div>HUI</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const) {
    if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: vi.fn(() => true), configurable: true })
  }
})

const helper = { conversations: [], selectedChatId: null } as unknown as HelperChats
const handle = () => screen.getByRole('separator', { name: 'Resize Admin panel' })
const move = (dx: number) => fireEvent(handle(), Object.assign(new Event('pointermove', { bubbles: true }), { pointerId: 1, movementX: dx }))

describe('Sidebar', () => {
  it('holds the panels only (their console buttons are in the band under the header), AUI for admins, in its mode', () => {
    const { rerender } = render(<Sidebar side="right" helper={helper} panel="queue" auiMode="small" isAdmin />)
    expect(screen.getByText('AUI small')).toBeTruthy()
    expect(screen.getByText('HUI')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Sidebar controls' })).toBeNull()
    rerender(<Sidebar side="right" helper={helper} panel="queue" auiMode="small" isAdmin={false} />)
    expect(screen.queryByText(/^AUI/)).toBeNull()
  })
})

const handleProps = { width: 800, label: 'Medium, 2 columns', onWidthChange: vi.fn(), onStep: vi.fn(), onReset: vi.fn() }

describe("AUI's resize handle", () => {
  it('drags wider toward the left for a right-handed layout (AUI sits on the outer, right edge)', () => {
    const onWidthChange = vi.fn()
    render(<AuiResize side="right" {...handleProps} onWidthChange={onWidthChange} />)
    fireEvent.pointerDown(handle(), { pointerId: 1 })
    move(-30)
    expect(onWidthChange).toHaveBeenCalledWith(830)
    expect(handle()).toHaveAttribute('aria-valuetext', 'Medium, 2 columns')
  })

  it('drags wider toward the right for a left-handed layout (AUI sits on the outer, left edge)', () => {
    const onWidthChange = vi.fn()
    render(<AuiResize side="left" {...handleProps} onWidthChange={onWidthChange} />)
    fireEvent.pointerDown(handle(), { pointerId: 1 })
    move(30)
    expect(onWidthChange).toHaveBeenCalledWith(830)
  })

  it('a real slow drag snaps through the modes: medium, max, then all the way in to mini', () => {
    // Wraps the handle in real state with App.tsx's snapping (lib/auiSize.ts), so each committed size feeds back into the next event,
    // the way it does in the live app; no single small movement crosses a column alone.
    function Harness() {
      const [size, setSize] = useState<AuiSize>({ mode: 'medium', columns: 2 })
      return (
        <div data-testid="size" data-mode={size.mode} data-columns={size.columns}>
          <AuiResize side="right" {...handleProps} width={auiWidth(size, 1700)} onWidthChange={raw => setSize(snapAui(raw, 1700))} />
        </div>
      )
    }
    render(<Harness />)
    const at = () => [screen.getByTestId('size').dataset.mode, screen.getByTestId('size').dataset.columns]
    fireEvent.pointerDown(handle(), { pointerId: 1 })
    for (let i = 0; i < 8; i++) move(-30)
    expect(at()).toEqual(['medium', '3'])
    for (let i = 0; i < 20; i++) move(-30)
    expect(at()).toEqual(['max', '4'])
    for (let i = 0; i < 60; i++) move(30)
    expect(at()).toEqual(['mini', '0'])
  })

  it('steps with the arrow keys, wider toward the panel side, and goes back to small on a double-click', () => {
    const onStep = vi.fn(), onReset = vi.fn()
    render(<AuiResize side="right" {...handleProps} onStep={onStep} onReset={onReset} />)
    handle().focus()
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(onStep.mock.calls).toEqual([[1], [-1]])
    fireEvent.doubleClick(handle())
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
