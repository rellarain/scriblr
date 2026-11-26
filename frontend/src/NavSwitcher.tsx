import type { ComponentType } from 'react'
import type { MainInterface } from './interfaceShellTypes'
import { BookFaceIcon, BriefcaseIcon, ChatBubblesIcon, GraduationCapIcon, PencilIcon, type IconProps } from './assets/icons'

interface NavSwitcherProps {
  active: MainInterface
  onSelect: (next: MainInterface) => void
  vuiOpen: boolean
  // The side interfaces: AUI (admins only) and HUI, each on or off on its own.
  isAdmin: boolean
  auiOn: boolean
  onToggleAui: () => void
  huiOn: boolean
  onToggleHui: () => void
  // Chats waiting in the queues that are on for the staff member: shown on HUI's toggle while HUI is off.
  waitingChats: number
}

const PAGES: Array<{ key: MainInterface; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'writer', label: 'Writer', Icon: PencilIcon },
  { key: 'reader', label: 'Reader', Icon: BookFaceIcon },
  { key: 'learning', label: 'Learning', Icon: GraduationCapIcon },
]

// The header's one container for every interface toggle, beside the sky toggle: the side interfaces (AUI, HUI), which open
// beside the page and the band under the header, then the pages (WUI, RUI, LUI), one of which is the page.
function NavSwitcher({ active, onSelect, vuiOpen, isAdmin, auiOn, onToggleAui, huiOn, onToggleHui, waitingChats }: NavSwitcherProps) {
  const waiting = !huiOn && waitingChats > 0 ? waitingChats : 0
  return (
    <nav className="navSwitcher" aria-label="Interfaces">
      <div className="navSwitcherGroup" role="group" aria-label="Side interfaces">
        {isAdmin && (
          <button
            type="button"
            className={auiOn ? 'navSwitcherBtn navSwitcherBtn--admin navSwitcherBtn--active' : 'navSwitcherBtn navSwitcherBtn--admin'}
            aria-pressed={auiOn} aria-label="Admin" title="Admin"
            onClick={onToggleAui}
          >
            <BriefcaseIcon size={21} />
          </button>
        )}
        <button
          type="button"
          className={huiOn ? 'navSwitcherBtn navSwitcherBtn--active' : 'navSwitcherBtn'}
          aria-pressed={huiOn}
          aria-label={waiting ? `Helper, ${waiting} waiting` : 'Helper'}
          title={waiting ? `Helper: ${waiting} waiting` : 'Helper'}
          onClick={onToggleHui}
        >
          <ChatBubblesIcon size={21} />
          {waiting > 0 && <span className="navSwitcherBadge" aria-hidden="true">{waiting > 99 ? '99+' : waiting}</span>}
        </button>
      </div>
      <span className="navSwitcherRule" aria-hidden="true" />
      <div className="navSwitcherGroup" role="group" aria-label="Pages">
        {PAGES.map(({ key, label, Icon }) => {
          // VUI is showing in place of whichever page is "active" -- drop the accent highlight in that state, since no page is
          // actually on screen right now.
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
      </div>
    </nav>
  )
}

export default NavSwitcher
