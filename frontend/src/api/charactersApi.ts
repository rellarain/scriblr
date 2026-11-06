import { api } from './client'
import type { CharacterCreate, CharacterDoc, CharacterSummary } from './types'

// The project's cast. The list has names only; a character is read whole when it is opened and replaced whole when it is saved.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/characters`

export function listCharacters(projectId: string): Promise<CharacterSummary[]> {
  return api.get<CharacterSummary[]>(base(projectId))
}

export function createCharacter(projectId: string, body: CharacterCreate): Promise<CharacterDoc> {
  return api.post<CharacterDoc>(base(projectId), body)
}

export function getCharacter(projectId: string, characterId: string): Promise<CharacterDoc> {
  return api.get<CharacterDoc>(`${base(projectId)}/${encodeURIComponent(characterId)}`)
}

export function putCharacter(projectId: string, doc: CharacterDoc): Promise<CharacterDoc> {
  return api.put<CharacterDoc>(`${base(projectId)}/${encodeURIComponent(doc.id)}`, doc)
}

export function deleteCharacter(projectId: string, characterId: string): Promise<void> {
  return api.delete<void>(`${base(projectId)}/${encodeURIComponent(characterId)}`)
}
