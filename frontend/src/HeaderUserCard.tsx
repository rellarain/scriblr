import type { CurrentUser } from './userTypes'
import { UserIcon, BuildingIcon } from './assets/icons'

interface HeaderUserCardProps {
  user: CurrentUser
  open: boolean
  onToggle: () => void
}

// Row 1's left-side element -- isolated from the other nav buttons per the
// redesign. Its own click toggles the header drawer (replacing the old
// lone Customize-toggle button that used to live inside NavSwitcher).
function HeaderUserCard({ user, open, onToggle }: HeaderUserCardProps) {
  return (
    <button
      type="button"
      className={open ? 'headerUserCard headerUserCard--active' : 'headerUserCard'}
      aria-pressed={open}
      aria-label="Open user panel"
      title={user.displayName}
      onClick={onToggle}
    >
      <span className="headerUserCardPhoto">
        {user.photoUrl ? <img src={user.photoUrl} alt="" /> : <UserIcon size={20} />}
      </span>
      <span className="headerUserCardText">
        <span className="headerUserCardName">{user.displayName}</span>
        <span className="headerUserCardOrg"><BuildingIcon size={12} /> {user.orgId}</span>
      </span>
    </button>
  )
}

export default HeaderUserCard
