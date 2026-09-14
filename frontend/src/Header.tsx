import NavSwitcher from './NavSwitcher'
import HeaderUserCard from './HeaderUserCard'
import HeaderActivityRibbon from './HeaderActivityRibbon'
import UUI from './assets/Interfaces/UUI'
import type { MainInterface, ColorKey, Handedness, HSLColor } from './interfaceShellTypes'
import type { CurrentUser } from './userTypes'
import type { ActivityInterval } from './activityTypes'

interface HeaderProps {
  active: MainInterface
  onSelect: (next: MainInterface) => void
  vuiOpen: boolean
  colors: Record<ColorKey, HSLColor>
  baseLightness: number
  onChangeLightness: (value: number) => void
  onChangeColor: (key: ColorKey, channel: 'h' | 's', value: number) => void
  drawerOpen: boolean
  onToggleDrawer: () => void
  handedness: Handedness
  onToggleHandedness: () => void
  currentUser: CurrentUser
  activity: ActivityInterval[]
}

// Two independent layers (see App.scss), not one growing box:
// - .header (always a fixed 40+10=50px, z-index above the Sidebar) -- the
//   nav row (user card isolated left, page-switch buttons right -- literal
//   left/right, independent of handedness, by design) and the activity
//   ribbon.
// - .headerDrawerClip, sitting right under row 1 (top: 40px) -- an always
//   fixed-size clipping window (z-index BELOW the Sidebar, so an expanded
//   Sidebar overlaps it, the same way it overlaps Mainscreen/VUI). Inside
//   it, .headerDrawerSlide (UUI + the footer strip, always laid out at
//   their full natural height) slides via transform: minimized, only the
//   footer peeks out right under the activity ribbon; open, it's slid
//   down so UUI itself sits at the top (under row 1) and the footer rests
//   at the very bottom of the screen. Collapsing never resizes or
//   unmounts UUI, just slides it out of the visible window.
function Header({
  active, onSelect, vuiOpen, colors, baseLightness, onChangeLightness, onChangeColor,
  drawerOpen, onToggleDrawer, handedness, onToggleHandedness, currentUser, activity,
}: HeaderProps) {
  return (
    <>
      <header className="header">
        <div className="headerNavRow">
          <HeaderUserCard user={currentUser} open={drawerOpen} onToggle={onToggleDrawer} />
          <NavSwitcher active={active} onSelect={onSelect} vuiOpen={vuiOpen} />
        </div>

        <HeaderActivityRibbon intervals={activity} />
      </header>

      <div className="headerDrawerClip">
        <div className={drawerOpen ? 'headerDrawerSlide headerDrawerSlide--open' : 'headerDrawerSlide'}>
          <div className="headerDrawerRow">
            <UUI
              colors={colors}
              baseLightness={baseLightness}
              onChangeLightness={onChangeLightness}
              onChangeColor={onChangeColor}
              handedness={handedness}
              onToggleHandedness={onToggleHandedness}
            />
          </div>
          <div className="headerDrawerFooterRow" aria-hidden="true" />
        </div>
      </div>
    </>
  )
}

export default Header
