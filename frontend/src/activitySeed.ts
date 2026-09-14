import type { ActivityInterval, ActivityKind } from './activityTypes'

// Mock plausible day pattern: idle overnight, workday blocks with a lunch
// break, some evening non-work activity, idle again late night. One kind
// hand-authored per hour, expanded to 6 ten-minute slots/hour below -- not
// real telemetry, just a readable placeholder (see helper/queueSeed.ts for
// the sibling seed-file convention this follows).
const HOUR_KIND: ActivityKind[] = [
  // 0        1        2        3        4        5        6        7         8         9        10       11
  'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'nonWork', 'work', 'work', 'work',
  // 12       13      14      15      16      17         18         19         20         21      22      23
  'break', 'work', 'work', 'work', 'work', 'nonWork', 'nonWork', 'nonWork', 'nonWork', 'idle', 'idle', 'idle',
]

export const DAY_ACTIVITY: ActivityInterval[] = Array.from({ length: 144 }, (_, i) => ({
  startMinute: i * 10,
  kind: HOUR_KIND[Math.floor(i / 6)],
}))
