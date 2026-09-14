import { useEffect, useState } from 'react'
import type { ActivityInterval } from './activityTypes'

interface HeaderActivityRibbonProps {
  intervals: ActivityInterval[]
}

// Which 10-minute slot (0-1430) the real clock is in right now.
function currentSlotStart(): number {
  const now = new Date()
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / 10) * 10
}

// Row 2: today's activity, one thin segment per 10-minute interval, colored
// by work/non-work/idle -- except the slot the real clock is in right now,
// which is always white regardless of its own kind. Root element IS the
// row's own flex container.
//
// Always visible (its own space overlaps where UUI rests when the drawer
// is open, since UUI sits at top: 40px, same as this row) -- inactive
// (idle) segments collapse to 0 height instead, so they don't obscure
// UUI there; only segments with real activity keep any height.
function HeaderActivityRibbon({ intervals }: HeaderActivityRibbonProps) {
  const [currentSlot, setCurrentSlot] = useState(currentSlotStart)

  useEffect(() => {
    // 10-minute granularity -- checking every 30s is more than enough to
    // catch the slot boundary without excessive re-rendering.
    const id = setInterval(() => setCurrentSlot(currentSlotStart()), 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="headerRibbonRow" role="img" aria-label="Today's activity, in 10-minute intervals">
      {intervals.map(({ startMinute, kind }) => (
        <span
          key={startMinute}
          className={
            startMinute === currentSlot
              ? 'headerRibbonSegment headerRibbonSegment--current'
              : `headerRibbonSegment headerRibbonSegment--${kind}`
          }
        />
      ))}
    </div>
  )
}

export default HeaderActivityRibbon
