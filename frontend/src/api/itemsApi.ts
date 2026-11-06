import { api } from './client'
import type { ItemCreate, ItemDoc, ItemSummary } from './types'

// The project's items (the library of things that change hands). The list has names only; an item is read whole when it is opened and replaced whole when it is saved.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/items`

export function listItems(projectId: string): Promise<ItemSummary[]> {
  return api.get<ItemSummary[]>(base(projectId))
}

// Every item of the project, whole (what the characters' pages read to show what they carry).
export function listAllItems(projectId: string): Promise<ItemDoc[]> {
  return api.get<ItemDoc[]>(`${base(projectId)}/all`)
}

export function createItem(projectId: string, body: ItemCreate): Promise<ItemDoc> {
  return api.post<ItemDoc>(base(projectId), body)
}

export function getItem(projectId: string, itemId: string): Promise<ItemDoc> {
  return api.get<ItemDoc>(`${base(projectId)}/${encodeURIComponent(itemId)}`)
}

export function putItem(projectId: string, doc: ItemDoc): Promise<ItemDoc> {
  return api.put<ItemDoc>(`${base(projectId)}/${encodeURIComponent(doc.id)}`, doc)
}

export function deleteItem(projectId: string, itemId: string): Promise<void> {
  return api.delete<void>(`${base(projectId)}/${encodeURIComponent(itemId)}`)
}
