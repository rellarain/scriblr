import type { CSSProperties } from 'react'
import './colorRange.scss'

// The app's colour selector: a ranged rectangular input whose track shows every
// value of what it edits, with a square thumb outlined in white that holds a
// smaller square of the resulting colour.
//
//   hue         the track runs through the hues (min..max, default 0-360; a
//               window such as 140..260 for a subcategory shows just that part)
//               drawn at `sat` and `light`
//   saturation  min..max at `hue` and `light`
//   brightness  min..max at `hue` and `sat`

export type ColorRangeKind = 'hue' | 'saturation' | 'brightness'

const RANGE: Record<ColorRangeKind, [number, number]> = { hue: [0, 360], saturation: [0, 100], brightness: [0, 100] }
const STOPS: Record<ColorRangeKind, number> = { hue: 12, saturation: 1, brightness: 4 }

interface Basis { hue: number; sat: number; light: number }

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`

// The colour a value stands for.
export function resultColor(kind: ColorRangeKind, value: number, basis: Basis): string {
  if (kind === 'hue') return hsl(value, basis.sat, basis.light)
  if (kind === 'saturation') return hsl(basis.hue, value, basis.light)
  return hsl(basis.hue, basis.sat, value)
}

// The track: the colour at evenly spaced values from min to max.
export function trackGradient(kind: ColorRangeKind, min: number, max: number, basis: Basis): string {
  const n = STOPS[kind]
  const stops = Array.from({ length: n + 1 }, (_, i) => {
    const value = min + ((max - min) * i) / n
    return `${resultColor(kind, value, basis)} ${((i / n) * 100).toFixed(2)}%`
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
  kind: ColorRangeKind
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  // What the other two channels are while this one moves.
  hue?: number
  sat?: number
  light?: number
  // Turn off the theme fade while dragging (the theme editor's own colours).
  live?: boolean
  disabled?: boolean
  className?: string
}

export function ColorRange({
  label, kind, value, onChange, min, max, hue = 0, sat = 50, light = 50, live = false, disabled = false, className,
}: ColorRangeProps) {
  const lo = min ?? RANGE[kind][0]
  const hi = max ?? RANGE[kind][1]
  const basis: Basis = { hue, sat, light }
  const clamped = Math.min(hi, Math.max(lo, value))
  const style = {
    '--cr-track': trackGradient(kind, lo, hi, basis),
    '--cr-result': resultColor(kind, clamped, basis),
    // A range with no room to move (min equals max) rests the thumb at the far end.
    '--cr-frac': hi === lo ? 1 : (clamped - lo) / (hi - lo),
  } as CSSProperties
  return (
    <div className={`colorRange${disabled ? ' colorRange--disabled' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <span className="colorRangeTrack" />
      <input
        className="colorRangeInput" type="range" min={lo} max={hi} step={1} value={clamped}
        aria-label={label} disabled={disabled || hi === lo}
        onChange={e => onChange(Number(e.target.value))}
        onPointerDown={live ? liveDrag : undefined}
      />
      <span className="colorRangeThumb" aria-hidden="true"><span className="colorRangeSwatch" /></span>
    </div>
  )
}

export default ColorRange
