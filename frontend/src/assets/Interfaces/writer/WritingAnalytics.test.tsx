import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { mergeDays } from './useWritingDays'
import WritingAnalytics, { writingStats } from './WritingAnalytics'

const TODAY = '2026-10-11'
const day = (wordCountDelta: number, outlineSaves = 0, plotSaves = 0, draftRevisions = 0) => ({ wordCountDelta, outlineSaves, plotSaves, draftRevisions })

describe('merging activity across projects', () => {
  it('sums words, edits and revisions by day, and never shows a day below zero words', () => {
    const days = mergeDays([
      { daily: { days: { '2026-10-11': day(400, 1, 1), '2026-10-10': day(-50) } } },
      { daily: { days: { '2026-10-11': day(250, 2, 0, 1), '2026-10-10': day(20) } } },
    ])
    expect(days['2026-10-11']).toEqual({ words: 650, edits: 4, revisions: 1 })
    expect(days['2026-10-10'].words).toBe(0) // net -30
    expect(mergeDays([{}, { daily: {} }])).toEqual({})
  })
})

describe('the numbers', () => {
  it('measures the week, the streak and the words a writing day', () => {
    const days = {
      '2026-10-11': { words: 600, edits: 0, revisions: 0 },
      '2026-10-10': { words: 0, edits: 3, revisions: 0 }, // edits alone keep a streak, but are not a writing day
      '2026-10-09': { words: 300, edits: 0, revisions: 0 },
      '2026-10-05': { words: 900, edits: 0, revisions: 0 },
    }
    const s = writingStats(days, TODAY)
    expect(s.wordsThisWeek).toBe(1800)
    expect(s.wordsPerActiveDay).toBe(600)
    expect(s.streak).toBe(3)
    expect(s.best).toBe(3)
    expect(s.wordsToday).toBe(600)
    expect(s.week).toHaveLength(7)
  })
})

interface Call { url: string }
let calls: Call[]

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push({ url })
    const today = new Date().toISOString().slice(0, 10)
    const body = url.includes('/p1/') ? { daily: { days: { [today]: day(700, 1) } } } : { daily: { days: { [today]: day(300, 0, 2, 1) } } }
    return { ok: true, status: 200, json: async () => body }
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('the writing analytics', () => {
  it('sums the projects it is given: this week, a calendar, the daily bars and the goals', async () => {
    render(<WritingAnalytics projectIds={['p1', 'p2']} />)
    const weekly = (await screen.findByText('words this week')).previousElementSibling
    expect(weekly?.textContent).toBe('1,000')
    expect(calls.map(c => c.url).sort()).toEqual(['/api/projects/p1/activity', '/api/projects/p2/activity'])
    expect(screen.getByRole('img', { name: '1,000 words on 1 days' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Words per day this week' })).toBeTruthy()
    expect(screen.getByText('1,000 of 3,000')).toBeTruthy() // the week against its goal
  })

  it('switches the calendar to edits and revisions', async () => {
    const user = userEvent.setup()
    render(<WritingAnalytics projectIds={['p1', 'p2']} />)
    await screen.findByText('words this week')
    await user.click(screen.getByRole('button', { name: 'Edits' }))
    expect(screen.getByRole('img', { name: '3 edits on 1 days' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Revisions' }))
    expect(screen.getByRole('img', { name: '1 revisions on 1 days' })).toBeTruthy()
  })

  it('keeps the writer\'s goals and measures today against them', async () => {
    const user = userEvent.setup()
    render(<WritingAnalytics projectIds={['p1']} />)
    await screen.findByText('700 of 500')
    const daily = screen.getByLabelText('Words a day')
    await user.clear(daily)
    await user.type(daily, '1000')
    expect(await screen.findByText('700 of 1,000')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('scriblr.writer.goals') ?? '{}')).toMatchObject({ wordsPerDay: 1000 })
  })

  it('says so when there are no projects', async () => {
    render(<WritingAnalytics projectIds={[]} />)
    expect(await screen.findByText('0 of 500')).toBeTruthy()
    expect(within(screen.getByRole('img', { name: '0 words on 0 days' })).queryAllByRole('img')).toHaveLength(0)
  })
})
