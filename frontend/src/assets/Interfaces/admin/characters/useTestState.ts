import { useCallback, useMemo, useState } from 'react'
import type { ModelContent, ModelFallSide, ModelPreset, ModelSwatch } from '../../../../api/types'
import { chosenCount, paletteOf, type Colouring, type SlotChoice, type SlotChoices } from './engine/colour'
import { formKey, type Choices } from './engine/forms'
import { applyPreset, awayCount, clearedBy, type TestState } from './engine/presets'
import { rollLook } from './engine/roll'
import type { Values } from './engine/rig'
import { seededRng, type Rng } from './engine/previews'

// What the admin has set up to look at the model, besides drawing it: the Try it sliders, the form each axis shows, the things switched off with the eye, and the
// colours of the test character (a palette of its own, the colour chosen for each slot, the genre the colours are drawn from) with the locks that keep things as
// they are when the look is rolled. It lives with the open model and is never saved (a preset is how a set of the first three is kept; the starter palette is how
// the palette is). `away` counts what is not at rest, for the toolbar.
export interface TestControls {
  state: TestState
  values: Values
  forms: Choices
  hidden: string[]
  // the side hanging things fall to (down, the picture's left or right, behind)
  fall: ModelFallSide
  setFall: (side: ModelFallSide) => void
  // the grip point a hand pose holds with now (marked on the canvas); a pose names it
  grip: string | null
  setGrip: (id: string | null) => void
  setValues: (change: Values | ((v: Values) => Values)) => void
  setForm: (objectId: string, axisId: string, formId: string) => void
  // a choice by its key: "objectId.axisId" (a form) or "class:classId" (the member of a family that is shown)
  setChoice: (key: string, option: string) => void
  toggleHidden: (id: string) => void
  // colour: the choice for each slot (none = gray), the test palette (null = the model's own), the genre colours are drawn from, the locks
  colours: SlotChoices
  palette: ModelSwatch[] | null
  genre: string | null
  locks: string[]
  setColour: (slotId: string, choice: SlotChoice | null) => void
  setPalette: (palette: ModelSwatch[] | null, choices?: SlotChoices) => void
  setGenre: (genreId: string | null) => void
  toggleLock: (id: string) => void
  // the colours as the canvas draws them
  colouring: (content: ModelContent) => Colouring
  // a new look: colours, a form on every axis and the member of every family, except for what is locked
  roll: (content: ModelContent, rng?: Rng) => void
  resetAll: () => void
  apply: (content: ModelContent, preset: ModelPreset) => void
  // turn a preset off: what its kind controls goes back to rest
  clear: (content: ModelContent, preset: ModelPreset) => void
  // switch several things off or on together (the groups of a model)
  setHidden: (ids: string[], hide: boolean) => void
  away: (content: ModelContent) => number
}

export function useTestState(): TestControls {
  const [values, setValues] = useState<Values>({})
  const [forms, setForms] = useState<Choices>({})
  const [hidden, setHidden] = useState<string[]>([])
  const [fall, setFall] = useState<ModelFallSide>('down')
  const [grip, setGrip] = useState<string | null>(null)
  const [colours, setColours] = useState<SlotChoices>({})
  const [palette, setPaletteState] = useState<ModelSwatch[] | null>(null)
  const [genre, setGenre] = useState<string | null>(null)
  const [locks, setLocks] = useState<string[]>([])
  const state = useMemo<TestState>(() => ({ values, forms, hidden, fall, grip }), [values, forms, hidden, fall, grip])
  const setForm = useCallback((objectId: string, axisId: string, formId: string) => setForms(f => ({ ...f, [formKey(objectId, axisId)]: formId })), [])
  const setChoice = useCallback((key: string, option: string) => setForms(f => ({ ...f, [key]: option })), [])
  const toggleHidden = useCallback((id: string) => setHidden(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id])), [])
  const setColour = useCallback((slotId: string, choice: SlotChoice | null) => setColours(cs => {
    if (choice) return { ...cs, [slotId]: choice }
    const { [slotId]: _gone, ...rest } = cs
    return rest
  }), [])
  const setPalette = useCallback((next: ModelSwatch[] | null, choices?: SlotChoices) => { setPaletteState(next); if (choices) setColours(choices) }, [])
  const toggleLock = useCallback((id: string) => setLocks(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])), [])
  const resetAll = useCallback(() => { setValues({}); setForms({}); setHidden([]); setFall('down'); setGrip(null); setColours({}); setPaletteState(null) }, [])
  const apply = useCallback((content: ModelContent, preset: ModelPreset) => {
    const next = applyPreset(content, state, preset)
    setValues(next.values); setForms(next.forms); setHidden(next.hidden); setFall(next.fall ?? 'down'); setGrip(next.grip ?? null)
  }, [state])
  const clear = useCallback((content: ModelContent, preset: ModelPreset) => {
    const next = clearedBy(content, state, preset)
    setValues(next.values); setForms(next.forms); setHidden(next.hidden); setFall(next.fall ?? 'down'); setGrip(next.grip ?? null)
  }, [state])
  const setHiddenIds = useCallback((ids: string[], hide: boolean) => setHidden(h => (hide ? [...new Set([...h, ...ids])] : h.filter(x => !ids.includes(x)))), [])
  const away = useCallback((content: ModelContent) => awayCount(content, state) + chosenCount(content, colours) + (palette ? 1 : 0), [state, colours, palette])
  const colouring = useCallback((content: ModelContent): Colouring => ({ palette: palette ?? paletteOf(content), choices: colours, forms }), [palette, colours, forms])
  const roll = useCallback((content: ModelContent, rng: Rng = seededRng(Math.floor(Math.random() * 2 ** 31))) => {
    const next = rollLook(content, rng, { genre, locks, forms, choices: colours, palette: palette ?? paletteOf(content), fall })
    setForms(next.forms); setColours(next.choices); setFall(next.fall)
  }, [genre, locks, forms, colours, palette, fall])
  return { state, values, forms, hidden, fall, setFall, grip, setGrip, setValues, setForm, setChoice, toggleHidden, colours, palette, genre, locks, setColour, setPalette, setGenre, toggleLock, colouring, roll, resetAll, apply, clear, setHidden: setHiddenIds, away }
}
