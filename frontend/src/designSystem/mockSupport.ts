import type { Person } from '../staff/staffTypes'
import type { ActionInput, Chat, ChatEvent, LevelRanges, QueueLevel, QueueRow, QueueView, ScheduleBlock, StaffChatView, SwitchState, UserChatView } from '../support/supportTypes'

// The design system's pretend support chats (backend storage/support.py, in memory): a user starts a chat in a console's queue,
// staff take it, talk, send guides, draft feedback, transfer, escalate and close it. Confirming drafted feedback calls `send`
// (the pretend feedback store), already checked by the staff member. The queues (backend storage/queues.py): helper time by the
// week, levels by how many are waiting, the switchboard per tier and the next chat; everyone with helper hours except Noor is
// given a block around the time the store is made, so the cards show people on shift.

class Refused extends Error { constructor(public status: number, message: string) { super(message) } }

const scopeOf = (id: string) => id.split('/').slice(0, 2).join('/')
const now = () => new Date().toISOString()

export function createMockSupport(opts: {
  isConsole: (id: string) => boolean
  isNode: (id: string) => boolean
  staffKind: (id: string) => 'helper' | 'admin' | null
  // Who an empty or unknown X-Admin-Id header acts as (the backend acts as the first admin when there is none).
  actingAs?: (id: string) => string
  // The staff and their tiers per console (the pretend roster), and the console queues in the channel list's order.
  people?: () => Array<Omit<Person, 'tier'>>
  tierFor?: (pid: string, console: string) => number | null
  consoles?: () => string[]
  now?: () => Date
  send: (draft: { channelId: string; verbId: string; text: string; tone: string | null }, userId: string, userName: string, checkedBy: string) => string
  seed?: boolean
}) {
  let next = 1
  const ev = (over: Partial<ChatEvent> & Pick<ChatEvent, 'kind'>): ChatEvent => ({
    id: `ev-${next++}`, at: now(), by: 'system', staffId: '', text: '', nodeId: null, draft: null, toQueue: null, toTier: null, stage: null, ...over,
  })
  const chats: Chat[] = []
  if (opts.seed) {
    const t = '2026-11-15T09:00:00.000Z'
    chats.push(
      { id: 'chat-1', userId: 'm.okafor', userName: 'Mia Okafor', queue: 'reader/library', focal: 'reader/library/catalog', tier: 1, staffId: '', status: 'pending', stage: 'greeting', createdAt: t, waitingSince: t, events: [ev({ kind: 'userMessage', by: 'user', text: 'How do I search by author?' })] },
      { id: 'chat-2', userId: 'a.kim', userName: 'Avery Kim', queue: 'writer/draft', focal: 'writer/draft/draft', tier: 1, staffId: 'adm-dana', status: 'active', stage: 'issue', createdAt: t, waitingSince: t, events: [
        ev({ kind: 'userMessage', by: 'user', text: 'Pasting a chapter freezes the editor.' }), ev({ kind: 'taken', by: 'staff', staffId: 'adm-dana' }),
        ev({ kind: 'greeting', by: 'staff', staffId: 'adm-dana', text: 'Hi Avery, Dana here. How long is the chapter?' }), ev({ kind: 'userMessage', by: 'user', text: 'About 9,000 words.' }),
      ] },
    )
  }
  const chat = (id: string) => { const c = chats.find(x => x.id === id); if (!c) throw new Refused(404, `Chat ${id} not found`); return c }
  const strip = (c: Chat) => { const { events, ...rest } = c; return { ...rest, actions: events.filter(e => e.by !== 'user').map(e => e.kind) } }
  const mine = (userId: string): UserChatView => ({
    chats: chats.filter(c => userId && c.userId === userId).sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || b.createdAt.localeCompare(a.createdAt)).map(c => structuredClone(c)),
  })
  const staffView = (me: string): StaffChatView => ({
    next: nextFor(me),
    me,
    waiting: chats.filter(c => c.status === 'pending').sort((a, b) => a.waitingSince.localeCompare(b.waitingSince)).map(c => structuredClone(c)),
    mine: chats.filter(c => c.status === 'active' && c.staffId === me).map(c => structuredClone(c)),
    others: chats.filter(c => c.status === 'active' && c.staffId !== me).map(strip),
    closed: chats.filter(c => c.status === 'closed' && c.staffId === me).map(c => structuredClone(c)),
  })
  const text = (t: unknown) => { const s = String(t ?? '').trim(); if (!s) throw new Refused(400, 'Write something first.'); return s }
  const own = (c: Chat, userId: string) => { if (c.userId !== userId) throw new Refused(403, "This is someone else's chat."); if (c.status === 'closed') throw new Refused(400, 'This chat is closed.') }
  const inIt = (c: Chat, me: string) => { if (c.status !== 'active' || c.staffId !== me) throw new Refused(403, 'Take the chat first.') }
  const back = (c: Chat) => { c.status = 'pending'; c.staffId = ''; c.waitingSince = now(); c.stage = 'acknowledgement' }

  function user(method: string, parts: string[], body: Record<string, unknown>, query: URLSearchParams): UserChatView {
    const userId = String(body.userId ?? query.get('userId') ?? '')
    const [what, id, sub, eventId] = parts
    if (what === 'mine') return mine(userId)
    if (what === 'chats' && method === 'POST' && !id) {
      const focal = String(body.focal ?? '')
      if (!opts.isNode(focal)) throw new Refused(400, `No part of the app ${focal}.`)
      if (!opts.isConsole(scopeOf(focal))) throw new Refused(400, 'Support is by console: choose a part of the app inside a console.')
      const t = now()
      chats.push({ id: `chat-${next++}`, userId, userName: String(body.userName ?? ''), queue: scopeOf(focal), focal, tier: 1, staffId: '', status: 'pending', stage: 'greeting', createdAt: t, waitingSince: t, events: [ev({ kind: 'userMessage', by: 'user', text: text(body.text) })] })
      return mine(userId)
    }
    const c = chat(id)
    own(c, userId)
    if (sub === 'user-messages') c.events.push(ev({ kind: 'userMessage', by: 'user', text: text(body.text) }))
    else if (sub === 'user-close') { c.status = 'closed'; c.events.push(ev({ kind: 'closed', by: 'user' })) }
    else if (sub === 'drafts') {
      const e = c.events.find(x => x.id === eventId && x.kind === 'feedbackInitiated')
      if (!e?.draft) throw new Refused(404, 'No drafted feedback there.')
      if (e.draft.confirmed) throw new Refused(400, 'That feedback was sent already.')
      e.draft.messageId = opts.send(e.draft, userId, String(body.userName ?? ''), e.staffId)
      e.draft.confirmed = true
      c.events.push(ev({ kind: 'feedbackConfirmed', by: 'user', draft: { ...e.draft } }))
    }
    return mine(userId)
  }

  function staff(method: string, parts: string[], body: Record<string, unknown>, me: string): StaffChatView {
    if (!opts.staffKind(me)) throw new Refused(403, `Unknown admin '${me}'`)
    const [what, id, sub] = parts
    if (method === 'GET' && parts.length === 0) return staffView(me)
    if (what !== 'chats') throw new Refused(404, 'Not found')
    const c = chat(id)
    if (sub === 'take') {
      if (c.status !== 'pending') throw new Refused(400, c.status === 'active' ? 'Someone has this chat already.' : 'This chat is closed.')
      c.staffId = me; c.status = 'active'; c.events.push(ev({ kind: 'taken', by: 'staff', staffId: me }))
      return staffView(me)
    }
    inIt(c, me)
    if (sub === 'messages') {
      c.events.push(ev({ kind: opts.staffKind(me) === 'helper' ? 'helperMessage' : 'adminMessage', by: 'staff', staffId: me, text: text(body.text) }))
      return staffView(me)
    }
    const a = body as unknown as ActionInput
    const e = ev({ kind: a.action, by: 'staff', staffId: me, text: String(a.text ?? '') })
    if (a.action === 'stage' && a.stage) { c.stage = a.stage; e.stage = a.stage }
    else if (a.action === 'focal' && a.nodeId) { c.focal = a.nodeId; e.nodeId = a.nodeId }
    else if (a.action === 'resource' && a.nodeId) { e.nodeId = a.nodeId; c.stage = 'solution' }
    else if (a.action === 'feedbackInitiated' && a.draft) e.draft = { ...a.draft, text: text(a.draft.text), confirmed: false, messageId: null }
    else if (a.action === 'transfer') {
      if (!a.toQueue || !opts.isConsole(a.toQueue) || a.toQueue === c.queue) throw new Refused(400, "Transfer to another console's queue.")
      c.queue = a.toQueue; e.toQueue = a.toQueue; back(c)
    } else if (a.action === 'escalation') {
      if (c.tier >= 4) throw new Refused(400, 'This chat is at the top tier already.')
      c.tier += 1; e.toTier = c.tier; back(c)
    } else if (a.action === 'closed') { c.status = 'closed'; c.stage = 'closing' }
    c.events.push(e)
    return staffView(me)
  }

  // --- the queues ---------------------------------------------------------------------------------------------------------------
  const LEVEL_ORDER: QueueLevel[] = ['low', 'medium', 'high', 'urgent']
  const REQUIRED_UP_TO: Record<QueueLevel, number> = { low: 1, medium: 2, high: 3, urgent: 4 }
  const clock = () => (opts.now ? opts.now() : new Date())
  const people = () => (opts.people ? opts.people() : [])
  const consoles = () => (opts.consoles ? opts.consoles() : [])
  const tierFor = (pid: string, q: string) => (opts.tierFor ? opts.tierFor(pid, q) : null)
  const pad = (n: number) => String(n).padStart(2, '0')
  const weekday = (d: Date) => (d.getDay() + 6) % 7
  const weekOf = (d: Date) => { const m = new Date(d); m.setDate(d.getDate() - weekday(d)); return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}` }
  const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(d.getDate() + n); return x }
  const schedules: Record<string, Record<string, ScheduleBlock[]>> = {}
  const switchboard: Record<string, string[]> = {}
  let levels: LevelRanges = { medium: 3, high: 6, urgent: 10 }
  const queueLevels: Record<string, LevelRanges> = {}
  const overrides: Record<string, { level: QueueLevel; until: string }> = {}
  {
    const t = clock()
    for (const pp of people()) {
      if (!pp.allotment) continue
      const hours = Math.min(4, pp.allotment)
      const day = pp.id === 'hlp-noor' ? (weekday(t) + 1) % 7 : weekday(t)
      schedules[pp.id] = { [weekOf(t)]: [{ day, start: Math.max(0, Math.min(t.getHours() - 1, 24 - hours)), hours }] }
    }
  }
  const scheduleFor = (pid: string, week: string): { blocks: ScheduleBlock[]; own: boolean } => {
    const weeks = schedules[pid] ?? {}
    if (weeks[week]) return { blocks: weeks[week], own: true }
    const earlier = Object.keys(weeks).filter(k => k < week).sort()
    return { blocks: earlier.length ? weeks[earlier[earlier.length - 1]] : [], own: false }
  }
  const person = (id: string) => { const pp = people().find(x => x.id === id); if (!pp) throw new Refused(404, `No staff member ${id}`); return pp }
  const onShift = (pp: Omit<Person, 'tier'>, now: Date) => {
    if (!pp.active || !pp.allotment) return false
    const hour = now.getHours() + now.getMinutes() / 60
    return scheduleFor(pp.id, weekOf(now)).blocks.some(b => b.day === weekday(now) && b.start <= hour && hour < b.start + b.hours)
  }
  const rangesOf = (q: string) => queueLevels[q] ?? levels
  const autoLevel = (r: LevelRanges, n: number): QueueLevel => (n >= r.urgent ? 'urgent' : n >= r.high ? 'high' : n >= r.medium ? 'medium' : 'low')
  const activeOverride = (q: string, now: Date) => { const o = overrides[q]; return o && new Date(o.until) > now ? o : null }
  const pendingIn = (q: string) => chats.filter(c => c.status === 'pending' && c.queue === q).sort((a, b) => a.waitingSince.localeCompare(b.waitingSince))
  const levelOf = (q: string, now: Date): QueueLevel => {
    const auto = autoLevel(rangesOf(q), pendingIn(q).length)
    const o = activeOverride(q, now)
    return o && LEVEL_ORDER.indexOf(o.level) > LEVEL_ORDER.indexOf(auto) ? o.level : auto
  }
  const stateOf = (pp: Omit<Person, 'tier'>, q: string, level: QueueLevel, shift: boolean): SwitchState | null => {
    const tier = tierFor(pp.id, q)
    if (tier === null) return null
    if (!shift) return 'unavailable'
    if (tier <= REQUIRED_UP_TO[level]) return 'required'
    return (switchboard[pp.id] ?? []).includes(q) ? 'on' : 'off'
  }
  const onFor = (pp: Omit<Person, 'tier'>, now: Date) => {
    const shift = onShift(pp, now)
    const out = new Map<string, number>()
    for (const q of consoles()) { const st = stateOf(pp, q, levelOf(q, now), shift); if (st === 'required' || st === 'on') out.set(q, tierFor(pp.id, q) ?? 0) }
    return out
  }
  function nextFor(me: string): string | null {
    const pp = people().find(x => x.id === me)
    if (!pp) return null
    const now = clock()
    const mine = onFor(pp, now)
    if (!mine.size) return null
    const others = people().filter(x => x.id !== me).map(x => onFor(x, now))
    const covered = (q: string, lo: number, hi: number) => others.some(on => { const t = on.get(q) ?? 0; return lo <= t && t <= hi })
    let best: { key: [number, number, string]; id: string } | null = null
    for (const [q, tier] of mine) {
      const rank = LEVEL_ORDER.indexOf(levelOf(q, now))
      for (const c of pendingIn(q)) {
        if (c.tier > tier) continue
        const own = c.tier === tier
        if (!own && rank < 2 && covered(q, c.tier, tier - 1)) continue
        const key: [number, number, string] = [own ? 0 : 1, -rank, c.waitingSince]
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key, id: c.id }
      }
    }
    return best?.id ?? null
  }
  const manages = (pp: Omit<Person, 'tier'>, q: string | null) => pp.active && (q ? pp.supports.includes(q) : pp.supports.length > 0)
  const week = (pid: string, start: string) => { const { blocks, own } = scheduleFor(pid, start); return { start, blocks: blocks.map(b => ({ ...b })), hours: blocks.reduce((n, b) => n + b.hours, 0), own } }
  function queueView(me: string): QueueView {
    const pp = person(me)
    const now = clock()
    const all = people()
    const names = new Map(all.map(x => [x.id, x.name]))
    const active = chats.filter(c => c.status === 'active')
    const chatting = new Set(active.map(c => c.staffId))
    const shifts = new Map(all.map(x => [x.id, onShift(x, now)]))
    const queues: QueueRow[] = consoles().map(q => {
      const level = levelOf(q, now)
      const waiting = pendingIn(q)
      const o = activeOverride(q, now)
      const row: QueueRow = {
        id: q, pending: waiting.length, level, autoLevel: autoLevel(rangesOf(q), waiting.length), override: o ? { ...o } : null,
        ranges: { ...rangesOf(q) }, ownRanges: q in queueLevels, myTier: tierFor(me, q), myState: stateOf(pp, q, level, shifts.get(me) ?? false),
        canManage: manages(pp, q), staff: [], chats: [], waiting: [],
      }
      if (pp.kind === 'admin') {
        for (const x of all) {
          const tier = tierFor(x.id, q)
          if (tier === null) continue
          const st = stateOf(x, q, level, shifts.get(x.id) ?? false)
          const busy = active.some(c => c.staffId === x.id && c.queue === q)
          row.staff.push({ id: x.id, name: x.name, tier, state: busy ? 'active' : (st === 'required' || st === 'on') && !chatting.has(x.id) ? 'idle' : 'inactive' })
        }
        const at = { active: 0, idle: 1, inactive: 2 }
        row.staff.sort((a, b) => at[a.state] - at[b.state] || a.tier - b.tier || a.name.localeCompare(b.name))
        row.chats = active.filter(c => c.queue === q).map(c => ({ id: c.id, staffId: c.staffId, staffName: names.get(c.staffId) ?? c.staffId, userName: c.userName, focal: c.focal, stage: c.stage, tier: c.tier, createdAt: c.createdAt, actions: c.events.filter(e => e.by !== 'user').map(e => e.kind) }))
        row.waiting = waiting.map(c => ({ id: c.id, userName: c.userName, focal: c.focal, tier: c.tier, waitingSince: c.waitingSince }))
      }
      return row
    })
    return {
      me: { id: pp.id, name: pp.name, kind: pp.kind, allotment: pp.allotment, onShift: shifts.get(me) ?? false, thisWeek: week(me, weekOf(now)), nextWeek: week(me, weekOf(plusDays(now, 7))), managesAny: manages(pp, null) },
      today: weekday(now), levels: { ...levels }, queues, next: nextFor(me),
    }
  }
  const ordered = (r: LevelRanges) => [r.medium, r.high, r.urgent].every(n => Number.isInteger(n) && n >= 1 && n <= 999) && r.medium < r.high && r.high < r.urgent
  function queueRoute(method: string, what: string, body: Record<string, unknown>, me: string): QueueView {
    const pp = person(me)
    const now = clock()
    if (what === 'queues' && method === 'GET') return queueView(me)
    if (what === 'schedule' && method === 'PUT') {
      if (!pp.allotment) throw new Refused(400, 'No helper hours are allotted to you.')
      const blocks = ((body.blocks as ScheduleBlock[] | undefined) ?? []).map(b => ({ day: Number(b.day), start: Number(b.start), hours: Number(b.hours) })).sort((a, b) => a.day - b.day)
      if (blocks.some(b => !(b.day >= 0 && b.day <= 6 && b.start >= 0 && b.start <= 23 && b.hours >= 1 && b.hours <= 12))) throw new Refused(400, 'A block is a day, a start hour and 1 to 12 hours.')
      if (new Set(blocks.map(b => b.day)).size !== blocks.length) throw new Refused(400, 'One block a day.')
      if (blocks.some(b => b.start + b.hours > 24)) throw new Refused(400, 'A block ends by midnight.')
      const total = blocks.reduce((n, b) => n + b.hours, 0)
      if (total > pp.allotment) throw new Refused(400, `That is ${total} hours; you have ${pp.allotment} a week.`)
      schedules[me] = { ...(schedules[me] ?? {}), [weekOf(plusDays(now, 7))]: blocks }
      return queueView(me)
    }
    if (what === 'switchboard' && method === 'PUT') {
      const q = String(body.queue ?? '')
      if (!consoles().includes(q)) throw new Refused(400, `No console queue ${q}.`)
      if (tierFor(me, q) === null) throw new Refused(400, 'You have no tier on this console.')
      if (!body.on && stateOf(pp, q, levelOf(q, now), true) === 'required') throw new Refused(400, 'This queue is required at its level.')
      switchboard[me] = [...(switchboard[me] ?? []).filter(x => x !== q), ...(body.on ? [q] : [])]
      return queueView(me)
    }
    if (what === 'levels' && method === 'PUT') {
      const q = (body.queue as string | null | undefined) ?? null
      if (q !== null && !consoles().includes(q)) throw new Refused(400, `No console queue ${q}.`)
      if (!manages(pp, q)) throw new Refused(400, q ? "Only the queue's channel support sets its levels." : 'Only channel support sets the default levels.')
      const r = (body.ranges as LevelRanges | null | undefined) ?? null
      if (r && !ordered(r)) throw new Refused(400, 'The ranges go up: medium below high below urgent.')
      if (q === null) { if (!r) throw new Refused(400, 'The default needs its ranges.'); levels = { ...r } } else if (r) { queueLevels[q] = { ...r } } else { delete queueLevels[q] }
      return queueView(me)
    }
    if (what === 'overrides' && method === 'PUT') {
      const q = String(body.queue ?? '')
      if (!consoles().includes(q)) throw new Refused(400, `No console queue ${q}.`)
      if (!manages(pp, q)) throw new Refused(400, "Only the queue's channel support raises its level.")
      const level = (body.level as QueueLevel | null | undefined) ?? null
      if (!level) { delete overrides[q]; return queueView(me) }
      const hours = Number(body.hours ?? 4)
      if (!(hours >= 1 && hours <= 24)) throw new Refused(400, 'An override lasts 1 to 24 hours.')
      overrides[q] = { level, until: new Date(now.getTime() + hours * 3600_000).toISOString() }
      return queueView(me)
    }
    throw new Refused(404, 'Not found')
  }

  const wrap = <T,>(run: () => T): { status: number; body: unknown } => {
    try { return { status: 200, body: run() } } catch (err) { if (err instanceof Refused) return { status: err.status, body: { detail: err.message } }; throw err }
  }
  return {
    // /support... : the user's routes (mine, starting, messages, closing, confirming) and the staff's (X-Admin-Id).
    route(method: string, parts: string[], body: unknown, query: URLSearchParams, adminId: string): { status: number; body: unknown } {
      const b = (body ?? {}) as Record<string, unknown>
      const userSide = parts[0] === 'mine' || (parts[0] === 'chats' && method === 'POST' && parts.length === 1) || ['user-messages', 'user-close', 'drafts'].includes(parts[2] ?? '')
      const me = opts.actingAs ? opts.actingAs(adminId) : adminId
      if (['queues', 'schedule', 'switchboard', 'levels', 'overrides'].includes(parts[0] ?? '')) return wrap(() => queueRoute(method, parts[0], b, me))
      return wrap(() => (userSide ? user(method, parts, b, query) : staff(method, parts, b, me)))
    },
  }
}
