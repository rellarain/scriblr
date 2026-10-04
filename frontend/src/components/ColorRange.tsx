import type { CSSProperties } from 'react'
import {
  DEFAULT_BOOK_HUE, SUBCATEGORY_HUE_WINDOW, TONES, TONE_NAME, decodeHue, encodeHue, hueDelta, toneHsl, type Tone,
} from '../theme/bookColors'
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

// ---------------------------------------------------------------- the tone track
//
// With `tones` the input works in track positions (0..POS_MAX) over one gradient, and `value` /
// `onChange` stay in the colour's own code (see theme/bookColors.ts): a hue in a brightness.
//
//   three bands, one per brightness: darker | base | lighter
//   unlimited (no `centre`): each band is the whole hue wheel
//   limited (`centre` = the parent's hue): each band is the +-60 degree window round that hue
//
// Every band is drawn at the one saturation (the zone's), at its brightness. An unlimited wheel
// starts and ends at orange so a hue sits at the same place in every band.
const POS_MAX = 999 // three bands, each a whole number of positions wide
const WHEEL_START_HUE = DEFAULT_BOOK_HUE

export interface ToneSegment { tone: Tone; from: number; to: number }

export function toneLayout(): ToneSegment[] {
  return TONES.map((tone, i) => ({ tone, from: i / TONES.length, to: (i + 1) / TONES.length }))
}

// A code's place on the track (0..POS_MAX): its hue's place in its brightness's band.
export function toneCodeToPos(code: number, centre: number | null): number {
  const d = decodeHue(code)
  const seg = toneLayout().find(s => s.tone === d.tone)!
  const f = centre !== null
    ? (Math.max(-SUBCATEGORY_HUE_WINDOW, Math.min(SUBCATEGORY_HUE_WINDOW, hueDelta(centre, d.hue))) + SUBCATEGORY_HUE_WINDOW) / (2 * SUBCATEGORY_HUE_WINDOW)
    : (((d.hue - WHEEL_START_HUE) % 360) + 360) % 360 / 360
  // A band's last position belongs to the band (the next one starts a position later).
  const last = seg.to >= 1 ? POS_MAX : Math.round(seg.to * POS_MAX) - 1
  return Math.min(last, Math.round((seg.from + f * (seg.to - seg.from)) * POS_MAX))
}

// The code at a track position.
export function tonePosToCode(pos: number, centre: number | null): number {
  const layout = toneLayout()
  const f = Math.max(0, Math.min(1, pos / POS_MAX))
  const seg = layout.find(s => f < s.to - 1e-9) ?? layout[layout.length - 1]
  const within = Math.max(0, Math.min(1, (f - seg.from) / (seg.to - seg.from)))
  const hue = centre !== null ? centre - SUBCATEGORY_HUE_WINDOW + within * 2 * SUBCATEGORY_HUE_WINDOW : WHEEL_START_HUE + within * 360
  return encodeHue(hue, seg.tone)
}

// The continuous track: each band through its hues at its brightness.
export function toneTrackGradient(basis: Basis, centre: number | null): string {
  const zone = { s: basis.sat, l: basis.light }
  const css = (code: number) => { const c = toneHsl(code, zone); return hsl(c.h, c.s, c.l) }
  const stops: string[] = []
  const at = (n: number) => `${(n * 100).toFixed(2)}%`
  for (const seg of toneLayout()) {
    for (let i = 0; i <= HUE_STOPS; i += 1) {
      const t = i / HUE_STOPS
      const hue = centre !== null ? centre - SUBCATEGORY_HUE_WINDOW + t * 2 * SUBCATEGORY_HUE_WINDOW : WHEEL_START_HUE + t * 360
      stops.push(`${css(encodeHue(hue, seg.tone))} ${at(seg.from + t * (seg.to - seg.from))}`)
    }
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

// What a code is called, for assistive tech.
export function toneName(code: number): string {
  const d = decodeHue(code)
  return `${TONE_NAME[d.tone]}, hue ${d.hue}`
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
  // The tone track (see above); `value` and `onChange` are then colour codes, not hues.
  tones?: boolean
  // With `tones`: the parent's hue for a limited track, none for an unlimited one.
  centre?: number | null
}

export function ColorRange({
  label, value, onChange, min = 0, max = 360, sat = 50, light = 50, live = false, disabled = false, className, tones = false, centre = null,
}: ColorRangeProps) {
  const basis: Basis = { sat, light }
  if (tones) {
    const pos = toneCodeToPos(value, centre)
    const result = toneHsl(value, { s: sat, l: light })
    const style = {
      '--cr-track': toneTrackGradient(basis, centre),
      '--cr-result': hsl(result.h, result.s, result.l),
      '--cr-frac': pos / POS_MAX,
    } as CSSProperties
    return (
      <div className={`colorRange${disabled ? ' colorRange--disabled' : ''}${className ? ` ${className}` : ''}`} style={style}>
        <span className="colorRangeTrack" />
        <input
          className="colorRangeInput" type="range" min={0} max={POS_MAX} step={1} value={pos}
          aria-label={label} aria-valuetext={toneName(value)} disabled={disabled}
          onChange={e => onChange(tonePosToCode(Number(e.target.value), centre))}
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
