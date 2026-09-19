import { SwapIcon } from './assets/icons'
import { setUi, useSettings } from './settings/settingsStore'
import './theme/themeSettings.scss'

interface CustomizeControlsProps {
  // Jump to the theme customization tool (UUI Dashboard > Settings).
  onOpenThemeSettings: () => void
}

// UUI Account > Settings: handedness, plus a pointer to the theme tool (the
// color, brightness and time-of-day controls live in Dashboard > Settings).
function CustomizeControls({ onOpenThemeSettings }: CustomizeControlsProps) {
  const { ui } = useSettings()
  const handedness = ui.handedness
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
          onClick={() => setUi(prev => ({ ...prev, handedness: prev.handedness === 'right' ? 'left' : 'right' }))}
        >
          <SwapIcon size={16} /> {handedness === 'right' ? 'Right' : 'Left'}
        </button>
      </div>

      <div className="customizeGroup themeLinkRow">
        <span>Colors, brightness and time-of-day themes</span>
        <button type="button" className="themeBtn" onClick={onOpenThemeSettings}>Open theme settings</button>
      </div>
    </div>
  )
}

export default CustomizeControls
