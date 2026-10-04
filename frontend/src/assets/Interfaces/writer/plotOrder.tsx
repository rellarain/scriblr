import { useStoredState } from './storage'

// How the plotpoints already placed in the outline are listed: by the Time of the scene each belongs
// to, or in story order (where they sit in the outline). One choice for every list that has the toggle.
export type PlotOrder = 'time' | 'story'
export const PLOT_ORDER_KEY = 'scriblr.writer.plotOrder'

export function usePlotOrder(): [PlotOrder, (next: PlotOrder) => void] {
  const [order, setOrder] = useStoredState<PlotOrder>(PLOT_ORDER_KEY, 'time')
  return [order === 'story' ? 'story' : 'time', setOrder]
}

export function PlotOrderToggle({ className }: { className?: string }) {
  const [order, setOrder] = usePlotOrder()
  const button = (value: PlotOrder, label: string, title: string) => (
    <button
      type="button" className={order === value ? 'wrOrderBtn wrOrderBtn--on' : 'wrOrderBtn'}
      aria-pressed={order === value} title={title} onClick={() => setOrder(value)}
    >
      {label}
    </button>
  )
  return (
    <span className={className ? `wrOrderToggle ${className}` : 'wrOrderToggle'} role="group" aria-label="Plotpoint order">
      {button('time', 'By time', "Order by the time of each plotpoint's scene")}
      {button('story', 'In story', 'Order as they appear in the story (the outline)')}
    </span>
  )
}
