import { useMemo, useState, type ComponentType } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { ChapterMode, WriterWorkspace } from './useWriterWorkspace'
import { ListIcon, PencilIcon, EyeIcon, type IconProps } from '../../icons'
import { HELP_COMPONENT, PAGE_COMPONENTS, SETTINGS_COMPONENT } from './consoleDefs'
import { ChapterTabs, ConsoleTitleRow, Placeholder } from './shared'
import { SaveControl } from '../../../components/SaveControl'
import { combineSaveStatus } from '../../../lib/useAutosave'
import { useChapterDraft } from './useChapterDraft'
import ChapterOutline, { type PlotDrag } from './ChapterOutline'
import { PlotpointTile } from './PlotpointTile'
import { orderAssignedPlotpoints } from './plotTree'
import { usePublications } from './usePublications'
import { PublishControl } from './PublishControl'
import { latestOf, type ChapterMeta } from './chapterDates'

// Outline | Draft | Preview, the buttons at the top right of the chapter
// page (and of its preview). Preview is only available once there is draft
// text to preview.
export function ChapterModeButtons({ mode, hasDraft, onMode, onPreview }: {
  mode: ChapterMode | 'preview'
  hasDraft: boolean
  onMode: (mode: ChapterMode) => void
  onPreview: () => void
}) {
  // Icons only; the selected one expands to show its name.
  const btn = (key: ChapterMode | 'preview', label: string, Icon: ComponentType<IconProps>, onClick: () => void, disabled = false, title = label) => (
    <button
      key={key} type="button" disabled={disabled} title={title} aria-label={label}
      className={mode === key ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} aria-pressed={mode === key}
      onClick={onClick}
    >
      <Icon size={16} />
      <span className="wrSegLabel">{label}</span>
    </button>
  )
  return (
    <div className="wrSegmented" role="group" aria-label="Chapter mode">
      {btn('outline', 'Outline', ListIcon, () => onMode('outline'))}
      {btn('draft', 'Draft', PencilIcon, () => onMode('draft'))}
      {btn('preview', 'Preview', EyeIcon, onPreview, !hasDraft, hasDraft ? 'Preview' : 'Write some draft text to preview it')}
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
  // Plotpoints assigned to this chapter (and not yet to one of its acts, scenes or
  // moments) wait in a column at the left of the Outline page.
  const [plotDragId, setPlotDragId] = useState<string | null>(null)
  const plotDrag: PlotDrag = { dragId: plotDragId, setDragId: setPlotDragId }
  const chapterPoints = useMemo(
    () => orderAssignedPlotpoints(
      w.plotNodes.filter(p => p.kind === 'plotpoint' && p.assignedMomentId === chapter.id),
      w.outlineNodes, w.activeProject?.settings.timeSystems ?? [],
    ),
    [w.plotNodes, w.outlineNodes, w.activeProject, chapter.id],
  )

  const pubs = usePublications(w.activeProjectId, chapter.id)
  const hasDraft = chapterHasDraft(draft.bodies)
  const meta: ChapterMeta = {
    created: chapter.createdAt ?? w.activeProject?.createdAt ?? null,
    edited: hasDraft ? draft.editedAt : null,
    published: latestOf(pubs.publications.map(p => p.publishedAt)),
  }

  const status = combineSaveStatus(w.saveStatus, { dirty: draft.dirty, saving: draft.saving, error: draft.saveError, lastSavedAt: draft.lastSavedAt })
  const saveAll = () => { void Promise.all([w.saveNow(), draft.flush()]) }
  const restoreAll = () => Promise.all([w.restoreSaved(), draft.restore()]).then(() => undefined)
  const buttons = (
    <>
      <SaveControl status={status} onSave={saveAll} onRestore={restoreAll} buttonClassName="wrSmallBtn wrSaveBtn" />
      <PublishControl
        disabled={!hasDraft} busy={pubs.publishing}
        title={hasDraft ? 'Publish this chapter' : 'Write some draft text to publish it'}
        // Publish what is saved: let any waiting edit land first.
        onPublish={async () => { await Promise.all([w.saveNow(), draft.flush()]); await pubs.publish() }}
      />
      <ChapterModeButtons
        mode={w.chapterMode} hasDraft={hasDraft}
        onMode={w.showChapter}
        // Preview loads its own copy of the draft: let the save land first.
        onPreview={() => { void draft.flush().then(() => w.showPreview()) }}
      />
    </>
  )

  return (
    <>
      <ConsoleTitleRow
        console="Page"
        component={`Chapter ${chapterNumber}`}
        right={buttons}
      />
      {(w.saveStatus.error || draft.error || pubs.error) && <p className="wrError">{w.saveStatus.error ?? draft.error ?? pubs.error}</p>}
      <div className="wrPageWrap">
        <ChapterOutline
          w={w} chapter={chapter} mode={w.chapterMode} draft={draft} plotDrag={plotDrag} meta={meta}
          sidebar={(
          <aside className="wrChapterPoints" aria-label="Chapter plotpoints">
            <div className="wrChapterPointsHead">
              <span>Plotpoints</span><span className="wrOutlineMeta">{chapterPoints.length}</span>
            </div>
            <div className="wrChapterPointsList">
              {chapterPoints.length === 0 && (
                <p className="wrMuted">Plotpoints assigned to this chapter appear here. Drag one onto an act, scene or moment.</p>
              )}
              {chapterPoints.map(p => (
                <PlotpointTile
                  key={p.id} w={w} point={p} dragging={plotDragId === p.id}
                  drag={{
                    onDragStart: e => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', p.id)
                      setPlotDragId(p.id)
                    },
                    onDragEnd: () => setPlotDragId(null),
                  }}
                />
              ))}
            </div>
          </aside>
          )}
        />
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
