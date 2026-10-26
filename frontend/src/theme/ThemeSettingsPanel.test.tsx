import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings } from '../settings/settingsStore'
import { mockFetch } from '../test/mockFetch'
import { CURRENT_USER } from '../userSeed'
import ThemeSettingsPanel from './ThemeSettingsPanel'
import { discardThemeDraft, editThemeDraft, getThemeDraft } from './themeDraft'
import { enableZone } from './zones'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  discardThemeDraft()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals(); CURRENT_USER.role = 'admin' })

// A fake drag, the steps a browser takes: start on the source, enter and move over the target, drop, end.
function drag(from: Element, to: Element) {
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: 'none', effectAllowed: 'all', types: [] as string[] }
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragEnter(to, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

const hue = (n: number) => screen.getByRole('button', { name: new RegExp(`^Hue ${n}:`) })
const hueCount = (n: number) => within(hue(n)).queryByText(/^\d+$/)?.textContent ?? null
const slot = (zone: string, role: string) => screen.getByRole('button', { name: new RegExp(`^${zone} ${role}:`) })
const header = (zone: string) => screen.getByRole('button', { name: new RegExp(`^${zone}, o(n|ff)`) })
const draft = () => getThemeDraft().theme
const saved = () => getSettings().theme

describe('the account theme panel', () => {
  it('lists the hues, with how many colours use each, and a card for each time of day', () => {
    render(<ThemeSettingsPanel />)
    const list = screen.getByRole('list', { name: 'Hues' })
    expect(within(list).getAllByRole('button', { name: /^Hue \d+:/ })).toHaveLength(4)
    expect(hue(1).getAttribute('aria-label')).toBe('Hue 1: 330°, used by Day theme')
    expect(hueCount(1)).toBe('1')
    expect(screen.getByRole('button', { name: 'Add a hue' })).toBeTruthy()
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Dawn colours', 'Day colours', 'Dusk colours', 'Night colours'])
  })

  it('gives a time of day that is on a slot for each of its colours, and one that is off only its header', () => {
    render(<ThemeSettingsPanel />)
    const day = screen.getByRole('region', { name: 'Day colours' })
    expect(within(day).getAllByRole('button').map(b => b.getAttribute('data-role') ?? 'header')).toEqual(['header', 'theme', 'accent', 'alert', 'accent2'])
    const dawn = screen.getByRole('region', { name: 'Dawn colours' })
    expect(within(dawn).getAllByRole('button')).toHaveLength(1)
    expect(header('Dawn').getAttribute('aria-pressed')).toBe('false')
    expect(header('Day').getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the admin accent only to an admin', () => {
    CURRENT_USER.role = 'user'
    render(<ThemeSettingsPanel />)
    expect(screen.queryByRole('button', { name: /^Day admin accent:/ })).toBeNull()
    expect(slot('Day', 'accent')).toBeTruthy()
  })

  describe('giving a colour a hue', () => {
    it('by dragging a hue onto it, staged: the rest of the app keeps the saved look', () => {
      render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Day', 'accent'))
      expect(draft().zones.day.palette.accent.h).toBe(260)
      expect(draft().zones.day.links.accent).toBe('h4')
      expect(saved().zones.day.palette.accent.h).toBe(32) // not saved yet
      expect(slot('Day', 'accent').getAttribute('aria-label')).toBe('Day accent: hue 260°, hue 4 in the list')
      expect(hueCount(4)).toBe('2')
      expect(hueCount(2)).toBeNull()
      expect(screen.getByText(/These changes are not saved/)).toBeTruthy()
    })

    it('by clicking a hue and then the colour', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(hue(3))
      expect(hue(3).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(slot('Day', 'theme'))
      expect(draft().zones.day.links.theme).toBe('h3')
      expect(draft().zones.day.palette.theme.h).toBe(200)
      expect(hue(3).getAttribute('aria-pressed')).toBe('false') // put down again
    })

    it('puts a picked hue down with Escape or a second click', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(hue(2))
      expect(hue(2).getAttribute('aria-pressed')).toBe('true')
      fireEvent.keyDown(hue(2), { key: 'Escape' })
      expect(hue(2).getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(hue(2))
      fireEvent.click(hue(2))
      expect(hue(2).getAttribute('aria-pressed')).toBe('false')
      expect(getThemeDraft().dirty).toBe(false)
    })

    it('does not take a role away: a colour is always some hue', () => {
      render(<ThemeSettingsPanel />)
      for (const role of ['theme', 'accent', 'alert', 'admin accent']) expect(slot('Day', role)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /clear|remove/i })).toBeNull()
    })
  })

  describe('swapping and copying colours', () => {
    it('swaps two colours of one time of day when one is dragged onto the other', () => {
      render(<ThemeSettingsPanel />)
      drag(slot('Day', 'theme'), slot('Day', 'accent'))
      expect(draft().zones.day.palette.theme.h).toBe(32)
      expect(draft().zones.day.palette.accent.h).toBe(330)
      expect(draft().zones.day.links).toMatchObject({ theme: 'h2', accent: 'h1' })
    })

    it('swaps with two clicks too', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(slot('Day', 'alert'))
      expect(slot('Day', 'alert').getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(slot('Day', 'accent'))
      expect(draft().zones.day.palette.alert.h).toBe(32)
      expect(draft().zones.day.palette.accent.h).toBe(200)
    })

    it('copies a colour to another time of day, leaving the first as it is', () => {
      act(() => { editThemeDraft(t => enableZone(t, 'night')) })
      render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Night', 'accent'))
      expect(draft().zones.night.palette.accent.h).toBe(260)
      drag(slot('Night', 'accent'), slot('Day', 'alert'))
      expect(draft().zones.day.palette.alert.h).toBe(260)
      expect(draft().zones.day.links.alert).toBe('h4')
      expect(draft().zones.night.palette.accent.h).toBe(260) // the source keeps its own
      expect(draft().zones.day.palette.accent.h).toBe(32) // as does the rest of Day
    })

    it('does nothing for a colour dropped on itself', () => {
      render(<ThemeSettingsPanel />)
      drag(slot('Day', 'accent'), slot('Day', 'accent'))
      expect(getThemeDraft().dirty).toBe(false)
    })
  })

  describe('the list of hues', () => {
    it('opens a slider for a hue by a click, and every colour that uses the hue follows it', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(hue(2))
      const slider = screen.getByRole('slider', { name: 'Hue 2 in degrees' })
      fireEvent.change(slider, { target: { value: '90' } })
      expect(draft().hues[1]).toEqual({ id: 'h2', h: 90 })
      expect(draft().zones.day.palette.accent.h).toBe(90)
      expect(hue(2).getAttribute('aria-label')).toBe('Hue 2: 90°, used by Day accent')
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('slider', { name: 'Hue 2 in degrees' })).toBeNull()
    })

    it('adds a hue at red with the plus, opening its slider, and the plus goes at ten', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Add a hue' }))
      expect(draft().hues).toHaveLength(5)
      expect(draft().hues[4]).toEqual({ id: 'h5', h: 0 })
      expect(screen.getByRole('slider', { name: 'Hue 5 in degrees' })).toBeTruthy()
      for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Add a hue' }))
      expect(draft().hues).toHaveLength(10)
      expect(screen.queryByRole('button', { name: 'Add a hue' })).toBeNull()
      expect(screen.getByText(/10 of 10 hues/)).toBeTruthy()
    })

    it('puts a hue before another when it is dragged onto it, and last on the end of the list', () => {
      render(<ThemeSettingsPanel />)
      drag(hue(4), hue(2))
      expect(draft().hues.map(h => h.id)).toEqual(['h1', 'h4', 'h2', 'h3'])
      drag(hue(1), screen.getByRole('list', { name: 'Hues' }))
      expect(draft().hues.map(h => h.id)).toEqual(['h4', 'h2', 'h3', 'h1'])
    })

    it('moves a hue with Alt and the arrow keys', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.keyDown(hue(1), { key: 'ArrowRight', altKey: true })
      expect(draft().hues.map(h => h.id)).toEqual(['h2', 'h1', 'h3', 'h4'])
      fireEvent.keyDown(screen.getByRole('button', { name: /^Hue 2: 330/ }), { key: 'ArrowLeft', altKey: true })
      expect(draft().hues.map(h => h.id)).toEqual(['h1', 'h2', 'h3', 'h4'])
    })

    it('deletes a hue that is let go outside the list', () => {
      act(() => { editThemeDraft(t => ({ ...t, hues: [...t.hues, { id: 'h5', h: 120 }] })) })
      render(<ThemeSettingsPanel />)
      expect(draft().hues).toHaveLength(5)
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: 'none', effectAllowed: 'all', types: [] as string[] }
      const five = hue(5)
      fireEvent.dragStart(five, { dataTransfer })
      fireEvent.dragEnter(document.body, { dataTransfer })
      fireEvent.dragOver(document.body, { dataTransfer })
      fireEvent.drop(document.body, { dataTransfer })
      fireEvent.dragEnd(five, { dataTransfer })
      expect(draft().hues.map(h => h.id)).toEqual(['h1', 'h2', 'h3', 'h4'])
    })

    it('keeps a hue that is in use, and says where', () => {
      render(<ThemeSettingsPanel />)
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: 'none', effectAllowed: 'all', types: [] as string[] }
      fireEvent.dragStart(hue(1), { dataTransfer })
      fireEvent.drop(document.body, { dataTransfer })
      fireEvent.dragEnd(hue(1), { dataTransfer })
      expect(draft().hues).toHaveLength(4)
      expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/Hue 1 is used by Day theme, so it was kept/)
    })

    it('keeps a hue whose drag is cancelled (Escape, or released over nothing that takes it)', () => {
      act(() => { editThemeDraft(t => ({ ...t, hues: [...t.hues, { id: 'h5', h: 120 }] })) })
      render(<ThemeSettingsPanel />)
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: 'none', effectAllowed: 'all', types: [] as string[] }
      fireEvent.dragStart(hue(5), { dataTransfer })
      fireEvent.dragEnd(hue(5), { dataTransfer }) // no drop: Escape, or released over nothing
      expect(draft().hues).toHaveLength(5)
    })

    it('does not delete a hue let go on a card between two colours', () => {
      act(() => { editThemeDraft(t => ({ ...t, hues: [...t.hues, { id: 'h5', h: 120 }] })) })
      render(<ThemeSettingsPanel />)
      drag(hue(5), screen.getByRole('region', { name: 'Day colours' }))
      expect(draft().hues).toHaveLength(5)
    })

    it('keeps the last hue', () => {
      act(() => { editThemeDraft(t => ({ ...t, hues: [t.hues[0]] })) })
      render(<ThemeSettingsPanel />)
      const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: 'none', effectAllowed: 'all', types: [] as string[] }
      fireEvent.dragStart(hue(1), { dataTransfer })
      fireEvent.drop(document.body, { dataTransfer })
      expect(draft().hues).toHaveLength(1)
      expect(screen.getByText('At least one hue stays in the list.')).toBeTruthy()
    })

    it('removes a selected hue with the Delete key, when nothing uses it', () => {
      act(() => { editThemeDraft(t => ({ ...t, hues: [...t.hues, { id: 'h5', h: 120 }] })) })
      render(<ThemeSettingsPanel />)
      fireEvent.keyDown(hue(5), { key: 'Delete' })
      expect(draft().hues).toHaveLength(4)
      fireEvent.keyDown(hue(1), { key: 'Delete' })
      expect(draft().hues).toHaveLength(4) // in use
    })

    it('has Delete in its slider, off for a hue in use', () => {
      render(<ThemeSettingsPanel />)
      fireEvent.click(hue(2))
      expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Add a hue' }))
      expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(draft().hues).toHaveLength(4)
    })
  })

  describe('turning a time of day on and off', () => {
    it('turns a time of day on by its header, with the colours of the one before it', () => {
      render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Day', 'accent'))
      fireEvent.click(header('Night'))
      expect(draft().zones.night.configured).toBe(true)
      expect(draft().zones.night.palette.accent.h).toBe(260) // Day's, as staged
      expect(draft().zones.night.links.accent).toBe('h4')
      expect(draft().timeBasedEnabled).toBe(true) // two are on, so the clock is followed
      expect(within(screen.getByRole('region', { name: 'Night colours' })).getAllByRole('button')).toHaveLength(5)
      expect(saved().zones.night.configured).toBe(false)
    })

    it('turns one off by its header, clearing its colours and keeping its start time', () => {
      act(() => { editThemeDraft(t => enableZone(t, 'night')) })
      render(<ThemeSettingsPanel />)
      const start = draft().zones.night.startMinute
      fireEvent.click(header('Night'))
      expect(draft().zones.night.configured).toBe(false)
      expect(draft().zones.night.links).toEqual({})
      expect(draft().zones.night.startMinute).toBe(start)
      expect(within(screen.getByRole('region', { name: 'Night colours' })).getAllByRole('button')).toHaveLength(1)
    })

    it('lets Day go while another is on, but never the last one', () => {
      act(() => { editThemeDraft(t => enableZone(t, 'night')) })
      render(<ThemeSettingsPanel />)
      fireEvent.click(header('Day'))
      expect(draft().zones.day.configured).toBe(false)
      const last = header('Night')
      expect(last.getAttribute('aria-disabled')).toBe('true')
      expect(last.getAttribute('aria-label')).toMatch(/only time of day on/)
      fireEvent.click(last)
      expect(draft().zones.night.configured).toBe(true)
    })

    it('says whether the app follows the clock', () => {
      render(<ThemeSettingsPanel />)
      expect(screen.getByText('One time of day is on, so the app always uses it.')).toBeTruthy()
      fireEvent.click(header('Night'))
      expect(screen.getByText('The app follows the clock, changing at the times above.')).toBeTruthy()
    })
  })

  describe('saving and leaving', () => {
    it('is clean until something changes, and Discard drops the changes', () => {
      render(<ThemeSettingsPanel />)
      expect(screen.queryByText(/These changes are not saved/)).toBeNull()
      drag(hue(4), slot('Day', 'accent'))
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(getThemeDraft().dirty).toBe(false)
      expect(slot('Day', 'accent').getAttribute('aria-label')).toBe('Day accent: hue 32°, hue 2 in the list')
      expect(screen.queryByText(/These changes are not saved/)).toBeNull()
    })

    it('saves the staged changes with the Save control: the app takes them on', async () => {
      render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Day', 'accent'))
      fireEvent.click(header('Night'))
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Save/ })) })
      expect(saved().zones.day.palette.accent.h).toBe(260)
      expect(saved().zones.night.configured).toBe(true)
      expect(getThemeDraft().dirty).toBe(false)
    })

    it('undoes its staged changes one by one with the Undo of the Save control', () => {
      render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Day', 'accent'))
      drag(hue(3), slot('Day', 'theme'))
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(draft().zones.day.palette.theme.h).toBe(330)
      expect(draft().zones.day.palette.accent.h).toBe(260)
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(getThemeDraft().dirty).toBe(false)
    })

    it('drops what is staged, without asking, when the panel is left', () => {
      const { unmount } = render(<ThemeSettingsPanel />)
      drag(hue(4), slot('Day', 'accent'))
      expect(getThemeDraft().dirty).toBe(true)
      unmount()
      expect(getThemeDraft().dirty).toBe(false)
      expect(saved().zones.day.palette.accent.h).toBe(32)
    })
  })

  it('moves a start time on the day bar, staged like the rest', () => {
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    render(<ThemeSettingsPanel />)
    const before = draft().zones.day.startMinute
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Day starts at' }), { key: 'ArrowRight' })
    expect(draft().zones.day.startMinute).toBe(before + 60)
    expect(saved().zones.day.startMinute).toBe(before)
  })
})
