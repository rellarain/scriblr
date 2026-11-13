import { createContext, useContext, useEffect, useState } from 'react'
import { getWriterLimits } from '../../../../api/characterModelsApi'
import type { WriterModelLimits } from '../../../../api/types'
import { defaultWriterLimits, designerMax, normalizeWriterLimits, type DesignerMax } from './engine/writerLimits'

// What the Designer is for. The admin's designer has every tool and is held only to the admin's own limits; the writer's (My models in the Characters console) is held to the limits
// the admin set for writers and hides the advanced tabs (Rig, Fields, Proportions and Frames) until the writer turns them on. The console that serves the designer provides this.
export interface DesignerPolicy {
  // The limits for a writer's own models, or null in the admin's designer.
  writer: WriterModelLimits | null
  // Whether the advanced tabs are offered.
  advanced: boolean
  // The most each count may grow to (the writer's limit, else the admin's own).
  max: DesignerMax
}

export const ADMIN_POLICY: DesignerPolicy = { writer: null, advanced: true, max: designerMax(null) }

const PolicyContext = createContext<DesignerPolicy>(ADMIN_POLICY)
export const DesignerPolicyProvider = PolicyContext.Provider
export const useDesignerPolicy = (): DesignerPolicy => useContext(PolicyContext)

export const policyFor = (writer: WriterModelLimits | null, advanced: boolean): DesignerPolicy => ({ writer, advanced, max: designerMax(writer) })

// The limits the admin set for a writer's own models, read when the writer's designer opens. A failed read is not fatal: the admin's own limits apply on the page (the server
// still holds the writer to the admin's choice when a model is published), and `failed` says so.
export function useWriterLimits(enabled: boolean): { limits: WriterModelLimits | null; failed: boolean } {
  const [state, setState] = useState<{ limits: WriterModelLimits | null; failed: boolean }>({ limits: null, failed: false })
  useEffect(() => {
    if (!enabled) return
    let live = true
    getWriterLimits()
      .then(raw => { if (live) setState({ limits: normalizeWriterLimits(raw), failed: false }) })
      .catch(() => { if (live) setState({ limits: defaultWriterLimits(), failed: true }) })
    return () => { live = false }
  }, [enabled])
  return state
}
