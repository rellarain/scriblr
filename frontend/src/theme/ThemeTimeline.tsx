import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { setTheme, useSettings } from '../settings/settingsStore'
import { ZONE_ICON } from './zoneIcons'
import { readableInk } from './contrast'
import { configuredZones, formatMinute, HOUR, MAX_HOUR_START, moveZoneStart, resetZoneStart, STEP_MINUTES } from './zones'
import { hslCss } from './palettes'
import { resolvePalette } from './zoneLooks'
import { ZONE_LABEL, type ZoneKey } from './types'

// 24h strip showing which zone is in effect when. Each segment is a midtone of its zone's accent (its accent hue and saturation at 50%
// lightness); every zone except the one being edited is a little dimmer.
//
// Where a zone begins is a handle on the strip (the seam you see, even with Day alone): drag it and it snaps to the nearest hour, the
// time showing in a bubble above it, and the zone's "Starts at" follows. A handle that meets the next one pushes it along, so zones
// keep their order and at least an hour each. The arrow keys move it an hour (Shift: 10 minutes); a double click puts the zone back
// to its default time. Grabbing a handle selects its zone.

const snapToHour = (minute: number) => Math.min(MAX_HOUR_START, Math.max(0, Math.round(minute / HOUR) * HOUR))

export function ThemeTimeline({ selected, onSelect }: { selected: ZoneKey; onSelect: (zone: ZoneKey) => void }) {
  const { theme } = useSettings()
  const order = configuredZones(theme.zones)
  const barRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<ZoneKey | null>(null)

  const segments: Array<{ key: ZoneKey; from: number; to: number }> = []
  order.forEach((key, i) => {
    const from = theme.zones[key].startMinute
    let to = theme.zones[order[(i + 1) % order.length]].startMinute
    if (order.length === 1) to = from + 1440
    else if (to <= from) to += 1440
    if (to > 1440) {
      segments.push({ key, from, to: 1440 })
      segments.push({ key, from: 0, to: to - 1440 })
    } else {
      segments.push({ key, from, to })
    }
  })

  // While a handle is held the mouse is followed on the window, so the drag carries on outside the strip.
  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      const bar = barRef.current
      if (!bar) return
      const box = bar.getBoundingClientRect()
      if (box.width <= 0) return
      const minute = snapToHour(((e.clientX - box.left) / box.width) * 1440)
      setTheme(prev => moveZoneStart(prev, dragging, minute))
    }
    const end = () => setDragging(null)
    const { userSelect, cursor } = document.body.style
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      document.body.style.userSelect = userSelect
      document.body.style.cursor = cursor
    }
  }, [dragging])

  const press = (key: ZoneKey) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.focus()
    onSelect(key)
    setDragging(key)
  }
  const keys = (key: ZoneKey) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const step = e.shiftKey ? STEP_MINUTES : HOUR
    setTheme(prev => moveZoneStart(prev, key, prev.zones[key].startMinute + dir * step))
  }

  return (
    <div className="themeTimeline" role="group" aria-label="Time zones across the day">
      <div className="themeTimelineTrack">
        <div className="themeTimelineBar" ref={barRef} role="img" aria-label="Where each time zone is in effect">
          {segments.map((seg, i) => {
            const accent = resolvePalette(theme.zones[seg.key].palette, seg.key).accent
            const fill = { h: accent.h, s: accent.s, l: 50 }
            const Icon = ZONE_ICON[seg.key]
            return (
              <span
                key={`${seg.key}-${i}`}
                className={seg.key === selected ? 'themeTimelineSeg' : 'themeTimelineSeg themeTimelineSeg--dim'}
                style={{ left: `${(seg.from / 1440) * 100}%`, width: `${((seg.to - seg.from) / 1440) * 100}%`, backgroundColor: hslCss(fill), color: hslCss(readableInk(fill)) }}
                title={`${ZONE_LABEL[seg.key]}: ${formatMinute(seg.from % 1440)} - ${formatMinute(seg.to % 1440)}`}
              >
                <Icon size={14} />
              </span>
            )
          })}
        </div>
        {order.map(key => {
          const start = theme.zones[key].startMinute
          return (
            <button
              key={key} type="button" role="slider"
              className={`themeTimelineHandle${key === selected ? ' themeTimelineHandle--selected' : ''}${dragging === key ? ' themeTimelineHandle--active' : ''}`}
              style={{ left: `${(start / 1440) * 100}%` }}
              aria-label={`${ZONE_LABEL[key]} starts at`} aria-orientation="horizontal"
              aria-valuemin={0} aria-valuemax={MAX_HOUR_START} aria-valuenow={start} aria-valuetext={formatMinute(start)}
              title={`${ZONE_LABEL[key]} starts at ${formatMinute(start)}. Drag to move it; double-click for its default.`}
              onMouseDown={press(key)} onKeyDown={keys(key)} onFocus={() => onSelect(key)}
              onDoubleClick={() => setTheme(prev => resetZoneStart(prev, key))}
            >
              <span className="themeTimelineBubble" aria-hidden="true">{formatMinute(start)}</span>
            </button>
          )
        })}
      </div>
      <div className="themeTimelineTicks"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
    </div>
  )
}

export default ThemeTimeline
