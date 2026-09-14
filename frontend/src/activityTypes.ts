// The header's activity ribbon: one day divided into 144 ten-minute slots.
export type ActivityKind = 'work' | 'nonWork' | 'break' | 'idle'

export interface ActivityInterval {
  startMinute: number // 0-1430, step 10
  kind: ActivityKind
}
