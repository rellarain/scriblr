import { api, type ApiHeaders } from '../api/client'
import type { ActionInput, LevelRanges, QueueLevel, QueueView, ScheduleBlock, StaffChatView, UserChatView } from './supportTypes'

// The support routes (backend/app/api/support.py). The user's side needs no admin; staff calls name the staff member acting.

const as = (adminId: string): ApiHeaders | undefined => (adminId ? { 'X-Admin-Id': adminId } : undefined)
const id = encodeURIComponent

export const userSupportApi = {
  mine: (userId: string) => api.get<UserChatView>(`/support/mine?userId=${id(userId)}`),
  start: (userId: string, userName: string, focal: string, text: string) => api.post<UserChatView>('/support/chats', { userId, userName, focal, text }),
  send: (userId: string, chatId: string, text: string) => api.post<UserChatView>(`/support/chats/${id(chatId)}/user-messages`, { userId, text }),
  close: (userId: string, chatId: string) => api.post<UserChatView>(`/support/chats/${id(chatId)}/user-close`, { userId }),
  confirm: (userId: string, userName: string, chatId: string, eventId: string) =>
    api.post<UserChatView>(`/support/chats/${id(chatId)}/drafts/${id(eventId)}/confirm`, { userId, userName }),
}

export const staffSupportApi = {
  load: (a: string) => api.get<StaffChatView>('/support', as(a)),
  take: (a: string, chatId: string) => api.post<StaffChatView>(`/support/chats/${id(chatId)}/take`, undefined, as(a)),
  send: (a: string, chatId: string, text: string) => api.post<StaffChatView>(`/support/chats/${id(chatId)}/messages`, { text }, as(a)),
  act: (a: string, chatId: string, input: ActionInput) => api.post<StaffChatView>(`/support/chats/${id(chatId)}/actions`, input, as(a)),
}

// The Queue console (helper time, the switchboard, levels), each answered with the whole queue view.
export const queueApi = {
  load: (a: string) => api.get<QueueView>('/support/queues', as(a)),
  schedule: (a: string, blocks: ScheduleBlock[]) => api.put<QueueView>('/support/schedule', { blocks }, as(a)),
  setSwitch: (a: string, queue: string, on: boolean) => api.put<QueueView>('/support/switchboard', { queue, on }, as(a)),
  setRanges: (a: string, queue: string | null, ranges: LevelRanges | null) => api.put<QueueView>('/support/levels', { queue, ranges }, as(a)),
  setOverride: (a: string, queue: string, level: QueueLevel | null, hours: number) => api.put<QueueView>('/support/overrides', { queue, level, hours }, as(a)),
  // Start or end the staff member's break; the break allowance (an admin), minutes earned per hour worked.
  setBreak: (a: string, on: boolean) => api.put<QueueView>('/support/break', { on }, as(a)),
  setBreakRate: (a: string, minutes: number) => api.put<QueueView>('/support/break-rate', { minutes }, as(a)),
}
