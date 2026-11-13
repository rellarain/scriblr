import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { ClockIcon, ExportIcon, FaceIcon, ImageIcon, LinkIcon, ListIcon, MannequinIcon, PencilIcon, RedoIcon, TeamIcon, UserIcon } from '../../../icons'
import { CharacterList } from './CharacterList'
import { AppearanceSection } from './AppearanceSection'
import { CastSection } from './CastSection'
import { WorldLinks } from '../links/WorldLinks'
import { CarriedItems } from '../items/CarriedItems'
import { hasPending, usePendingOpen } from '../links/worldNav'
import { ForReadersSection } from './ForReadersSection'
import { useCast } from './castStore'
import { useFigureModels } from './figure/figureModelStore'
import { OpenMyModelContext } from './figure/ownModel'
import { exportSheet } from './sheet'
import { PortraitSection } from './PortraitSection'
import { ProfileSection } from './ProfileSection'
import { RelationshipsSection } from './RelationshipsSection'
import { StorySection } from './StorySection'
import { storyPoints } from './story'
import { useCharacters } from './useCharacters'
import './characters.scss'

// The designer for the writer's own models (the same console the Admin's Designer is), loaded when its section is opened.
const ModelsDesigner = lazy(() => import('../../admin/characters/DesignerConsole'))

export type CharacterSection = 'appearance' | 'portrait' | 'profile' | 'relationships' | 'story' | 'cast' | 'readers' | 'models'
type Section = CharacterSection
const SECTIONS: Array<{ section: Section; label: string; Icon: typeof FaceIcon }> = [
  { section: 'appearance', label: 'Appearance', Icon: PencilIcon },
  { section: 'portrait', label: 'Portrait', Icon: UserIcon },
  { section: 'profile', label: 'Profile', Icon: ListIcon },
  { section: 'relationships', label: 'Relationships', Icon: LinkIcon },
  { section: 'story', label: 'Story', Icon: ClockIcon },
  { section: 'cast', label: 'The cast', Icon: TeamIcon },
  { section: 'readers', label: 'For readers', Icon: ExportIcon },
]
// Not about the open character, nor about this project: the writer's own models, kept for every project (a character is drawn from a published one).
const MODELS = { section: 'models' as const, label: 'My models', Icon: MannequinIcon }
// Project > Characters: the cast. A list of characters and, for the open one, what to work on: its appearance in words, its portrait (a card drawn from a handful of choices,
// made with dropdowns in tabs), its profile, relationships and story, the cast as a whole, and what readers see; and the writer's own models, designed here and kept for every
// project. Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on.
export default function CharactersConsole({ projectId, outline = [], plotNodes = [], onOpenPlot, onOpenScene, initialSection = 'appearance' }: {
  projectId: string; outline?: OutlineNode[]; plotNodes?: PlotNode[]; onOpenPlot?: (nodeId: string) => void; onOpenScene?: (nodeId: string) => void; initialSection?: CharacterSection
}) {
  const c = useCharacters(projectId)
  // The copies of models the cast's figures are drawn from.
  useFigureModels(projectId)
  const { ui } = useSettings()
  const [section, setSection] = useState<Section>(initialSection)
  // The model My models opens first: Edit this model in the figure editor asks for one.
  const [modelToOpen, setModelToOpen] = useState<string | null>(null)
  const openModel = useCallback((id: string) => { setModelToOpen(id); setSection('models') }, [])
  const points = useMemo(() => storyPoints(outline), [outline])
  const { doc } = c
  const store = useCast(projectId)
  // The whole cast, with the open character as it is being edited.
  const all = useMemo(() => {
    const rest = store.cast.map(d => (doc && d.id === doc.id ? doc : d))
    return doc && !rest.some(d => d.id === doc.id) ? [...rest, doc] : rest
  }, [store.cast, doc])
  const [sheetNote, setSheetNote] = useState('')
  // The Models section is the designer on its own, under the bar (the cast list and the character's sections give way to it).
  const inModels = section === 'models'

  // The first character opens by itself.
  useEffect(() => {
    if (c.status === 'ready' && c.openId === null && c.cast.length > 0 && !hasPending('char')) void c.open(c.cast[0].id)
    // Only when the list has loaded (opening is not repeated after a character is closed by deleting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.status])

  // A link from another console asked for a character.
  usePendingOpen('char', c.status === 'ready', id => { void c.open(id) })

  if (c.status === 'error') {
    return (
      <div className="charNote" role="alert">
        <p>{c.loadError ?? 'The characters could not be loaded.'}</p>
        <button type="button" className="charIconBtn" aria-label="Try loading again" title="Try loading again" onClick={() => { void c.reload() }}><RedoIcon size={18} /></button>
      </div>
    )
  }
  if (c.status === 'loading') return <p className="charNote" role="status">Loading the cast…</p>

  return (
    <OpenMyModelContext.Provider value={openModel}>
      <div className="charPage">
        <div className="charBar">
          <h2 className="charBarTitle">Characters</h2>
          <div className="charTools" role="toolbar" aria-label="What to work on">
            {(doc ? [...SECTIONS, MODELS] : [MODELS]).map(({ section: x, label, Icon }) => (
              <button key={x} type="button" className="charIconBtn" aria-pressed={section === x} aria-label={label} title={label} onClick={() => { setModelToOpen(null); setSection(x) }}><Icon size={18} /></button>
            ))}
          </div>
          {doc && !inModels && (
            <button
              type="button" className="charIconBtn" aria-label="Save the character sheet as an image" title="Save the character sheet as an image (a PNG with the profile in words)"
              onClick={() => { setSheetNote(''); void exportSheet(doc).then(r => { if (r === 'unavailable') setSheetNote('The sheet could not be made.') }) }}
            ><ImageIcon size={18} /></button>
          )}
          {!inModels && (
            <SaveCluster
              status={c.saveStatus} onSave={() => { void c.saveNow() }} scope=".charPage"
              history={{ canUndo: c.canUndo, canRedo: c.canRedo, onUndo: c.undo, onRedo: c.redo }}
              autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: c.saveCountdown.nextSaveAt, wait: c.saveCountdown.wait }}
            />
          )}
        </div>
        {c.saveStatus.error && <p className="charNote charNote--error" role="alert">{c.saveStatus.error}</p>}
        {sheetNote && <p className="charNote charNote--error" role="alert">{sheetNote}</p>}
        {c.notice && <p className="charNote charNote--error" role="alert">{c.notice}</p>}
        {inModels && (
          <div className="charModels">
            <Suspense fallback={<p className="charNote" role="status">Opening the designer…</p>}><ModelsDesigner library="mine" openId={modelToOpen} /></Suspense>
          </div>
        )}
        {!inModels && <div className="charSplit">
          <CharacterList c={c} />
          {doc && section === 'appearance' && <AppearanceSection doc={doc} edit={c.edit} rename={c.rename} />}
          {doc && section === 'portrait' && <PortraitSection projectId={projectId} doc={doc} edit={c.edit} rename={c.rename} setFigure={c.setFigure} convert={c.convert} revert={c.revert} />}
          {doc && section === 'profile' && <ProfileSection doc={doc} edit={c.edit} />}
          {doc && section === 'relationships' && <RelationshipsSection projectId={projectId} c={c} doc={doc} points={points} />}
          {doc && section === 'cast' && <CastSection c={c} cast={all} doc={doc} onOpen={id => { void c.open(id) }} />}
          {doc && section === 'readers' && <ForReadersSection projectId={projectId} doc={doc} edit={c.edit} savedAt={c.saveStatus.lastSavedAt} />}
          {doc && section === 'story' && <StorySection doc={doc} edit={c.edit} points={points} links={<><CarriedItems projectId={projectId} characterId={doc.id} outline={outline} /><WorldLinks projectId={projectId} self={`char:${doc.id}`} plotNodes={plotNodes} onOpenPlot={onOpenPlot} outline={outline} onOpenScene={onOpenScene} /></>} />}
          {doc ? null : (
            <p className="charNote charEmpty">{c.cast.length === 0 ? 'Make a character to start: a name, a portrait and the words about them.' : 'Pick a character in the list to open it.'}</p>
          )}
        </div>}
      </div>
    </OpenMyModelContext.Provider>
  )
}
