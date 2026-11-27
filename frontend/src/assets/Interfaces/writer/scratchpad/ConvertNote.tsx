import { useEffect, useMemo, useState } from 'react'
import { FLAG_KINDS, type FlagType, type OutlineNode, type OutlineNodeKind, type OutlineTree, type PlotNode, type PlotTree } from '../../../../api/types'
import { getOutline, putOutline } from '../../../../api/outlineApi'
import { getPlot, putPlot } from '../../../../api/plotApi'
import { createRevisionFlag } from '../schedule/scheduleApi'
import { changeMomentDraft } from '../draftInserts'
import type { WriterWorkspace } from '../useWriterWorkspace'
import {
  chapterOf, chaptersOf, fieldsOf, momentsOf, NEW_KINDS, noteParagraph, noteParts, parentsFor, TARGET_NAMES, withNodeFlag, withOutlineNode,
  withParagraph, withPlotpoint, type ConvertTarget, type NoteConversion, type NoteLike,
} from './noteConversion'

// "Convert this note" (under a Scratchpad note being edited): make the note into an outline node, a plotpoint, draft text or a revision flag, in
// a project chosen here. The open project is changed through the workspace (the change waits for its Save, like any edit there); another project
// is read and written at once. A moment whose chapter is open in the Draft takes draft text as typed text (draftInserts.ts). Afterwards the note
// stays, marked with what it became, or goes (the switch).

const KIND_NAME: Record<OutlineNodeKind, string> = { series: 'Series', book: 'Book', arc: 'Arc', chapter: 'Chapter', act: 'Act', scene: 'Scene', moment: 'Moment' }
const FLAG_NAME: Record<FlagType, string> = { review: 'Review', add: 'Add', remove: 'Remove', merge: 'Merge', change: 'Change', simplify: 'Simplify', expand: 'Expand' }
const TITLE_MAX = 50 // a plotpoint's title
const NOTES_MAX = 255 // its description

interface Trees { outline: OutlineTree; plot: PlotTree }

export function ConvertNote({ w, note, onDone }: {
  w: WriterWorkspace
  note: NoteLike
  onDone: (conversion: NoteConversion, keep: boolean) => void
}) {
  const projects = w.projects ?? []
  const [projectId, setProjectId] = useState<string>(w.activeProjectId ?? projects[0]?.projectId ?? '')
  const isOpen = projectId !== '' && projectId === w.activeProjectId
  const [remote, setRemote] = useState<{ id: string; trees: Trees } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    if (!projectId || isOpen) return undefined
    let live = true
    setLoadError(null)
    Promise.all([getOutline(projectId), getPlot(projectId)])
      .then(([outline, plot]) => { if (live) setRemote({ id: projectId, trees: { outline, plot } }) })
      .catch(() => { if (live) setLoadError('That project could not be read. Check that Scriblr is running, then try again.') })
    return () => { live = false }
  }, [projectId, isOpen])
  const ready = isOpen || remote?.id === projectId
  const outline: OutlineNode[] = useMemo(
    () => (isOpen ? w.outlineNodes : remote?.id === projectId ? remote.trees.outline.nodes : []), [isOpen, w.outlineNodes, remote, projectId],
  )
  const plot: PlotNode[] = useMemo(() => (isOpen ? w.plotNodes : remote?.id === projectId ? remote.trees.plot.nodes : []), [isOpen, w.plotNodes, remote, projectId])

  const parts = noteParts(note)
  const paragraph = noteParagraph(note)
  const [target, setTarget] = useState<ConvertTarget>('outline')
  const [kind, setKind] = useState<OutlineNodeKind>('moment')
  const [parentId, setParentId] = useState<string>('')
  const [title, setTitle] = useState(parts.title)
  const [summary, setSummary] = useState(parts.rest)
  // The text that goes into a draft or a flag's note: the note as one paragraph, to put right before converting.
  const [text, setText] = useState(paragraph)
  const [field, setField] = useState('')
  const [placeOn, setPlaceOn] = useState('')
  const [momentId, setMomentId] = useState('')
  const [where, setWhere] = useState<'start' | 'end'>('end')
  const [flagKind, setFlagKind] = useState<FlagType>('review')
  const [flagOn, setFlagOn] = useState('project')
  const [keep, setKeep] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parents = useMemo(() => parentsFor(outline, kind), [outline, kind])
  const fields = useMemo(() => fieldsOf(plot), [plot])
  const moments = useMemo(() => momentsOf(outline), [outline])
  const chapters = useMemo(() => chaptersOf(outline), [outline])
  // A choice that is not among the project's places falls back to the first one.
  const parent = parents.some(p => (p.id ?? '') === parentId) ? parentId : parents[0]?.id ?? ''
  const fieldKey = fields.some(f => `${f.holderId}|${f.fieldId}` === field) ? field : fields[0] ? `${fields[0].holderId}|${fields[0].fieldId}` : ''
  const moment = moments.some(m => m.id === momentId) ? momentId : moments[0]?.id ?? ''
  const flagTarget = flagOn === 'project' || chapters.some(c => c.id === flagOn) ? flagOn : 'project'
  const flaggedAlready = flagTarget !== 'project' ? outline.find(n => n.id === flagTarget)?.flag ?? null : null
  const projectTitle = projects.find(p => p.projectId === projectId)?.title ?? ''

  const blocked = !paragraph ? 'The note is empty.'
    : !ready ? null
      : target === 'outline' && parents.length === 0 ? `There is nowhere in this project for a ${KIND_NAME[kind].toLowerCase()} yet: add what it goes inside first.`
        : target === 'plot' && fields.length === 0 ? 'This project’s plot has no field to write a plotpoint into yet: add one in its Plot.'
          : target === 'draft' && moments.length === 0 ? 'This project has no moments yet: outline one to write into.'
            : null
  const canConvert = ready && !blocked && !working && (target !== 'outline' || (kind === 'scene' ? summary.trim() || title.trim() : title.trim() || summary.trim()))
    && (target !== 'plot' || title.trim()) && ((target !== 'draft' && target !== 'flag') || text.trim())

  async function convert() {
    if (!canConvert) return
    setWorking(true)
    setError(null)
    try {
      if (target === 'outline') {
        const under = parent || null
        const fields: Partial<OutlineNode> = kind === 'scene' ? { action: [title.trim(), summary.trim()].filter(Boolean).join(' ') } : { title: title.trim(), synopsis: summary.trim() }
        if (isOpen) w.addOutlineNode(under, kind, fields)
        else if (remote) await putOutline(projectId, { ...remote.trees.outline, nodes: withOutlineNode(remote.trees.outline.nodes, under, kind, fields).nodes })
      } else if (target === 'plot') {
        const [holderId, fieldId] = fieldKey.split('|')
        const t = title.trim().slice(0, TITLE_MAX)
        const body = summary.trim().slice(0, NOTES_MAX)
        if (isOpen) {
          const id = w.addPlotValue(holderId, fieldId)
          if (!id) throw new Error('That field takes no plotpoints.')
          w.updatePlotValue(id, { title: t, body })
          if (placeOn) w.placePlotpoint(id, placeOn)
        } else if (remote) {
          const made = withPlotpoint(remote.trees.plot.nodes, remote.trees.outline.nodes, holderId, fieldId, t, body, placeOn || null)
          if (!made.id) throw new Error('That field takes no plotpoints.')
          await putPlot(projectId, { ...remote.trees.plot, nodes: made.nodes })
        }
      } else if (target === 'draft') {
        const chapterId = chapterOf(outline, moment)
        if (!chapterId) throw new Error('That moment is in no chapter.')
        const words = text.trim().split(/\s*\n\s*/).filter(Boolean).join(' ')
        await changeMomentDraft(projectId, chapterId, moment, body => withParagraph(body, words, where))
      } else if (flagTarget === 'project') {
        await createRevisionFlag(projectId, { scope: 'project', type: flagKind, note: text.trim() })
      } else if (isOpen) {
        w.updateOutlineNode(flagTarget, { flag: { type: flagKind, note: text.trim() } })
      } else if (remote) {
        await putOutline(projectId, { ...remote.trees.outline, nodes: withNodeFlag(remote.trees.outline.nodes, flagTarget, flagKind, text.trim()) })
      }
      onDone({ target, projectId, projectTitle, at: new Date().toISOString() }, keep)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'It could not be converted. Try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="wrConvert" aria-label="Convert this note" onKeyDown={e => e.stopPropagation()}>
      <span className="wrConvertTitle">Convert this note</span>
      <div className="wrConvertBlock">
        <span className="wrLabel">Make it into</span>
        <div className="wrChoice" role="group" aria-label="Make it into">
          {(Object.keys(TARGET_NAMES) as ConvertTarget[]).map(t => (
            <button key={t} type="button" aria-pressed={target === t} className={target === t ? 'on' : undefined} onClick={() => setTarget(t)}>{TARGET_NAMES[t]}</button>
          ))}
        </div>
      </div>
      <label className="wrConvertField">
        <span className="wrLabel">In the project</span>
        <select className="wrField" value={projectId} onChange={e => setProjectId(e.target.value)}>
          {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.title || 'Untitled project'}</option>)}
        </select>
      </label>
      {loadError && <p className="wrError" role="alert">{loadError}</p>}
      {!ready && !loadError && projectId && <p className="wrConvertNote" role="status">Reading the project…</p>}

      {ready && target === 'outline' && (
        <div className="wrConvertGrid">
          <label className="wrConvertField">
            <span className="wrLabel">A new</span>
            <select className="wrField" value={kind} onChange={e => setKind(e.target.value as OutlineNodeKind)}>
              {NEW_KINDS.map(k => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
            </select>
          </label>
          <label className="wrConvertField">
            <span className="wrLabel">Inside</span>
            <select className="wrField" value={parent} onChange={e => setParentId(e.target.value)} disabled={parents.length === 0}>
              {parents.map(p => <option key={p.id ?? 'top'} value={p.id ?? ''}>{p.label}</option>)}
            </select>
          </label>
          {kind === 'scene' ? (
            <label className="wrConvertField wrConvertField--wide">
              <span className="wrLabel">What happens</span>
              <input className="wrField" value={[title, summary].filter(s => s.trim()).join(' ')} onChange={e => { setTitle(e.target.value); setSummary('') }} />
            </label>
          ) : (
            <>
              <label className="wrConvertField">
                <span className="wrLabel">Title (the first line)</span>
                <input className="wrField" value={title} onChange={e => setTitle(e.target.value)} />
              </label>
              <label className="wrConvertField">
                <span className="wrLabel">Summary (the rest)</span>
                <input className="wrField" value={summary} onChange={e => setSummary(e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}

      {ready && target === 'plot' && (
        <div className="wrConvertGrid">
          <label className="wrConvertField">
            <span className="wrLabel">In the field</span>
            <select className="wrField" value={fieldKey} onChange={e => setField(e.target.value)} disabled={fields.length === 0}>
              {fields.map(f => <option key={`${f.holderId}|${f.fieldId}`} value={`${f.holderId}|${f.fieldId}`}>{f.label}</option>)}
            </select>
          </label>
          <label className="wrConvertField">
            <span className="wrLabel">Placed at (optional)</span>
            <select className="wrField" value={placeOn} onChange={e => setPlaceOn(e.target.value)}>
              <option value="">Not placed yet</option>
              {moments.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="wrConvertField">
            <span className="wrLabel">Title (the first line)</span>
            <input className="wrField" maxLength={TITLE_MAX} value={title.slice(0, TITLE_MAX)} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="wrConvertField">
            <span className="wrLabel">Notes (the rest)</span>
            <input className="wrField" maxLength={NOTES_MAX} value={summary.slice(0, NOTES_MAX)} onChange={e => setSummary(e.target.value)} />
          </label>
        </div>
      )}

      {ready && target === 'draft' && (
        <>
          <div className="wrConvertGrid">
            <label className="wrConvertField">
              <span className="wrLabel">Into the moment</span>
              <select className="wrField" value={moment} onChange={e => setMomentId(e.target.value)} disabled={moments.length === 0}>
                {moments.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <div className="wrConvertField">
              <span className="wrLabel">Where</span>
              <div className="wrChoice" role="group" aria-label="Where in the moment">
                <button type="button" aria-pressed={where === 'start'} className={where === 'start' ? 'on' : undefined} onClick={() => setWhere('start')}>At the start</button>
                <button type="button" aria-pressed={where === 'end'} className={where === 'end' ? 'on' : undefined} onClick={() => setWhere('end')}>At the end</button>
              </div>
            </div>
          </div>
          <label className="wrConvertField">
            <span className="wrLabel">Its text</span>
            <textarea className="wrField" rows={3} value={text} onChange={e => setText(e.target.value)} />
          </label>
          <span className="wrConvertNote">The note’s text goes in as a new paragraph of the draft.</span>
        </>
      )}

      {ready && target === 'flag' && (
        <>
          <div className="wrConvertGrid">
            <label className="wrConvertField">
              <span className="wrLabel">Kind</span>
              <select className="wrField" value={flagKind} onChange={e => setFlagKind(e.target.value as FlagType)}>
                {FLAG_KINDS.map(k => <option key={k} value={k}>{FLAG_NAME[k]}</option>)}
              </select>
            </label>
            <label className="wrConvertField">
              <span className="wrLabel">On</span>
              <select className="wrField" value={flagTarget} onChange={e => setFlagOn(e.target.value)}>
                <option value="project">The project</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <label className="wrConvertField">
            <span className="wrLabel">The flag’s note</span>
            <textarea className="wrField" rows={3} value={text} onChange={e => setText(e.target.value)} />
          </label>
          <span className="wrConvertNote">
            The note becomes the flag’s note.
            {flaggedAlready && ` This chapter has a ${FLAG_NAME[flaggedAlready.type]} flag already: this one takes its place.`}
          </span>
        </>
      )}

      {blocked && ready && <p className="wrConvertNote" role="status">{blocked}</p>}
      {error && <p className="wrError" role="alert">{error}</p>}
      <div className="wrConvertFoot">
        <label className="wrConvertKeep">
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />
          Keep the note, marked with what it became
        </label>
        <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={!canConvert} onClick={() => void convert()}>{working ? 'Converting…' : 'Convert'}</button>
      </div>
    </section>
  )
}

export default ConvertNote
