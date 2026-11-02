import { useRef, useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPlanner, newTask, type ActivityEvent, type Planner, type Shift } from '../../../../lib/facets'
import { DRAG_ITEM } from './Backlog'
import { ScheduleCard, type ScheduleOwner, type TicksApi } from './ScheduleCard'

const TODAY = '2026-10-31' // a Saturday
const shift = (over: Partial<Shift> = {}): Shift => ({
  id: 's1', title: 'Morning draft', facet: 'draft', date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: 800,
  recurrence: null, pauses: [], skipped: [], overrides: {}, ...over,
})
const repeating = (over: Partial<Shift> = {}) => shift({ recurrence: { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: '2026-10-26', until: null }, ...over })
const withShifts = (shifts: Shift[], items = [newTask('i1', 'Reread Ch. 8', null, { priority: 'medium', estimateMinutes: 30 })]): Planner => ({ ...emptyPlanner(), shifts, items })

let latest: Planner
function Harness({ start, events = [], nowSlot = 60, nodeTitle }: { start: Planner; events?: ActivityEvent[]; nowSlot?: number; nodeTitle?: (id: string) => string | undefined }) {
  const [planner, setPlanner] = useState(start)
  const ticked = useRef<Record<string, string[]>>({})
  const [, force] = useState(0)
  latest = planner
  const owner: ScheduleOwner = { id: 'p1', label: 'Saga', projectId: 'p1', planner, setPlanner: p => { latest = p; setPlanner(p) } }
  const ticks: TicksApi = {
    get: (_o, d) => ticked.current[d] ?? [], loaded: () => true, load: () => {},
    set: (_o, d, id, on) => { ticked.current[d] = on ? [...(ticked.current[d] ?? []), id] : (ticked.current[d] ?? []).filter(x => x !== id); force(n => n + 1) },
  }
  return <ScheduleCard owners={[owner]} today={TODAY} nowSlot={nowSlot} events={events} weekStart="monday" targets={[]} ticks={ticks} nodeTitle={nodeTitle} />
}
const show = (p: Planner, extra: Omit<Parameters<typeof Harness>[0], 'start'> = {}) => render(<Harness start={p} {...extra} />)
const blockOf = (name: RegExp) => within(document.querySelector(`[data-date="${TODAY}"]`) as HTMLElement).getByRole('button', { name })
// A click is a press and a release in one place, which opens the shift.
const pick = (el: HTMLElement) => userEvent.setup().click(el)
const panel = () => screen.getByRole('form')

afterEach(() => { vi.restoreAllMocks() })

describe('the shift panel', () => {
  it('opens beside the calendar when a shift is clicked, and changes the shift as it is typed in (there is no Save)', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    await pick(blockOf(/^Morning draft/))
    expect(within(panel()).queryByRole('button', { name: 'Save shift' })).toBeNull()
    const title = screen.getByLabelText('Title') as HTMLInputElement
    expect(title.value).toBe('Morning draft')
    await user.clear(title)
    await user.type(title, 'Evening plot')
    expect(blockOf(/^Evening plot/)).toBeTruthy()
    expect(latest.shifts[0].title).toBe('Evening plot')
    await user.click(within(panel()).getByRole('button', { name: 'Plot' }))
    expect(latest.shifts[0].facet).toBe('plot')
  })

  it('closes with Escape, with its close icon and with a click on empty time', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    await pick(blockOf(/^Morning draft/))
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    expect(screen.queryByRole('form')).toBeNull()
    await pick(blockOf(/^Morning draft/))
    await user.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('form')).toBeNull()
    await pick(blockOf(/^Morning draft/))
    await user.click(document.querySelector(`[data-date="${TODAY}"]`) as HTMLElement)
    expect(screen.queryByRole('form')).toBeNull()
    expect(latest.shifts).toHaveLength(1) // the click only closed it
  })

  it('asks which days a change is for first, for a shift that repeats, and keeps a day\'s own title apart from the pattern\'s', async () => {
    const user = userEvent.setup()
    show(withShifts([repeating()]))
    await pick(blockOf(/^Morning draft/))
    const scope = within(panel()).getByRole('radiogroup', { name: 'Change which shifts?' })
    expect(within(scope).getAllByRole('radio').map(r => r.textContent)).toEqual(['This day', 'This and following', 'All of them'])
    expect(within(scope).getByRole('radio', { name: 'This day' }).getAttribute('aria-checked')).toBe('true')
    // the scope is the first thing in the panel
    expect((panel().querySelector('.wrSchedHead')?.nextElementSibling as HTMLElement).getAttribute('aria-label')).toBe('Change which shifts?')
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Late start')
    expect(latest.shifts[0].title).toBe('Morning draft')
    expect(latest.shifts[0].overrides[TODAY]).toEqual({ title: 'Late start' })
    await user.click(within(scope).getByRole('radio', { name: 'All of them' }))
    expect(latest.shifts[0].title).toBe('Late start')
    expect(latest.shifts[0].overrides).toEqual({})
  })

  it('splits the pattern at this day for "This and following", once, however many fields change', async () => {
    const user = userEvent.setup()
    show(withShifts([repeating()]))
    await pick(blockOf(/^Morning draft/))
    await user.click(within(panel()).getByRole('radio', { name: 'This and following' }))
    await user.click(within(panel()).getByRole('button', { name: 'Plot' }))
    await user.click(within(panel()).getByRole('button', { name: 'Revision' }))
    expect(latest.shifts).toHaveLength(2)
    const [head, tail] = latest.shifts.slice().sort((a, b) => (a.recurrence?.anchor ?? '').localeCompare(b.recurrence?.anchor ?? ''))
    expect(head.recurrence?.until).toBe('2026-10-30')
    expect(head.facet).toBe('draft')
    expect(tail).toMatchObject({ facet: 'revision' })
    expect(tail.recurrence?.anchor).toBe(TODAY)
  })

  it('makes a new shift at once, and takes it away again when the panel is closed without a name', async () => {
    const user = userEvent.setup()
    show(withShifts([]))
    await user.click(screen.getByRole('button', { name: 'New shift' }))
    expect(screen.getByRole('form', { name: 'New shift' })).toBeTruthy()
    expect(latest.shifts).toHaveLength(1)
    await user.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(latest.shifts).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'New shift' }))
    await user.type(screen.getByLabelText('Title'), 'Plot beats')
    await user.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(latest.shifts.map(s => s.title)).toEqual(['Plot beats'])
  })

  it('sets how a shift repeats from the folded Repeat section, with the presets of the repeat picker', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    await pick(blockOf(/^Morning draft/))
    expect(within(panel()).queryByRole('radio', { name: 'Weekdays' })).toBeNull() // folded
    await user.click(within(panel()).getByRole('button', { name: /^Repeat/ }))
    await user.click(within(panel()).getByRole('radio', { name: 'Weekdays' }))
    expect(latest.shifts[0].recurrence).toMatchObject({ kind: 'weekly', every: 1, days: [0, 1, 2, 3, 4], anchor: TODAY })
    await user.click(within(panel()).getByRole('radio', { name: 'Does not repeat' }))
    expect(latest.shifts[0].recurrence).toBeNull()
  })

  it('holds the pattern while "This day" is chosen, and lets it be changed for the following days', async () => {
    const user = userEvent.setup()
    show(withShifts([repeating()]))
    await pick(blockOf(/^Morning draft/))
    await user.click(within(panel()).getByRole('button', { name: /^Repeat/ }))
    expect(within(panel()).queryByRole('radio', { name: 'Weekdays' })).toBeNull()
    expect(within(panel()).getByText(/Choose This and following/)).toBeTruthy()
    await user.click(within(panel()).getByRole('radio', { name: 'All of them' }))
    await user.click(within(panel()).getByRole('radio', { name: 'Weekdays' }))
    expect(latest.shifts[0].recurrence).toMatchObject({ kind: 'weekly', days: [0, 1, 2, 3, 4], anchor: '2026-10-26' })
  })

  it('has the checklist of the shift: add a task, tick it for the day, unassign it', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    await pick(blockOf(/^Morning draft/))
    await user.click(within(panel()).getByRole('button', { name: /^Checklist/ }))
    await user.type(within(panel()).getByLabelText('New checklist item'), 'Read the notes{Enter}')
    const added = latest.items.find(i => i.label === 'Read the notes')
    expect(added).toMatchObject({ shiftId: 's1', facet: 'draft' })
    await user.click(within(panel()).getByRole('checkbox', { name: 'Read the notes' }))
    expect((within(panel()).getByRole('checkbox', { name: 'Read the notes' }) as HTMLInputElement).checked).toBe(true)
    await user.click(within(panel()).getByRole('button', { name: 'Unassign Read the notes' }))
    expect(latest.items.find(i => i.label === 'Read the notes')?.shiftId).toBeNull()
  })

  it('changes the title on the block itself with a double click', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    fireEvent.doubleClick(blockOf(/^Morning draft/))
    const input = screen.getByLabelText('Shift title')
    await user.clear(input)
    await user.type(input, 'Quiet hour{Enter}')
    expect(latest.shifts[0].title).toBe('Quiet hour')
    expect(screen.queryByLabelText('Shift title')).toBeNull()
  })

  it('has a bar of quick actions on a block: duplicate it, delete it (or skip a day of one that repeats)', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()]))
    await user.click(screen.getByRole('button', { name: 'Duplicate Morning draft' }))
    expect(latest.shifts).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Delete Morning draft' })[0])
    expect(latest.shifts).toHaveLength(1)
  })

  it('skips only the day, from the bar of a shift that repeats', async () => {
    const user = userEvent.setup()
    show(withShifts([repeating()]))
    await user.click(screen.getAllByRole('button', { name: 'Skip Morning draft on this day' })[0])
    expect(latest.shifts[0].skipped).toHaveLength(1)
  })
})

describe('the Agenda in a narrow tile', () => {
  it('lists the days as a checklist below 480px, with the stored view still the week, and gives the panel the whole tile', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 600, top: 0, left: 0, right: 320, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    show(withShifts([shift()]))
    expect(document.querySelector('.wrSchedAgenda')).toBeTruthy()
    expect(document.querySelector('.wrSchedWeek')).toBeNull()
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByText('Morning draft', { selector: '.wrSchedAgendaRow b' }).closest('button') as HTMLElement)
    expect(screen.getByRole('form')).toBeTruthy()
    expect(document.querySelector('.wrSchedMain')).toBeNull()
  })

  it('keeps the week grid in a wide tile', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    show(withShifts([shift()]))
    expect(document.querySelector('.wrSchedWeek')).toBeTruthy()
  })
})

describe('dropping a task on the calendar', () => {
  const drop = (target: HTMLElement) => fireEvent.drop(target, { clientY: 200, dataTransfer: { getData: (t: string) => (t === DRAG_ITEM ? JSON.stringify({ ownerId: 'p1', itemId: 'i1' }) : '') } })

  it('makes a shift for the task on an empty slot: its name and facet, as long as its estimate, starting where it was dropped', () => {
    show(withShifts([], [newTask('i1', 'Reread Ch. 8', null, { facet: 'plot', estimateMinutes: 50 })]))
    drop(document.querySelector(`[data-date="${TODAY}"]`) as HTMLElement)
    expect(latest.shifts).toHaveLength(1)
    expect(latest.shifts[0]).toMatchObject({ title: 'Reread Ch. 8', facet: 'plot', date: TODAY })
    expect(latest.shifts[0].endSlot - latest.shifts[0].startSlot).toBe(5)
    expect(latest.items[0].shiftId).toBe(latest.shifts[0].id)
  })

  it('puts the task on the shift it is dropped on, without making another', () => {
    show(withShifts([shift()]))
    drop(blockOf(/^Morning draft/))
    expect(latest.shifts).toHaveLength(1)
    expect(latest.items[0].shiftId).toBe('s1')
  })

  it('sets the task\'s due day when it is dropped on a day of the month', async () => {
    const user = userEvent.setup()
    show(withShifts([]))
    await user.click(screen.getByRole('button', { name: 'Month' }))
    const cell = within(screen.getByRole('grid')).getAllByRole('gridcell').find(c => c.textContent?.startsWith('5')) as HTMLElement
    drop(cell)
    expect(latest.items[0].dueDate).toMatch(/^2026-1[01]-05$/)
  })
})

describe('the Agenda keeps you aware of the day', () => {
  const task = (id: string, over = {}) => newTask(id, `Task ${id}`, null, { shiftId: 's1', priority: 'medium', ...over })
  const word = (slot: number, amount: number): ActivityEvent => ({ ts: '', date: TODAY, slot, facet: 'draft', action: 'words', nodeId: 'm', kind: 'moment', label: null, amount })

  it('has a bar for the shift running now, with the time left and its tasks, which opens the shift', async () => {
    const user = userEvent.setup()
    show(withShifts([shift()], [task('a'), task('b', { doneOn: TODAY })]))
    const bar = screen.getByRole('button', { name: /^Now: Morning draft, 1 h left, 1 of 2 tasks ticked/ })
    expect(bar.textContent).toContain('1 h left · 1/2 tasks')
    await user.click(bar)
    expect(screen.getByRole('form', { name: 'Edit shift' })).toBeTruthy()
  })

  it('has a bar for the next shift, and the time until it, when none is running', () => {
    show(withShifts([shift({ startSlot: 90, endSlot: 100 })]), { nowSlot: 60 })
    expect(screen.getByRole('button', { name: /^Next: Morning draft, in 5 h/ })).toBeTruthy()
  })

  it('has no bar when no shift is left', () => {
    show(withShifts([shift({ date: '2026-10-20' })]))
    expect(document.querySelector('.wrNextUp')).toBeNull()
  })

  it('shows on a block how far the aim is, the node it is on and how many tasks are ticked', () => {
    show(withShifts([shift({ targetNodeId: 'n1', targetTree: 'outline' })], [task('a'), task('b', { doneOn: TODAY })]), { events: [word(55, 200), word(60, 200)], nodeTitle: id => (id === 'n1' ? 'Chapter 3' : undefined) })
    const block = blockOf(/^Morning draft/)
    expect(within(block).getByText(/1\/2/)).toBeTruthy()
    expect(within(block).getByText('Chapter 3')).toBeTruthy()
    const bar = within(block).getByRole('progressbar', { name: 'Morning draft aim' })
    expect(bar.getAttribute('aria-valuenow')).toBe('400')
    expect(bar.getAttribute('aria-valuemax')).toBe('800')
  })

  it('marks the days that tasks and routines fall due on, with their names', () => {
    const p = withShifts([], [newTask('i1', 'Send pages', null, { dueDate: '2026-10-28' })])
    show(p)
    const mark = screen.getByLabelText(/1 due on .*: Send pages/)
    expect(mark.textContent).toBe('1 due')
    expect(mark.getAttribute('title')).toBe('Due: Send pages')
  })

  it('shows a Now button while the now line is scrolled out of sight, which brings it back', async () => {
    const user = userEvent.setup()
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 })
    try {
      show(withShifts([]))
      const box = document.querySelector('.wrSchedGridBox') as HTMLElement
      expect(screen.queryByRole('button', { name: 'Now' })).toBeNull() // it opened on the now line
      box.scrollTop = 0
      fireEvent.scroll(box)
      await user.click(await screen.findByRole('button', { name: 'Now' }))
      expect(box.scrollTop).toBeGreaterThan(900)
      expect(screen.queryByRole('button', { name: 'Now' })).toBeNull()
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
    }
  })
})
