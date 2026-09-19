import type { OutlineNode } from '../../../api/types'
import type { ChapterMode, WriterWorkspace } from './useWriterWorkspace'
import { HELP_COMPONENT, PAGE_COMPONENTS, SETTINGS_COMPONENT } from './consoleDefs'
import { ChapterTabs, ConsoleTitleRow, Placeholder } from './shared'
import { useChapterDraft } from './useChapterDraft'
import ChapterOutline from './ChapterOutline'

// Outline | Draft | Preview, the buttons at the top right of the chapter
// page (and of its preview). Preview is only available once there is draft
// text to preview.
export function ChapterModeButtons({ mode, hasDraft, onMode, onPreview }: {
  mode: ChapterMode | 'preview'
  hasDraft: boolean
  onMode: (mode: ChapterMode) => void
  onPreview: () => void
}) {
  const btn = (key: ChapterMode | 'preview', label: string, onClick: () => void, disabled = false, title?: string) => (
    <button
      key={key} type="button" disabled={disabled} title={title}
      className={mode === key ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} aria-pressed={mode === key}
      onClick={onClick}
    >
      {label}
    </button>
  )
  return (
    <div className="wrSegmented" role="group" aria-label="Chapter mode">
      {btn('outline', 'Outline', () => onMode('outline'))}
      {btn('draft', 'Draft', () => onMode('draft'))}
      {btn('preview', 'Preview', onPreview, !hasDraft, hasDraft ? undefined : 'Write some draft text to preview it')}
    </div>
  )
}

// Every moment in the chapter that has any draft text.
export function chapterHasDraft(bodies: Record<string, string>): boolean {
  return Object.values(bodies).some(body => body.trim() !== '')
}

// The chapter page: one nested-card page in two modes (Outline / Draft),
// with the chapter tabs on its right edge.
function ChapterPage({ w, chapter }: { w: WriterWorkspace; chapter: OutlineNode }) {
  const draft = useChapterDraft(w.activeProjectId, chapter.id)
  const chapterNumber = w.activeBookChapters.findIndex(c => c.id === chapter.id) + 1
  const buttons = (
    <ChapterModeButtons
      mode={w.chapterMode} hasDraft={chapterHasDraft(draft.bodies)}
      onMode={w.showChapter} onPreview={w.showPreview}
    />
  )

  return (
    <>
      <ConsoleTitleRow
        console="Page"
        component={`Chapter ${chapterNumber}${draft.saving ? ' · Saving…' : ''}`}
        right={buttons}
      />
      {draft.error && <p className="wrError">{draft.error}</p>}
      <div className="wrPageWrap">
        <ChapterOutline w={w} chapter={chapter} mode={w.chapterMode} draft={draft} />
        <ChapterTabs
          variant="page" chapters={w.activeBookChapters} activeId={chapter.id}
          onSelect={w.selectChapter}
          onAdd={w.activeBook ? () => w.addOutlineNode(w.activeBook!.id, 'chapter') : undefined}
        />
      </div>
    </>
  )
}

function PageConsole({ w, component }: { w: WriterWorkspace; component: string }) {
  const chapter = w.activeChapter
  const def = [...PAGE_COMPONENTS, SETTINGS_COMPONENT, HELP_COMPONENT].find(c => c.key === component)

  if (!chapter) return <Placeholder title="Page" body="Open a chapter from the book editor to outline or draft it." />

  if (component === 'chapter') return <ChapterPage key={chapter.id} w={w} chapter={chapter} />

  return (
    <>
      <ConsoleTitleRow console="Page" component={def?.label ?? ''} />
      <Placeholder title={def?.label ?? ''} body={def?.body} />
    </>
  )
}

export default PageConsole
