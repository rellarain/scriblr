import type { ActionInput, Chat, ChatEvent, StaffChatView, UserChatView } from '../support/supportTypes'

// The design system's pretend support chats (backend storage/support.py, in memory): a user starts a chat in a console's queue,
// staff take it, talk, send guides, draft feedback, transfer, escalate and close it. Confirming drafted feedback calls `send`
// (the pretend feedback store), already checked by the staff member.

class Refused extends Error { constructor(public status: number, message: string) { super(message) } }

const scopeOf = (id: string) => id.split('/').slice(0, 2).join('/')
const now = () => new Date().toISOString()

export function createMockSupport(opts: {
  isConsole: (id: string) => boolean
  isNode: (id: string) => boolean
  staffKind: (id: string) => 'helper' | 'admin' | null
  // Who an empty or unknown X-Admin-Id header acts as (the backend acts as the first admin when there is none).
  actingAs?: (id: string) => string
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
      if (c.tier >= 3) throw new Refused(400, 'This chat is at the top tier already.')
      c.tier += 1; e.toTier = c.tier; back(c)
    } else if (a.action === 'closed') { c.status = 'closed'; c.stage = 'closing' }
    c.events.push(e)
    return staffView(me)
  }

  const wrap = <T,>(run: () => T): { status: number; body: unknown } => {
    try { return { status: 200, body: run() } } catch (err) { if (err instanceof Refused) return { status: err.status, body: { detail: err.message } }; throw err }
  }
  return {
    // /support... : the user's routes (mine, starting, messages, closing, confirming) and the staff's (X-Admin-Id).
    route(method: string, parts: string[], body: unknown, query: URLSearchParams, adminId: string): { status: number; body: unknown } {
      const b = (body ?? {}) as Record<string, unknown>
      const userSide = parts[0] === 'mine' || (parts[0] === 'chats' && method === 'POST' && parts.length === 1) || ['user-messages', 'user-close', 'drafts'].includes(parts[2] ?? '')
      return wrap(() => (userSide ? user(method, parts, b, query) : staff(method, parts, b, opts.actingAs ? opts.actingAs(adminId) : adminId)))
    },
  }
}
