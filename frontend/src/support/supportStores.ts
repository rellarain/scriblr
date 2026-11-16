import { useEffect, useSyncExternalStore } from 'react'
import { getStaffState, refreshStaff, subscribeStaff } from '../feedback/staffStore'
import { refreshMine } from '../feedback/mineStore'
import { CURRENT_USER } from '../userSeed'
import { queueApi, staffSupportApi, userSupportApi } from './supportApi'
import type { ActionInput, QueueView, StaffChatView, UserChatView } from './supportTypes'

// The two sides of support chat: the user's chats (every Help tile) and the staff view (the Helper panel, the Queue console),
// and the Queue console's own view (helper time, the switchboard, levels).
// Both read the same backend; a change on one side tells the other to read again (SUPPORT_CHANGED), so a message sent in a
// Help tile shows in the Helper panel at once and the other way round. The user is the one local account (userSeed.ts).

export const SUPPORT_CHANGED = 'scriblr:support'
export const userId = () => CURRENT_USER.orgId || CURRENT_USER.displayName
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(SUPPORT_CHANGED)) }
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

interface Store<V> {
  view: V
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

function makeStore<V>(empty: V) {
  let state: Store<V> = { view: empty, status: 'idle', error: null }
  const listeners = new Set<() => void>()
  let queue: Promise<unknown> = Promise.resolve()
  // Bumped on reset, so an answer that arrives afterwards is dropped.
  let gen = 0
  return {
    get: () => state,
    gen: () => gen,
    set(next: Partial<Store<V>>) { state = { ...state, ...next }; listeners.forEach(l => l()) },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
    // Runs changes one at a time, in order.
    serial<T>(task: () => Promise<T>): Promise<T> { const t = queue.then(task); queue = t.catch(() => undefined); return t },
    reset() { gen += 1; state = { view: empty, status: 'idle', error: null }; queue = Promise.resolve(); listeners.forEach(l => l()) },
  }
}

const list = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])

// --- the user's side ---------------------------------------------------------------------------------------------------------

const userStore = makeStore<UserChatView>({ chats: [] })
const userView = (v: UserChatView | undefined): UserChatView => ({ chats: list(v?.chats) })

export async function loadUserChats(): Promise<void> {
  const g = userStore.gen()
  if (userStore.get().status === 'idle') userStore.set({ status: 'loading' })
  try {
    const view = userView(await userSupportApi.mine(userId()))
    if (g === userStore.gen()) userStore.set({ view, status: 'ready', error: null })
  } catch (err) {
    if (g === userStore.gen()) userStore.set({ status: 'error', error: message(err, 'Your chats could not be loaded.') })
  }
}

function userChange(run: () => Promise<UserChatView>): Promise<boolean> {
  return userStore.serial(async () => {
    try {
      userStore.set({ view: userView(await run()), status: 'ready', error: null })
      changed()
      return true
    } catch (err) {
      userStore.set({ error: message(err, 'That could not be sent.') })
      return false
    }
  })
}

export const startChat = (focal: string, text: string) => userChange(() => userSupportApi.start(userId(), CURRENT_USER.displayName, focal, text))
export const sendUserMessage = (chatId: string, text: string) => userChange(() => userSupportApi.send(userId(), chatId, text))
export const closeUserChat = (chatId: string) => userChange(() => userSupportApi.close(userId(), chatId))
export async function confirmDraft(chatId: string, eventId: string): Promise<boolean> {
  const ok = await userChange(() => userSupportApi.confirm(userId(), CURRENT_USER.displayName, chatId, eventId))
  // The feedback is the user's now: My feedback and the Inbox show it.
  if (ok) { refreshMine(); refreshStaff() }
  return ok
}
export const clearUserChatError = () => userStore.set({ error: null })

export function useUserChats() {
  const snapshot = useSyncExternalStore(userStore.subscribe, userStore.get, userStore.get)
  useEffect(() => {
    if (userStore.get().status === 'idle') void loadUserChats()
    const again = () => { if (userStore.get().status !== 'idle') void loadUserChats() }
    window.addEventListener(SUPPORT_CHANGED, again)
    return () => window.removeEventListener(SUPPORT_CHANGED, again)
  }, [])
  return snapshot
}

// --- the staff side ----------------------------------------------------------------------------------------------------------

const EMPTY_STAFF: StaffChatView = { me: '', waiting: [], mine: [], others: [], closed: [], next: null }
const staffStore = makeStore<StaffChatView>(EMPTY_STAFF)
const staffView = (v: StaffChatView | undefined): StaffChatView => ({
  me: v?.me ?? '', waiting: list(v?.waiting), mine: list(v?.mine), others: list(v?.others), closed: list(v?.closed), next: v?.next ?? null,
})
let actingFor = ''

export async function loadStaffChats(): Promise<void> {
  const g = staffStore.gen()
  actingFor = getStaffState().adminId
  if (staffStore.get().status === 'idle') staffStore.set({ status: 'loading' })
  try {
    const view = staffView(await staffSupportApi.load(actingFor))
    if (g === staffStore.gen()) staffStore.set({ view, status: 'ready', error: null })
  } catch (err) {
    if (g === staffStore.gen()) staffStore.set({ status: 'error', error: message(err, 'The chats could not be loaded.') })
  }
}

function staffChange(run: (adminId: string) => Promise<StaffChatView>): Promise<boolean> {
  return staffStore.serial(async () => {
    try {
      staffStore.set({ view: staffView(await run(getStaffState().adminId)), status: 'ready', error: null })
      changed()
      return true
    } catch (err) {
      staffStore.set({ error: message(err, 'That could not be done.') })
      return false
    }
  })
}

export const takeChat = (chatId: string) => staffChange(a => staffSupportApi.take(a, chatId))
export const sendStaffMessage = (chatId: string, text: string) => staffChange(a => staffSupportApi.send(a, chatId, text))
export const chatAction = (chatId: string, input: ActionInput) => staffChange(a => staffSupportApi.act(a, chatId, input))
export const clearStaffChatError = () => staffStore.set({ error: null })
export const getStaffChats = () => staffStore.get()

export function useStaffChats() {
  const snapshot = useSyncExternalStore(staffStore.subscribe, staffStore.get, staffStore.get)
  useEffect(() => {
    if (staffStore.get().status === 'idle') void loadStaffChats()
    const again = () => { if (staffStore.get().status !== 'idle') void loadStaffChats() }
    window.addEventListener(SUPPORT_CHANGED, again)
    const unsub = subscribeStaff(() => { if (getStaffState().adminId !== actingFor) again() })
    return () => { window.removeEventListener(SUPPORT_CHANGED, again); unsub() }
  }, [])
  return snapshot
}

// --- the queues --------------------------------------------------------------------------------------------------------------

const queueStore = makeStore<QueueView | null>(null)
let queueActingFor = ''
// An answer without the staff member or the queue list is no view (null): the console shows that it is loading or failed.
const queueViewOf = (v: QueueView | null | undefined): QueueView | null => {
  if (!v || !v.me || !Array.isArray(v.queues)) return null
  const week = (w: QueueView['me']['thisWeek'] | undefined) => ({ start: w?.start ?? '', blocks: list(w?.blocks), hours: w?.hours ?? 0, own: !!w?.own })
  return {
    ...v,
    me: { ...v.me, thisWeek: week(v.me.thisWeek), nextWeek: week(v.me.nextWeek) },
    weeks: list(v.weeks).map(w => ({ id: w.id, thisWeek: week(w.thisWeek), nextWeek: week(w.nextWeek) })),
    levels: v.levels ?? { medium: 3, high: 6, urgent: 10 },
    queues: v.queues.map(q => ({ ...q, staff: list(q.staff), chats: list(q.chats), waiting: list(q.waiting) })),
    next: v.next ?? null,
  }
}

export async function loadQueues(): Promise<void> {
  const g = queueStore.gen()
  queueActingFor = getStaffState().adminId
  if (queueStore.get().status === 'idle') queueStore.set({ status: 'loading' })
  try {
    const view = queueViewOf(await queueApi.load(queueActingFor))
    if (g === queueStore.gen()) queueStore.set({ view, status: 'ready', error: null })
  } catch (err) {
    if (g === queueStore.gen()) queueStore.set({ status: 'error', error: message(err, 'The queues could not be loaded.') })
  }
}

function queueChange(run: (adminId: string) => Promise<QueueView>): Promise<boolean> {
  return queueStore.serial(async () => {
    try {
      queueStore.set({ view: queueViewOf(await run(getStaffState().adminId)), status: 'ready', error: null })
      // What is next for the staff member, and the sidebar's meter, follow.
      changed()
      return true
    } catch (err) {
      queueStore.set({ error: message(err, 'That could not be changed.') })
      return false
    }
  })
}

export const saveSchedule = (blocks: Parameters<typeof queueApi.schedule>[1]) => queueChange(a => queueApi.schedule(a, blocks))
export const setQueueSwitch = (queue: string, on: boolean) => queueChange(a => queueApi.setSwitch(a, queue, on))
export const setQueueRanges = (queue: string | null, ranges: Parameters<typeof queueApi.setRanges>[2]) => queueChange(a => queueApi.setRanges(a, queue, ranges))
export const setQueueOverride = (queue: string, level: Parameters<typeof queueApi.setOverride>[2], hours: number) => queueChange(a => queueApi.setOverride(a, queue, level, hours))
export const clearQueueError = () => queueStore.set({ error: null })

export function useQueues() {
  const snapshot = useSyncExternalStore(queueStore.subscribe, queueStore.get, queueStore.get)
  useEffect(() => {
    if (queueStore.get().status === 'idle') void loadQueues()
    const again = () => { if (queueStore.get().status !== 'idle') void loadQueues() }
    window.addEventListener(SUPPORT_CHANGED, again)
    const unsub = subscribeStaff(() => { if (getStaffState().adminId !== queueActingFor) again() })
    return () => { window.removeEventListener(SUPPORT_CHANGED, again); unsub() }
  }, [])
  return snapshot
}

// The sidebar's queue meter: the chats this staff member is in, and the ones waiting in the queues that are on for them (all
// waiting chats until the queues are loaded), each split into first-tier and escalated ones.
export function useQueueMeter() {
  const { view: chats } = useStaffChats()
  const { view: queues } = useQueues()
  const on = queues ? new Set(queues.queues.filter(q => q.myState === 'required' || q.myState === 'on').map(q => q.id)) : null
  const tierOf = queues ? new Map(queues.queues.map(q => [q.id, q.myTier ?? 0])) : null
  const waiting = chats.waiting.filter(c => !on || (on.has(c.queue) && c.tier <= (tierOf?.get(c.queue) ?? 0)))
  return {
    activeEscalated: chats.mine.filter(c => c.tier > 1).length,
    activeFirst: chats.mine.filter(c => c.tier <= 1).length,
    waitingEscalated: waiting.filter(c => c.tier > 1).length,
    waitingFirst: waiting.filter(c => c.tier <= 1).length,
  }
}

export function __resetSupportForTests() {
  userStore.reset()
  staffStore.reset()
  queueStore.reset()
  actingFor = ''
  queueActingFor = ''
}
