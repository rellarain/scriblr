import { ApiError } from './client'

// Raw fetch + Blob download -- bypasses the JSON-only `api` client in
// client.ts, since a PDF response body isn't JSON. New plumbing for this
// codebase (no prior file-download flow existed).
async function downloadPdf(path: string, filename: string): Promise<void> {
  const response = await fetch(`/api${path}`)
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail ?? detail
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

export function exportBookPdf(projectId: string, bookId: string, filename: string): Promise<void> {
  return downloadPdf(`/projects/${projectId}/export/book/${bookId}`, filename)
}

export function exportChapterPdf(projectId: string, chapterId: string, filename: string): Promise<void> {
  return downloadPdf(`/projects/${projectId}/export/chapter/${chapterId}`, filename)
}
