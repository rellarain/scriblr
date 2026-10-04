import ColorRange from '../../../components/ColorRange'
import { zoneBasis } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// A level's colour selector (project, series, book, arc, chapter), in two forms; each runs three
// bands of brightness, darker, base, lighter, at the one saturation. With no `centre` each band is
// the whole hue wheel (unlimited). With a `centre` (the parent level's hue) each band is the +-60
// degree window round that hue (limited). The colours are drawn from the active zone's saturation
// and lightness, so what the thumb shows is what the app draws. `hue` and `onChange` carry the
// colour code (see theme/bookColors.ts).
function HueSlider({ label, hue, centre, onChange, className }: {
  label: string
  hue: number
  centre: number | null
  onChange: (code: number) => void
  className?: string
}) {
  const { settings, activeZone } = useThemeState()
  const basis = zoneBasis(settings.zones[activeZone].palette, activeZone)
  return <ColorRange label={label} value={hue} sat={basis.s} light={basis.l} tones centre={centre} className={className} onChange={onChange} />
}

export default HueSlider
