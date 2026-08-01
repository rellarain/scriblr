/** Strips characters invalid in Windows/macOS/Linux filenames. */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, '_')
  return trimmed || 'untitled'
}
