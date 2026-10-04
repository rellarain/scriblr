import type { CSSProperties } from 'react'
import { HUE_SWATCHES, SWATCH_START_HUE, swatchOf, wrapHue, type HueSwatch } from '../theme/bookColors'
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

// With `swatches`, the track is one gradient: the hues, starting and ending at orange (SWATCH_START_HUE),
// then on from that orange into the fixed colours (brown, black, gray, white). The last fifth of the
// track is those colours, a block each (the thumb snaps to a block's centre, where the track is exactly
// that colour). The input then works in track positions (0..POS_MAX) and `value` / `onChange` stay in
// the colour's own number: a hue 0-360, or a swatch's value.
const POS_MAX = 1000
const HUE_SHARE = 0.8

export function swatchValueToPos(value: number, swatches: readonly HueSwatch[]): number {
  const idx = swatches.findIndex(s => s.value === value)
  if (idx < 0) {
    const offset = (((value - SWATCH_START_HUE) % 360) + 360) % 360 // degrees on from the start
    return Math.round((offset / 360) * HUE_SHARE * POS_MAX)
  }
  return Math.round((HUE_SHARE + ((idx + 0.5) / swatches.length) * (1 - HUE_SHARE)) * POS_MAX)
}

export function swatchPosToValue(pos: number, swatches: readonly HueSwatch[]): number {
  const f = pos / POS_MAX
  if (f <= HUE_SHARE) return wrapHue(SWATCH_START_HUE + (f / HUE_SHARE) * 360)
  const idx = Math.min(swatches.length - 1, Math.floor(((f - HUE_SHARE) / (1 - HUE_SHARE)) * swatches.length))
  return swatches[idx].value
}

// The hue wheel from orange round to orange, then a soft blend through the swatches' colours.
export function swatchTrackGradient(basis: Basis, swatches: readonly HueSwatch[]): string {
  const stops = Array.from({ length: HUE_STOPS + 1 }, (_, i) => {
    const value = SWATCH_START_HUE + (360 * i) / HUE_STOPS
    return `${resultColor(value, basis)} ${((i / HUE_STOPS) * HUE_SHARE * 100).toFixed(2)}%`
  })
  const width = ((1 - HUE_SHARE) * 100) / swatches.length
  swatches.forEach((sw, k) => {
    const at = HUE_SHARE * 100 + (k + 0.5) * width
    stops.push(`${hsl(sw.color.h, sw.color.s, sw.color.l)} ${at.toFixed(2)}%`)
  })
  const last = swatches[swatches.length - 1].color
  stops.push(`${hsl(last.h, last.s, last.l)} 100%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
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
  // End the slider with the neutral swatches (HUE_SWATCHES); only for a full-range (0-360) slider.
  swatches?: boolean
}

export function ColorRange({
  label, value, onChange, min = 0, max = 360, sat = 50, light = 50, live = false, disabled = false, className, swatches = false,
}: ColorRangeProps) {
  const basis: Basis = { sat, light }
  if (swatches) {
    const swatch = swatchOf(value)
    const pos = swatchValueToPos(value, HUE_SWATCHES)
    const style = {
      '--cr-track': swatchTrackGradient(basis, HUE_SWATCHES),
      '--cr-result': swatch ? hsl(swatch.color.h, swatch.color.s, swatch.color.l) : resultColor(value, basis),
      '--cr-frac': pos / POS_MAX,
    } as CSSProperties
    return (
      <div className={`colorRange${disabled ? ' colorRange--disabled' : ''}${className ? ` ${className}` : ''}`} style={style}>
        <span className="colorRangeTrack" />
        <input
          className="colorRangeInput" type="range" min={0} max={POS_MAX} step={1} value={pos}
          aria-label={label} aria-valuetext={swatch ? swatch.name : `Hue ${Math.round(value)}`} disabled={disabled}
          onChange={e => onChange(swatchPosToValue(Number(e.target.value), HUE_SWATCHES))}
          onPointerDown={live ? liveDrag : undefined}
        />
        <span className="colorRangeThumb" aria-hidden="true"><span className="colorRangeSwatch" /></span>
      </div>
    )
  }
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
