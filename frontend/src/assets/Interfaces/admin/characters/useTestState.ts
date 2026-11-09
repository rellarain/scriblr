import { useCallback, useMemo, useState } from 'react'
import type { ModelContent, ModelPreset } from '../../../../api/types'
import { formKey, type Choices } from './engine/forms'
import { applyPreset, awayCount, type TestState } from './engine/presets'
import type { Values } from './engine/rig'

// What the admin has set up to look at the model, besides drawing it: the Try it sliders, the form each axis shows and the things switched off with the eye.
// It lives with the open model and is never saved (a preset is how a set of these is kept). `away` counts what is not at rest, for the toolbar.
export interface TestControls {
  state: TestState
  values: Values
  forms: Choices
  hidden: string[]
  setValues: (change: Values | ((v: Values) => Values)) => void
  setForm: (objectId: string, axisId: string, formId: string) => void
  // a choice by its key: "objectId.axisId" (a form) or "class:classId" (the member of a family that is shown)
  setChoice: (key: string, option: string) => void
  toggleHidden: (id: string) => void
  resetAll: () => void
  apply: (content: ModelContent, preset: ModelPreset) => void
  away: (content: ModelContent) => number
}

export function useTestState(): TestControls {
  const [values, setValues] = useState<Values>({})
  const [forms, setForms] = useState<Choices>({})
  const [hidden, setHidden] = useState<string[]>([])
  const state = useMemo<TestState>(() => ({ values, forms, hidden }), [values, forms, hidden])
  const setForm = useCallback((objectId: string, axisId: string, formId: string) => setForms(f => ({ ...f, [formKey(objectId, axisId)]: formId })), [])
  const setChoice = useCallback((key: string, option: string) => setForms(f => ({ ...f, [key]: option })), [])
  const toggleHidden = useCallback((id: string) => setHidden(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id])), [])
  const resetAll = useCallback(() => { setValues({}); setForms({}); setHidden([]) }, [])
  const apply = useCallback((content: ModelContent, preset: ModelPreset) => {
    const next = applyPreset(content, state, preset)
    setValues(next.values); setForms(next.forms); setHidden(next.hidden)
  }, [state])
  const away = useCallback((content: ModelContent) => awayCount(content, state), [state])
  return { state, values, forms, hidden, setValues, setForm, setChoice, toggleHidden, resetAll, apply, away }
}
