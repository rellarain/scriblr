import type { CSSProperties } from 'react'
import './colorRange.scss'

// The app's hue selector: a ranged rectangular input whose track shows every
// hue (min..max, default 0-360; a window such as 140..260 for a subcategory
// shows just that part) drawn at `sat` and `light`, with a square thumb outlined
// in white that holds a smaller square of the resulting colour.

const HUE_STOPS = 12

interface Basis { sat: number; light: number }

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`

// The colour a hue stands for.
export function resultColor(value: number, basis: Basis): string {
  return hsl(value, basis.sat, basis.light)
}

// The track: the colour at evenly spaced hues from min to max.
export function trackGradient(min: number, max: number, basis: Basis): string {
  const stops = Array.from({ length: HUE_STOPS + 1 }, (_, i) => {
    const value = min + ((max - min) * i) / HUE_STOPS
    return `${resultColor(value, basis)} ${((i / HUE_STOPS) * 100).toFixed(2)}%`
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}

// While a slider is dragged the theme preview should track the thumb, so the
// fade between palettes is switched off until the pointer is released.
function liveDrag() {
  document.documentElement.setAttribute('data-theme-live', '')
  const end = () => {
    document.documentElement.removeAttribute('data-theme-live')
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

export interface ColorRangeProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  // The saturation and lightness the hues are drawn at.
  sat?: number
  light?: number
  // Turn off the theme fade while dragging (the theme editor's own colours).
  live?: boolean
  disabled?: boolean
  className?: string
}

export function ColorRange({
  label, value, onChange, min = 0, max = 360, sat = 50, light = 50, live = false, disabled = false, className,
}: ColorRangeProps) {
  const basis: Basis = { sat, light }
  const clamped = Math.min(max, Math.max(min, value))
  const style = {
    '--cr-track': trackGradient(min, max, basis),
    '--cr-result': resultColor(clamped, basis),
    // A range with no room to move (min equals max) rests the thumb at the far end.
    '--cr-frac': max === min ? 1 : (clamped - min) / (max - min),
  } as CSSProperties
  return (
    <div className={`colorRange${disabled ? ' colorRange--disabled' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <span className="colorRangeTrack" />
      <input
        className="colorRangeInput" type="range" min={min} max={max} step={1} value={clamped}
        aria-label={label} disabled={disabled || max === min}
        onChange={e => onChange(Number(e.target.value))}
        onPointerDown={live ? liveDrag : undefined}
      />
      <span className="colorRangeThumb" aria-hidden="true"><span className="colorRangeSwatch" /></span>
    </div>
  )
}

export default ColorRange
