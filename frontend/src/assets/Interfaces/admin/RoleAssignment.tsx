import { useState } from 'react'
import { feedbackApi } from '../helper/inbox/feedbackApi'
import { changeFeedback, clearFeedbackError, useFeedback } from '../helper/inbox/feedbackStore'
import type { Role } from '../helper/inbox/feedbackTypes'

// Admin > Manager > Assignment: which roles each admin holds on each console. Processor validates feedback and
// votes, Configurer proposes solutions, reopens cases and manages verb categories, Planner closes cases. The
// changes are made as the admin signed in to the Inbox (there is no login yet) and are kept in a role history;
// nobody can remove their own Configurer role on Helper > Inbox.

const ROLES: Array<{ key: Role; label: string; hint: string }> = [
  { key: 'processor', label: 'Processor', hint: 'Validates feedback and votes' },
  { key: 'configurer', label: 'Configurer', hint: 'Proposes solutions, reopens cases, manages verb categories' },
  { key: 'planner', label: 'Planner', hint: 'Closes cases' },
]

const pretty = (console: string) => console.replace('/', ' > ')

export default function RoleAssignment() {
  const { bundle, adminId, status, error } = useFeedback()
  const [console, setConsole] = useState('Helper/Inbox')

  if (!bundle) return <p className="feedbackCardMeta">{status === 'error' ? error : 'Loading…'}</p>

  const acting = bundle.admins.find(a => a.id === adminId)
  const toggle = (targetId: string, role: Role, held: Role[]) => {
    const next = held.includes(role) ? held.filter(r => r !== role) : [...held, role]
    void changeFeedback(a => feedbackApi.setRoles(a, targetId, console, next))
  }

  return (
    <div className="roleAssignment">
      <div className="roleBar">
        <select aria-label="Console" value={console} onChange={e => setConsole(e.target.value)}>
          {bundle.consoles.map(c => <option key={c} value={c}>{pretty(c)}</option>)}
        </select>
        {acting && <span className="feedbackCardMeta">Changing roles as {acting.name}</span>}
      </div>
      {error && (
        <p className="inboxError" role="alert">
          {error} <button type="button" className="inboxErrorClose" aria-label="Dismiss" onClick={clearFeedbackError}>×</button>
        </p>
      )}
      <table className="roleTable">
        <thead>
          <tr>
            <th scope="col">Admin</th>
            {ROLES.map(r => <th key={r.key} scope="col" title={r.hint}>{r.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {bundle.admins.map(admin => {
            const held = admin.roles[console] ?? []
            return (
              <tr key={admin.id}>
                <th scope="row">{admin.name}</th>
                {ROLES.map(r => (
                  <td key={r.key}>
                    <input
                      type="checkbox" checked={held.includes(r.key)} aria-label={`${admin.name}: ${r.label} on ${pretty(console)}`}
                      onChange={() => toggle(admin.id, r.key, held)}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <details className="caseHistory">
        <summary>Role history ({bundle.roleHistory.length})</summary>
        <ul>
          {bundle.roleHistory.length === 0 && <li>No changes yet.</li>}
          {[...bundle.roleHistory].reverse().map((h, i) => (
            <li key={i}><span className="feedbackCardMeta">{new Date(h.at).toLocaleString()}</span> {h.detail}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}
