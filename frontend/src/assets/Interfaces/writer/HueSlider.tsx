import ColorRange from '../../../components/ColorRange'
import { coverColor, hueDelta, hueWindow, wrapHue } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'
import { LEVEL_HUE_WINDOW } from './levelHues'

// A level's hue selector (project, series, book, arc, chapter). With a `centre` the
// slider runs only +-60 degrees round it (the parent level's hue); with none it runs the
// whole wheel. Saturation and lightness are the active zone's, so what the thumb shows
// is what the app draws.
function HueSlider({ label, hue, centre, onChange, className }: {
  label: string
  hue: number
  centre: number | null
  onChange: (hue: number) => void
  className?: string
}) {
  const { settings, activeZone } = useThemeState()
  const fill = coverColor(settings.zones[activeZone].palette, activeZone, hue)
  const window = centre != null ? hueWindow(centre, LEVEL_HUE_WINDOW) : { min: 0, max: 360 }
  // The same hue, expressed inside the window (a slider over it runs through the wrap-around).
  const shown = centre != null ? centre + hueDelta(centre, hue) : hue
  return (
    <ColorRange
      label={label} value={shown} min={window.min} max={window.max} sat={fill.s} light={fill.l}
      className={className} onChange={v => onChange(wrapHue(v))}
    />
  )
}

export default HueSlider
