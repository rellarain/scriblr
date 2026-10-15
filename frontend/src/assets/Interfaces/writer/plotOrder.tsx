import type { ComponentType } from 'react'
import { BookOpenIcon, ClockIcon, type IconProps } from '../../icons'
import { useStoredState } from './storage'

// How the plotpoints already placed in the outline are listed: by the Time of the scene each belongs
// to, or in story order (where they sit in the outline). One choice for every list that has the toggle: a clock for
// time, an open book for the story.
export type PlotOrder = 'time' | 'story'
export const PLOT_ORDER_KEY = 'scriblr.writer.plotOrder'

export function usePlotOrder(): [PlotOrder, (next: PlotOrder) => void] {
  const [order, setOrder] = useStoredState<PlotOrder>(PLOT_ORDER_KEY, 'time')
  return [order === 'story' ? 'story' : 'time', setOrder]
}

export function PlotOrderToggle({ className }: { className?: string }) {
  const [order, setOrder] = usePlotOrder()
  const button = (value: PlotOrder, label: string, title: string, Icon: ComponentType<IconProps>) => (
    <button
      type="button" className={order === value ? 'wrOrderBtn wrOrderBtn--on' : 'wrOrderBtn'}
      aria-label={label} aria-pressed={order === value} title={title} onClick={() => setOrder(value)}
    >
      <Icon size={14} />
    </button>
  )
  return (
    <span className={className ? `wrOrderToggle ${className}` : 'wrOrderToggle'} role="group" aria-label="Plotpoint order">
      {button('time', 'By time', "By time: ordered by the time of each plotpoint's scene", ClockIcon)}
      {button('story', 'In story', 'In story: ordered as they appear in the story (the outline)', BookOpenIcon)}
    </span>
  )
}
