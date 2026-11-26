import { useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon, RestoreIcon, TrashIcon, CloseIcon } from '../../../icons'
import { useChannels } from '../../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../../channels/channelTree'
import { OWNER_ID, useStaff } from '../../../../feedback/staffStore'
import '../../../../feedback/feedback.scss'
import { staffApi } from '../../../../staff/staffApi'
import type { Person, PersonKind, Priority, StaffView } from '../../../../staff/staffTypes'
import { changeRoster, clearRosterError, loadRoster, useRoster } from '../../../../staff/rosterStore'
import { setBreakRate, useQueues } from '../../../../support/supportStores'
import './staff.scss'

// Admin > Office's staff pages (Department Roster, Department Details, Allotment, Hire/Term Admin, Monitor Training) and
// Configuration > SLA, over one staff view (staff/rosterStore.ts). Support tiers are worked out per console: 1 a helper promoted on
// it, 2 a helper promoted on its interface, 3 its channel support, 4 an admin with helper hours promoted on it (the roster shows the
// highest anywhere). Changes act as the owner, who holds every role (universal access).

export const TIER_LABEL: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4' }
export const KIND_LABEL: Record<PersonKind, string> = { helper: 'Helper', admin: 'Admin' }
const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }

export function Frame({ label, children }: { label: string; children: (view: StaffView) => ReactNode }) {
  const { view, status, error } = useRoster()
  if (!view) {
    return (
      <div className="stPage fbScope" aria-label={label}>
        {status === 'error'
          ? <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadRoster()}>Retry</button></p>
          : <p className="fbMuted">Loading…</p>}
      </div>
    )
  }
  return (
    <div className="stPage fbScope" aria-label={label}>
      {error && <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" aria-label="Dismiss" title="Dismiss" onClick={clearRosterError}>×</button></p>}
      {children(view)}
    </div>
  )
}

export const nameOf = (view: StaffView, id: string | null) => (id ? view.people.find(p => p.id === id)?.name ?? id : '')
export const placeOf = (view: StaffView, p: Person) => {
  const team = view.teams.find(t => t.id === p.teamId)
  const dep = view.departments.find(d => d.id === (team?.departmentId ?? p.departmentId))
  return [dep?.name, team?.name].filter(Boolean).join(' · ')
}

// A text field saved when left (or on Enter); Escape puts it back.
export function NameField({ value, label, onSave }: { value: string; label: string; onSave: (name: string) => void }) {
  const [text, setText] = useState(value)
  const save = () => { if (text.trim() && text !== value) onSave(text); else setText(value) }
  return (
    <input
      className="fbField" value={text} maxLength={80} aria-label={label}
      onChange={e => setText(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(value) }}
    />
  )
}

// --- Department Roster -----------------------------------------------------------------------------------------------------

export function RosterPage() {
  return <Frame label="Department Roster">{view => <RosterTables view={view} />}</Frame>
}

// The roster as tables, one per department (with `departmentId`, that department's only; '' for the people in none).
export function RosterTables({ view, departmentId }: { view: StaffView; departmentId?: string }) {
  const all = [...view.departments.map(d => ({ id: d.id, name: d.name })), { id: '', name: 'No department' }]
  const groups = departmentId === undefined ? all : all.filter(g => g.id === departmentId)
  return (
    <div className="fbList">
      {groups.map(g => {
        const people = view.people.filter(p => (p.departmentId ?? '') === g.id)
        if (people.length === 0) return departmentId === undefined ? null : <p key="none" className="fbMuted">Nobody yet.</p>
        return (
          <section key={g.id || 'none'} className="stGroup" aria-label={g.name}>
            <h3 className="fbLabel">{g.name}</h3>
            <table className="stTable">
              <thead><tr><th scope="col">Name</th><th scope="col">Tier</th><th scope="col">Team</th><th scope="col">Helper hours</th><th scope="col">Supports</th></tr></thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.id} className={p.active ? undefined : 'stInactive'}>
                    <th scope="row">{p.name}{!p.active && <span className="fbMuted"> (left)</span>}</th>
                    <td>{p.tier ? TIER_LABEL[p.tier] : KIND_LABEL[p.kind]}</td>
                    <td>{view.teams.find(t => t.id === p.teamId)?.name ?? ''}</td>
                    <td>{p.allotment ? `${p.allotment} h` : ''}</td>
                    <td>{p.supports.length || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}

// --- Department Details ----------------------------------------------------------------------------------------------------

export function LeaderSelect({ view, value, label, onChange }: { view: StaffView; value: string | null; label: string; onChange: (id: string | null) => void }) {
  return (
    <select className="fbSelect" value={value ?? ''} aria-label={label} onChange={e => onChange(e.target.value || null)}>
      <option value="">Nobody</option>
      {view.people.filter(p => p.active && p.kind === 'admin').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

export function DepartmentsPage() {
  return (
    <Frame label="Department Details">
      {view => (
        <div className="fbList">
          {view.departments.map(d => (
            <section key={d.id} className="stGroup" aria-label={d.name}>
              <DepartmentRow view={view} departmentId={d.id} />
              <TeamList view={view} departmentId={d.id} />
            </section>
          ))}
          <AddDepartment />
        </div>
      )}
    </Frame>
  )
}

// One department: its name, director and delete (once it is empty).
export function DepartmentRow({ view, departmentId }: { view: StaffView; departmentId: string }) {
  const d = view.departments.find(x => x.id === departmentId)
  if (!d) return null
  return (
    <div className="fbRow">
      <NameField value={d.name} label={`Name of ${d.name}`} onSave={name => void changeRoster(a => staffApi.editDepartment(a, d.id, { name }))} />
      <span className="fbLabel">Director</span>
      <LeaderSelect view={view} value={d.directorId} label={`Director of ${d.name}`} onChange={id => void changeRoster(a => staffApi.editDepartment(a, d.id, { directorId: id }))} />
      <button type="button" className="fbIconBtn" aria-label={`Delete ${d.name}`} title="Delete the department (once it is empty)" onClick={() => void changeRoster(a => staffApi.removeDepartment(a, d.id))}><TrashIcon size={14} /></button>
    </div>
  )
}

// A department's teams: each with its name, manager, how many people and delete (once it is empty), then a new one.
export function TeamList({ view, departmentId }: { view: StaffView; departmentId: string }) {
  const [newTeam, setNewTeam] = useState('')
  const d = view.departments.find(x => x.id === departmentId)
  if (!d) return null
  return (
    <>
      <ul className="stTeams">
        {view.teams.filter(t => t.departmentId === d.id).map(t => (
          <li key={t.id} className="fbRow" aria-label={t.name}>
            <NameField value={t.name} label={`Name of ${t.name}`} onSave={name => void changeRoster(a => staffApi.editTeam(a, t.id, { name }))} />
            <span className="fbLabel">Manager</span>
            <LeaderSelect view={view} value={t.managerId} label={`Manager of ${t.name}`} onChange={id => void changeRoster(a => staffApi.editTeam(a, t.id, { managerId: id }))} />
            <span className="fbMuted">{view.people.filter(p => p.teamId === t.id && p.active).length} people</span>
            <button type="button" className="fbIconBtn" aria-label={`Delete ${t.name}`} title="Delete the team (once it is empty)" onClick={() => void changeRoster(a => staffApi.removeTeam(a, t.id))}><TrashIcon size={14} /></button>
          </li>
        ))}
      </ul>
      <form className="fbRow" onSubmit={e => { e.preventDefault(); const n = newTeam.trim(); if (n) void changeRoster(a => staffApi.addTeam(a, n, d.id)).then(ok => { if (ok) setNewTeam('') }) }}>
        <input className="fbField" value={newTeam} maxLength={80} aria-label={`New team in ${d.name}`} placeholder="New team…" onChange={e => setNewTeam(e.target.value)} />
        <button type="submit" className="fbIconBtn" aria-label={`Add a team to ${d.name}`} title="Add a team" disabled={!newTeam.trim()}><PlusIcon size={14} /></button>
      </form>
    </>
  )
}

export function AddDepartment() {
  const [newDep, setNewDep] = useState('')
  return (
    <form className="fbRow" onSubmit={e => { e.preventDefault(); if (newDep.trim()) void changeRoster(a => staffApi.addDepartment(a, newDep)).then(ok => { if (ok) setNewDep('') }) }}>
      <input className="fbField" value={newDep} maxLength={80} aria-label="New department" placeholder="New department…" onChange={e => setNewDep(e.target.value)} />
      <button type="submit" className="fbIconBtn" aria-label="Add a department" title="Add a department" disabled={!newDep.trim()}><PlusIcon size={14} /></button>
    </form>
  )
}

// --- Allotment -------------------------------------------------------------------------------------------------------------

export function AllotmentPage() {
  return <Frame label="Allotment">{view => <AllotmentTable view={view} people={view.people.filter(p => p.active)} />}</Frame>
}

// The helper hours of these people (5, 10, 20 or 30 a week, or none).
export function AllotmentTable({ view, people }: { view: StaffView; people: Person[] }) {
  if (people.length === 0) return <p className="fbMuted">Nobody yet.</p>
  return (
        <table className="stTable">
          <thead><tr><th scope="col">Name</th><th scope="col">Place</th><th scope="col">Helper hours a week</th></tr></thead>
          <tbody>
            {people.map(p => (
              <tr key={p.id}>
                <th scope="row">{p.name} <span className="fbMuted">{p.tier ? TIER_LABEL[p.tier] : KIND_LABEL[p.kind]}</span></th>
                <td>{placeOf(view, p)}</td>
                <td>
                  <div className="fbVerbs" role="group" aria-label={`Helper hours of ${p.name}`}>
                    {[null, ...view.allotments].map(h => (
                      <button key={h ?? 0} type="button" className="fbVerbChip" aria-pressed={p.allotment === h} onClick={() => void changeRoster(a => staffApi.editPerson(a, p.id, { allotment: h }))}>
                        {h ? `${h} h` : 'None'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
  )
}

// --- Hire/Term Admin -------------------------------------------------------------------------------------------------------

export function HirePage() {
  return (
    <Frame label="Hire/Term Admin">
      {view => (
        <div className="fbList">
          <HireForm view={view} />
          <table className="stTable">
            <tbody>
              {view.people.map(p => (
                <tr key={p.id} className={p.active ? undefined : 'stInactive'}>
                  <th scope="row">{p.name}{!p.active && <span className="fbMuted"> (left)</span>}</th>
                  <td>{KIND_LABEL[p.kind]}</td>
                  <td>{placeOf(view, p)}</td>
                  <td>
                    {p.active
                      ? <button type="button" className="fbIconBtn" aria-label={`Term ${p.name}`} title="Term: marked as left, never deleted" onClick={() => void changeRoster(a => staffApi.editPerson(a, p.id, { active: false }))}><CloseIcon size={14} /></button>
                      : <button type="button" className="fbIconBtn" aria-label={`Rehire ${p.name}`} title="Rehire" onClick={() => void changeRoster(a => staffApi.editPerson(a, p.id, { active: true }))}><RestoreIcon size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  )
}

// Hire someone: a name (given when hiring one of the app's users), helper or admin, and a team.
export function HireForm({ view, givenName }: { view: StaffView; givenName?: string }) {
  const [typed, setTyped] = useState('')
  const [kind, setKind] = useState<PersonKind>(givenName === undefined ? 'admin' : 'helper')
  const [team, setTeam] = useState('')
  const name = givenName ?? typed
  return (
    <form className="fbRow" aria-label="Hire" onSubmit={e => { e.preventDefault(); if (name.trim()) void changeRoster(a => staffApi.hire(a, { name, kind, teamId: team || null })).then(ok => { if (ok) setTyped('') }) }}>
      {givenName === undefined && <input className="fbField" value={typed} maxLength={80} aria-label="Name" placeholder="Name…" onChange={e => setTyped(e.target.value)} />}
      <select className="fbSelect" value={kind} aria-label="Helper or admin" onChange={e => setKind(e.target.value as PersonKind)}>
        <option value="helper">Helper</option>
        <option value="admin">Admin</option>
      </select>
      <select className="fbSelect" value={team} aria-label="Team" onChange={e => setTeam(e.target.value)}>
        <option value="">No team</option>
        {view.departments.map(d => (
          <optgroup key={d.id} label={d.name}>{view.teams.filter(t => t.departmentId === d.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
        ))}
      </select>
      <button type="submit" className="fbIconBtn fbIconBtn--primary" aria-label={givenName ? `Hire ${givenName}` : 'Hire'} title="Hire" disabled={!name.trim()}><PlusIcon size={14} /></button>
    </form>
  )
}

// --- Configuration > SLA ---------------------------------------------------------------------------------------------------

const hours = (h: number) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? 'day' : 'days'}` : `${h} h`)
// Steps: an hour at a time up to a day, then whole days.
const step = (h: number, dir: -1 | 1, big: boolean) => {
  const by = big ? 24 : h > 24 || (h === 24 && dir > 0) ? 24 : 1
  return Math.min(24 * 90, Math.max(1, h + dir * by))
}

// The break allowance: minutes of break a staff member earns for each hour of helper time worked (AUI's break meter; backend
// storage/queues.py). 0 to 30, a minute a click, 5 with Shift.
function BreakAllowance() {
  const { view, error } = useQueues()
  const rate = view?.me.work?.breakRate
  if (rate === undefined) return error ? <p className="fbError" role="alert">{error}</p> : null
  const to = (by: number) => Math.max(0, Math.min(30, rate + by))
  return (
    <div className="stBreaks">
      <h3 className="stSubhead">Breaks</h3>
      <div className="stStep" role="group" aria-label="Break earned for each hour worked">
        <button type="button" className="fbIconBtn" aria-label="Less break an hour" title="Less (Shift: by 5)" disabled={rate <= 0} onClick={e => void setBreakRate(to(e.shiftKey ? -5 : -1))}><ChevronLeftIcon size={12} /></button>
        <span className="stStepValue" aria-live="polite">{rate} min an hour worked</span>
        <button type="button" className="fbIconBtn" aria-label="More break an hour" title="More (Shift: by 5)" disabled={rate >= 30} onClick={e => void setBreakRate(to(e.shiftKey ? 5 : 1))}><ChevronRightIcon size={12} /></button>
      </div>
      {error && <p className="fbError" role="alert">{error}</p>}
    </div>
  )
}

export function SlaPage() {
  return (
    <Frame label="SLA">
      {view => (
        <>
        <table className="stTable">
          <thead><tr><th scope="col">Priority</th><th scope="col">Time to do it, from when it is assigned</th></tr></thead>
          <tbody>
            {(['urgent', 'high', 'normal', 'low'] as Priority[]).map(p => (
              <tr key={p}>
                <th scope="row">{PRIORITY_LABEL[p]}</th>
                <td>
                  <div className="stStep" role="group" aria-label={`SLA for ${PRIORITY_LABEL[p]}`}>
                    <button type="button" className="fbIconBtn" aria-label={`Shorten the ${PRIORITY_LABEL[p]} SLA`} title="Shorter (Shift: by a day)" disabled={view.sla[p] <= 1} onClick={e => void changeRoster(a => staffApi.setSla(a, { [p]: step(view.sla[p], -1, e.shiftKey) }))}><ChevronLeftIcon size={12} /></button>
                    <span className="stStepValue" aria-live="polite">{hours(view.sla[p])}</span>
                    <button type="button" className="fbIconBtn" aria-label={`Lengthen the ${PRIORITY_LABEL[p]} SLA`} title="Longer (Shift: by a day)" disabled={view.sla[p] >= 24 * 90} onClick={e => void changeRoster(a => staffApi.setSla(a, { [p]: step(view.sla[p], 1, e.shiftKey) }))}><ChevronRightIcon size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <BreakAllowance />
        </>
      )}
    </Frame>
  )
}

// --- Monitor Training ------------------------------------------------------------------------------------------------------

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

// Training finished on interfaces and consoles, recorded per person, and the director's promotion that gives the tier (until Training
// keeps records per staff member, finishing is recorded here by hand).
export function TrainingPage({ personId }: { personId?: string } = {}) {
  const { index } = useChannels()
  const { adminId } = useStaff()
  const [picks, setPicks] = useState<Record<string, string>>({})
  const places = childrenOf(index, null).flatMap(i => [i, ...childrenOf(index, i.id)])
  return (
    <Frame label="Monitor Training">
      {view => {
        const directors = new Set(view.departments.map(d => d.directorId).filter(Boolean))
        const mayPromote = (p: Person) => {
          // the owner (universal access) promotes anyone; anyone else only as their director
          if (adminId === OWNER_ID) return true
          const own = view.departments.find(d => d.id === p.departmentId)?.directorId ?? null
          return own ? adminId === own : directors.has(adminId)
        }
        return (
          <div className="fbList">
            {view.people.filter(p => (personId ? p.id === personId : p.active)).map(p => {
              const may = mayPromote(p)
              const pick = picks[p.id] ?? ''
              return (
                <section key={p.id} className="stGroup" aria-label={`Training of ${p.name}`}>
                  <h3 className="fbLabel">{p.name} <span className="fbMuted">{p.tier ? TIER_LABEL[p.tier] : KIND_LABEL[p.kind]}</span></h3>
                  {p.training.length > 0 && (
                    <table className="stTable">
                      <thead><tr><th scope="col">Part of the app</th><th scope="col">Finished</th><th scope="col">Promoted</th><th scope="col"><span className="stHidden">Changes</span></th></tr></thead>
                      <tbody>
                        {p.training.map(r => {
                          const label = labelOf(index, r.nodeId)
                          return (
                            <tr key={r.nodeId}>
                              <th scope="row">{label}</th>
                              <td>{day(r.finishedAt)}</td>
                              <td>{r.promotedBy ? `${nameOf(view, r.promotedBy)}, ${day(r.promotedAt)}` : <span className="fbMuted">Not yet</span>}</td>
                              <td className="stActions">
                                {r.promotedBy
                                  ? <button type="button" className="fbIconBtn" disabled={!may} aria-label={`Take back ${p.name}'s promotion on ${label}`} title={may ? 'Take back the promotion' : 'Only their director promotes'} onClick={() => void changeRoster(a => staffApi.promote(a, p.id, r.nodeId, false))}><ChevronDownIcon size={12} /></button>
                                  : <button type="button" className="fbIconBtn" disabled={!may} aria-label={`Promote ${p.name} on ${label}`} title={may ? 'Promote' : 'Only their director promotes'} onClick={() => void changeRoster(a => staffApi.promote(a, p.id, r.nodeId, true))}><ChevronUpIcon size={12} /></button>}
                                <button type="button" className="fbIconBtn" aria-label={`Remove ${p.name}'s training on ${label}`} title="Not finished after all (takes back the promotion)" onClick={() => void changeRoster(a => staffApi.setTraining(a, p.id, r.nodeId, false))}><TrashIcon size={12} /></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className="fbRow">
                    <select className="fbSelect" value={pick} aria-label={`Training ${p.name} finished`} onChange={e => setPicks(prev => ({ ...prev, [p.id]: e.target.value }))}>
                      <option value="">Training finished on…</option>
                      {places.filter(n => !p.training.some(r => r.nodeId === n.id)).map(n => <option key={n.id} value={n.id}>{labelOf(index, n.id)}</option>)}
                    </select>
                    <button type="button" className="fbIconBtn" disabled={!pick} aria-label={`Record ${p.name}'s finished training`} title="Record the finished training" onClick={() => { void changeRoster(a => staffApi.setTraining(a, p.id, pick, true)); setPicks(prev => ({ ...prev, [p.id]: '' })) }}><PlusIcon size={12} /></button>
                  </div>
                </section>
              )
            })}
          </div>
        )
      }}
    </Frame>
  )
}
