import { ApiError } from './client'

export type ExportScope = 'project' | 'book' | 'chapter'
export type ExportFormat = 'pdf' | 'epub' | 'json'
export type PageSize = '6x9' | 'a5' | 'letter' | 'a4'

// What `GET /api/projects/{id}/export` takes beside the scope, the target and the format (backend/app/api/export.py). Each format reads its own:
// a PDF the page size, title page, contents, footnotes and margin flags; an EPUB the cover, contents and footnotes; JSON the plot, flags and
// chapter revisions. `split` makes a project's PDF or EPUB a zip with a file per book.
export interface ExportOptions {
  pageSize?: PageSize
  titlePage?: boolean
  contents?: boolean
  footnotes?: boolean
  marginFlags?: boolean
  cover?: boolean
  split?: boolean
  plot?: boolean
  flags?: boolean
  revisions?: boolean
}

export interface ExportRequest {
  scope: ExportScope
  id?: string // the book or chapter; none for the project
  format: ExportFormat
  options?: ExportOptions
}

export function exportUrl(projectId: string, request: ExportRequest): string {
  const params = new URLSearchParams({ scope: request.scope, format: request.format })
  if (request.id) params.set('id', request.id)
  for (const [key, value] of Object.entries(request.options ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  return `/api/projects/${encodeURIComponent(projectId)}/export?${params}`
}

// Raw fetch + Blob download -- bypasses the JSON-only `api` client in client.ts, since a PDF, EPUB or zip body isn't JSON (and the JSON export
// is a file to save, not data to read). The browser is handed the file through a temporary link, saved under `filename`.
export async function exportFile(projectId: string, request: ExportRequest, filename: string): Promise<void> {
  const response = await fetch(exportUrl(projectId, request))
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // no JSON body; fall back to statusText
    }
    throw new ApiError(response.status, detail)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
