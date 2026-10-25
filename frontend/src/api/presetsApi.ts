import { api } from './client'
import type { PresetCatalog, PresetDraftList, PublishedPresetList } from './types'

// The whole catalog as the admin page edits it: every preset's draft, published copy and earlier versions.
export function getPresets(): Promise<PresetCatalog> {
  return api.get<PresetCatalog>('/presets')
}

// Saves the drafts in order; published copies and history are kept, and a preset left out is deleted.
export function putPresets(drafts: PresetDraftList): Promise<PresetCatalog> {
  return api.put<PresetCatalog>('/presets', drafts)
}

// What the Writer's "+ Preset" offers: the published copies only.
export function getPublishedPresets(): Promise<PublishedPresetList> {
  return api.get<PublishedPresetList>('/presets/published')
}

const id = encodeURIComponent

// Freezes the draft as the next published version.
export function publishPreset(presetId: string): Promise<PresetCatalog> {
  return api.post<PresetCatalog>(`/presets/${id(presetId)}/publish`)
}

// Takes the preset out of the Writer's list; its versions are kept.
export function unpublishPreset(presetId: string): Promise<PresetCatalog> {
  return api.post<PresetCatalog>(`/presets/${id(presetId)}/unpublish`)
}

// Puts the draft back to the published copy.
export function discardPresetChanges(presetId: string): Promise<PresetCatalog> {
  return api.post<PresetCatalog>(`/presets/${id(presetId)}/discard`)
}

// Brings an earlier published version into the draft (it is not published again until Publish).
export function restorePresetVersion(presetId: string, version: number): Promise<PresetCatalog> {
  return api.post<PresetCatalog>(`/presets/${id(presetId)}/restore/${version}`)
}
