import type { ReactNode } from 'react'
import type { ModelContent, ModelObject, ModelShape } from '../../../../api/types'
import { BridgeIcon, EyeOffIcon, GridViewIcon, LayersIcon, LinkIcon, MoonIcon, OrbitIcon, StampIcon, SunIcon, SwapIcon } from '../../../icons'
import { classOfObject } from './engine/classEdit'
import { actsAs } from './engine/kinds'
import { patternOfMark } from './engine/patterns'

const label = (name: string, fallback: string) => name.trim() || fallback

// ---- the marks on a card ----

export function Mark({ label: aria, title, children }: { label: string; title?: string; children: ReactNode }) {
  return <span className="cmTwin" role="img" title={title ?? aria} aria-label={aria}>{children}</span>
}
export const TWIN = (name: string) => ({ label: `${name} is a twin`, title: `${name} is a twin: it mirrors another and follows it` })
export function ShapeMarks({ content, shape, name }: { content: ModelContent; shape: ModelShape; name: string }) {
  const pattern = patternOfMark(content, shape.id), kind = actsAs(shape)
  return (
    <>
      {kind === 'stretch' && <Mark label={`${name} is a stretch shape`} title={`${name} is a stretch shape: every point follows another shape`}><BridgeIcon size={11} /></Mark>}
      {kind === 'shadow' && <Mark label={`${name} is a shadow`}><MoonIcon size={11} /></Mark>}
      {kind === 'pivot' && <Mark label={`${name} is a pivot circle`}><OrbitIcon size={11} /></Mark>}
      {kind === 'light' && <Mark label={`${name} is a light`}><SunIcon size={11} /></Mark>}
      {shape.mirrorOf && <Mark {...TWIN(name)}><SwapIcon size={11} /></Mark>}
      {shape.shade && <Mark label={`${name} is a shading shape`} title={`${name} is a shading shape: a ${shape.shade.kind === 'mid' ? 'mid tone' : shape.shade.kind} kept inside the other shapes of its object`}><LayersIcon size={11} /></Mark>}
      {pattern && <Mark label={`${name} is a mark of the fill pattern ${label(pattern.name, 'Untitled pattern')}`} title={`${name} is a mark of the fill pattern ${label(pattern.name, 'Untitled pattern')}: it is kept inside its base shape`}><GridViewIcon size={11} /></Mark>}
      {shape.helper && <Mark label={`${name} is a helper shape`} title={`${name} is a helper shape: it is not drawn in the previews`}><EyeOffIcon size={11} /></Mark>}
      {shape.copyOf && <Mark label={`${name} follows the pattern`} title={`${name} follows the pattern${shape.pts.length >= 3 ? ' (it has an outline of its own)' : ''}`}><LinkIcon size={11} /></Mark>}
    </>
  )
}
export function ObjectMarks({ content, object, name }: { content: ModelContent; object: ModelObject; name: string }) {
  const k = classOfObject(content, object)
  return (
    <>
      {object.mirrorOf && <Mark {...TWIN(name)}><SwapIcon size={11} /></Mark>}
      {k && <Mark label={k.template === object.id ? `${name} is the pattern of class ${k.name.trim() || 'Untitled class'}` : `${name} is a member of class ${k.name.trim() || 'Untitled class'}`}>{k.template === object.id ? <StampIcon size={11} /> : <LinkIcon size={11} />}</Mark>}
    </>
  )
}
