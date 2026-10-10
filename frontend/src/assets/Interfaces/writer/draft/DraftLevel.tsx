import { useMemo, useState } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { EyeIcon, GearIcon, HelpIcon, PencilIcon, PlotIcon } from '../../../icons'
import type { SplitNode } from '../../../../components/tiles/splitTree'
import { SaveCluster } from '../../../../components/SaveCluster'
import { combineCountdown, combineSaveStatus } from '../../../../lib/useAutosave'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { chapterDatesOf, type ChapterMeta } from '../chapterDates'
import EdgeTabs from '../EdgeTabs'
import HueSlider from '../HueSlider'
import HelpArticles from '../levels/HelpArticles'
import { PublishControl } from '../PublishControl'
import { Placeholder } from '../shared'
import SplitArea from '../SplitArea'
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

// Where the page's tiles sit until one is moved: the chapter on top, the plotpoints above the draft.
const DRAFT_LAYOUT: SplitNode = { dir: 'col', ratio: 0.19, a: { id: 'chapter' }, b: { dir: 'col', ratio: 0.18, a: { id: 'points' }, b: { id: 'draft' } } }

const DRAFT_HELP_NAMES = ['draft', 'chapter']
const DRAFT_HELP_FALLBACK = 'The Draft level is the open chapter as an open book: write each moment in its card, and switch to Preview to read the chapter as it will be published.'

// Settings and Help, the last two tabs of the Draft level: icons in the chapter tile's tools that
// swap the right page for that panel (the same button puts the page back).
function DraftPanelButtons({ panel, onPanel }: { panel: DraftPanel; onPanel: (next: DraftPanel) => void }) {
  const toggle = (which: 'settings' | 'help') => onPanel(panel === which ? null : which)
  return (
    <span className="wrTabBar">
      <button type="button" className={`wrTabBtn${panel === 'settings' ? ' wrTabBtn--on' : ''}`} aria-label="Settings" title="Settings" aria-pressed={panel === 'settings'} onClick={() => toggle('settings')}><GearIcon size={18} /></button>
      <button type="button" className={`wrTabBtn${panel === 'help' ? ' wrTabBtn--on' : ''}`} aria-label="Help" title="Help" aria-pressed={panel === 'help'} onClick={() => toggle('help')}><HelpIcon size={18} /></button>
    </span>
  )
}
type DraftPanel = 'settings' | 'help' | null

// The Draft level at Max: the open chapter as an open book: the left page, which is just the strip of
// paper under the other levels' tiles, the crease beside it, and the right page, which holds three tiles on a
// split grid (drag a title bar to move one, a divider to resize; remembered): the chapter title tile (what the
// chapter is, and the page tools), the chapter's plotpoints and its draft (or, from the toggle, its preview or
// its settings or help), with the arcs' and chapters' tabs on the edge.
function DraftPage({ w, chapter, pagesComponent, onPagesComponent }: {
  w: WriterWorkspace
  chapter: OutlineNode
  pagesComponent: string
  onPagesComponent: (key: string) => void
}) {
  const [panel, setPanel] = useState<DraftPanel>(null)
  const draft = useChapterDraft(w.activeProjectId, chapter.id)
  const pubs = usePublications(w.activeProjectId, chapter.id)
  const preview = w.activeConsole === 'pages'
  const hasDraft = chapterHasDraft(draft.bodies)
  const chapterWords = useMemo(() => Object.values(draft.bodies).reduce((sum, body) => sum + countWords(body), 0), [draft.bodies])
  const meta: ChapterMeta = chapterDatesOf(chapter, w.activeProject, hasDraft ? draft.editedAt : null, pubs.publications)

  const status = combineSaveStatus(w.saveStatus, { dirty: draft.dirty, saving: draft.saving, error: draft.saveError, lastSavedAt: draft.lastSavedAt })
  const saveAll = () => { void Promise.all([w.saveNow(), draft.flush()]) }
  const { ui } = useSettings()
  const countdown = combineCountdown(w.saveCountdown, { nextSaveAt: draft.nextSaveAt, wait: draft.wait })
  // Undo and Redo act on the tile last used: the draft text, or the chapter's own fields (title, synopsis, dates).
  const [focusedTile, setFocusedTile] = useState<string>('draft')
  const onText = focusedTile === 'draft'
  const history = {
    canUndo: onText ? draft.canUndo : w.history.canUndo('outline'),
    canRedo: onText ? draft.canRedo : w.history.canRedo('outline'),
    onUndo: () => { if (onText) draft.undo(); else w.history.undo('outline') },
    onRedo: () => { if (onText) draft.redo(); else w.history.redo('outline') },
  }

  // An arc's tab goes to its first chapter.
  const firstChapterOf = (arcId: string) => w.outlineNodes
    .filter(n => n.parentId === arcId && n.kind === 'chapter').sort((a, b) => a.order - b.order)[0]

  return (
    <div className="wrDraftLevel">
      <div className="wrDraftBody">
        <div className="wrPage wrPage--chapter wrSpread">
          <div className="wrSpreadLeft" aria-hidden="true" />
          <div className="wrCrease" aria-hidden="true" />
          <div className="wrSpreadRight">
            {/* The page's three tiles on a split grid: drag a title bar to move one, a divider to resize. */}
            <SplitArea
              gridId="scriblr.writer.draft" label="Chapter tiles" defaultTree={DRAFT_LAYOUT} onFocusTile={setFocusedTile}
              tiles={[
                {
                  id: 'chapter', title: 'Chapter', Icon: PencilIcon, bodyClassName: 'wrDraftTileBody',
                  children: (
                    <ChapterTile
                      w={w} chapter={chapter} chapterWords={chapterWords} meta={meta}
                      error={w.saveStatus.error ?? draft.error ?? pubs.error}
                      tools={(
                        <>
                          <SaveCluster
                            status={status} onSave={saveAll} buttonClassName="wrSmallBtn wrSaveBtn" history={history}
                            autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: countdown.nextSaveAt, wait: countdown.wait }}
                          />
                          <PublishControl
                            disabled={!hasDraft} busy={pubs.publishing}
                            title={hasDraft ? 'Publish this chapter' : 'Write some draft text to publish it'}
                            // Publish what is saved: let any waiting edit land first.
                            onPublish={async () => { await Promise.all([w.saveNow(), draft.flush()]); await pubs.publish() }}
                          />
                          <DraftPreviewToggle preview={preview} hasDraft={hasDraft} onDraft={w.showDraft} onPreview={w.showPreview} />
                          <DraftPanelButtons panel={panel} onPanel={setPanel} />
                        </>
                      )}
                    />
                  ),
                },
                {
                  id: 'points', title: 'Plotpoints', Icon: PlotIcon, bodyClassName: 'wrDraftTileBody wrDraftTileBody--padded',
                  children: <ChapterPoints w={w} chapter={chapter} />,
                },
                {
                  id: 'draft', title: panel === 'settings' ? 'Settings' : panel === 'help' ? 'Help' : preview ? 'Preview' : 'Draft',
                  Icon: preview && !panel ? EyeIcon : PencilIcon, bodyClassName: 'wrDraftTileBody wrDraftTileBody--flush',
                  children: (
                    <>
                      {panel === 'settings' && (
                        <div className="wrSpreadScroll wrDraftPanel" role="region" aria-label="Chapter settings">
                          <span className="wrLabel">Colour</span>
                          <HueSlider
                            label="Chapter colour" className="wrNodeHue" hue={w.levelHueOf(chapter)} centre={w.hueCentreOf(chapter)}
                            onChange={code => w.setNodeHue(chapter.id, code)}
                          />
                        </div>
                      )}
                      {panel === 'help' && (
                        <div className="wrSpreadScroll wrDraftPanel" role="region" aria-label="Draft help">
                          <HelpArticles names={DRAFT_HELP_NAMES} fallback={DRAFT_HELP_FALLBACK} />
                        </div>
                      )}
                      {panel ? null : preview
                        ? <PreviewPane w={w} chapter={chapter} draft={draft} pubs={pubs} component={pagesComponent} onComponent={onPagesComponent} />
                        : <div className="wrSpreadScroll"><DraftCards w={w} chapter={chapter} draft={draft} /></div>}
                    </>
                  ),
                },
              ]}
            />
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
