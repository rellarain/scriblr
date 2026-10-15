import { SidebarIcon } from '../../icons'
import { useSideAvailable, useSidebar } from './sidebarState'

// The header's button for the Writer's side column (pressed = shown). It has nothing to do at the Dash, which has no side column.
export default function SidebarToggle() {
  const side = useSidebar()
  const available = useSideAvailable()
  return (
    <div className="navSwitcher">
      <button
        type="button" className={available && !side.hidden ? 'navSwitcherBtn navSwitcherBtn--active' : 'navSwitcherBtn'}
        aria-pressed={!side.hidden} aria-label="Sidebar" disabled={!available}
        title={!available ? 'The sidebar shows beside a project, book or chapter' : side.hidden ? 'Show the sidebar' : 'Hide the sidebar'}
        onClick={side.toggle}
      >
        <SidebarIcon size={21} />
      </button>
    </div>
  )
}
