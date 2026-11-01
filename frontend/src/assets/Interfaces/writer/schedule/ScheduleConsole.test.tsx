import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { emptyDay, emptyPlanner, type Planner } from '../../../../lib/facets'
import ScheduleConsole from './ScheduleConsole'
import { DRAG_ITEM } from './Backlog'

const TODAY = '2026-10-31'
const day = (o: Record<string, unknown>) => ({ ...emptyDay(), ...o })

function planner(): Planner {
  return {
    ...emptyPlanner(),
    timelineEnd: '2027-03-01',
    goals: [{ id: 'g1', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: 500, weekly: 3000, total: 90000, deadline: '2027-03-01' }],
    shifts: [{
      id: 's1', title: 'Morning draft', facet: 'draft', date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: 800,
      recurrence: null, pauses: [], skipped: [], overrides: {},
    }],
    items: [{ id: 'i1', label: 'Reread Ch. 8', facet: 'draft', targetNodeId: null, targetTree: null, shiftId: null, doneOn: null }],
  }
}

let saved: Planner[]
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  saved = []
  mockFetchBy((url, init) => {
    if (url.endsWith('/activity/facets')) {
      return {
        today: TODAY, events: [],
        daily: { [TODAY]: day({ draft: 412 }), '2026-10-30': day({ draft: 500, outline: 3 }), '2026-10-29': day({ plot: 2 }) },
        monthly: { '2025-09': { ...day({ draft: 900, outline: 20 }), activeDays: 10 } },
      }
    }
    if (url.endsWith('/planner')) {
      if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)) as Planner; saved.push(body); return body }
      return planner()
    }
    if (url.endsWith('/analytics')) return { totals: { totalWordCount: 52200 }, nodeWordCounts: {} }
    if (url.endsWith('/outline')) return { nodes: [{ id: 'b1', kind: 'book', parentId: null, title: 'Book One' }] }
    if (url.endsWith('/plot')) return { nodes: [] }
    if (url.includes('/schedule/')) return []
    return {}
  })
})

const open = async () => {
  render(<ScheduleConsole scope="project" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
  await screen.findByText('Reread Ch. 8')
}
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('the Schedule console', () => {
  it('lays out goals, review, activity, schedule, backlog and analytics as tiles of their own', async () => {
    await open()
    expect(Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id')).sort()).toEqual(['activity', 'analytics', 'backlog', 'goals', 'review', 'schedule'])
    expect(tile('schedule').contains(tile('backlog'))).toBe(false)
    expect(within(tile('backlog')).getByText('Reread Ch. 8')).toBeTruthy()
  })

  it('shows each goal with its progress, the pace against the deadline and its status', async () => {
    await open()
    const goals = within(tile('goals'))
    expect(await goals.findByText('Draft')).toBeTruthy()
    expect(goals.getByText('58%')).toBeTruthy()
    expect(goals.getByText(/Behind/)).toBeTruthy() // 412 words today is nowhere near 90,000 by March
    expect(goals.getByText(/Due Mar 1, 2027/)).toBeTruthy()
    expect(goals.getByText('Today 412 of 500')).toBeTruthy()
  })

  it('draws the grid with today outlined, the week from Monday, month names in capitals and the older months as bars', async () => {
    await open()
    const activity = tile('activity')
    const grid = activity.querySelector('.wrSchedCalGrid') as HTMLElement
    expect(grid.querySelectorAll('.wrSchedCalCell--today')).toHaveLength(1)
    expect((grid.querySelector('.wrSchedCalCell--today') as HTMLElement).title).toMatch(/^Sat, Oct 31/)
    expect(Array.from(activity.querySelectorAll('.wrSchedCalLetters span')).map(s => s.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    expect(Array.from(activity.querySelectorAll('.wrSchedCalMonth')).map(s => s.textContent)).toEqual(expect.arrayContaining(['NOV', 'DECEMBER'])) // in capitals, abbreviated where the rectangle is narrow
    expect(activity.querySelectorAll('.wrSchedCalBar')).toHaveLength(1) // September 2025, before the grid
    expect(within(activity).queryByText(/Writing, last 12 months/)).toBeNull()
  })

  it('has a toggle for each facet, all on, and keeps at least one on', async () => {
    const user = userEvent.setup()
    await open()
    const facets = within(tile('activity'))
    for (const name of ['Outline', 'Plot', 'Draft', 'Revision', 'Project']) expect(facets.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    for (const name of ['Outline', 'Plot', 'Revision', 'Project']) await user.click(facets.getByRole('button', { name }))
    expect(facets.getByRole('button', { name: 'Draft' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(facets.getByRole('button', { name: 'Draft' })) // the last one stays on
    expect(facets.getByRole('button', { name: 'Draft' }).getAttribute('aria-pressed')).toBe('true')
    const cell = (tile('activity').querySelector('.wrSchedCalGrid') as HTMLElement).querySelectorAll('i')[362] as HTMLElement
    expect(cell.title).toBe('Sat, Oct 31 · Draft 412 words')
  })

  it('switches between the grid and the line graph, which draws a line for each facet that has a total goal', async () => {
    const user = userEvent.setup()
    await open()
    const activity = within(tile('activity'))
    await user.click(activity.getByRole('button', { name: 'Line graph' }))
    expect(activity.getByRole('img', { name: /Goal completion by facet/ })).toBeTruthy()
    expect(tile('activity').querySelectorAll('.wrSchedLineSolid')).toHaveLength(1) // draft is the only facet with a total goal
    expect(tile('activity').querySelector('.wrSchedFoot, .wrSchedLegend')).toBeNull() // no footnote or legend under the chart
    await user.click(activity.getByRole('button', { name: 'Grid' }))
    expect(tile('activity').querySelector('.wrSchedCalGrid')).toBeTruthy()
  })

  it('has its toggles in the title bar of the tile: the facets, the chart as icons, and % or # for the shades', async () => {
    await open()
    const bar = tile('activity').querySelector('.wrTabTileTitle') as HTMLElement
    const inBar = within(bar)
    expect(inBar.getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Outline', 'Plot', 'Draft', 'Revision', 'Project', 'Grid', 'Line graph', 'Vs goal', 'Vs busiest day', 'Minimize Activity'])
    expect(inBar.getByRole('button', { name: 'Vs goal' }).textContent).toBe('%')
    expect(inBar.getByRole('button', { name: 'Vs busiest day' }).textContent).toBe('#')
    expect(tile('activity').querySelector('.wrSchedTileBody .wrSchedFacet')).toBeNull()
  })

  it('puts the year over the monthly bars and the month number under each bar', async () => {
    await open()
    const years = [...tile('activity').querySelectorAll('.wrSchedCalYear')].map(y => y.textContent)
    expect(years.length).toBeGreaterThan(0)
    expect(years.every(y => /^\d{4}$/.test(y ?? ''))).toBe(true)
    const numbers = [...tile('activity').querySelectorAll('.wrSchedCalBarMonths span')].map(n => Number(n.textContent))
    expect(numbers.length).toBe(tile('activity').querySelectorAll('.wrSchedCalBar').length)
    expect(numbers.every(n => n >= 1 && n <= 12)).toBe(true)
  })

  it('shades against the goal or the busiest day, by a toggle', async () => {
    const user = userEvent.setup()
    await open()
    const activity = within(tile('activity'))
    expect(activity.getByRole('button', { name: 'Vs goal' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(activity.getByRole('button', { name: 'Vs busiest day' }))
    expect(activity.getByRole('button', { name: 'Vs busiest day' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the shift on its day, with its time, and opens its editor on a click', async () => {
    const user = userEvent.setup()
    await open()
    const block = await within(tile('schedule')).findByRole('button', { name: /^Morning draft, 9:00 AM to 11:00 AM/ })
    await user.click(block)
    // the click is a pointer press and release in one place
    fireEvent.pointerDown(block, { button: 0, clientY: 100 })
    fireEvent.pointerUp(window)
    expect(await screen.findByRole('form', { name: 'Edit shift' })).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Morning draft')
  })

  it('makes a shift from + Shift, repeating on chosen days, and saves the planner', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(within(tile('schedule')).getByRole('button', { name: 'New shift' }))
    await user.type(screen.getByLabelText('Title'), 'Evening plot')
    await user.selectOptions(screen.getByLabelText('Facet'), 'plot')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'weekly')
    await user.click(screen.getByRole('button', { name: 'Saturday' }))
    await user.click(screen.getByRole('button', { name: 'Save shift' }))
    expect(await within(tile('schedule')).findByRole('button', { name: /^Evening plot/ })).toBeTruthy()
    await waitFor(() => expect(saved.length).toBeGreaterThan(0), { timeout: 3000 })
    const shift = saved.at(-1)!.shifts.find(s => s.title === 'Evening plot')!
    expect(shift).toMatchObject({ facet: 'plot', date: TODAY })
    expect(shift.recurrence).toMatchObject({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5] })
  })

  it('assigns a backlog task by dropping it on a shift', async () => {
    await open()
    const block = await within(tile('schedule')).findByRole('button', { name: /^Morning draft/ })
    fireEvent.drop(block, { dataTransfer: { getData: (type: string) => (type === DRAG_ITEM ? JSON.stringify({ ownerId: 'p1', itemId: 'i1' }) : '') } })
    await waitFor(() => expect(within(tile('backlog')).queryByText('Reread Ch. 8')).toBeNull())
    await waitFor(() => expect(saved.at(-1)?.items[0].shiftId).toBe('s1'), { timeout: 3000 })
  })

  it('starts the week on Sunday from the settings, in the grid and the schedule', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Schedule settings' }))
    await user.selectOptions(screen.getByLabelText('Week starts on'), 'sunday')
    expect(Array.from(tile('activity').querySelectorAll('.wrSchedCalLetters span')).map(s => s.textContent)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    const heads = Array.from(tile('schedule').querySelectorAll('.wrSchedDayHead button')).map(b => b.textContent)
    expect(heads[0]).toMatch(/^Sun/)
  })

  it('has the settings button in the console header, not in the schedule tile, and the settings open over the console', async () => {
    const user = userEvent.setup()
    await open()
    expect(within(tile('schedule')).queryByRole('button', { name: 'Schedule settings' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Schedule settings' }))
    expect(screen.getByRole('dialog', { name: 'Schedule settings' }).closest('.wrSchedConsole')).not.toBeNull()
    expect(tile('schedule').querySelector('.wrSchedPopover')).toBeNull()
  })

  it('puts the settings button in the slot of the title bar when it is given one', () => {
    const slot = document.createElement('span')
    document.body.appendChild(slot)
    render(<ScheduleConsole scope="project" projectIds={['p1']} titles={{ p1: 'Saga' }} titleSlot={slot} />)
    expect(within(slot).getByRole('button', { name: 'Schedule settings' })).toBeTruthy()
    slot.remove()
  })

  it('has no icon smaller than 20px square, in the tiles, their title bars and the settings', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Schedule settings' }))
    const icons = [...document.querySelectorAll('.wrSchedConsole svg[viewBox="0 0 24 24"]')]
    expect(icons.length).toBeGreaterThan(20)
    for (const icon of icons) {
      expect(Number(icon.getAttribute('width'))).toBeGreaterThanOrEqual(20)
      expect(Number(icon.getAttribute('height'))).toBeGreaterThanOrEqual(20)
    }
  })

  it('has a row for every 10-minute slot of the day in the timeline, each labelled with its time, the whole hours marked', async () => {
    await open()
    const labels = [...tile('schedule').querySelectorAll('.wrSchedHours span')]
    expect(labels).toHaveLength(144)
    expect(labels[0].textContent).toBe('12:00 AM')
    expect(labels[1].textContent).toBe('12:10 AM')
    expect(labels[75].textContent).toBe('12:30 PM')
    expect(labels.filter(l => l.classList.contains('wrSchedHour'))).toHaveLength(24)
    expect(tile('schedule').querySelector('.wrSchedCol')?.getAttribute('style')).toContain(`height: ${144 * 20}px`)
  })

  it('has a year view: twelve small calendars, the days with shifts shaded, a click opening the day', async () => {
    const user = userEvent.setup()
    await open()
    const schedule = within(tile('schedule'))
    await user.click(schedule.getByRole('button', { name: 'Year' }))
    const year = tile('schedule').querySelector('.wrSchedYear') as HTMLElement
    expect(year.getAttribute('aria-label')).toBe('2026')
    const months = [...year.querySelectorAll('.wrSchedYearMonth')]
    expect(months).toHaveLength(12)
    expect(months.map(m => m.querySelector('.wrSchedYearName')?.textContent)).toEqual(['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'])
    const october = months[9]
    expect(october.querySelectorAll('.wrSchedYearDay')).toHaveLength(31)
    expect(october.querySelector('.wrSchedYearDay--today')?.textContent).toBe('31')
    expect(october.querySelector('.wrSchedYearDay--has')).not.toBeNull() // the weekday shifts
    expect(schedule.getByRole('button', { name: 'Next' })).toBeTruthy()
    await user.click(schedule.getByRole('button', { name: 'Next' }))
    expect(year.getAttribute('aria-label')).toBe('2027')
    await user.click(schedule.getByRole('button', { name: 'Previous' }))
    const again = [...(tile('schedule').querySelector('.wrSchedYear') as HTMLElement).querySelectorAll('.wrSchedYearMonth')][9] // the year was drawn again
    await user.click(again.querySelectorAll('.wrSchedYearDay')[27] as HTMLElement)
    expect(schedule.getByRole('button', { name: 'Day' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('has a different icon for each calendar view, and the Today icon shows the day of the month', async () => {
    await open()
    const schedule = within(tile('schedule'))
    const markup = (name: string) => schedule.getByRole('button', { name }).innerHTML
    const views = ['Day', 'Week', 'Month', 'Year'].map(markup)
    expect(new Set(views).size).toBe(4)
    expect(schedule.getByRole('button', { name: 'Today' }).querySelector('text')?.textContent).toBe('31')
  })

  it('switches the schedule to the day, month and agenda views', async () => {
    const user = userEvent.setup()
    await open()
    const schedule = within(tile('schedule'))
    await user.click(schedule.getByRole('button', { name: 'Agenda' }))
    expect(schedule.getByText('Morning draft')).toBeTruthy()
    await user.click(schedule.getByRole('button', { name: 'Month' }))
    expect(schedule.getByRole('grid', { name: 'October 2026' })).toBeTruthy()
    await user.click(schedule.getByRole('button', { name: 'Day' }))
    expect(schedule.getAllByRole('button', { name: /^Morning draft/ })).toHaveLength(1)
  })

  it('lists a routine that has run past its range as a priority and one inside its range as low priority', async () => {
    vi.useRealTimers()
    mockFetchBy(url => {
      if (url.endsWith('/planner')) {
        return {
          ...emptyPlanner(),
          routines: [
            { id: 'r1', label: 'Export a backup', facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: '2026-10-23', recurrence: { kind: 'interval', every: 7, unit: 'day', days: [], rangeMax: 10, anchor: '2026-10-01', until: null } },
            { id: 'r2', label: 'Review character sheets', facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: '2026-10-01', recurrence: { kind: 'interval', every: 2, unit: 'week', days: [], rangeMax: 3, anchor: '2026-09-01', until: null } },
          ],
        }
      }
      if (url.endsWith('/activity/facets')) return { today: TODAY, events: [], daily: {}, monthly: {} }
      if (url.endsWith('/analytics')) return { totals: { totalWordCount: 0 }, nodeWordCounts: {} }
      if (url.includes('/outline') || url.includes('/plot')) return { nodes: [] }
      return []
    })
    render(<ScheduleConsole scope="project" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
    const backlog = within(tile('backlog'))
    expect(await backlog.findByText('Review character sheets')).toBeTruthy()
    expect(backlog.getByText('Priority')).toBeTruthy() // 30 days since, past its 3-week range
    expect(backlog.getByText('Overdue')).toBeTruthy()
    // 8 days since, in its 7-10 day range: low priority, and can be ticked
    expect(backlog.getByText('In range · low priority')).toBeTruthy()
    expect(backlog.getByRole('checkbox', { name: 'Export a backup' })).toBeTruthy()
    expect(backlog.getByText(/day 8/)).toBeTruthy()
  })
})
