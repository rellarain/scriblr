import { useEffect, useRef, useState } from 'react'
import { initials } from './feedbackLogic'
import { setActingAdmin, useStaff } from './staffStore'

// The "Acting as" chip: there is no login yet, so this initials chip opens a menu that picks the staff member whose roles the
// feedback screens act with (shared by the Helper and Admin panels; remembered in this browser).
export function ActingAs() {
  const { bundle, adminId } = useStaff()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const admins = bundle?.admins ?? []
  const me = admins.find(a => a.id === adminId)
  return (
    <div className="signIn" ref={box}>
      <button
        type="button" className="signInChip" aria-haspopup="menu" aria-expanded={open}
        aria-label={me ? `Acting as ${me.name}` : 'Acting as'} title="Acting as (testing)" onClick={() => setOpen(o => !o)}
      >
        {me ? initials(me.name) : '?'}
      </button>
      {open && (
        <ul className="signInMenu" role="menu">
          {admins.map(a => (
            <li key={a.id} role="none">
              <button
                type="button" role="menuitemradio" aria-checked={a.id === adminId} className={a.id === adminId ? 'signInItem signInItem--on' : 'signInItem'}
                onClick={() => { setOpen(false); setActingAdmin(a.id) }}
              >
                <span className="signInChip signInChip--small">{initials(a.name)}</span>{a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ActingAs
