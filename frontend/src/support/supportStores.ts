import { useEffect, useSyncExternalStore } from 'react'
import { getStaffState, refreshStaff, subscribeStaff } from '../feedback/staffStore'
import { refreshMine } from '../feedback/mineStore'
import { CURRENT_USER } from '../userSeed'
import { staffSupportApi, userSupportApi } from './supportApi'
import type { ActionInput, StaffChatView, UserChatView } from './supportTypes'

// The two sides of support chat: the user's chats (every Help tile) and the staff view (the Helper panel, the Queue console).
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

const EMPTY_STAFF: StaffChatView = { me: '', waiting: [], mine: [], others: [], closed: [] }
const staffStore = makeStore<StaffChatView>(EMPTY_STAFF)
const staffView = (v: StaffChatView | undefined): StaffChatView => ({
  me: v?.me ?? '', waiting: list(v?.waiting), mine: list(v?.mine), others: list(v?.others), closed: list(v?.closed),
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

export function __resetSupportForTests() {
  userStore.reset()
  staffStore.reset()
  actingFor = ''
}
