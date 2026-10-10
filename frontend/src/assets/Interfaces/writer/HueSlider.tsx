import ColorRange from '../../../components/ColorRange'
import { SUBCATEGORY_HUE_WINDOW, hueDelta, hueOfCode, wrapHue, zoneBasis } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// A level's colour selector (project, series, book, arc, chapter), in two forms; both draw the colours at the active zone's
// saturation and lightness, so what the thumb shows is what the app draws. With no `centre` the track is the whole hue
// wheel (unlimited). With a `centre` (the parent level's hue) it is the +-60 degree window round that hue (limited).
// `hue` and `onChange` carry the stored colour, a hue in degrees (see theme/bookColors.ts).
function HueSlider({ label, hue, centre, onChange, className }: {
  label: string
  hue: number
  centre: number | null
  onChange: (hue: number) => void
  className?: string
}) {
  const { settings, activeZone } = useThemeState()
  const basis = zoneBasis(settings.zones[activeZone].palette, activeZone)
  const at = hueOfCode(hue)
  if (centre === null) {
    return <ColorRange label={label} value={at} min={0} max={360} sat={basis.s} light={basis.l} className={className} onChange={h => onChange(wrapHue(h))} />
  }
  // A window may run past 0 or 360, so the value is the hue's place in it (the shortest way round from the centre).
  const within = centre + Math.max(-SUBCATEGORY_HUE_WINDOW, Math.min(SUBCATEGORY_HUE_WINDOW, hueDelta(centre, at)))
  return (
    <ColorRange
      label={label} value={within} min={centre - SUBCATEGORY_HUE_WINDOW} max={centre + SUBCATEGORY_HUE_WINDOW} sat={basis.s} light={basis.l}
      className={className} onChange={h => onChange(wrapHue(h))}
    />
  )
}

export default HueSlider
