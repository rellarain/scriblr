import { useSideAvailable, useSidebar } from './sidebarState'

// The header's button for the Writer's side column, left of the user card: a plain vertical bar, no icon (lit = the column is shown).
// It has nothing to do at the Dash, which has no side column.
export default function SidebarToggle() {
  const side = useSidebar()
  const available = useSideAvailable()
  return (
    <button
      type="button" className={available && !side.hidden ? 'headerSideBar headerSideBar--active' : 'headerSideBar'}
      aria-pressed={!side.hidden} aria-label="Sidebar" disabled={!available}
      title={!available ? 'The sidebar shows beside a project, book or chapter' : side.hidden ? 'Show the sidebar' : 'Hide the sidebar'}
      onClick={side.toggle}
    />
  )
}
