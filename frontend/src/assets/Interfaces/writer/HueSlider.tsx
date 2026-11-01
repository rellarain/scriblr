import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import ColorRange, { resultColor } from '../../../components/ColorRange'
import { chipLight, hueDelta, hueOfCode, rangeOptions, sliderLight, wrapHue, zoneBasis } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// What a level's colour selector is given: the colour it shows, the hue it is measured from, its range, and what to do when the user changes any of them.
// (The workspace hands these out per node: `hueSliderOf`, `plotHueSliderOf` and `projectHueSlider` in useWriterWorkspace.ts.)
export interface HueSliderValue {
  // The hue shown: the node's own, or its parent's while it inherits.
  hue: number
  // The hue the colour is measured from (the parent's); null when there is none (a plain slider with no row).
  centre: number | null
  // Degrees either side of the centre the colour may take (30, 60, 90, 120, 180 or 360 = any hue).
  range: number
  // The widest range on offer: the parent's own range (360 when it has none).
  maxRange?: number
  // The node has no colour of its own: it shows, and follows, its parent's.
  inherit?: boolean
  onChange: (hue: number) => void
  onRange?: (range: number) => void
  onInherit?: (on: boolean) => void
}

const rangeText = (range: number) => (range >= 360 ? '360°' : `±${range}°`)
const rangeName = (range: number) => (range >= 360 ? 'any hue, 360 degrees' : `plus or minus ${range} degrees`)

// The range button: the chosen range as text; on hover, focus or press it opens inline into every range on offer (none wider than the parent's), the
// slider beside it giving up the room, and closes again when another is picked, the pointer or the focus leaves, or Escape is pressed. (The chosen range
// is the same element open or shut, so the focus stays on it; pressing it while open does nothing, so a tap that opens it is not read as a pick.)
function RangeButton({ label, range, maxRange, onRange }: { label: string; range: number; maxRange: number; onRange: (range: number) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const shown = open ? rangeOptions(maxRange) : [range]
  const pick = (value: number) => { setOpen(false); onRange(value) }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }
  return (
    <div
      ref={box} role="radiogroup" aria-label={`${label} range`} className={`hueRange${open ? ' hueRange--open' : ''}`} onKeyDown={onKeyDown}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)}
      onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false) }}
    >
      {shown.map(o => (
        <button
          key={o} type="button" role="radio" aria-checked={o === range} className={`hueRangeBtn${o === range ? ' hueRangeBtn--on' : ''}`}
          aria-label={`Range ${rangeName(o)}`} title={open ? rangeName(o) : `Range: ${rangeName(o)}`} onClick={() => { if (!open) setOpen(true); else if (o !== range) pick(o) }}
        >
          {rangeText(o)}
        </button>
      ))}
    </div>
  )
}

// A level's colour selector (project, book, arc, chapter, plot category, subcategory, cluster): one row of
//   an Inherit toggle (a square in the parent's hue, outlined in white only while it is on),
//   a read-only chip with the hue's degrees (in the colour itself, deepened only as far as its white text needs, with a white outline),
//   the slider, and
//   the range button (how far from the parent's hue the colour may go).
// Both the track and the chip draw the colours at the active zone's saturation and lightness (a little darker by day and at dawn: sliderLight), so what
// the thumb shows is close to what the app draws. With a `range` of 360 the track is the whole hue wheel from 0 degrees and there is no parent to follow
// (Inherit is off and cannot be turned on); with less it is the `range` degrees either side of the parent's hue, the parent's hue in the middle (even at 180).
// While inheriting there is no thumb: the colour is the parent's. `hue` and `onChange` carry the stored colour, a hue in degrees (see theme/bookColors.ts).
function HueSlider({ label, hue, centre, range, maxRange = 360, inherit = false, onChange, onRange, onInherit, className }: HueSliderValue & { label: string; className?: string }) {
  const { settings, activeZone } = useThemeState()
  const basis = zoneBasis(settings.zones[activeZone].palette, activeZone)
  const light = sliderLight(activeZone, basis.l)
  const at = hueOfCode(hue)
  const whole = centre === null || range >= 360
  // A window may run past 0 or 360, so the value is the hue's place in it (the shortest way round from the centre).
  const within = whole || centre === null ? at : centre + Math.max(-range, Math.min(range, hueDelta(centre, at)))
  const parent = centre === null ? null : wrapHue(centre)
  const track = (
    <ColorRange
      label={label} value={within} min={whole ? 0 : (centre as number) - range} max={whole ? 360 : (centre as number) + range} sat={basis.s} light={light}
      hideThumb={inherit} disabled={inherit} onChange={h => onChange(wrapHue(h))}
    />
  )
  if (centre === null && !onRange && !onInherit) return <div className={`hueSliderRow${className ? ` ${className}` : ''}`}>{track}</div>
  const cannotInherit = range >= 360 && !inherit
  return (
    <div className={`hueSliderRow${className ? ` ${className}` : ''}`}>
      {onInherit && parent !== null && (
        <button
          type="button" className={`hueInherit${inherit ? ' hueInherit--on' : ''}`} aria-pressed={inherit} disabled={cannotInherit}
          aria-label="Inherit parent colour" title={cannotInherit ? 'A range of 360 has no parent colour to follow' : `Inherit parent colour (${parent}°)`}
          style={{ '--cr-reset': resultColor(parent, { sat: basis.s, light }) } as CSSProperties} onClick={() => onInherit(!inherit)}
        />
      )}
      <span className="hueChip" role="img" aria-label={`${label}: ${at} degrees`} style={{ '--cr-chip': resultColor(at, { sat: basis.s, light: chipLight(at, basis.s, light) }) } as CSSProperties}>{at}°</span>
      {track}
      {onRange && <RangeButton label={label} range={range} maxRange={maxRange} onRange={onRange} />}
    </div>
  )
}

export default HueSlider
