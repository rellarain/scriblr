import { useRef, useState } from 'react'
import type { CharacterLook, CharacterMark, CharacterMarkKind, CharacterOutfit } from '../../../../api/types'
import { CHARACTER_MAX_MARKS, CHARACTER_MAX_STROKES } from '../../../../api/types'
import { PlusIcon, TrashIcon, UndoIcon } from '../../../icons'
import { CharacterArt, type ArtBox } from './art/CharacterArt'
import { EARS, EYES, BROWS, FACIAL_HAIR, HAIR, HEAD_SHAPES, MOUTHS, NOSES, type Option } from './art/library'
import { ACCESSORIES, AREAS, BOTTOMS, BUILDS, DEFAULT_MARK_COLORS, DESIGNS, ITEMS, MARK_KINDS, OUTER, POSES, SHOES, SLOT_NAMES, TOPS, areaOf, type OutfitSlot } from './art/wardrobe'
import { Colour, Field, Options, Slider } from './CharFields'
import { RANGES, type SliderKey } from './art/defaults'

// The drawers of the Characters console's side panel: what the author chooses for each part of the figure. A drawer is handed the look and the ways to change it.

export interface DrawerCtx {
  look: CharacterLook
  // Change some of the look; edits with the same `group` in quick succession are one undo step (a slider).
  set: (patch: Partial<CharacterLook>, group?: string) => void
  setOutfit: (patch: Partial<CharacterOutfit>, group?: string) => void
}

const SKIN = ['#f6d7bd', '#e8b890', '#e0b08a', '#c98f6b', '#a8683f', '#8d5a3b', '#6b4226', '#4a2c1a'] as const
const HAIR_COLOURS = ['#1f1a17', '#3b2a20', '#7a3f22', '#a8683f', '#d9b26f', '#e8d9a8', '#c4452d', '#8a8f98', '#f2f2f2', '#4a6fa5', '#7a3f9a', '#3e8a5a'] as const
const EYE_COLOURS = ['#5b3a29', '#3e6b5a', '#3b6ea5', '#6b6b6b', '#8a6a2a', '#1c1226', '#7a3f9a'] as const
const LIP_COLOURS = ['#b5655a', '#c98f8a', '#8a3a3a', '#a64a6a', '#7a4a3a'] as const
const CLOTH_COLOURS = ['#4a6fa5', '#3b3f4a', '#6b5b4a', '#802020', '#d9d2c0', '#2f4a5a', '#4a8a5a', '#c9a227', '#7a3f9a', '#1c1226'] as const
const MARK_COLOURS = ['#a8683f', '#5a3a28', '#b86a6a', '#2f3b52', '#e6847a', '#6a4a8a', '#b3322e', '#1c1226'] as const

// A picture of one part: the figure drawn with the choice, cropped to the part.
const CROPS: Record<string, ArtBox> = {
  head: { x: -60, y: -62, w: 120, h: 124 },
  eyes: { x: -38, y: -26, w: 76, h: 38 },
  brows: { x: -38, y: -36, w: 76, h: 38 },
  nose: { x: -26, y: -20, w: 52, h: 50 },
  mouth: { x: -30, y: 12, w: 60, h: 36 },
  hair: { x: -80, y: -100, w: 160, h: 190 },
}
function Thumb({ look, patch, crop }: { look: CharacterLook; patch: Partial<CharacterLook>; crop: keyof typeof CROPS }) {
  return <CharacterArt look={{ ...look, ...patch }} mode="head" crop={CROPS[crop]} label="" className="charThumb" marks={false} />
}
function PoseThumb({ look, pose }: { look: CharacterLook; pose: string }) {
  return <CharacterArt look={{ ...look, pose }} mode="full" label="" className="charThumb charThumb--tall" marks={false} />
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v)}°`
function S({ ctx, k, label, format = pct, step = 0.01 }: { ctx: DrawerCtx; k: SliderKey; label: string; format?: (v: number) => string; step?: number }) {
  const [lo, hi] = RANGES[k]
  return <Slider label={label} value={ctx.look[k]} min={lo} max={hi} step={step} format={format} onChange={v => ctx.set({ [k]: v } as Partial<CharacterLook>, k)} />
}

export function BodyDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Build"><Options label="Build" items={BUILDS} value={look.build} onPick={id => id && ctx.set({ build: id })} /></Field>
      <S ctx={ctx} k="height" label="Height" />
      <S ctx={ctx} k="width" label="Width" />
      <S ctx={ctx} k="shoulders" label="Shoulders" />
      <Field label="Skin"><Colour label="Skin colour" value={look.skin} swatches={SKIN} onChange={c => c && ctx.set({ skin: c }, 'skin')} /></Field>
    </>
  )
}

export function HeadDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Head shape">
        <Options label="Head shape" items={HEAD_SHAPES} value={look.headShape} onPick={id => id && ctx.set({ headShape: id })} thumb={o => <Thumb look={look} patch={{ headShape: o.id, hair: 'bald' }} crop="head" />} />
      </Field>
      <S ctx={ctx} k="headWidth" label="Head width" />
      <Field label="Ears"><Options label="Ears" items={EARS} value={look.ears} onPick={id => id && ctx.set({ ears: id })} /></Field>
      <S ctx={ctx} k="earSize" label="Ear size" />
    </>
  )
}

export function EyesDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Eyes"><Options label="Eyes" items={EYES} value={look.eyes} onPick={id => id && ctx.set({ eyes: id })} thumb={o => <Thumb look={look} patch={{ eyes: o.id }} crop="eyes" />} /></Field>
      <Field label="Eye colour"><Colour label="Eye colour" value={look.eyeColor} swatches={EYE_COLOURS} onChange={c => c && ctx.set({ eyeColor: c }, 'eyeColor')} /></Field>
      <S ctx={ctx} k="eyeSize" label="Eye size" />
      <S ctx={ctx} k="eyeSpacing" label="Eye spacing" />
      <S ctx={ctx} k="eyeTilt" label="Eye tilt" format={deg} step={1} />
      <Field label="Brows"><Options label="Brows" items={BROWS} value={look.brows} onPick={id => id && ctx.set({ brows: id })} thumb={o => <Thumb look={look} patch={{ brows: o.id }} crop="brows" />} /></Field>
      <Field label="Brow colour"><Colour label="Brow colour" value={look.browColor} swatches={HAIR_COLOURS} onChange={c => c && ctx.set({ browColor: c }, 'browColor')} /></Field>
      <S ctx={ctx} k="browThickness" label="Brow thickness" />
      <S ctx={ctx} k="browTilt" label="Brow tilt" format={deg} step={1} />
    </>
  )
}

export function NoseMouthDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Nose"><Options label="Nose" items={NOSES} value={look.nose} onPick={id => id && ctx.set({ nose: id })} thumb={o => <Thumb look={look} patch={{ nose: o.id }} crop="nose" />} /></Field>
      <S ctx={ctx} k="noseSize" label="Nose size" />
      <S ctx={ctx} k="noseWidth" label="Nose width" />
      <Field label="Mouth"><Options label="Mouth" items={MOUTHS} value={look.mouth} onPick={id => id && ctx.set({ mouth: id })} thumb={o => <Thumb look={look} patch={{ mouth: o.id }} crop="mouth" />} /></Field>
      <S ctx={ctx} k="mouthSize" label="Mouth size" />
      <Field label="Lip colour"><Colour label="Lip colour" value={look.lipColor} swatches={LIP_COLOURS} onChange={c => c && ctx.set({ lipColor: c }, 'lipColor')} /></Field>
    </>
  )
}

export function HairDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Hair"><Options label="Hair" items={HAIR} value={look.hair} onPick={id => id && ctx.set({ hair: id })} thumb={o => <Thumb look={look} patch={{ hair: o.id }} crop="hair" />} /></Field>
      <Field label="Hair colour"><Colour label="Hair colour" value={look.hairColor} swatches={HAIR_COLOURS} onChange={c => c && ctx.set({ hairColor: c }, 'hairColor')} /></Field>
      <S ctx={ctx} k="hairLength" label="Hair length" />
      <Field label="Streaks"><Colour label="Streak colour" value={look.streakColor} none="No streaks" swatches={HAIR_COLOURS} onChange={c => ctx.set({ streakColor: c }, 'streakColor')} /></Field>
      {look.streakColor && <S ctx={ctx} k="streakAmount" label="How many streaks" />}
      <Field label="Facial hair"><Options label="Facial hair" items={FACIAL_HAIR} value={look.facialHair} onPick={id => id && ctx.set({ facialHair: id })} /></Field>
      {look.facialHair !== 'none' && <Field label="Facial hair colour"><Colour label="Facial hair colour" value={look.facialHairColor} swatches={HAIR_COLOURS} onChange={c => c && ctx.set({ facialHairColor: c }, 'facialHairColor') } /></Field>}
    </>
  )
}

// ---- marks ----
const nextMarkId = (marks: CharacterMark[]): string => {
  for (let i = 1; ; i += 1) if (!marks.some(m => m.id === `m${i}`)) return `m${i}`
}
const areasFor = (kind: CharacterMarkKind) => AREAS.filter(a => a.marks.includes(kind))

export function MarksDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  const [picked, setPicked] = useState<string | null>(null)
  const [adding, setAdding] = useState<CharacterMarkKind>('freckles')
  const marks = look.marks
  const chosen = marks.find(m => m.id === picked) ?? null
  const update = (id: string, patch: Partial<CharacterMark>, group?: string) => ctx.set({ marks: marks.map(m => (m.id === id ? { ...m, ...patch } : m)) }, group)

  function add() {
    if (marks.length >= CHARACTER_MAX_MARKS) return
    const area = areasFor(adding)[0]
    const mark: CharacterMark = { id: nextMarkId(marks), kind: adding, design: DESIGNS[adding][0].id, area: area.id, x: 0.5, y: 0.5, size: 1, color: null, strokes: [] }
    ctx.set({ marks: [...marks, mark] })
    setPicked(mark.id)
  }
  function changeKind(m: CharacterMark, kind: CharacterMarkKind) {
    const area = areasFor(kind).some(a => a.id === m.area) ? m.area : areasFor(kind)[0].id
    update(m.id, { kind, design: DESIGNS[kind][0].id, area, strokes: [], color: null })
  }

  return (
    <>
      <p className="charHint">Freckles, moles, scars, birthmarks, tattoos, blush, make-up and face paint. A mark on a part the pose does not show is not drawn.</p>
      <ul className="charMarks" aria-label="Marks">
        {marks.map(m => (
          <li key={m.id} className="charMarkRow">
            <button type="button" className="charMarkOpen" aria-pressed={picked === m.id} onClick={() => setPicked(picked === m.id ? null : m.id)}>
              {MARK_KINDS.find(k => k.id === m.kind)?.name} · {areaOf(m.area).name}
            </button>
            <button type="button" className="charIconBtn" aria-label={`Remove ${MARK_KINDS.find(k => k.id === m.kind)?.name} on ${areaOf(m.area).name}`} title="Remove this mark" onClick={() => { ctx.set({ marks: marks.filter(x => x.id !== m.id) }); if (picked === m.id) setPicked(null) }}><TrashIcon size={16} /></button>
          </li>
        ))}
      </ul>
      <div className="charRow">
        <select className="charSelect" aria-label="Kind of mark to add" value={adding} onChange={e => setAdding(e.target.value as CharacterMarkKind)}>
          {MARK_KINDS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button type="button" className="charIconBtn" aria-label="Add a mark" title="Add a mark" disabled={marks.length >= CHARACTER_MAX_MARKS} onClick={add}><PlusIcon size={16} /></button>
      </div>
      {chosen && (
        <section className="charMarkEdit" aria-label="Chosen mark">
          <Field label="Kind">
            <select className="charSelect" aria-label="Kind of mark" value={chosen.kind} onChange={e => changeKind(chosen, e.target.value as CharacterMarkKind)}>
              {MARK_KINDS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </Field>
          <Field label="Design"><Options label="Design" items={DESIGNS[chosen.kind]} value={chosen.design} onPick={id => id && update(chosen.id, { design: id })} /></Field>
          <Field label="Where">
            <select className="charSelect" aria-label="Where the mark goes" value={chosen.area} onChange={e => update(chosen.id, { area: e.target.value })}>
              {areasFor(chosen.kind).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Slider label="Across" value={chosen.x} min={0} max={1} step={0.01} onChange={v => update(chosen.id, { x: v }, `${chosen.id}x`)} format={pct} />
          <Slider label="Up and down" value={chosen.y} min={0} max={1} step={0.01} onChange={v => update(chosen.id, { y: v }, `${chosen.id}y`)} format={pct} />
          <Slider label="Size" value={chosen.size} min={0.2} max={3} step={0.05} onChange={v => update(chosen.id, { size: v }, `${chosen.id}s`)} format={pct} />
          <Field label="Colour"><Colour label="Mark colour" value={chosen.color ?? DEFAULT_MARK_COLORS[chosen.kind]} swatches={MARK_COLOURS} onChange={c => update(chosen.id, { color: c }, `${chosen.id}c`)} /></Field>
          {chosen.kind === 'tattoo' && <TattooPad strokes={chosen.strokes} onChange={strokes => update(chosen.id, { strokes })} color={chosen.color ?? DEFAULT_MARK_COLORS.tattoo} />}
        </section>
      )}
    </>
  )
}

// Draw a tattoo of your own: lines drawn with the pointer on a square (the library design is replaced while there are lines).
export function TattooPad({ strokes, onChange, color }: { strokes: Array<Array<[number, number]>>; onChange: (strokes: Array<Array<[number, number]>>) => void; color: string }) {
  const [live, setLive] = useState<Array<[number, number]> | null>(null)
  const box = useRef<SVGSVGElement>(null)
  const at = (e: React.PointerEvent): [number, number] => {
    const r = box.current?.getBoundingClientRect()
    const w = r && r.width > 0 ? r.width : 140
    const h = r && r.height > 0 ? r.height : 140
    const x = (e.clientX - (r?.left ?? 0)) / w
    const y = (e.clientY - (r?.top ?? 0)) / h
    return [Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000]
  }
  const finish = () => {
    if (live && live.length >= 2 && strokes.length < CHARACTER_MAX_STROKES) onChange([...strokes, live])
    setLive(null)
  }
  const path = (pts: Array<[number, number]>) => `M${pts.map(([x, y]) => `${x * 100} ${y * 100}`).join('L')}`
  return (
    <div className="charPad">
      <svg
        ref={box} className="charPadBox" viewBox="0 0 100 100" role="img" aria-label="Pad to draw a tattoo on" tabIndex={0}
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); setLive([at(e)]) }}
        onPointerMove={e => {
          if (!live || live.length >= 48) return
          const p = at(e)
          const last = live[live.length - 1]
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.02) setLive([...live, p])
        }}
        onPointerUp={finish} onPointerCancel={() => setLive(null)}
      >
        {[...strokes, ...(live ? [live] : [])].map((st, i) => <path key={i} d={path(st)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <div className="charPadTools">
        <button type="button" className="charIconBtn" aria-label="Take the last line back" title="Take the last line back" disabled={strokes.length === 0} onClick={() => onChange(strokes.slice(0, -1))}><UndoIcon size={16} /></button>
        <button type="button" className="charIconBtn" aria-label="Clear the drawing" title="Clear the drawing (back to the library design)" disabled={strokes.length === 0} onClick={() => onChange([])}><TrashIcon size={16} /></button>
        <span className="charHint">{strokes.length} of {CHARACTER_MAX_STROKES} lines</span>
      </div>
    </div>
  )
}

// ---- clothes ----
const SLOT_ITEMS: Record<OutfitSlot, readonly Option[]> = { top: TOPS, bottom: BOTTOMS, shoes: SHOES, outer: OUTER }

export function ClothesDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  const outfit = look.outfit
  const slots: OutfitSlot[] = ['top', 'bottom', 'shoes', 'outer']
  const toggle = (id: string) => ctx.setOutfit({ accessories: outfit.accessories.includes(id) ? outfit.accessories.filter(a => a !== id) : [...outfit.accessories, id].slice(0, 8) })
  return (
    <>
      {slots.map(slot => (
        <div key={slot} className="charSlot">
          <Field label={SLOT_NAMES[slot]}>
            <Options label={SLOT_NAMES[slot]} items={SLOT_ITEMS[slot]} value={outfit[slot]} none="None" onPick={id => ctx.setOutfit({ [slot]: id } as Partial<CharacterOutfit>)} />
          </Field>
          {outfit[slot] && <Colour label={`${SLOT_NAMES[slot]} colour`} value={outfit.colors[slot] ?? '#888888'} swatches={CLOTH_COLOURS} onChange={c => c && ctx.setOutfit({ colors: { ...outfit.colors, [slot]: c } }, `colour${slot}`)} />}
        </div>
      ))}
      <Field label="Accessories">
        <div className="charOptions" role="group" aria-label="Accessories">
          {ACCESSORIES.map(a => (
            <button key={a.id} type="button" className="charOpt" aria-pressed={outfit.accessories.includes(a.id)} aria-label={a.name} title={a.name} onClick={() => toggle(a.id)}><span className="charOptName">{a.name}</span></button>
          ))}
        </div>
      </Field>
      {outfit.accessories.length > 0 && <Colour label="Accessory colour" value={outfit.colors.accessory ?? '#c9a227'} swatches={CLOTH_COLOURS} onChange={c => c && ctx.setOutfit({ colors: { ...outfit.colors, accessory: c } }, 'coloura')} />}
    </>
  )
}

export function PoseDrawer({ ctx }: { ctx: DrawerCtx }) {
  const { look } = ctx
  return (
    <>
      <Field label="Pose"><Options label="Pose" items={POSES} value={look.pose} onPick={id => id && ctx.set({ pose: id })} thumb={o => <PoseThumb look={look} pose={o.id} />} /></Field>
      <Field label="In the left hand"><Options label="Left hand" items={ITEMS} value={look.heldLeft} none="Nothing" onPick={id => ctx.set({ heldLeft: id })} /></Field>
      <Field label="In the right hand"><Options label="Right hand" items={ITEMS} value={look.heldRight} none="Nothing" onPick={id => ctx.set({ heldRight: id })} /></Field>
    </>
  )
}
