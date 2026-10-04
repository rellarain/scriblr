import { useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { EyeIcon, PencilIcon } from '../../../icons'
import { SaveControl } from '../../../../components/SaveControl'
import { combineSaveStatus } from '../../../../lib/useAutosave'
import { chapterDatesOf, type ChapterMeta } from '../chapterDates'
import EdgeTabs from '../EdgeTabs'
import { PublishControl } from '../PublishControl'
import { Placeholder } from '../shared'
import { useChapterDraft } from '../useChapterDraft'
import { usePublications } from '../usePublications'
import { countWords } from '../wordCount'
import ChapterPoints from './ChapterPoints'
import ChapterTile from './ChapterTile'
import DraftCards from './DraftCards'
import PreviewPane from './PreviewPane'
import { chapterHasDraft } from './draftModel'

// Draft | Preview, at the top right of the page. Preview is only available once there is
// draft text to preview.
export function DraftPreviewToggle({ preview, hasDraft, onDraft, onPreview }: {
  preview: boolean
  hasDraft: boolean
  onDraft: () => void
  onPreview: () => void
}) {
  // Icons only; the selected one expands to show its name.
  return (
    <div className="wrSegmented" role="group" aria-label="Chapter view">
      <button type="button" title="Draft" aria-label="Draft" aria-pressed={!preview} className={!preview ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={onDraft}>
        <PencilIcon size={16} /><span className="wrSegLabel">Draft</span>
      </button>
      <button
        type="button" disabled={!hasDraft && !preview} aria-label="Preview" aria-pressed={preview}
        title={hasDraft || preview ? 'Preview' : 'Write some draft text to preview it'}
        className={preview ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={onPreview}
      >
        <EyeIcon size={16} /><span className="wrSegLabel">Preview</span>
      </button>
    </div>
  )
}

// The Draft level at Max: the open chapter as an open book. The chapter title tile runs across the
// top (what the chapter is, and the page tools); below it the left page, which is just the strip of
// paper under the other levels' tiles, the crease beside them, and the right page: the chapter's
// plotpoints and its draft (or, from the toggle, its preview), with the arcs' and chapters' tabs on the edge.
function DraftPage({ w, chapter, pagesComponent, onPagesComponent }: {
  w: WriterWorkspace
  chapter: OutlineNode
  pagesComponent: string
  onPagesComponent: (key: string) => void
}) {
  const draft = useChapterDraft(w.activeProjectId, chapter.id)
  const pubs = usePublications(w.activeProjectId, chapter.id)
  const preview = w.activeConsole === 'pages'
  const hasDraft = chapterHasDraft(draft.bodies)
  const chapterWords = useMemo(() => Object.values(draft.bodies).reduce((sum, body) => sum + countWords(body), 0), [draft.bodies])
  const meta: ChapterMeta = chapterDatesOf(chapter, w.activeProject, hasDraft ? draft.editedAt : null, pubs.publications)

  const status = combineSaveStatus(w.saveStatus, { dirty: draft.dirty, saving: draft.saving, error: draft.saveError, lastSavedAt: draft.lastSavedAt })
  const saveAll = () => { void Promise.all([w.saveNow(), draft.flush()]) }
  const restoreAll = () => Promise.all([w.restoreSaved(), draft.restore()]).then(() => undefined)

  // An arc's tab goes to its first chapter.
  const firstChapterOf = (arcId: string) => w.outlineNodes
    .filter(n => n.parentId === arcId && n.kind === 'chapter').sort((a, b) => a.order - b.order)[0]

  return (
    <div className="wrDraftLevel">
      <ChapterTile
        w={w} chapter={chapter} chapterWords={chapterWords} meta={meta}
        error={w.saveStatus.error ?? draft.error ?? pubs.error}
        tools={(
          <>
            <SaveControl status={status} onSave={saveAll} onRestore={restoreAll} buttonClassName="wrSmallBtn wrSaveBtn" />
            <PublishControl
              disabled={!hasDraft} busy={pubs.publishing}
              title={hasDraft ? 'Publish this chapter' : 'Write some draft text to publish it'}
              // Publish what is saved: let any waiting edit land first.
              onPublish={async () => { await Promise.all([w.saveNow(), draft.flush()]); await pubs.publish() }}
            />
            <DraftPreviewToggle preview={preview} hasDraft={hasDraft} onDraft={w.showDraft} onPreview={w.showPreview} />
          </>
        )}
      />
      <div className="wrDraftBody">
        <div className="wrPage wrPage--chapter wrSpread">
          <div className="wrSpreadLeft" aria-hidden="true" />
          <div className="wrCrease" aria-hidden="true" />
          <div className="wrSpreadRight">
            {preview
              ? <PreviewPane w={w} chapter={chapter} draft={draft} pubs={pubs} component={pagesComponent} onComponent={onPagesComponent} />
              : <div className="wrSpreadScroll"><ChapterPoints w={w} chapter={chapter} /><DraftCards w={w} chapter={chapter} draft={draft} /></div>}
          </div>
        </div>
        <EdgeTabs
          w={w} activeChapterId={chapter.id}
          onChapter={id => w.selectChapter(id)}
          onArc={arcId => { const first = firstChapterOf(arcId); if (first) w.selectChapter(first.id) }}
        />
      </div>
    </div>
  )
}

function DraftLevel({ w, pagesComponent, onPagesComponent }: { w: WriterWorkspace; pagesComponent: string; onPagesComponent: (key: string) => void }) {
  const chapter = w.activeChapter
  if (!chapter) return <Placeholder title="Chapter" body="Open a chapter from the book editor to draft it." />
  return <DraftPage key={chapter.id} w={w} chapter={chapter} pagesComponent={pagesComponent} onPagesComponent={onPagesComponent} />
}

export default DraftLevel
