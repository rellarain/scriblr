import { useEffect, useMemo, useState } from 'react'
import type { OutlineNode } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { ImageIcon, TeamIcon } from '../../../icons'
import { BagIcon, BodyIcon, BrushIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, EyeIcon, FaceIcon, HandIcon, LinkIcon, ListIcon, MixedFaceIcon, NeutralFaceIcon, PencilIcon, RedoIcon, TurnIcon } from '../../../icons'
import { CharacterArt } from './art/CharacterArt'
import { EXPRESSIONS } from './art/library'
import { VIEWS, type View } from './art/space'
import { CharacterList } from './CharacterList'
import { BodyDrawer, ClothesDrawer, EyesDrawer, HairDrawer, HeadDrawer, MarksDrawer, NoseMouthDrawer, PoseDrawer, type DrawerCtx } from './Drawers'
import { CommitText, Field } from './CharFields'
import { CastSection } from './CastSection'
import { useCast } from './castStore'
import { exportSheet } from './sheet'
import { ProfileSection } from './ProfileSection'
import { RelationshipsSection } from './RelationshipsSection'
import { StorySection } from './StorySection'
import { storyPoints } from './story'
import { useCharacters } from './useCharacters'
import './characters.scss'

type Section = 'look' | 'profile' | 'relationships' | 'story' | 'cast'
const SECTIONS: Array<{ section: Section; label: string; Icon: typeof FaceIcon }> = [
  { section: 'look', label: 'Look', Icon: BrushIcon },
  { section: 'profile', label: 'Profile', Icon: ListIcon },
  { section: 'relationships', label: 'Relationships', Icon: LinkIcon },
  { section: 'story', label: 'Story', Icon: ClockIcon },
  { section: 'cast', label: 'The cast', Icon: TeamIcon },
]
type Mode = 'closeup' | 'full' | 'turnaround' | 'expressions'
const MODES: Array<{ mode: Mode; label: string; Icon: typeof FaceIcon }> = [
  { mode: 'closeup', label: 'Close-up', Icon: FaceIcon },
  { mode: 'full', label: 'Full body', Icon: BodyIcon },
  { mode: 'turnaround', label: 'Turnaround', Icon: TurnIcon },
  { mode: 'expressions', label: 'Expressions', Icon: MixedFaceIcon },
]
const DRAWERS: Array<{ id: string; name: string; Icon: typeof FaceIcon }> = [
  { id: 'body', name: 'Body', Icon: BodyIcon },
  { id: 'head', name: 'Head and ears', Icon: FaceIcon },
  { id: 'eyes', name: 'Eyes and brows', Icon: EyeIcon },
  { id: 'nose', name: 'Nose and mouth', Icon: NeutralFaceIcon },
  { id: 'hair', name: 'Hair and beard', Icon: BrushIcon },
  { id: 'marks', name: 'Marks and tattoos', Icon: PencilIcon },
  { id: 'clothes', name: 'Clothes and accessories', Icon: BagIcon },
  { id: 'pose', name: 'Pose and things held', Icon: HandIcon },
]

// Project > Characters: the cast. A list of characters, the open one drawn as a close-up, a full figure, a turnaround of four views or a strip of expressions, and beside it
// the drawers where its parts are chosen (build, head, eyes, nose and mouth, hair, marks, clothes, pose). A character is only its look, a handful of choices and
// numbers; the art is drawn from them in any view. Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on.
export default function CharactersConsole({ projectId, outline = [] }: { projectId: string; outline?: OutlineNode[] }) {
  const c = useCharacters(projectId)
  const { ui } = useSettings()
  const [section, setSection] = useState<Section>('look')
  const points = useMemo(() => storyPoints(outline), [outline])
  const [mode, setMode] = useState<Mode>('closeup')
  const [view, setView] = useState<View>('front')
  const [facing, setFacing] = useState<'left' | 'right'>('right')
  const [drawer, setDrawer] = useState<string>('body')
  const { doc } = c
  const store = useCast(projectId)
  // The whole cast, with the open character as it is being edited.
  const all = useMemo(() => {
    const rest = store.cast.map(d => (doc && d.id === doc.id ? doc : d))
    return doc && !rest.some(d => d.id === doc.id) ? [...rest, doc] : rest
  }, [store.cast, doc])
  const [sheetNote, setSheetNote] = useState('')

  // The first character opens by itself.
  useEffect(() => {
    if (c.status === 'ready' && c.openId === null && c.cast.length > 0) void c.open(c.cast[0].id)
    // Only when the list has loaded (opening is not repeated after a character is closed by deleting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.status])

  if (c.status === 'error') {
    return (
      <div className="charNote" role="alert">
        <p>{c.loadError ?? 'The characters could not be loaded.'}</p>
        <button type="button" className="charIconBtn" aria-label="Try loading again" title="Try loading again" onClick={() => { void c.reload() }}><RedoIcon size={18} /></button>
      </div>
    )
  }
  if (c.status === 'loading') return <p className="charNote" role="status">Loading the cast…</p>

  const ctx: DrawerCtx | null = doc ? {
    look: doc.look,
    set: (patch, group) => c.setLook(patch, group ?? null),
    setOutfit: (patch, group) => c.setLook(l => ({ ...l, outfit: { ...l.outfit, ...patch } }), group ?? null),
  } : null
  const name = doc?.name ?? ''

  return (
    <div className="charPage">
      <div className="charBar">
        <h2 className="charBarTitle">Characters</h2>
        {doc && (
          <div className="charTools" role="toolbar" aria-label="What to work on">
            {SECTIONS.map(({ section: x, label, Icon }) => (
              <button key={x} type="button" className="charIconBtn" aria-pressed={section === x} aria-label={label} title={label} onClick={() => setSection(x)}><Icon size={18} /></button>
            ))}
          </div>
        )}
        {doc && section === 'look' && (
          <div className="charTools" role="toolbar" aria-label="Ways to see the character">
            {MODES.map(({ mode: m, label, Icon }) => (
              <button key={m} type="button" className="charIconBtn" aria-pressed={mode === m} aria-label={label} title={label} onClick={() => setMode(m)}><Icon size={18} /></button>
            ))}
          </div>
        )}
        {doc && (
          <button
            type="button" className="charIconBtn" aria-label="Save the character sheet as an image" title="Save the character sheet as an image (a PNG with the figure and the profile)"
            onClick={() => { setSheetNote(''); void exportSheet(doc).then(r => { if (r === 'unavailable') setSheetNote('The sheet could not be made.') }) }}
          ><ImageIcon size={18} /></button>
        )}
        <SaveCluster
          status={c.saveStatus} onSave={() => { void c.saveNow() }} scope=".charPage"
          history={{ canUndo: c.canUndo, canRedo: c.canRedo, onUndo: c.undo, onRedo: c.redo }}
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: c.saveCountdown.nextSaveAt, wait: c.saveCountdown.wait }}
        />
      </div>
      {c.saveStatus.error && <p className="charNote charNote--error" role="alert">{c.saveStatus.error}</p>}
      {sheetNote && <p className="charNote charNote--error" role="alert">{sheetNote}</p>}
      {c.notice && <p className="charNote charNote--error" role="alert">{c.notice}</p>}
      <div className="charSplit">
        <CharacterList c={c} />
        {doc && section === 'profile' && <ProfileSection doc={doc} edit={c.edit} />}
        {doc && section === 'relationships' && <RelationshipsSection projectId={projectId} c={c} doc={doc} points={points} />}
        {doc && section === 'cast' && <CastSection c={c} cast={all} doc={doc} onOpen={id => { void c.open(id) }} />}
        {doc && section === 'story' && <StorySection doc={doc} edit={c.edit} points={points} />}
        {doc && ctx && section === 'look' ? (
          <>
            <div className="charStage">
              {(mode === 'closeup' || mode === 'full') && (
                <div className="charViews" role="group" aria-label="View">
                  {VIEWS.map(v => (
                    <button key={v.id} type="button" className="charChip" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.name}</button>
                  ))}
                  {(view === 'side' || view === 'threeQuarter') && (
                    <button type="button" className="charIconBtn" aria-label={`Facing ${facing === 'right' ? 'right' : 'left'}: turn the other way`} title="Turn the other way" onClick={() => setFacing(f => (f === 'right' ? 'left' : 'right'))}>
                      {facing === 'right' ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
                    </button>
                  )}
                </div>
              )}
              <div className="charBox">
                {mode === 'closeup' && <CharacterArt look={doc.look} mode="closeup" view={view} facing={facing} label={`${name}, close-up, ${view}`} className="charArt" />}
                {mode === 'full' && <CharacterArt look={doc.look} mode="full" view={view} facing={facing} label={`${name}, full body, ${view}`} className="charArt" />}
                {mode === 'turnaround' && (
                  <div className="charTurn">
                    {VIEWS.map(v => (
                      <figure key={v.id} className="charTurnItem">
                        <CharacterArt look={doc.look} mode="full" view={v.id} facing={facing} label={`${name}, ${v.name}`} className="charArt" frame="fixed" />
                        <figcaption className="charCaption">{v.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {mode === 'expressions' && (
                  <div className="charExpressions" role="group" aria-label="Expressions">
                    {EXPRESSIONS.map(x => (
                      <button key={x.id} type="button" className="charExpr" aria-pressed={doc.look.expression === x.id} aria-label={x.name} title={x.name} onClick={() => c.setLook({ expression: x.id })}>
                        <CharacterArt look={{ ...doc.look, expression: x.id }} mode="head" crop={{ x: -70, y: -90, w: 140, h: 170 }} label="" className="charArt" marks />
                        <span className="charCaption">{x.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(mode === 'closeup' || mode === 'full') && (
                <div className="charViews" role="group" aria-label="Expression">
                  {EXPRESSIONS.map(x => (
                    <button key={x.id} type="button" className="charChip" aria-pressed={doc.look.expression === x.id} onClick={() => c.setLook({ expression: x.id })}>{x.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="charSide">
              <section className="charPanel" aria-label="Name">
                <Field label="Name"><CommitText label="Name of the character" value={doc.name} max={120} onCommit={c.rename} /></Field>
              </section>
              {DRAWERS.map(({ id, name: title, Icon }) => (
                <section key={id} className="charPanel charDrawer" aria-label={title}>
                  <h3 className="charDrawerHead">
                    <button type="button" className="charDrawerBtn" aria-expanded={drawer === id} aria-controls={`charDrawer-${id}`} onClick={() => setDrawer(drawer === id ? '' : id)}>
                      <Icon size={16} /><span>{title}</span>
                    </button>
                  </h3>
                  {drawer === id && (
                    <div className="charDrawerBody" id={`charDrawer-${id}`}>
                      {id === 'body' && <BodyDrawer ctx={ctx} />}
                      {id === 'head' && <HeadDrawer ctx={ctx} />}
                      {id === 'eyes' && <EyesDrawer ctx={ctx} />}
                      {id === 'nose' && <NoseMouthDrawer ctx={ctx} />}
                      {id === 'hair' && <HairDrawer ctx={ctx} />}
                      {id === 'marks' && <MarksDrawer ctx={ctx} />}
                      {id === 'clothes' && <ClothesDrawer ctx={ctx} />}
                      {id === 'pose' && <PoseDrawer ctx={ctx} />}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        ) : doc ? null : (
          <p className="charNote charEmpty">{c.cast.length === 0 ? 'Make a character to start: a face, a build and a wardrobe.' : 'Pick a character in the list to open it.'}</p>
        )}
      </div>
    </div>
  )
}
