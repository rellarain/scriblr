import type { CSSProperties } from 'react'
import {
  DEFAULT_BOOK_HUE, NEUTRAL_CODE, NEUTRAL_NAME, SUBCATEGORY_HUE_WINDOW, TONES, TONE_NAME, decodeHue, encodeHue, hueDelta, toneHsl,
  type Neutral, type Tone,
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
// `onChange` stay in the colour's own code (see theme/bookColors.ts): a hue in a tone, or a neutral stop.
//
//   unlimited (no `centre`): dark gray | dark | saturated | desaturated | light saturated | white
//   limited (`centre` = the parent's hue): dark gray of the parent | dark | saturated | desaturated |
//     light saturated windows round the parent's hue (+-60 degrees each) | light gray of the parent |
//     light shade of the parent
//
// Each wheel / window is drawn at its tone's saturation and lightness (the zone's, stepped), and an
// unlimited wheel starts and ends at orange so a hue sits at the same place in every tone.
const POS_MAX = 1000
const NEUTRAL_SHARE = 0.03 // a neutral stop's block, of the track
const WHEEL_START_HUE = DEFAULT_BOOK_HUE

export type ToneSegment =
  | { kind: 'neutral'; neutral: Neutral; from: number; to: number }
  | { kind: 'wheel'; tone: Tone; from: number; to: number }

export function toneLayout(limited: boolean): ToneSegment[] {
  const lead: Neutral[] = [limited ? 'darkGrayOfParent' : 'darkGray']
  const tail: Neutral[] = limited ? ['lightGrayOfParent', 'lightShadeOfParent'] : ['white']
  const wheel = (1 - NEUTRAL_SHARE * (lead.length + tail.length)) / TONES.length
  const segments: ToneSegment[] = []
  let at = 0
  const push = (make: (from: number, to: number) => ToneSegment, width: number) => { segments.push(make(at, at + width)); at += width }
  for (const neutral of lead) push((from, to) => ({ kind: 'neutral', neutral, from, to }), NEUTRAL_SHARE)
  for (const tone of TONES) push((from, to) => ({ kind: 'wheel', tone, from, to }), wheel)
  for (const neutral of tail) push((from, to) => ({ kind: 'neutral', neutral, from, to }), NEUTRAL_SHARE)
  segments[segments.length - 1].to = 1 // no rounding gap at the end
  return segments
}

// A code's place on the track (0..POS_MAX): the middle of a neutral's block, or its hue's place in its tone's wheel.
export function toneCodeToPos(code: number, centre: number | null): number {
  const layout = toneLayout(centre !== null)
  const d = decodeHue(code)
  if (d.kind === 'neutral') {
    const seg = layout.find(s => s.kind === 'neutral' && s.neutral === d.neutral)
    // A stop this track does not have (a free neutral on a limited track): the track's first block.
    const found = seg ?? layout[0]
    return Math.round(((found.from + found.to) / 2) * POS_MAX)
  }
  const seg = layout.find(s => s.kind === 'wheel' && s.tone === d.tone)!
  const f = centre !== null
    ? (Math.max(-SUBCATEGORY_HUE_WINDOW, Math.min(SUBCATEGORY_HUE_WINDOW, hueDelta(centre, d.hue))) + SUBCATEGORY_HUE_WINDOW) / (2 * SUBCATEGORY_HUE_WINDOW)
    : (((d.hue - WHEEL_START_HUE) % 360) + 360) % 360 / 360
  return Math.round((seg.from + f * (seg.to - seg.from)) * POS_MAX)
}

// The code at a track position.
export function tonePosToCode(pos: number, centre: number | null): number {
  const layout = toneLayout(centre !== null)
  const f = Math.max(0, Math.min(1, pos / POS_MAX))
  const seg = layout.find(s => f < s.to) ?? layout[layout.length - 1]
  if (seg.kind === 'neutral') return NEUTRAL_CODE[seg.neutral]
  const within = Math.max(0, Math.min(1, (f - seg.from) / (seg.to - seg.from)))
  const hue = centre !== null ? centre - SUBCATEGORY_HUE_WINDOW + within * 2 * SUBCATEGORY_HUE_WINDOW : WHEEL_START_HUE + within * 360
  return encodeHue(hue, seg.tone)
}

// The continuous track: each wheel through its hues in its tone, each neutral a flat block.
export function toneTrackGradient(basis: Basis, centre: number | null): string {
  const zone = { s: basis.sat, l: basis.light }
  const parent = centre ?? 0
  const css = (code: number) => { const c = toneHsl(code, zone, parent); return hsl(c.h, c.s, c.l) }
  const stops: string[] = []
  const at = (n: number) => `${(n * 100).toFixed(2)}%`
  for (const seg of toneLayout(centre !== null)) {
    if (seg.kind === 'neutral') {
      const colour = css(NEUTRAL_CODE[seg.neutral])
      stops.push(`${colour} ${at(seg.from)}`, `${colour} ${at(seg.to)}`)
      continue
    }
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
  return d.kind === 'neutral' ? NEUTRAL_NAME[d.neutral] : `${TONE_NAME[d.tone]}, hue ${d.hue}`
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
    const result = toneHsl(value, { s: sat, l: light }, centre ?? 0)
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
