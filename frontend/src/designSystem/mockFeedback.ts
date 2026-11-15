import type {
  FeedbackAdmin, FeedbackStatus, KeywordFlag, MineView, MyMessage, Role, StaffBundle, StaffMessage, Statement, StatusStep, Tone,
  ToneCategory, ToneSummary, VerbCategory,
} from '../feedback/feedbackTypes'

// The design system's pretend feedback store (backend storage/feedback.py, in memory): the same seed, the same statement
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

export function createMockFeedback() {
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
    return { status: 'planned', steps, note: st.decisionNote }
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
        decision: st.decision, decisionNote: st.decisionNote, decidedAt: st.decidedAt, work: null, history: hist(st.history),
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
