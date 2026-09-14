import type { ComponentType } from 'react'
import type { MainInterface } from './interfaceShellTypes'
import { BookFaceIcon, GlobeIcon, PencilIcon, type IconProps } from './assets/icons'

interface NavSwitcherProps {
  active: MainInterface
  onSelect: (next: MainInterface) => void
  vuiOpen: boolean
}

const OPTIONS: Array<{ key: MainInterface; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'reader', label: 'Reader', Icon: BookFaceIcon },
  { key: 'translator', label: 'Translator', Icon: GlobeIcon },
  { key: 'writer', label: 'Writer', Icon: PencilIcon },
]

// The Customize/user toggle button that used to lead this row now lives in
// HeaderUserCard instead -- this is just the 4 page-switch buttons.
function NavSwitcher({ active, onSelect, vuiOpen }: NavSwitcherProps) {
  return (
    <nav className="navSwitcher">
      {OPTIONS.map(({ key, label, Icon }) => {
        // VUI is showing in place of whichever page is "active" -- drop
        // the accent highlight in that state, since no page is actually
        // on screen right now.
        const isActive = key === active && !vuiOpen
        return (
          <button
            key={key}
            type="button"
            className={isActive ? 'navSwitcherBtn navSwitcherBtn--active' : 'navSwitcherBtn'}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            onClick={() => onSelect(key)}
          >
            <Icon size={21} />
          </button>
        )
      })}
    </nav>
  )
}

export default NavSwitcher
