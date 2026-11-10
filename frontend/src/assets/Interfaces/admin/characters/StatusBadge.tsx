import type { ModelEntry } from '../../../../api/types'
import { CheckIcon } from '../../../icons'
import { publishState } from './modelContent'

// Where a model stands, in words and in a shape (a tick, a filled dot, a hollow dot, a grey dot), so colour is not what tells them apart.
export function StatusBadge({ entry }: { entry: ModelEntry }) {
  const state = publishState(entry)
  if (state === 'published') return <span className="cmBadge"><CheckIcon size={11} /> Published v{entry.published!.version}</span>
  if (state === 'changed') return <span className="cmBadge cmBadge--pending"><span className="cmDot" aria-hidden="true" /> v{entry.published!.version} · unpublished changes</span>
  if (state === 'unpublished') return <span className="cmBadge"><span className="cmDot cmDot--off" aria-hidden="true" /> Unpublished (was v{entry.history[0].version})</span>
  return <span className="cmBadge"><span className="cmDot cmDot--never" aria-hidden="true" /> Not published</span>
}

export const modelLabel = (entry: ModelEntry) => entry.draft.name.trim() || 'Untitled model'
