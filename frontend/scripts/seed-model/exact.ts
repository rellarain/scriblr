// The exact shapes of the old portrait engine's default adult and of every option of its head, ears, eyes, brows, nose and mouth, as exported for the mockup
// (docs/mannequin-mockup/exact-default.js, produced by export-exact.ts from the old engine).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Exact } from './outline'

export interface ExactShape { p: string; f: string; o: number; c: [string, string, number] | null; n: Exact }
export interface ExactOption { id: string; name: string; shapes: ExactShape[] }
export interface ExactData { shapes: ExactShape[]; options: Record<string, ExactOption[]>; bases: Record<string, string> }

const here = dirname(fileURLToPath(import.meta.url))
export const MOCKUP = resolve(here, '../../../docs/mannequin-mockup')

export function loadExact(): ExactData {
  const require = createRequire(import.meta.url)
  require(resolve(MOCKUP, 'exact-default.js'))
  return (globalThis as unknown as { ExactDefault: ExactData }).ExactDefault
}

// The mockup's own model (a body first, the clothes on it, hair in sections), for the geometry of the body.
export function loadMockupModel(): any {
  const require = createRequire(import.meta.url)
  require(resolve(MOCKUP, 'designer-engine.js'))
  require(resolve(MOCKUP, 'exact-default.js'))
  return (globalThis as any).Mannequin.model()
}
