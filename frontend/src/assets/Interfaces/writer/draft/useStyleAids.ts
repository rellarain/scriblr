import { useStoredState } from '../storage'
import { DEFAULT_AIDS, type StyleAids } from '../styleAids'

// The style aids' switches (the Draft's settings), kept on this machine for every chapter.
export const STYLE_AIDS_KEY = 'scriblr.writer.styleAids'

export function useStyleAids(): [StyleAids, (patch: Partial<StyleAids>) => void] {
  const [stored, setStored] = useStoredState<Partial<StyleAids>>(STYLE_AIDS_KEY, {})
  return [{ ...DEFAULT_AIDS, ...stored }, patch => setStored(prev => ({ ...prev, ...patch }))]
}
