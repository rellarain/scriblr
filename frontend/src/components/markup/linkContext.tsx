import { createContext, useContext, useEffect, useMemo } from 'react'
import type { TrainingContent, TrainingContentDraft } from '../../api/types'
import { useResourcesFile } from '../../channels/resourcesStore'
import { loadLearning, useLearning } from '../../assets/Interfaces/learning/learningStore'
import { headingsOf, type LinkContext, type LinkTarget } from '../../lib/markup/links'

// What a markup text's links resolve against: the Resources file and the Training courses, loaded only when the text has links (`enabled`),
// and the text's own headings. `training` replaces the saved courses while they are being edited (the Instructor's draft).
export function useLinkContext(text: string, enabled: boolean, training?: TrainingContentDraft): LinkContext {
  const { file } = useResourcesFile(enabled)
  const saved = useLearning()
  useEffect(() => { if (enabled && !training) void loadLearning() }, [enabled, training])
  const headings = useMemo(() => headingsOf(text), [text])
  const courses = useMemo<TrainingContent | null>(() => (training ? { schemaVersion: 2, ...training } : saved.training?.content ?? null), [training, saved.training])
  return useMemo(() => ({ resources: file, training: courses, headings }), [file, courses, headings])
}

export const LinkCtx = createContext<LinkContext | null>(null)
export const useLinks = () => useContext(LinkCtx)

// Where a link opens: the nearest MarkupPlace (a Help tile's guides, a lesson). `from` is the link, which gets the focus back on Back.
export interface Place { open: (target: LinkTarget, from: HTMLElement) => void }
export const PlaceCtx = createContext<Place | null>(null)
export const usePlace = () => useContext(PlaceCtx)
