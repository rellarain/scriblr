import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../settings/settingsStore'
import { CARDS, ensureBackend } from './cards'
import { createMockBackend, FIXTURE_PROJECT_ID } from './mockBackend'
import { Preview } from './Preview'

// Every card of the design system mounts and draws the real app: the Writer against the pretend backend, in each zone, at each screen width.

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  ensureBackend()
})

describe('the pretend backend', () => {
  it('serves the project the Writer opens: its outline, plot, drafts and word counts', async () => {
    const { fetch: f } = createMockBackend()
    const list = await (await f('/api/projects')).json()
    expect(list.map((p: { projectId: string }) => p.projectId)).toEqual([FIXTURE_PROJECT_ID])
    const summary = await (await f(`/api/projects/${FIXTURE_PROJECT_ID}`)).json()
    expect(summary.outline.nodes.some((n: { kind: string }) => n.kind === 'moment')).toBe(true)
    expect(summary.plot.nodes.some((n: { assignedMomentId: string | null }) => n.assignedMomentId)).toBe(true)
    const draft = await (await f(`/api/projects/${FIXTURE_PROJECT_ID}/draft/chapter/c1`)).json()
    expect(Object.keys(draft.moments).length).toBeGreaterThan(0)
    const analytics = await (await f(`/api/projects/${FIXTURE_PROJECT_ID}/analytics`)).json()
    expect(analytics.totals.chapterCount).toBe(5)
    expect((await f('/api/nowhere')).status).toBe(404)
  })

  it('keeps a save in memory (the outline), and answers the settings and resources routes', async () => {
    const { fetch: f } = createMockBackend()
    const summary = await (await f(`/api/projects/${FIXTURE_PROJECT_ID}`)).json()
    const nodes = summary.outline.nodes.map((n: { id: string }) => (n.id === 'b1' ? { ...n, title: 'Changed' } : n))
    await f(`/api/projects/${FIXTURE_PROJECT_ID}/outline`, { method: 'PUT', body: JSON.stringify({ schemaVersion: 2, nodes }) })
    const again = await (await f(`/api/projects/${FIXTURE_PROJECT_ID}`)).json()
    expect(again.outline.nodes.find((n: { id: string }) => n.id === 'b1').title).toBe('Changed')
    expect((await f('/api/user-settings')).status).toBe(200)
    expect((await (await f('/api/resources')).json()).nodes).toEqual([])
  })
})

describe('the cards', () => {
  it('has a unique id, a title, a group and a summary for each', () => {
    expect(new Set(CARDS.map(c => c.id)).size).toBe(CARDS.length)
    for (const c of CARDS) expect([c.title, c.group, c.summary].every(Boolean)).toBe(true)
  })

  it.each(CARDS.map(c => [c.id, c] as const))('%s mounts in every zone', async (_id, card) => {
    render(<Preview card={{ ...card, defaults: { ...card.defaults, zones: ['dawn', 'day', 'dusk', 'night'], width: 400 } }} />)
    await waitFor(() => expect(document.querySelectorAll('.uiPreviewFrame')).toHaveLength(4))
    // Each frame is its own theme scope, drawn for its zone.
    const frames = Array.from(document.querySelectorAll<HTMLElement>('.uiPreviewFrame'))
    expect(frames.map(f => f.style.getPropertyValue('--paper-dir'))).toEqual(['1', '1', '-1', '-1'])
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    for (const f of frames) expect(f.textContent?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('the preview frame', () => {
  const card = CARDS.find(c => c.id === 'controls')!

  it('shows the zones chosen side by side, at the one screen width chosen', () => {
    render(<Preview card={card} />)
    expect(screen.getAllByRole('figure').map(f => f.querySelector('figcaption')?.textContent)).toEqual(['Day · 800px', 'Night · 800px'])
    const bar = screen.getByRole('toolbar', { name: /preview controls/ })
    fireEvent.click(within(bar).getByRole('button', { name: /Dawn/ }))
    fireEvent.click(within(bar).getByRole('button', { name: '1200px' }))
    expect(screen.getAllByRole('figure').map(f => f.querySelector('figcaption')?.textContent)).toEqual(['Dawn · 1200px', 'Day · 1200px', 'Night · 1200px'])
    expect(within(bar).getByRole('button', { name: '800px' }).getAttribute('aria-pressed')).toBe('false')
    // The container grows with the screen.
    expect(document.querySelector<HTMLElement>('.uiPreview')!.style.getPropertyValue('--pv-w')).toBe('1200px')
    expect(screen.getAllByRole('figure')[0].style.width).toBe('1200px')
  })

  it('keeps at least one zone on, and pressing the chosen width keeps it', () => {
    render(<Preview card={{ ...card, defaults: { zones: ['day'], width: 800 } }} />)
    const bar = screen.getByRole('toolbar', { name: /preview controls/ })
    fireEvent.click(within(bar).getByRole('button', { name: /Day/ }))
    fireEvent.click(within(bar).getByRole('button', { name: '800px' }))
    expect(screen.getAllByRole('figure')).toHaveLength(1)
  })

  it('recolours the frames when the hue changes', () => {
    render(<Preview card={{ ...card, defaults: { zones: ['day'], width: 800 } }} />)
    const frame = () => document.querySelector<HTMLElement>('.uiPreviewFrame')!
    expect(frame().style.getPropertyValue('--color-theme-h')).toBe('330')
    fireEvent.change(screen.getByLabelText('Theme hue'), { target: { value: '100' } })
    expect(frame().style.getPropertyValue('--color-theme-h')).toBe('100')
    fireEvent.change(screen.getByLabelText('Accent hue'), { target: { value: '200' } })
    expect(frame().style.getPropertyValue('--color-accent-h')).toBe('200')
  })

  it('switches the card\'s view', async () => {
    const writer = CARDS.find(c => c.id === 'level-panels')!
    render(<Preview card={{ ...writer, defaults: { zones: ['day'], width: 800, view: 'dash' } }} />)
    const bar = screen.getByRole('toolbar', { name: /preview controls/ })
    expect(within(bar).getByRole('button', { name: 'Dash' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(bar).getByRole('button', { name: 'Project' }))
    expect(within(bar).getByRole('button', { name: 'Project' }).getAttribute('aria-pressed')).toBe('true')
  })
})
