import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getKv } from '../../../../settings/settingsStore'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { outlineNode } from '../plotTestWorkspace'
import { DraftCards } from './DraftCards'
import { StyleAidsSettings } from './StyleAidsSettings'
import { STYLE_AIDS_KEY } from './useStyleAids'

// The style aids' switches in the Draft's settings (kept on this machine for every chapter), and the reading level beside a moment's title.

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })

describe('the style aids in the Draft settings', () => {
  it('turns each aid on and off, and keeps it', () => {
    render(<StyleAidsSettings />)
    for (const name of ['Long sentences', 'Repeated words', 'Readability']) {
      const sw = screen.getByRole('switch', { name })
      expect(sw).toHaveProperty('checked', false)
      fireEvent.click(sw)
    }
    expect(getKv(STYLE_AIDS_KEY)).toEqual({ long: true, repeat: true, read: true })
  })

  it('keeps the numbers within their limits', () => {
    render(<StyleAidsSettings />)
    const words = screen.getByLabelText('Words in a long sentence') as HTMLInputElement
    expect(words.value).toBe('30')
    fireEvent.change(words, { target: { value: '500' } })
    fireEvent.blur(words)
    expect(words.value).toBe('120')
    const apart = screen.getByLabelText('Words apart') as HTMLInputElement
    fireEvent.change(apart, { target: { value: '25' } })
    fireEvent.keyDown(apart, { key: 'Enter' })
    expect(getKv(STYLE_AIDS_KEY)).toMatchObject({ longWords: 120, repeatGap: 25 })
  })
})

describe("a moment's reading level", () => {
  const outline = [outlineNode('c1', 'chapter', null), outlineNode('m1', 'moment', 'c1', { synopsis: 'Arrival' })]
  const text = 'The dog ran to the boat. The cat sat on the dock. The sun was hot and the sky was blue. We went home at night.'
  const cards = () => render(
    <DraftCards
      w={makeWorkspace({ activeProjectId: 'p1', outlineNodes: outline, plotNodes: [], plotNodeById: new Map(), activeProject: { settings: { timeSystems: [] } } })}
      chapter={outline[0]} draft={{ bodies: { m1: text }, setBody: vi.fn() }}
    />,
  )

  it('shows beside the title only with Readability on', () => {
    cards()
    expect(screen.queryByText(/Reading level/)).toBeNull()
  })

  it('shows the grade with Readability on', () => {
    render(<StyleAidsSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Readability' }))
    cards()
    expect(screen.getByText(/^Reading level: grade \d+$/)).toBeTruthy()
  })
})
