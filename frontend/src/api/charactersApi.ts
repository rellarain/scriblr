import { api } from './client'
import type { CharacterCreate, CharacterDoc, CharacterSummary, ConvertBody, FrozenPortrait } from './types'

// The project's cast. The list has names only; a character is read whole when it is opened and replaced whole when it is saved.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/characters`

export function listCharacters(projectId: string): Promise<CharacterSummary[]> {
  return api.get<CharacterSummary[]>(base(projectId))
}

// Every character of the project, whole (what the Outline and the Draft read to show who is in a scene).
export function listAllCharacters(projectId: string): Promise<CharacterDoc[]> {
  return api.get<CharacterDoc[]>(`${base(projectId)}/all`)
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

// Convert a character's portrait to a mannequin (phase 6c-4): the portraits of it frozen in editions, keeping the converted figures of the character, its story looks and its editions
// in one write, and going back to the old portrait.
export function getFrozenPortraits(projectId: string, characterId: string): Promise<FrozenPortrait[]> {
  return api.get<FrozenPortrait[]>(`${base(projectId)}/${encodeURIComponent(characterId)}/frozen`)
}

export function convertCharacter(projectId: string, characterId: string, body: ConvertBody): Promise<CharacterDoc> {
  return api.post<CharacterDoc>(`${base(projectId)}/${encodeURIComponent(characterId)}/convert`, body)
}

export function revertCharacter(projectId: string, characterId: string): Promise<CharacterDoc> {
  return api.post<CharacterDoc>(`${base(projectId)}/${encodeURIComponent(characterId)}/revert`, {})
}
