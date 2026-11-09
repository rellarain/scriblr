import type { ReactNode } from 'react'
import DragGap from '../../../../components/DragGap'
import { GripIcon } from '../../../icons'
import { useReorder } from '../plot/useReorder'

// A list whose items are reordered by dragging their grip (or Alt + Up / Down on it): the items it passes slide aside to open a gap, as in the Plot
// presets' lists. Each list needs its own instance of the hook, so each is one of these. `render` draws an item and is given its grip.
export function ReorderList<T extends { id: string }>({ items, onMove, onNudge, className, itemClass, render, label }: {
  items: T[]
  // Put `id` before `beforeId` (null: last).
  onMove: (id: string, beforeId: string | null) => void
  onNudge?: (id: string, dir: -1 | 1) => void
  className?: string
  itemClass?: (item: T) => string
  render: (item: T, grip: ReactNode) => ReactNode
  // What the grip says it moves, for a screen reader.
  label: (item: T) => string
}) {
  const drag = useReorder<string>(onMove, onNudge ?? ((id, dir) => {
    const at = items.findIndex(i => i.id === id), to = at + dir
    if (at < 0 || to < 0 || to >= items.length) return
    const next = items[dir < 0 ? to : to + 1]
    onMove(id, next ? next.id : null)
  }))
  return (
    <ul className={className} ref={drag.listRef}>
      <DragGap rect={drag.gap} />
      {items.map(item => (
        <li key={item.id} className={`${itemClass?.(item) ?? ''}${drag.dragId === item.id ? ' cmDragging' : ''}`} {...drag.item(item.id)}>
          {render(item, <span className="cmGrip" role="button" tabIndex={0} aria-label={`Move ${label(item)} (Alt+Up or Down)`} {...drag.grip(item.id)}><GripIcon size={12} /></span>)}
        </li>
      ))}
    </ul>
  )
}
