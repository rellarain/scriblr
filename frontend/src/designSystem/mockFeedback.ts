import type { ItemPatch, NewItem, PlanItem, PlanView, PlanStatus } from '../plan/planTypes'
import type { Department, Person, StaffView, Team } from '../staff/staffTypes'
import type {
  FeedbackAdmin, FeedbackStatus, KeywordFlag, MineView, MyMessage, Role, StaffBundle, StaffMessage, Statement, StatusStep, Tone,
  ToneCategory, ToneSummary, VerbCategory,
} from '../feedback/feedbackTypes'

// The design system's pretend feedback store and Project Plan (backend storage/feedback.py and project_plan.py, in memory): the same seed, the same statement
// lumping (checked messages with one subject and one verb), roles per scope, and the same answers (the staff bundle, the
// writer's own view), so the Help tile, the Inbox, the Office pages and Assignment work in the cards.

const INBOX = 'helper/inbox'
const scopeOf = (channelId: string) => channelId.split('/').slice(0, 2).join('/')
const now = () => new Date().toISOString()

interface Question { id: string; askedBy: string; text: string; at: string; answer: string; answeredAt: string | null }
interface Comment { id: string; by: string; text: string; at: string }
interface Event { at: string; adminId: string; kind: string; detail: string }
interface Message {
  id: string; text: string; authorId: string; submittedAt: string; senderTone: Tone | null; channelId: string; verbId: string
  fromChannel: string | null; tone: Tone | null; checkedBy: string; checkedAt: string | null
  questions: Question[]; comments: Comment[]; history: Event[]
}
interface Vote { adminId: string; approve: boolean; deny: boolean; passed: boolean; approveNote: string; denyNote: string; passNote: string; updatedAt: string }
interface State { id: string; key: string; votes: Vote[]; decision: 'accepted' | 'vetoed' | null; decisionNote: string; decidedAt: string | null; history: Event[] }

class Refused extends Error { constructor(public status: number, message: string) { super(message) } }

const VERBS: VerbCategory[] = [
  { id: 'verb-increase', name: 'Increase', keywords: ['increase', 'raise', 'boost', 'brighter', 'larger', 'contrast', 'hard to see'] },
  { id: 'verb-improve', name: 'Improve', keywords: ['improve', 'better', 'useless', 'relevant', 'slow'] },
  { id: 'verb-fix', name: 'Fix', keywords: ['fix', 'broken', 'bug', 'freezes', 'crash', 'error'] },
  { id: 'verb-add', name: 'Add', keywords: ['add', 'missing', 'wish', 'would like', 'need'] },
  { id: 'verb-remove', name: 'Remove', keywords: ['remove', 'delete', 'get rid of', 'annoying'] },
  { id: 'verb-simplify', name: 'Simplify', keywords: ['simplify', 'confusing', 'complicated', 'not sure'] },
  { id: 'verb-keep', name: 'Keep', keywords: ['keep', 'great', 'love', 'like'] },
]

const WRITER_CONSOLES = ['writer/dashboard', 'writer/project', 'writer/book', 'writer/draft']
const READER_CONSOLES = ['reader/nook', 'reader/library']
const grant = (...pairs: [string[], Role[]][]): Record<string, Role[]> => {
  const out: Record<string, Role[]> = {}
  for (const [scopes, roles] of pairs) for (const s of scopes) out[s] = [...new Set([...(out[s] ?? []), ...roles])]
  return out
}

function seedAdmins(): FeedbackAdmin[] {
  return [
    { id: 'adm-dana', name: 'Dana Ruiz', roles: grant([[INBOX], ['checker', 'channelManager']], [[...WRITER_CONSOLES, ...READER_CONSOLES, 'admin/office'], ['voter']], [WRITER_CONSOLES, ['channelManager', 'planner']]) },
    { id: 'adm-lee', name: 'Lee Park', roles: grant([[INBOX], ['checker']], [[...WRITER_CONSOLES, ...READER_CONSOLES], ['voter']], [READER_CONSOLES, ['channelManager']]) },
    { id: 'adm-sam', name: 'Sam Ortiz', roles: grant([[INBOX], ['checker']], [READER_CONSOLES, ['voter', 'planner']]) },
  ]
}

// The local user (userSeed's CURRENT_USER) wrote two of these, so the Help tile's My feedback has something in it.
const ME = 'ORG-4471'
const SHELF = 'writer/dashboard/scratchpad'

function message(id: string, text: string, authorId: string, day: string, sender: Tone, channelId: string, verbId: string, tone?: Tone, by = ''): Message {
  return {
    id, text, authorId, submittedAt: day, senderTone: sender, channelId, verbId, fromChannel: scopeOf(channelId), tone: tone ?? null,
    checkedBy: tone ? by : '', checkedAt: tone ? `${day}T12:00:00.000Z` : null, questions: [], comments: [], history: [],
  }
}

function seedMessages(): Message[] {
  const list = [
    message('fb-1', 'The editor freezes for a second every time I paste a large block of text.', ME, '2026-08-10', 'unpleasant', 'writer/draft/draft', 'verb-fix', 'unpleasant', 'adm-dana'),
    message('fb-2', 'I love the new dark mode, but the scratchpad icons are hard to see in it.', 'a.kim', '2026-08-11', 'unpleasant', SHELF, 'verb-increase', 'mixed', 'adm-lee'),
    message('fb-3', 'Search inside the library is basically useless, it never finds anything relevant.', ME, '2026-08-12', 'unpleasant', 'reader/library/catalog', 'verb-improve', 'unpleasant', 'adm-dana'),
    message('fb-4', 'Just wanted to say the reading stack is great, keep it up!', 'j.rivera', '2026-08-13', 'pleasant', 'reader/nook/stack', 'verb-keep', 'pleasant', 'adm-sam'),
    message('fb-5', 'Not sure what this button does??', 'a.kim', '2026-08-14', 'neutral', 'admin/office/voting', 'verb-simplify'),
    message('fb-6', 'At night I cannot tell the scratchpad icons apart, they need more contrast.', 'j.rivera', '2026-08-15', 'unpleasant', SHELF, 'verb-increase', 'unpleasant', 'adm-dana'),
    message('fb-7', 'Dark mode is lovely but the icons are too dim, please make them brighter.', 'm.okafor', '2026-08-16', 'mixed', SHELF, 'verb-increase'),
  ]
  list[2].questions.push({ id: 'q-seed-1', askedBy: 'adm-lee', text: 'Which words did you search for?', at: '2026-08-13T09:00:00.000Z', answer: '', answeredAt: null })
  list[1].comments.push({ id: 'c-seed-1', by: 'adm-dana', text: 'Three reports of this now.', at: '2026-08-15T09:00:00.000Z' })
  return list
}

const keyOf = (channelId: string, verbId: string) => `${channelId}::${verbId}`
// The backend hashes the key; any stable id will do here.
const idOf = (key: string) => `st-${key.replace(/[^a-z0-9]+/gi, '-')}`

function category(labels: Tone[]): ToneCategory | null {
  const n = labels.length
  if (n === 0) return null
  const p = labels.filter(t => t === 'pleasant' || t === 'mixed').length / n
  const u = labels.filter(t => t === 'unpleasant' || t === 'mixed').length / n
  const z = labels.filter(t => t === 'neutral').length / n
  if (z >= 0.5) return 'neutral'
  if (p >= 0.5 && u >= 0.5) return 'mixed'
  if (p >= 0.75) return 'pleasant'
  if (u >= 0.75) return 'unpleasant'
  if (p >= 0.5) return 'mixedPleasant'
  if (u >= 0.5) return 'mixedUnpleasant'
  return 'mixed'
}
const summary = (labels: Tone[]): ToneSummary => ({
  category: category(labels), n: labels.length,
  pleasant: labels.filter(t => t === 'pleasant' || t === 'mixed').length,
  unpleasant: labels.filter(t => t === 'unpleasant' || t === 'mixed').length,
  neutral: labels.filter(t => t === 'neutral').length,
})

function flags(text: string, verbs: VerbCategory[]): KeywordFlag[] {
  const out: KeywordFlag[] = []
  for (const v of verbs) for (const kw of v.keywords) {
    const re = new RegExp(`(?<![\\w])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'gi')
    for (const m of text.matchAll(re)) out.push({ categoryId: v.id, keyword: kw, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end)
}

// A small plan for the design system's cards (tests start from an empty one): a release procedure on the Draft console with a process
// and its tasks, a routine, and dated items for the Timeline.
function seedPlan(): Omit<PlanItem, 'can'>[] {
  const base = { notes: '', ordered: true, priority: 'normal' as const, start: null, due: null, assignee: null, claimedBy: '', statementIds: [], recurrence: null, createdAt: '2026-11-10T09:00:00.000Z', doneAt: null }
  return [
    { ...base, id: 'pi-1', nodeId: 'writer/draft', kind: 'procedure', title: 'Release the faster editor', parentId: null, order: 0, status: 'inProgress', start: '2026-11-10', due: '2026-11-28' },
    { ...base, id: 'pi-2', nodeId: 'writer/draft', kind: 'process', title: 'Paste without freezing', parentId: 'pi-1', order: 0, status: 'inProgress', ordered: false },
    { ...base, id: 'pi-3', nodeId: 'writer/draft', kind: 'task', title: 'Measure a large paste', parentId: 'pi-2', order: 0, status: 'done', assignee: { kind: 'staff', id: 'adm-dana' }, claimedBy: 'adm-dana', doneAt: '2026-11-12T10:00:00.000Z', start: '2026-11-10', due: '2026-11-12' },
    { ...base, id: 'pi-4', nodeId: 'writer/draft', kind: 'task', title: 'Split the word count off the paste', parentId: 'pi-2', order: 1, status: 'inProgress', priority: 'high', assignee: { kind: 'staff', id: 'adm-dana' }, claimedBy: 'adm-dana', start: '2026-11-13', due: '2026-11-20' },
    { ...base, id: 'pi-5', nodeId: 'writer/draft', kind: 'task', title: 'Write the release note', parentId: 'pi-1', order: 1, status: 'todo', due: '2026-11-27' },
    { ...base, id: 'pi-6', nodeId: 'reader/library', kind: 'task', title: 'Search by author', parentId: null, order: 0, status: 'claimed', priority: 'urgent', assignee: { kind: 'staff', id: 'adm-sam' }, claimedBy: 'adm-sam', start: '2026-11-17', due: '2026-11-24' },
    { ...base, id: 'pi-7', nodeId: 'helper/inbox', kind: 'routine', title: 'Check the Inbox', parentId: null, order: 0, status: 'todo', recurrence: { kind: 'weekly', every: 1, unit: 'day', days: [0, 3], rangeMax: null, anchor: '2026-11-10', until: null } },
  ]
}

export function createMockFeedback(opts: { planSeed?: boolean } = {}) {
  const admins = seedAdmins()
  let verbs = VERBS.map(v => ({ ...v, keywords: [...v.keywords] }))
  const messages = seedMessages()
  const states = new Map<string, State>()
  const roleHistory: Event[] = []
  let next = 100
  const shelfKey = keyOf(SHELF, 'verb-increase')
  states.set(idOf(shelfKey), {
    id: idOf(shelfKey), key: shelfKey, decision: null, decisionNote: '', decidedAt: null, history: [],
    votes: [
      { adminId: 'adm-dana', approve: true, deny: false, passed: false, approveNote: 'Three separate reports, clearly a real problem.', denyNote: '', passNote: '', updatedAt: '2026-08-16T10:00:00.000Z' },
      { adminId: 'adm-lee', approve: false, deny: true, passed: false, approveNote: '', denyNote: 'Wait for the theme rework first.', passNote: '', updatedAt: '2026-08-16T11:00:00.000Z' },
    ],
  })

  const stateOf = (key: string): State => states.get(idOf(key)) ?? { id: idOf(key), key, votes: [], decision: null, decisionNote: '', decidedAt: null, history: [] }
  const stored = (key: string): State => { const s = stateOf(key); states.set(s.id, s); return s }
  const admin = (id: string) => {
    const a = admins.find(x => x.id === id) ?? admins[0]
    if (!a) throw new Refused(401, 'Choose who you are acting as.')
    return a
  }
  const has = (a: FeedbackAdmin, role: Role, scope: string) => (a.roles[scope] ?? []).includes(role)
  const need = (a: FeedbackAdmin, role: Role, scope: string, what: string) => {
    if (!has(a, role, scope)) throw new Refused(403, `${what} needs the ${role === 'channelManager' ? 'Channel manager' : role[0].toUpperCase() + role.slice(1)} role on ${scope}.`)
  }
  const msg = (id: string) => {
    const m = messages.find(x => x.id === id)
    if (!m) throw new Refused(404, `Message ${id} not found`)
    return m
  }

  function groups() {
    const out = new Map<string, Message[]>()
    for (const m of messages) if (m.checkedAt) out.set(keyOf(m.channelId, m.verbId), [...(out.get(keyOf(m.channelId, m.verbId)) ?? []), m])
    return [...out.entries()].sort((a, b) => Math.min(...a[1].map(m => +new Date(m.submittedAt))) - Math.min(...b[1].map(m => +new Date(m.submittedAt))))
  }

  function statusOf(m: Message): { status: FeedbackStatus; steps: StatusStep[]; note: string } {
    const steps: StatusStep[] = [{ step: 'received', at: m.submittedAt }]
    if (!m.checkedAt) return { status: 'received', steps, note: '' }
    steps.push({ step: 'checked', at: m.checkedAt })
    const st = stateOf(keyOf(m.channelId, m.verbId))
    if (st.decision === 'vetoed') { steps.push({ step: 'declined', at: st.decidedAt }); return { status: 'declined', steps, note: st.decisionNote } }
    if (st.decision !== 'accepted') { steps.push({ step: 'voting', at: m.checkedAt }); return { status: 'voting', steps, note: '' } }
    steps.push({ step: 'planned', at: st.decidedAt })
    const work = workOf(st.id)
    if (work === 'inProgress' || work === 'done') steps.push({ step: 'inProgress', at: null })
    if (work === 'done') steps.push({ step: 'done', at: null })
    return { status: work === 'done' ? 'done' : work === 'inProgress' ? 'inProgress' : 'planned', steps, note: st.decisionNote }
  }

  // --- the staff (backend storage/staff.py) ---------------------------------------------
  const departments: Department[] = [{ id: 'dep-product', name: 'Product', directorId: 'adm-dana' }, { id: 'dep-support', name: 'Support', directorId: 'adm-sam' }]
  const teams: Team[] = [
    { id: 'team-writing', name: 'Writing tools', departmentId: 'dep-product', managerId: 'adm-dana' },
    { id: 'team-reading', name: 'Reading', departmentId: 'dep-product', managerId: 'adm-lee' },
    { id: 'team-help', name: 'Help desk', departmentId: 'dep-support', managerId: 'adm-sam' },
  ]
  type Stored = Omit<Person, 'tier'>
  const people: Stored[] = [
    { id: 'adm-dana', name: 'Dana Ruiz', kind: 'admin', active: true, departmentId: 'dep-product', teamId: 'team-writing', allotment: null, supports: [] },
    { id: 'adm-lee', name: 'Lee Park', kind: 'admin', active: true, departmentId: 'dep-product', teamId: 'team-reading', allotment: null, supports: ['reader/library', 'reader/nook'] },
    { id: 'adm-sam', name: 'Sam Ortiz', kind: 'admin', active: true, departmentId: 'dep-support', teamId: 'team-help', allotment: 10, supports: [] },
    { id: 'hlp-ari', name: 'Ari Chen', kind: 'helper', active: true, departmentId: 'dep-support', teamId: 'team-help', allotment: 20, supports: [] },
    { id: 'hlp-noor', name: 'Noor Haddad', kind: 'helper', active: true, departmentId: 'dep-support', teamId: 'team-help', allotment: 10, supports: [] },
  ]
  for (const pp of people) if (!admins.some(a => a.id === pp.id)) admins.push({ id: pp.id, name: pp.name, roles: { [INBOX]: ['checker'] } })
  let sla = { urgent: 4, high: 24, normal: 72, low: 168 }
  const tierOf = (pp: Stored): Person['tier'] => (pp.kind === 'helper' ? 1 : pp.allotment ? 3 : pp.supports.length ? 2 : null)
  function staffView(): StaffView {
    const depAt = (id: string | null) => { const n = departments.findIndex(d => d.id === id); return n < 0 ? departments.length : n }
    const list = people.map(pp => ({ ...pp, supports: [...pp.supports], tier: tierOf(pp) }))
      .sort((a, b) => depAt(a.departmentId) - depAt(b.departmentId) || (a.tier ?? 9) - (b.tier ?? 9) || Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name))
    return { people: list, departments: departments.map(d => ({ ...d })), teams: teams.map(t => ({ ...t })), sla: { ...sla }, allotments: [5, 10, 20, 30] }
  }
  function roster(method: string, parts: string[], body: Record<string, unknown>, meId: string): StaffView {
    admin(meId)
    const [what, id] = parts
    if (method === 'GET' && parts.length === 0) return staffView()
    if (what === 'people' && method === 'POST') {
      const name = String(body.name ?? '').trim()
      if (!name) throw new Refused(400, 'A staff member needs a name.')
      const teamId = (body.teamId as string | null) ?? null
      const pid = `${body.kind === 'helper' ? 'hlp' : 'adm'}-${next++}`
      people.push({ id: pid, name, kind: body.kind === 'helper' ? 'helper' : 'admin', active: true, teamId, departmentId: teams.find(t => t.id === teamId)?.departmentId ?? null, allotment: null, supports: [] })
      admins.push({ id: pid, name, roles: {} })
      return staffView()
    }
    if (what === 'people' && method === 'PATCH') {
      const pp = people.find(x => x.id === id)
      if (!pp) throw new Refused(404, `No staff member ${id}`)
      if ('allotment' in body && body.allotment !== null && ![5, 10, 20, 30].includes(Number(body.allotment))) throw new Refused(400, 'Helper hours are 5, 10, 20 or 30 a week.')
      Object.assign(pp, body)
      if (body.active === false) {
        for (const d of departments) if (d.directorId === pp.id) d.directorId = null
        for (const t of teams) if (t.managerId === pp.id) t.managerId = null
      }
      const fa = admins.find(a => a.id === pp.id)
      if (fa) fa.name = pp.name
      return staffView()
    }
    if (what === 'departments' && method === 'POST') { departments.push({ id: `dep-${next++}`, name: String(body.name ?? ''), directorId: null }); return staffView() }
    if (what === 'departments' && method === 'PATCH') { Object.assign(departments.find(d => d.id === id) ?? {}, body); return staffView() }
    if (what === 'departments' && method === 'DELETE') {
      if (teams.some(t => t.departmentId === id) || people.some(x => x.departmentId === id)) throw new Refused(400, 'Move its teams and people out first.')
      departments.splice(departments.findIndex(d => d.id === id), 1)
      return staffView()
    }
    if (what === 'teams' && method === 'POST') { teams.push({ id: `team-${next++}`, name: String(body.name ?? ''), departmentId: String(body.departmentId ?? ''), managerId: null }); return staffView() }
    if (what === 'teams' && method === 'PATCH') { Object.assign(teams.find(t => t.id === id) ?? {}, body); return staffView() }
    if (what === 'teams' && method === 'DELETE') {
      if (people.some(x => x.teamId === id)) throw new Refused(400, 'Move its people out first.')
      teams.splice(teams.findIndex(t => t.id === id), 1)
      return staffView()
    }
    if (what === 'sla' && method === 'PUT') { sla = { ...sla, ...(body as typeof sla) }; return staffView() }
    throw new Refused(404, 'Not found')
  }

  // --- the Project Plan ---------------------------------------------------------------
  let items: Omit<PlanItem, 'can'>[] = opts.planSeed ? seedPlan() : []
  const below = (id: string): Omit<PlanItem, 'can'>[] => items.filter(i => i.parentId === id).flatMap(i => [i, ...below(i.id)])
  function workOf(sid: string): 'planned' | 'inProgress' | 'done' | null {
    const linked = items.filter(i => i.statementIds.includes(sid))
    if (!linked.length) return null
    const all = [...linked, ...linked.flatMap(i => below(i.id))]
    if (all.every(i => i.status === 'done')) return 'done'
    return all.some(i => i.status === 'inProgress' || i.status === 'done') ? 'inProgress' : 'planned'
  }
  function planView(meId: string): PlanView {
    const me = admin(meId)
    return {
      me: me.id,
      items: [...items].sort((a, b) => a.nodeId.localeCompare(b.nodeId) || (a.parentId ?? '').localeCompare(b.parentId ?? '') || a.order - b.order).map(i => {
        const planner = has(me, 'planner', scopeOf(i.nodeId))
        const mineToo = i.assignee?.id === me.id || i.claimedBy === me.id
        const claimable = (!i.assignee || i.assignee.id === me.id) && (!i.claimedBy || i.claimedBy === me.id) && i.status !== 'done'
        return { ...i, can: { edit: planner, status: planner || mineToo, claim: claimable && i.claimedBy !== me.id } }
      }),
    }
  }
  const planItem = (id: string) => {
    const it = items.find(i => i.id === id)
    if (!it) throw new Refused(404, `Plan item ${id} not found`)
    return it
  }
  const level = (nodeId: string, parentId: string | null) => items.filter(i => i.nodeId === nodeId && i.parentId === parentId).sort((a, b) => a.order - b.order)
  function plan(method: string, parts: string[], body: Record<string, unknown>, meId: string): PlanView {
    const me = admin(meId)
    const [what, id, sub] = parts
    const shape = (nodeId: string) => need(me, 'planner', scopeOf(nodeId), 'Planning')
    if (method === 'GET' && parts.length === 0) return planView(me.id)
    if (what === 'items' && method === 'POST' && !id) {
      const b = body as unknown as NewItem
      shape(b.nodeId)
      items = [...items, {
        id: `pi-${next++}`, nodeId: b.nodeId, kind: b.kind, title: b.title, notes: '', parentId: b.parentId ?? null, ordered: b.ordered ?? true,
        order: level(b.nodeId, b.parentId ?? null).length, status: 'todo', priority: b.priority ?? 'normal', start: b.start ?? null, due: b.due ?? null,
        assignee: b.assignee ?? (b.assigneeId ? { kind: 'staff', id: b.assigneeId } : null), claimedBy: '', statementIds: b.statementIds ?? [],
        recurrence: b.recurrence ?? null, createdAt: now(), doneAt: null,
      }]
      return planView(me.id)
    }
    if (what === 'items' && id === 'reorder' && method === 'PUT') {
      shape(String(body.nodeId))
      const ids = body.orderedIds as string[]
      items = items.map(i => (ids.includes(i.id) ? { ...i, order: ids.indexOf(i.id) } : i))
      return planView(me.id)
    }
    if (what === 'items' && method === 'PATCH') {
      const it = planItem(id)
      const patch = body as ItemPatch
      const view = planView(me.id).items.find(i => i.id === id)!
      if (Object.keys(patch).some(k => k !== 'status')) shape(it.nodeId)
      else if (!view.can.status && !view.can.claim) throw new Refused(403, 'Only who it is assigned to, who claimed it, or a Planner moves an item along.')
      const status = patch.status as PlanStatus | undefined
      const { assigneeId, ...rest } = patch
      Object.assign(it, rest, 'assigneeId' in patch ? { assignee: assigneeId ? { kind: 'staff', id: assigneeId } : null } : {})
      if (status) {
        if ((status === 'claimed' || status === 'inProgress') && !it.claimedBy) it.claimedBy = me.id
        if (status === 'todo') it.claimedBy = ''
        it.doneAt = status === 'done' ? now() : null
      }
      return planView(me.id)
    }
    if (what === 'items' && method === 'DELETE') {
      const it = planItem(id)
      shape(it.nodeId)
      const gone = new Set([it.id, ...below(it.id).map(i => i.id)])
      items = items.filter(i => !gone.has(i.id))
      return planView(me.id)
    }
    if (what === 'items' && sub === 'claim') {
      const it = planItem(id)
      if (body.release) { it.claimedBy = ''; if (it.status === 'claimed') it.status = 'todo'; return planView(me.id) }
      if (!planView(me.id).items.find(i => i.id === id)!.can.claim) throw new Refused(403, 'This item is assigned to or claimed by someone else.')
      it.claimedBy = me.id
      if (it.status === 'todo') it.status = 'claimed'
      return planView(me.id)
    }
    throw new Refused(404, 'Not found')
  }

  function bundle(meId: string): StaffBundle {
    const me = admin(meId)
    const hist = (events: Event[]) => events.map(e => ({ at: e.at, kind: e.kind, detail: e.detail, mine: e.adminId === me.id }))
    const view = (m: Message): StaffMessage => ({
      id: m.id, text: m.text, submittedAt: m.submittedAt, senderTone: m.senderTone, channelId: m.channelId, verbId: m.verbId,
      fromChannel: m.fromChannel, tone: m.tone, checked: !!m.checkedAt, checkedAt: m.checkedAt, checkedByMe: m.checkedBy === me.id,
      statementId: m.checkedAt ? idOf(keyOf(m.channelId, m.verbId)) : null,
      questions: m.questions.map(q => ({ id: q.id, text: q.text, at: q.at, answer: q.answer, answeredAt: q.answeredAt, mine: q.askedBy === me.id })),
      comments: m.comments.map(c => ({ id: c.id, text: c.text, at: c.at, mine: c.by === me.id })),
      flags: flags(m.text, verbs), status: statusOf(m).status, history: hist(m.history),
    })
    const statements: Statement[] = groups().map(([key, members]) => {
      const st = stateOf(key)
      const [channelId, verbId] = key.split('::')
      const votes = st.votes.filter(v => v.approve || v.deny || v.passed)
      const scope = scopeOf(channelId)
      return {
        id: st.id, key, channelId, verbId, verbName: verbs.find(v => v.id === verbId)?.name ?? verbId, messageIds: members.map(m => m.id),
        tone: summary(members.map(m => m.tone).filter((t): t is Tone => !!t)),
        votes: votes.map(v => ({ mine: v.adminId === me.id, approve: v.approve, deny: v.deny, passed: v.passed, approveNote: v.approveNote, denyNote: v.denyNote, passNote: v.passNote, updatedAt: v.updatedAt })),
        tally: { approve: votes.filter(v => v.approve).length, deny: votes.filter(v => v.deny).length, pass: votes.filter(v => v.passed).length },
        decision: st.decision, decisionNote: st.decisionNote, decidedAt: st.decidedAt, work: workOf(st.id), history: hist(st.history),
        can: { vote: has(me, 'voter', scope) && st.decision === null, correct: has(me, 'channelManager', scope), decide: has(me, 'planner', scope) },
      }
    })
    return {
      me: me.id, admins: admins.map(a => ({ ...a, roles: { ...a.roles } })), verbCategories: verbs, messages: messages.map(view), statements,
      roleHistory: hist(roleHistory), can: { check: has(me, 'checker', INBOX), manageVerbs: has(me, 'channelManager', INBOX) },
    }
  }

  function mine(authorId: string): MineView {
    const list: MyMessage[] = messages.filter(m => authorId && m.authorId === authorId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map(m => {
        const s = statusOf(m)
        return {
          id: m.id, text: m.text, submittedAt: m.submittedAt, senderTone: m.senderTone, channelId: m.channelId, verbId: m.verbId,
          verbName: verbs.find(v => v.id === m.verbId)?.name ?? m.verbId, status: s.status, steps: s.steps, note: s.note,
          questions: m.questions.map(q => ({ id: q.id, text: q.text, at: q.at, answer: q.answer, answeredAt: q.answeredAt })),
        }
      })
    return { messages: list, openQuestions: list.reduce((n, m) => n + m.questions.filter(q => !q.answer).length, 0) }
  }

  function staff(method: string, parts: string[], body: Record<string, unknown>, meId: string): StaffBundle {
    const me = admin(meId)
    const [what, id, sub] = parts
    if (method === 'GET' && parts.length === 0) return bundle(me.id)
    if (what === 'messages' && method === 'PUT' && !sub) {
      const m = msg(id)
      if (m.checkedAt) need(me, 'channelManager', scopeOf(m.channelId), 'Correcting a statement')
      else need(me, 'checker', INBOX, 'Checking feedback')
      if (typeof body.channelId === 'string' && body.channelId !== m.channelId) {
        if (m.checkedAt) need(me, 'channelManager', scopeOf(body.channelId), 'Moving a statement there')
        m.channelId = body.channelId
      }
      if (typeof body.verbId === 'string') m.verbId = body.verbId
      if (typeof body.tone === 'string') m.tone = body.tone as Tone
      if (body.checked && !m.checkedAt) {
        if (!m.tone) throw new Refused(400, 'Set the tone before checking.')
        m.checkedBy = me.id
        m.checkedAt = now()
      }
      return bundle(me.id)
    }
    if (what === 'messages' && method === 'POST' && sub === 'questions') {
      msg(id).questions.push({ id: `q-${next++}`, askedBy: me.id, text: String(body.text ?? ''), at: now(), answer: '', answeredAt: null })
      return bundle(me.id)
    }
    if (what === 'messages' && method === 'POST' && sub === 'comments') {
      msg(id).comments.push({ id: `c-${next++}`, by: me.id, text: String(body.text ?? ''), at: now() })
      return bundle(me.id)
    }
    if (what === 'statements' && sub === 'vote') {
      const st = [...groups()].map(([key]) => key).find(key => idOf(key) === id)
      if (!st) throw new Refused(404, `Statement ${id} not found`)
      const state = stored(st)
      need(me, 'voter', scopeOf(st.split('::')[0]), 'Voting')
      if (state.decision) throw new Refused(409, 'This statement has been decided.')
      const vote: Vote = { adminId: me.id, approve: !!body.approve, deny: !!body.deny, passed: !!body.passed, approveNote: String(body.approveNote ?? ''), denyNote: String(body.denyNote ?? ''), passNote: String(body.passNote ?? ''), updatedAt: now() }
      state.votes = [...state.votes.filter(v => v.adminId !== me.id), vote]
      return bundle(me.id)
    }
    if (what === 'statements' && sub === 'decision') {
      const st = [...groups()].map(([key]) => key).find(key => idOf(key) === id)
      if (!st) throw new Refused(404, `Statement ${id} not found`)
      need(me, 'planner', scopeOf(st.split('::')[0]), 'Deciding')
      const state = stored(st)
      state.decision = (body.decision as State['decision']) ?? null
      state.decisionNote = String(body.note ?? '')
      state.decidedAt = state.decision ? now() : null
      return bundle(me.id)
    }
    if (what === 'admins' && sub === 'roles') {
      const target = admins.find(a => a.id === id)
      if (!target) throw new Refused(404, `Admin ${id} not found`)
      const scope = String(body.scope ?? '')
      const roles = (body.roles as Role[]) ?? []
      if (target.id === me.id && scope === INBOX && has(me, 'channelManager', INBOX) && !roles.includes('channelManager')) {
        throw new Refused(403, 'You cannot remove your own Channel manager role on Helper > Inbox.')
      }
      target.roles = { ...target.roles, [scope]: roles }
      roleHistory.push({ at: now(), adminId: me.id, kind: 'roles', detail: `${me.name} set ${target.name}'s roles on ${scope}` })
      return bundle(me.id)
    }
    if (what === 'verb-categories') {
      need(me, 'channelManager', INBOX, 'Changing the verbs')
      if (method === 'POST') verbs = [...verbs, { id: `verb-${next++}`, name: String(body.name ?? ''), keywords: (body.keywords as string[]) ?? [] }]
      if (method === 'PATCH') verbs = verbs.map(v => (v.id === id ? { ...v, ...(body.name !== undefined ? { name: String(body.name) } : {}), ...(body.keywords ? { keywords: body.keywords as string[] } : {}) } : v))
      if (method === 'DELETE') {
        if (messages.some(m => m.verbId === id)) throw new Refused(409, 'Feedback still uses this verb.')
        verbs = verbs.filter(v => v.id !== id)
      }
      return bundle(me.id)
    }
    throw new Refused(404, 'Not found')
  }

  return {
    // /staff... (adminId from the X-Admin-Id header)
    rosterRoute(method: string, parts: string[], body: unknown, adminId: string): { status: number; body: unknown } {
      try {
        return { status: 200, body: roster(method, parts, (body ?? {}) as Record<string, unknown>, adminId) }
      } catch (err) {
        if (err instanceof Refused) return { status: err.status, body: { detail: err.message } }
        throw err
      }
    },
    // /project-plan... (adminId from the X-Admin-Id header)
    planRoute(method: string, parts: string[], body: unknown, adminId: string): { status: number; body: unknown } {
      try {
        return { status: 200, body: plan(method, parts, (body ?? {}) as Record<string, unknown>, adminId) }
      } catch (err) {
        if (err instanceof Refused) return { status: err.status, body: { detail: err.message } }
        throw err
      }
    },
    // /feedback... (adminId from the X-Admin-Id header; the user's routes need none)
    route(method: string, parts: string[], body: unknown, query: URLSearchParams, adminId: string): { status: number; body: unknown } {
      const b = (body ?? {}) as Record<string, unknown>
      try {
        if (parts[0] === 'mine') return { status: 200, body: mine(query.get('authorId') ?? '') }
        if (parts[0] === 'verbs') return { status: 200, body: verbs }
        if (parts[0] === 'messages' && method === 'POST' && parts.length === 1) {
          const m = message(`fb-${next++}`, String(b.text ?? ''), String(b.authorId ?? ''), now(), (b.senderTone as Tone | null) ?? 'neutral', String(b.channelId ?? ''), String(b.verbId ?? ''))
          m.senderTone = (b.senderTone as Tone | null) ?? null
          m.fromChannel = (b.fromChannel as string | null) ?? null
          messages.push(m)
          return { status: 200, body: { id: m.id, submittedAt: m.submittedAt } }
        }
        if (parts[0] === 'messages' && parts[2] === 'questions' && parts[4] === 'answer') {
          const m = msg(parts[1])
          if (m.authorId !== b.authorId) throw new Refused(403, 'Only the writer can answer.')
          const q = m.questions.find(x => x.id === parts[3])
          if (!q) throw new Refused(404, 'Question not found')
          q.answer = String(b.answer ?? '')
          q.answeredAt = now()
          return { status: 200, body: mine(m.authorId) }
        }
        return { status: 200, body: staff(method, parts, b, adminId) }
      } catch (err) {
        if (err instanceof Refused) return { status: err.status, body: { detail: err.message } }
        throw err
      }
    },
  }
}
