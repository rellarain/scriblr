import type { CSSProperties } from 'react'
import ColorRange, { resultColor } from '../../../components/ColorRange'
import { hueDelta, hueOfCode, sliderLight, wrapHue, zoneBasis } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// A level's colour selector (project, book, arc, chapter, plot category, subcategory, cluster), in two forms; both draw the colours at the
// active zone's saturation and lightness (a little darker by day and at dawn: sliderLight), so what the thumb shows is close to what the app
// draws. With no `centre` (the project) the track is the whole hue wheel, from 0 degrees. With a `centre` (the parent's hue) it is the
// `range` degrees either side of it (hue-ranges are in theme/bookColors.ts: HUE_RANGES), and a square button to its left, filled with the
// parent's hue, sets the colour to exactly that hue.
// `hue` and `onChange` carry the stored colour, a hue in degrees (see theme/bookColors.ts).
function HueSlider({ label, hue, centre, range, onChange, className }: {
  label: string
  hue: number
  centre: number | null
  // Degrees either side of the centre the colour may take (360 = any hue).
  range: number
  onChange: (hue: number) => void
  className?: string
}) {
  const { settings, activeZone } = useThemeState()
  const basis = zoneBasis(settings.zones[activeZone].palette, activeZone)
  const light = sliderLight(activeZone, basis.l)
  const at = hueOfCode(hue)
  if (centre === null) {
    return <ColorRange label={label} value={at} min={0} max={360} sat={basis.s} light={light} className={className} onChange={h => onChange(wrapHue(h))} />
  }
  const whole = range >= 360
  // A window may run past 0 or 360, so the value is the hue's place in it (the shortest way round from the centre).
  const within = whole ? at : centre + Math.max(-range, Math.min(range, hueDelta(centre, at)))
  const parent = wrapHue(centre)
  return (
    <div className={`hueSliderRow${className ? ` ${className}` : ''}`}>
      <button
        type="button" className="hueReset" aria-label="Reset to parent colour" title={`Reset to parent colour (${parent}°)`}
        style={{ '--cr-reset': resultColor(parent, { sat: basis.s, light }) } as CSSProperties} onClick={() => onChange(parent)}
      />
      <ColorRange
        label={label} value={within} min={whole ? 0 : centre - range} max={whole ? 360 : centre + range} sat={basis.s} light={light}
        onChange={h => onChange(wrapHue(h))}
      />
    </div>
  )
}

export default HueSlider
