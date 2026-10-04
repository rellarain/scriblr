import ColorRange from '../../../components/ColorRange'
import { zoneBasis } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// A level's colour selector (project, series, book, arc, chapter), in two forms. With no `centre` it is
// unlimited: dark gray, then the whole hue wheel in four tones (dark, saturated, desaturated, light),
// then white. With a `centre` (the parent level's hue) it is limited: the stops of the parent, and
// the +-60 degree window round that hue in the same four tones. The colours are drawn from the active
// zone's saturation and lightness, so what the thumb shows is what the app draws. `hue` and
// `onChange` carry the colour code (see theme/bookColors.ts).
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
