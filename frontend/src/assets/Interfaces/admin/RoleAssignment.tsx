import { useState } from 'react'
import { useChannels } from '../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../channels/channelTree'
import { staffFeedbackApi } from '../../../feedback/feedbackApi'
import { changeStaff, clearStaffError, useStaff } from '../../../feedback/staffStore'
import type { Role } from '../../../feedback/feedbackTypes'
import { staffApi } from '../../../staff/staffApi'
import { changeRoster, useRoster } from '../../../staff/rosterStore'

// Admin > Office > Assignment: which roles each admin holds on each console of the channel list (or on an interface, for
// statements about the interface itself). A Checker checks feedback in the Inbox (on Helper > Inbox), a Voter votes on the
// console's statements, a Channel manager corrects them (and, on Helper > Inbox, keeps the verbs), a Planner accepts or vetoes
// them. The changes are made as the staff member acting (there is no login yet) and kept in a role history; nobody can remove
// their own Channel manager role on Helper > Inbox. On a console, Supports puts the person on its support queue (channel support: tier 2 for
// an admin).

const ROLES: Array<{ key: Role; label: string; hint: string }> = [
  { key: 'checker', label: 'Checker', hint: 'Checks feedback in the Inbox (on Helper > Inbox)' },
  { key: 'voter', label: 'Voter', hint: "Votes on the console's statements" },
  { key: 'channelManager', label: 'Channel manager', hint: "Corrects the console's statements; on Helper > Inbox, keeps the verbs" },
  { key: 'planner', label: 'Planner', hint: "Accepts or vetoes the console's statements" },
]

export default function RoleAssignment() {
  const { bundle, adminId, status, error } = useStaff()
  const { index } = useChannels()
  const [console, setConsole] = useState('helper/inbox')
  const pretty = (scope: string) => labelOf(index, scope)
  const scopes = childrenOf(index, null).flatMap(i => [i, ...childrenOf(index, i.id)])
  const roster = useRoster().view
  const isConsole = index.byId.get(console)?.kind === 'console'

  if (!bundle) return <p className="feedbackCardMeta">{status === 'error' ? error : 'Loading…'}</p>

  const acting = bundle.admins.find(a => a.id === adminId)
  const toggle = (targetId: string, role: Role, held: Role[]) => {
    const next = held.includes(role) ? held.filter(r => r !== role) : [...held, role]
    void changeStaff(a => staffFeedbackApi.setRoles(a, targetId, console, next))
  }

  return (
    <div className="roleAssignment">
      <div className="roleBar">
        <select aria-label="Console" value={console} onChange={e => setConsole(e.target.value)}>
          {scopes.map(n => <option key={n.id} value={n.id}>{n.kind === 'interface' ? `${n.name} (the interface)` : pretty(n.id)}</option>)}
        </select>
        {acting && <span className="feedbackCardMeta">Changing roles as {acting.name}</span>}
      </div>
      {error && (
        <p className="inboxError" role="alert">
          {error} <button type="button" className="inboxErrorClose" aria-label="Dismiss" onClick={clearStaffError}>×</button>
        </p>
      )}
      <table className="roleTable">
        <thead>
          <tr>
            <th scope="col">Admin</th>
            {ROLES.map(r => <th key={r.key} scope="col" title={r.hint}>{r.label}</th>)}
            {isConsole && roster && <th scope="col" title="On this console's support queue">Supports</th>}
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
                {isConsole && roster && (() => {
                  const person = roster.people.find(p => p.id === admin.id)
                  if (!person) return <td />
                  const on = person.supports.includes(console)
                  return (
                    <td>
                      <input
                        type="checkbox" checked={on} disabled={!person.active} aria-label={`${admin.name}: supports ${pretty(console)}`}
                        onChange={() => void changeRoster(a => staffApi.editPerson(a, person.id, { supports: on ? person.supports.filter(x => x !== console) : [...person.supports, console] }))}
                      />
                    </td>
                  )
                })()}
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
