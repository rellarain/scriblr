import type { ColorKey, Handedness, HSLColor } from './interfaceShellTypes'
import { SAT_STEP } from './colorRules'
import { SwapIcon } from './assets/icons'

interface CustomizeControlsProps {
  colors: Record<ColorKey, HSLColor>
  baseLightness: number
  onChangeLightness: (value: number) => void
  onChangeColor: (key: ColorKey, channel: 'h' | 's', value: number) => void
  handedness: Handedness
  onToggleHandedness: () => void
}

const GROUPS: Array<{ key: ColorKey; label: string; saturationMin: (colors: Record<ColorKey, HSLColor>) => number }> = [
  { key: 'theme', label: 'Theme color', saturationMin: () => 0 },
  { key: 'accent', label: 'Accent color', saturationMin: colors => Math.min(100, colors.theme.s + SAT_STEP) },
  { key: 'alert', label: 'Alert color', saturationMin: colors => Math.min(100, colors.accent.s + SAT_STEP) },
]

// Shared by UUI (Mainscreen's Home mode, full-size) and Header (an
// expandable quick-access panel) -- same controls, same App-level state,
// mounted from two call sites so neither duplicates this logic.
function CustomizeControls({
  colors, baseLightness, onChangeLightness, onChangeColor, handedness, onToggleHandedness,
}: CustomizeControlsProps) {
  return (
    <div className="customize">
      <h2>Customize</h2>

      <div className="customizeGroup">
        <div className="customizeGroupHeader">
          <span>Handedness</span>
        </div>
        <button
          type="button" className="toneBtn"
          aria-label={`Handedness: ${handedness} (click to switch)`}
          onClick={onToggleHandedness}
        >
          <SwapIcon size={16} /> {handedness === 'right' ? 'Right' : 'Left'}
        </button>
      </div>

      <div className="customizeGroup">
        <div className="customizeGroupHeader">
          <span
            className="customizeSwatch"
            style={{ backgroundColor: `hsl(0, 0%, ${baseLightness}%)` }}
          />
          <span>Lightness</span>
        </div>
        <label>
          Lightness
          <input
            type="range" min={0} max={100} value={baseLightness}
            onChange={e => onChangeLightness(Number(e.target.value))}
          />
          <span>{baseLightness}%</span>
        </label>
      </div>

      {GROUPS.map(({ key, label, saturationMin }) => {
        const value = colors[key]
        const minSaturation = saturationMin(colors)
        return (
          <div className="customizeGroup" key={key}>
            <div className="customizeGroupHeader">
              <span
                className="customizeSwatch"
                style={{ backgroundColor: `hsl(${value.h}, ${value.s}%, ${value.l}%)` }}
              />
              <span>{label}</span>
            </div>
            <label>
              Hue
              <input
                type="range" min={0} max={360} value={value.h}
                onChange={e => onChangeColor(key, 'h', Number(e.target.value))}
              />
              <span>{value.h}°</span>
            </label>
            <label>
              Saturation
              <input
                type="range" min={minSaturation} max={100} value={value.s}
                onChange={e => onChangeColor(key, 's', Number(e.target.value))}
              />
              <span>{value.s}%</span>
            </label>
          </div>
        )
      })}
    </div>
  )
}

export default CustomizeControls
