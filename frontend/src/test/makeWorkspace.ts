import type { WriterWorkspace } from '../assets/Interfaces/writer/useWriterWorkspace'

// A test's stand-in for the Writer workspace: only what the component under test reads is given. The keys and value types are checked against
// the real `WriterWorkspace`, so renaming or retyping a field in the hook fails the tests that fake it, where a blanket `as unknown as` would
// not. Objects inside may be partial too (an `activeProject` with just its settings); functions, Maps and Sets are taken as they are.
type DeepPartial<T> =
  T extends (...args: never[]) => unknown ? T
  : T extends Map<unknown, unknown> | Set<unknown> ? T
  : T extends ReadonlyArray<infer U> ? Array<DeepPartial<U>>
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

export type WorkspaceOverrides = DeepPartial<WriterWorkspace>

// The one place a partial workspace is read as a whole one.
export function makeWorkspace(overrides: WorkspaceOverrides = {}): WriterWorkspace {
  return overrides as unknown as WriterWorkspace
}
