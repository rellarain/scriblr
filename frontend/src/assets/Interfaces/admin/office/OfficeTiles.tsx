import { useState, type ComponentType, type ReactNode } from 'react'
import {
  BarChartIcon, BriefcaseIcon, BuildingIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, CloseIcon, EnvelopeIcon, ExplicatingIcon,
  FlagIcon, GraduationCapIcon, HistoryIcon, InfoIcon, LibraryIcon, LineChartIcon, PeopleIcon, PlusIcon, QueueIcon, HeartIcon, RestoreIcon,
  ShieldIcon, SortingIcon, TeamIcon, ToningIcon, TrashIcon, VotingIcon, type IconProps,
} from '../../../icons'
import { useChannels } from '../../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../../channels/channelTree'
import { OWNER_ID } from '../../../../feedback/staffStore'
import { staffApi } from '../../../../staff/staffApi'
import type { Person, StaffView } from '../../../../staff/staffTypes'
import { changeRoster, loadRoster, useRoster } from '../../../../staff/rosterStore'
import { useStaffChats, userId } from '../../../../support/supportStores'
import WeekTable from '../../../../support/WeekTable'
import { CURRENT_USER } from '../../../../userSeed'
import RoleAssignment from '../RoleAssignment'
import { ChannelManagementPage, ExplicationPage, TonePage, VotingPage } from './StatementPages'
import {
  AddDepartment, AllotmentTable, DepartmentRow, Frame, HireForm, KIND_LABEL, LeaderSelect, RosterTables, TIER_LABEL, TeamList, TrainingPage, placeOf,
} from './StaffPages'
import { Soon, TabbedTile, type OfficeSubject } from './TabbedTile'
import './staff.scss'

// Admin > Office as seven tiles (the user, 2026-11-16), each with its parts as tabs in its title bar and, where it is about one of several
// things, a picker: Site, Department, Team, Channel, Desk, Admin/Helper and User. Parts with no data in the app yet say what they will hold.
// Everything acts as the owner, who holds every role.

type Host = { host: HTMLElement | null }
const tab = (id: string, label: string, Icon: ComponentType<IconProps>, render: (subject: string) => ReactNode) => ({ id, label, Icon, render })
const roster = (label: string, body: (view: StaffView) => ReactNode) => <Frame label={label}>{body}</Frame>

// What the picker shows while the roster loads, or why it cannot.
function RosterWait({ none }: { none: string }) {
  const { view, status, error } = useRoster()
  if (status === 'error' && !view) return <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadRoster()}>Retry</button></p>
  return <p className="fbMuted">{view ? none : 'Loading…'}</p>
}

// --- Site ------------------------------------------------------------------------------------------------------------------

export function SiteTile({ host }: Host) {
  return (
    <TabbedTile id="site" label="Site" host={host} tabs={[
      tab('analytics', 'Site analytics', BarChartIcon, () => <Soon>Site analytics: visits, writers and activity across the app.</Soon>),
      tab('departments', 'Departments', BuildingIcon, () => roster('Departments', view => (
        <div className="fbList">
          {view.departments.map(d => <DepartmentRow key={d.id} view={view} departmentId={d.id} />)}
          <AddDepartment />
        </div>
      ))),
    ]} />
  )
}

// --- Department ------------------------------------------------------------------------------------------------------------

export function DepartmentTile({ host }: Host) {
  const { view } = useRoster()
  return (
    <TabbedTile
      id="department" label="Department" host={host} subjectLabel="Department"
      subjects={view?.departments ?? []} empty={<RosterWait none="No departments yet: add one in Site." />}
      tabs={[
        tab('details', 'Details', InfoIcon, id => roster('Department details', v => {
          const teams = v.teams.filter(t => t.departmentId === id)
          const people = v.people.filter(p => p.departmentId === id && p.active)
          return (
            <div className="fbList">
              <DepartmentRow view={v} departmentId={id} />
              <p className="fbMuted">{teams.length} {teams.length === 1 ? 'team' : 'teams'} · {people.length} {people.length === 1 ? 'person' : 'people'} · {people.filter(p => p.kind === 'admin').length} admins · {people.filter(p => p.kind === 'helper').length} helpers</p>
            </div>
          )
        })),
        tab('roster', 'Roster', PeopleIcon, id => roster('Department roster', v => <RosterTables view={v} departmentId={id} />)),
        tab('schedule', 'Schedule', CalendarIcon, id => roster('Department schedule', v => (
          <WeekTable label={`Shifts of ${v.departments.find(d => d.id === id)?.name ?? 'the department'}`} people={v.people.filter(p => p.departmentId === id && p.active)} />
        ))),
        tab('analytics', 'Analytics', BarChartIcon, () => <Soon>Department analytics: its plan work, its queues and its feedback.</Soon>),
        tab('teams', 'Teams', TeamIcon, id => roster('Teams', v => <TeamList view={v} departmentId={id} />)),
      ]}
    />
  )
}

// --- Team ------------------------------------------------------------------------------------------------------------------

const teamSubjects = (view: StaffView | null): OfficeSubject[] => (view
  ? view.departments.flatMap(d => view.teams.filter(t => t.departmentId === d.id).map(t => ({ id: t.id, name: `${d.name} · ${t.name}` })))
  : [])

// The team's members (each can be taken off it), its manager, and someone added to it.
function TeamMembers({ view, teamId }: { view: StaffView; teamId: string }) {
  const [pick, setPick] = useState('')
  const t = view.teams.find(x => x.id === teamId)
  if (!t) return null
  const members = view.people.filter(p => p.teamId === t.id)
  const others = view.people.filter(p => p.active && p.teamId !== t.id)
  return (
    <div className="fbList">
      <div className="fbRow">
        <span className="fbLabel">Manager</span>
        <LeaderSelect view={view} value={t.managerId} label={`Manager of ${t.name}`} onChange={id => void changeRoster(a => staffApi.editTeam(a, t.id, { managerId: id }))} />
      </div>
      {members.length === 0 ? <p className="fbMuted">Nobody yet.</p> : (
        <table className="stTable">
          <tbody>
            {members.map(p => (
              <tr key={p.id} className={p.active ? undefined : 'stInactive'}>
                <th scope="row">{p.name}{!p.active && <span className="fbMuted"> (left)</span>}{t.managerId === p.id && <span className="fbMuted"> · Manager</span>}</th>
                <td>{p.tier ? TIER_LABEL[p.tier] : KIND_LABEL[p.kind]}</td>
                <td className="stActions">
                  <button type="button" className="fbIconBtn" aria-label={`Take ${p.name} off ${t.name}`} title="Take off the team" onClick={() => void changeRoster(a => staffApi.editPerson(a, p.id, { teamId: null }))}><TrashIcon size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="fbRow">
        <select className="fbSelect" value={pick} aria-label={`Add to ${t.name}`} onChange={e => setPick(e.target.value)}>
          <option value="">Add to the team…</option>
          {others.map(p => <option key={p.id} value={p.id}>{p.name}{p.teamId ? ` (${placeOf(view, p)})` : ''}</option>)}
        </select>
        <button
          type="button" className="fbIconBtn" disabled={!pick} aria-label={`Add to ${t.name}`} title="Add to the team"
          onClick={() => { void changeRoster(a => staffApi.editPerson(a, pick, { teamId: t.id, departmentId: t.departmentId })); setPick('') }}
        ><PlusIcon size={14} /></button>
      </div>
    </div>
  )
}

export function TeamTile({ host }: Host) {
  const { view } = useRoster()
  const membersOf = (v: StaffView, id: string) => v.people.filter(p => p.teamId === id)
  return (
    <TabbedTile
      id="team" label="Team" host={host} subjectLabel="Team"
      subjects={teamSubjects(view)} empty={<RosterWait none="No teams yet: add one in Department." />}
      tabs={[
        tab('assignment', 'Assignment', ShieldIcon, id => roster('Team assignment', v => {
          const admins = membersOf(v, id).filter(p => p.kind === 'admin').map(p => p.id)
          return admins.length ? <RoleAssignment only={admins} /> : <p className="fbMuted">No admins on the team.</p>
        })),
        tab('allotment', 'Allotment', ClockIcon, id => roster('Team allotment', v => <AllotmentTable view={v} people={membersOf(v, id).filter(p => p.active)} />)),
        tab('schedule', 'Schedule', CalendarIcon, id => roster('Team schedule', v => (
          <WeekTable label={`Shifts of ${v.teams.find(t => t.id === id)?.name ?? 'the team'}`} people={membersOf(v, id).filter(p => p.active)} />
        ))),
        tab('performance', 'Performance', LineChartIcon, () => <Soon>Team performance: its plan work done within the SLA, chats taken and feedback checked.</Soon>),
        tab('members', 'Members', PeopleIcon, id => roster('Team members', v => <TeamMembers view={v} teamId={id} />)),
        tab('applications', 'Applications', EnvelopeIcon, () => <Soon>Applications from users who passed the required exams in Training.</Soon>),
      ]}
    />
  )
}

// --- Channel ---------------------------------------------------------------------------------------------------------------

export function ChannelTile({ host }: Host) {
  const { index, ready } = useChannels()
  const consoles = childrenOf(index, null).flatMap(i => childrenOf(index, i.id).filter(n => n.kind === 'console')).map(n => ({ id: n.id, name: labelOf(index, n.id) }))
  return (
    <TabbedTile
      id="channel" label="Channel" host={host} subjectLabel="Console"
      subjects={consoles} empty={<p className="fbMuted">{ready ? 'No consoles in the channel list.' : 'Loading…'}</p>}
      tabs={[
        tab('queue', 'Queue analytics', QueueIcon, () => <Soon>Queue analytics for this console: chats waiting, taken and closed, and how long users waited.</Soon>),
        tab('resources', 'Resource analytics', LibraryIcon, () => <Soon>Resource analytics for this console: the guides read and the guides sent in chats.</Soon>),
        tab('feedback', 'Helper-checked feedback', SortingIcon, id => <ChannelManagementPage key={id} under={id} />),
      ]}
    />
  )
}

// --- Desk ------------------------------------------------------------------------------------------------------------------

export function DeskTile({ host }: Host) {
  return (
    <TabbedTile id="desk" label="Desk" host={host} tabs={[
      tab('voting', 'Voting', VotingIcon, () => <VotingPage />),
      tab('toning', 'Toning', ToningIcon, () => <TonePage />),
      tab('explication', 'Explication', ExplicatingIcon, () => <ExplicationPage />),
    ]} />
  )
}

// --- Admin/Helper ----------------------------------------------------------------------------------------------------------

interface Move { key: string; label: string; action: string; Icon: ComponentType<IconProps>; run: () => Promise<boolean>; disabled?: string }

// What can raise (`up`) or lower a person: a support tier on a console (the promotion their finished training allows), helper and admin, and
// leading a team or a department.
function moves(view: StaffView, p: Person, up: boolean, label: (id: string) => string): Move[] {
  const out: Move[] = []
  for (const r of p.training) {
    if (up === !r.promotedBy) {
      const where = label(r.nodeId)
      out.push({ key: `node:${r.nodeId}`, label: `Support tier on ${where}`, action: `${up ? 'Promote' : 'Demote'} ${p.name} on ${where}`, Icon: up ? ChevronUpIcon : ChevronDownIcon, run: () => changeRoster(a => staffApi.promote(a, p.id, r.nodeId, up)) })
    }
  }
  if (up && p.kind === 'helper') out.push({ key: 'kind', label: 'Helper to admin', action: `Make ${p.name} an admin`, Icon: ChevronUpIcon, run: () => changeRoster(a => staffApi.editPerson(a, p.id, { kind: 'admin' })) })
  if (!up && p.kind === 'admin') out.push({ key: 'kind', label: 'Admin to helper', action: `Make ${p.name} a helper`, Icon: ChevronDownIcon, run: () => changeRoster(a => staffApi.editPerson(a, p.id, { kind: 'helper' })), disabled: p.id === OWNER_ID ? 'The owner stays an admin' : undefined })
  const team = view.teams.find(t => t.id === p.teamId)
  const dep = view.departments.find(d => d.id === (team?.departmentId ?? p.departmentId))
  if (up && p.kind === 'admin') {
    if (team && team.managerId !== p.id) out.push({ key: `team:${team.id}`, label: `Manager of ${team.name}`, action: `Make ${p.name} the manager of ${team.name}`, Icon: ChevronUpIcon, run: () => changeRoster(a => staffApi.editTeam(a, team.id, { managerId: p.id })) })
    if (dep && dep.directorId !== p.id) out.push({ key: `dep:${dep.id}`, label: `Director of ${dep.name}`, action: `Make ${p.name} the director of ${dep.name}`, Icon: ChevronUpIcon, run: () => changeRoster(a => staffApi.editDepartment(a, dep.id, { directorId: p.id })) })
  }
  if (!up) {
    for (const t of view.teams.filter(x => x.managerId === p.id)) out.push({ key: `team:${t.id}`, label: `Manager of ${t.name}`, action: `${p.name} no longer manages ${t.name}`, Icon: ChevronDownIcon, run: () => changeRoster(a => staffApi.editTeam(a, t.id, { managerId: null })) })
    for (const d of view.departments.filter(x => x.directorId === p.id)) out.push({ key: `dep:${d.id}`, label: `Director of ${d.name}`, action: `${p.name} no longer directs ${d.name}`, Icon: ChevronDownIcon, run: () => changeRoster(a => staffApi.editDepartment(a, d.id, { directorId: null })) })
  }
  return out
}

function Moves({ view, person, up }: { view: StaffView; person: Person; up: boolean }) {
  const { index } = useChannels()
  if (!person.active) return <p className="fbMuted">{person.name} has left.</p>
  const list = moves(view, person, up, id => labelOf(index, id))
  if (list.length === 0) return <p className="fbMuted">Nothing to {up ? 'promote' : 'demote'}.</p>
  return (
    <table className="stTable" aria-label={up ? `Promote ${person.name}` : `Demote ${person.name}`}>
      <tbody>
        {list.map(m => (
          <tr key={m.key}>
            <th scope="row">{m.label}</th>
            <td className="stActions">
              <button type="button" className="fbIconBtn" disabled={!!m.disabled} aria-label={m.action} title={m.disabled ?? m.action} onClick={() => void m.run()}><m.Icon size={14} /></button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Term({ person }: { person: Person }) {
  const owner = person.id === OWNER_ID
  return (
    <div className="fbRow">
      <span>{person.active ? `${person.name} works here` : `${person.name} has left`}</span>
      {person.active
        ? <button type="button" className="fbIconBtn" disabled={owner} aria-label={`Term ${person.name}`} title={owner ? 'The owner cannot be termed' : 'Term: marked as left, never deleted'} onClick={() => void changeRoster(a => staffApi.editPerson(a, person.id, { active: false }))}><CloseIcon size={14} /></button>
        : <button type="button" className="fbIconBtn" aria-label={`Rehire ${person.name}`} title="Rehire" onClick={() => void changeRoster(a => staffApi.editPerson(a, person.id, { active: true }))}><RestoreIcon size={14} /></button>}
    </div>
  )
}

export function StaffTile({ host }: Host) {
  const { view } = useRoster()
  const subjects = (view?.people ?? []).map(p => ({ id: p.id, name: `${p.name} (${KIND_LABEL[p.kind]}${p.active ? '' : ', left'})` }))
  const of = (v: StaffView, id: string, body: (p: Person) => ReactNode) => {
    const p = v.people.find(x => x.id === id)
    return p ? body(p) : null
  }
  return (
    <TabbedTile
      id="staff" label="Admin/Helper" host={host} subjectLabel="Staff member"
      subjects={subjects} empty={<RosterWait none="Nobody on the staff yet." />}
      tabs={[
        tab('training', 'Training', GraduationCapIcon, id => <TrainingPage personId={id} />),
        tab('performance', 'Performance', LineChartIcon, () => <Soon>Performance: their plan work done within the SLA, chats taken and feedback checked.</Soon>),
        tab('activity', 'Activity', HistoryIcon, () => <Soon>Activity: what they did in the app, newest first.</Soon>),
        tab('flags', 'Flags', FlagIcon, () => <Soon>Flags: concerns raised about their work.</Soon>),
        tab('promote', 'Promote', ChevronUpIcon, id => roster('Promote', v => of(v, id, p => <Moves view={v} person={p} up />))),
        tab('demote', 'Demote', ChevronDownIcon, id => roster('Demote', v => of(v, id, p => <Moves view={v} person={p} up={false} />))),
        tab('term', 'Term', CloseIcon, id => roster('Term', v => of(v, id, p => <Term person={p} />))),
        tab('hours', 'Allot hours', ClockIcon, id => roster('Allot hours', v => of(v, id, p => <AllotmentTable view={v} people={[p]} />))),
      ]}
    />
  )
}

// --- User ------------------------------------------------------------------------------------------------------------------

// The users the app knows: the writer, and whoever has asked for support in a chat.
function useUsers(): OfficeSubject[] {
  const { view } = useStaffChats()
  const seen = new Map<string, string>([[userId(), CURRENT_USER.displayName]])
  for (const c of [...view.waiting, ...view.mine, ...view.others, ...view.closed]) if (c.userId && !seen.has(c.userId)) seen.set(c.userId, c.userName || c.userId)
  return [...seen].map(([id, name]) => ({ id, name }))
}

export function UserTile({ host }: Host) {
  const users = useUsers()
  const nameOf = (id: string) => users.find(u => u.id === id)?.name ?? id
  return (
    <TabbedTile
      id="user" label="User" host={host} subjectLabel="User" subjects={users}
      tabs={[
        tab('engagement', 'Engagement', HeartIcon, () => <Soon>Engagement: what this user writes, reads, sends and asks.</Soon>),
        tab('training', 'Training', GraduationCapIcon, () => <Soon>Training: the courses this user took and the exams they passed.</Soon>),
        tab('hire', 'Hire', BriefcaseIcon, id => roster('Hire', v => {
          const name = nameOf(id)
          const staff = v.people.find(p => p.name === name)
          return staff
            ? <p className="fbMuted">{name} is on the staff ({KIND_LABEL[staff.kind]}{staff.active ? '' : ', left'}).</p>
            : <HireForm key={id} view={v} givenName={name} />
        })),
      ]}
    />
  )
}
