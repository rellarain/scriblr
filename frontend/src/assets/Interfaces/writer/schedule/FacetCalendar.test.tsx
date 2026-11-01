import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDay, FACETS, type MonthTotals } from '../../../../lib/facets'
import { buildFacetGrid, portraitRows, weekRows } from '../../../../lib/scheduleCalendar'
import { FacetCalendar, isPortrait, landscapeCell, portraitCell } from './FacetCalendar'

const month = (draft: number): MonthTotals => ({ ...emptyDay(), draft, activeDays: 10 })
const grid = buildFacetGrid({
  daily: { '2026-10-31': { ...emptyDay(), draft: 300 }, '2026-10-26': { ...emptyDay(), outline: 2 } },
  monthly: { '2024-11': month(9000), '2025-01': month(12000), '2025-02': month(6000) },
  today: '2026-10-31', facets: FACETS, rule: 'busiest', dailyGoals: {}, weekStart: 'monday',
})

// A box of this size for every element (jsdom has no layout): what the calendar measures itself against.
const boxOf = (width: number, height: number) => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
  () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect,
)

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('the shape of the tile', () => {
  it('is portrait when the tile is taller than wide or square, landscape when wider, and landscape until measured', () => {
    expect(isPortrait({ width: 300, height: 600 })).toBe(true)
    expect(isPortrait({ width: 400, height: 400 })).toBe(true)
    expect(isPortrait({ width: 600, height: 300 })).toBe(false)
    expect(isPortrait(null)).toBe(false)
  })
})

describe('the cell that fits the tile', () => {
  it('is square in a landscape tile tall enough, and squished in height, not width, in a shorter one', () => {
    const tall = landscapeCell(300, true)
    expect(tall.w).toBe(tall.h)
    const short = landscapeCell(110, true)
    expect(short.h).toBeLessThan(8)
    expect(short.w).toBe(8)
    // seven rows and their gaps, the months' row and the numbers fit the height
    expect(short.h * 7 + short.gap * 6 + 28 + 4 + 18).toBeLessThanOrEqual(110)
    expect(landscapeCell(null).w).toBe(14)
  })
  it('is square in a portrait tile, the seven columns and what is beside them fitting its width (the weeks scroll down)', () => {
    const c = portraitCell(360, true)
    expect(c.w).toBe(c.h)
    expect(c.w * 7 + c.gap * 6 + 20 + c.gap).toBeLessThanOrEqual(360)
    expect(portraitCell(60, true).w).toBe(8) // never under 8px
    expect(portraitCell(null).w).toBe(14)
  })
})

describe('the portrait grid', () => {
  it('has the weeks as rows, the newest first', () => {
    const weeks = weekRows(grid.cells)
    expect(weeks).toHaveLength(52)
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks[0].some(c => c.today)).toBe(true) // the top row is the current week
    expect(weeks[0][0].date < weeks[1][0].date).toBe(false) // and the next row is the week before
  })
  it('maps a month rectangle over weeks (oldest first) to the rows it covers (newest first)', () => {
    expect(portraitRows(49, 4, 52)).toEqual({ row: 1, span: 4 }) // the last four weeks are the top four rows
    expect(portraitRows(1, 4, 52)).toEqual({ row: 49, span: 4 })
  })

  it('is drawn in a tile taller than wide as a calendar: the months as dividers in capitals, the current week on the top row, the bars grouped by year', () => {
    boxOf(320, 700)
    const { container } = render(<FacetCalendar grid={grid} weekStart="monday" />)
    expect(container.querySelector('.wrSchedCal--portrait')).not.toBeNull()
    const main = container.querySelector('.wrSchedCalPMain') as HTMLElement
    const dividers = [...main.querySelectorAll('.wrSchedCalPDivider')].map(d => d.textContent)
    expect(dividers[0]).toBe('OCTOBER') // the newest month first, in capitals
    expect(dividers.every(d => d === d?.toUpperCase())).toBe(true)
    expect(dividers).toHaveLength(12) // November of the year before to October
    // the first week row after the first divider is the current week: its Mon-to-Sat days are shown (Sunday Nov 1 is not here yet), today among them
    const afterFirst = [...main.children].slice(1, 8)
    expect(afterFirst.some(c => c.className.includes('--today'))).toBe(true)
    expect([...container.querySelectorAll('.wrSchedCalPLetters span')].map(l => l.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    const bars = container.querySelector('.wrSchedCalPBars') as HTMLElement
    expect([...bars.querySelectorAll('.wrSchedCalPDivider')].map(d => d.textContent)).toEqual(['2025', '2024']) // a divider for each year, the newest first
    expect([...bars.querySelectorAll('.wrSchedCalPNum')].map(n => n.textContent)).toEqual(['2', '1', '11']) // the newest month first
    const root = container.querySelector('.wrSchedCal') as HTMLElement
    expect(root.style.getPropertyValue('--ch')).toBe(root.style.getPropertyValue('--cw')) // square
  })
})

describe('the landscape grid', () => {
  it('writes the months in capitals, abbreviated to fit their rectangles', () => {
    boxOf(900, 260)
    const { container } = render(<FacetCalendar grid={grid} weekStart="monday" />)
    const names = [...container.querySelectorAll('.wrSchedCalMonth')].map(m => m.textContent ?? '')
    expect(names.length).toBeGreaterThan(8)
    expect(names.every(n => n === n.toUpperCase())).toBe(true)
    expect(names.some(n => n.length === 3)).toBe(true) // a four-week month at 14px a week is too narrow for its whole name
  })

  it('is drawn in a tile wider than tall, with the weeks as columns', () => {
    boxOf(900, 260)
    const { container } = render(<FacetCalendar grid={grid} weekStart="monday" />)
    expect(container.querySelector('.wrSchedCal--portrait')).toBeNull()
    expect(container.querySelectorAll('.wrSchedCalGrid > i')).toHaveLength(52 * 7)
    expect([...container.querySelectorAll('.wrSchedCalBarMonths span')].map(n => n.textContent)).toEqual(['11', '1', '2'])
  })

  it('keeps the current week at the right edge when the tile is resized', () => {
    let resize: (r: { width: number; height: number }) => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: ResizeObserverCallback) { resize = r => cb([{ contentRect: r } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      observe() {}
      disconnect() {}
    })
    boxOf(900, 260)
    const { container } = render(<FacetCalendar grid={grid} weekStart="monday" />)
    const scroller = container.querySelector('.wrSchedCalScroll') as HTMLElement
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, get: () => 2000 })
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => 800 })
    act(() => resize({ width: 900, height: 200 })) // the tile gets shorter: the cells shrink and the grid is narrower
    expect(scroller.scrollLeft).toBe(1200) // scrollWidth - clientWidth: still at the right edge, not the left
    // scrolled away from the edge by 300px, it stays 300px from it
    scroller.scrollLeft = 900
    scroller.dispatchEvent(new Event('scroll'))
    act(() => resize({ width: 900, height: 160 }))
    expect(scroller.scrollLeft).toBe(900)
  })
})
