import { useEffect, useSyncExternalStore } from 'react'
import { CURRENT_USER } from '../userSeed'
import { userFeedbackApi } from './feedbackApi'
import type { MineView, SendInput, Tone, VerbCategory } from './feedbackTypes'
import { FEEDBACK_CHANGED, refreshStaff } from './staffStore'

// The user's side of the feedback pipeline: what they sent from the Help tiles, where each stands, and the questions asked of
// them (answered here or on their dashboard), with the verbs they write statements with. Shared by every Help tile and the
// user's dashboard. The user is the one placeholder account (userSeed.ts) until there is a login.

export const authorId = () => CURRENT_USER.orgId || CURRENT_USER.displayName

export interface MineState {
  view: MineView
  verbs: VerbCategory[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

const EMPTY: MineView = { messages: [], openQuestions: 0 }
// What the server sent, with its lists always lists (an answer from an older or a stand-in server can leave them out).
const viewOf = (v: Partial<MineView> | null | undefined): MineView => ({
  messages: Array.isArray(v?.messages) ? v.messages : [], openQuestions: typeof v?.openQuestions === 'number' ? v.openQuestions : 0,
})
let state: MineState = { view: EMPTY, verbs: [], status: 'idle', error: null }
const listeners = new Set<() => void>()

function set(next: Partial<MineState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const getMineState = () => state

export async function loadMine(): Promise<void> {
  if (state.status === 'idle') set({ status: 'loading' })
  try {
    const [view, verbs] = await Promise.all([userFeedbackApi.mine(authorId()), userFeedbackApi.verbs()])
    set({ view: viewOf(view), verbs: Array.isArray(verbs) ? verbs : [], status: 'ready', error: null })
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'Your feedback could not be loaded.' })
  }
}

export async function sendFeedback(input: { text: string; senderTone: Tone | null; channelId: string; verbId: string; fromChannel: string | null }): Promise<boolean> {
  const body: SendInput = { ...input, author: CURRENT_USER.displayName, authorId: authorId() }
  try {
    await userFeedbackApi.send(body)
    set({ error: null })
    await loadMine()
    refreshStaff()
    return true
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'That could not be sent.' })
    return false
  }
}

export async function answerQuestion(messageId: string, questionId: string, answer: string): Promise<boolean> {
  try {
    const view = await userFeedbackApi.answer(authorId(), messageId, questionId, answer)
    set({ view: viewOf(view), error: null })
    refreshStaff()
    return true
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'That could not be sent.' })
    return false
  }
}

export function refreshMine() {
  if (state.status !== 'idle') void loadMine()
}

export function __resetMineForTests() {
  state = { view: EMPTY, verbs: [], status: 'idle', error: null }
  listeners.forEach(l => l())
}

function subscribeMine(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useMine(): MineState {
  const snapshot = useSyncExternalStore(subscribeMine, getMineState, getMineState)
  useEffect(() => {
    if (getMineState().status === 'idle') void loadMine()
    window.addEventListener(FEEDBACK_CHANGED, refreshMine)
    return () => window.removeEventListener(FEEDBACK_CHANGED, refreshMine)
  }, [])
  return snapshot
}
