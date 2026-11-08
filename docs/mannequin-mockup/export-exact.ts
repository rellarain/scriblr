// Exports the EXACT shapes the old portrait engine draws (paint order, tagged by part) as mannequin point lists with explicit handles, plus how each fill derives from the
// character's colours (the same colour, or a shade or mix of it) so the new system can use the old system's own tones. Read-only on the user's data. Output: exact-data.json
import { readFileSync, writeFileSync } from 'node:fs'
import { defaultPortrait, normalizePortrait } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/defaults'
import { drawnOf } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/scene'
import { rigOf } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/rig'
import { Shapes, band, lerp, PI, sample } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/paths'
import { EXPRESSIONS, HEADS, EARS, EYES, BROWS, NOSES, MOUTHS, pick } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/library'
import { FANTASY_EARS, HOODED } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/fantasyLibrary'
import { shade, mix } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/colour'
import { drawBody } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/body'
import { drawBeard, drawMoustache } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/facial'
import { drawBrows, drawMouth, drawNose } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/features'
import { drawFantasyEars, drawCrown, drawEyeSet, drawHeldItem, drawHood, drawHoodDown, drawHorns, drawNecklace } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/fantasy'
import { drawEars, drawHead } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/head'
import { drawHair } from 'C:/Users/rella/scriblr/scriblr/frontend/src/assets/Interfaces/writer/characters/portrait/draw/hair'

const dir = 'C:/Users/rella/AppData/Local/Temp/claude/aa8d8c71d38cb425/762b7e63-112a-4794-aff7-9345cfd32b9f/scratchpad/mockup/'
type P = { x: number; y: number; m: string; hi: number[] | null; ho: number[] | null }

// ---- the old engine's scene, part by part (the same calls in the same order as scene.ts, each tagged) ----
function tagged(portrait: any): { part: string; d: string; fill: string; opacity: number }[] {
  const p = drawnOf(portrait) as any
  const g = rigOf(p) as any
  const ex = pick(EXPRESSIONS, p.expression)
  const out = new Shapes(), tags: string[] = []
  const t = (name: string, fn: () => void) => { const n0 = out.list.length; fn(); for (let i = n0; i < out.list.length; i++) tags[i] = name }
  t('hairBack', () => drawHair(out, g, p, 'back'))
  t('hoodDown', () => drawHoodDown(out, g, p))
  t('body', () => drawBody(out, g, p))
  t('necklace', () => drawNecklace(out, g, p))
  if (pick(FANTASY_EARS, p.fantasyEars).id === 'none') t('ears', () => drawEars(out, g, p)); else t('ears', () => drawFantasyEars(out, g, p))
  t('head', () => drawHead(out, g, p))
  if (g.lines > 1) t('lines', () => { [0, 1].forEach((i) => { const y = g.browY - g.H * (0.075 + i * 0.05); out.add(band(sample((tt: number) => [lerp(100 - g.fore * 0.45, 100 + g.fore * 0.45, tt), y - Math.sin(tt * PI) * 1.2], 8), 0.2, 0.2, 0.7), shade(p.skin, 0.12), 0.65) }) })
  if (p.eyeCount === 'one') {
    t('brows', () => drawBrows(out, { ...g, eyeCX: -g.eyeHW * 0.3, eyeHW: g.eyeHW * 1.55 }, p, ex, [1]))
    t('nose', () => drawNose(out, g, p)); t('eyes', () => drawEyeSet(out, g, p, ex))
  } else {
    t('brows', () => drawBrows(out, g, p, ex)); t('eyes', () => drawEyeSet(out, g, p, ex)); t('nose', () => drawNose(out, g, p))
  }
  t('beard', () => drawBeard(out, g, p, ex)); t('mouth', () => drawMouth(out, g, p, ex)); t('moustache', () => drawMoustache(out, g, p, ex))
  t('hairFront', () => drawHair(out, g, p, 'front'))
  if ((HOODED as string[]).includes(p.hood)) { t('hood', () => drawHood(out, g, p)); t('hairFall', () => drawHair(out, g, p, 'fall')) }
  t('horns', () => drawHorns(out, g, p)); t('crown', () => drawCrown(out, g, p)); t('heldItem', () => drawHeldItem(out, g, p))
  return out.list.map((s, i) => ({ part: tags[i], ...s }))
}

// ---- an SVG path as mannequin points with explicit handles: M L C Q A Z (every arc of the old engine is a whole ellipse) ----
function tokens(d: string): (string | number)[] { const out: (string | number)[] = []; const re = /([MLCQAZHV])|(-?\d*\.?\d+(?:e-?\d+)?)/gi; let m; while ((m = re.exec(d))) out.push(m[1] ? m[1].toUpperCase() : parseFloat(m[2])); return out }
function parse(d: string): { closed: boolean; pts: P[] }[] {
  const tk = tokens(d), subs: { closed: boolean; segs: any[]; start: number[] }[] = []
  let i = 0, cur: number[] = [0, 0], sub: any = null
  const num = () => tk[i++] as number
  while (i < tk.length) {
    const c = tk[i++] as string
    if (c === 'M') { const x = num(), y = num(); sub = { closed: false, segs: [], start: [x, y] }; subs.push(sub); cur = [x, y] }
    else if (c === 'L') { const x = num(), y = num(); sub.segs.push({ k: 'L', p: [x, y] }); cur = [x, y] }
    else if (c === 'H') { const x = num(); sub.segs.push({ k: 'L', p: [x, cur[1]] }); cur = [x, cur[1]] }
    else if (c === 'V') { const y = num(); sub.segs.push({ k: 'L', p: [cur[0], y] }); cur = [cur[0], y] }
    else if (c === 'C') { const a = [num(), num()], b = [num(), num()], p = [num(), num()]; sub.segs.push({ k: 'C', a, b, p }); cur = p }
    else if (c === 'Q') { const q = [num(), num()], p = [num(), num()]; sub.segs.push({ k: 'C', a: [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], b: [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p }); cur = p }
    else if (c === 'A') { const rx = num(), ry = num(); num(); const large = num(), sweep = num(), x = num(), y = num(); sub.segs.push({ k: 'A', rx, ry, large, sweep, p: [x, y], from: cur.slice() }); cur = [x, y] }
    else if (c === 'Z') { sub.closed = true }
    else throw new Error('path command ' + c)
  }
  const outSubs: { closed: boolean; pts: P[] }[] = []
  for (const s of subs) {
    // expand arcs: two half-ellipse arcs make a whole ellipse, as four cubic quarter arcs
    const segs: any[] = []
    for (let k = 0; k < s.segs.length; k++) {
      const sg = s.segs[k]
      if (sg.k === 'A') {
        const nx = s.segs[k + 1]
        if (nx && nx.k === 'A') {
          const cx = (sg.from[0] + sg.p[0]) / 2, cy = (sg.from[1] + sg.p[1]) / 2, rx = sg.rx, ry = sg.ry, K = 0.5522847498
          const top = [cx, cy - ry], right = [cx + rx, cy], bottom = [cx, cy + ry], left = [cx - rx, cy]
          // start at the left point, over the top (sweep 0 = counter-clockwise on screen... the old engine draws left -> right -> left): left -> top -> right -> bottom -> left
          segs.push({ k: 'C', a: [left[0], left[1] - K * ry], b: [top[0] - K * rx, top[1]], p: top })
          segs.push({ k: 'C', a: [top[0] + K * rx, top[1]], b: [right[0], right[1] - K * ry], p: right })
          segs.push({ k: 'C', a: [right[0], right[1] + K * ry], b: [bottom[0] + K * rx, bottom[1]], p: bottom })
          segs.push({ k: 'C', a: [bottom[0] - K * rx, bottom[1]], b: [left[0], left[1] + K * ry], p: left })
          k++
          continue
        }
        // a single arc: a straight chord (not used by the old engine)
        segs.push({ k: 'L', p: sg.p })
      } else segs.push(sg)
    }
    // nodes: the start, then the end of each segment (a closing segment that returns to the start is merged into the first node)
    const nodes: { p: number[]; inH: number[] | null; outH: number[] | null }[] = [{ p: s.start, inH: null, outH: null }]
    let prev = nodes[0]
    segs.forEach((sg, idx) => {
      if (sg.k === 'C') prev.outH = sg.a
      const isLast = idx === segs.length - 1, back = isLast && Math.hypot(sg.p[0] - s.start[0], sg.p[1] - s.start[1]) < 0.011
      if (back) { nodes[0].inH = sg.k === 'C' ? sg.b : null; return }
      const nn = { p: sg.p, inH: sg.k === 'C' ? sg.b : null, outH: null as number[] | null }
      nodes.push(nn); prev = nn
    })
    const pts: P[] = nodes.map((n) => {
      const hasIn = !!n.inH && Math.hypot(n.inH[0] - n.p[0], n.inH[1] - n.p[1]) > 0.0001, hasOut = !!n.outH && Math.hypot(n.outH[0] - n.p[0], n.outH[1] - n.p[1]) > 0.0001
      const m = hasIn && hasOut ? 'c' : hasIn ? 'cs' : hasOut ? 'sc' : 's'
      const rr = (v: number) => Math.round(v * 100) / 100
      return { x: rr(n.p[0]), y: rr(n.p[1]), m, hi: hasIn ? [rr(n.inH![0] - n.p[0]), rr(n.inH![1] - n.p[1])] : null, ho: hasOut ? [rr(n.outH![0] - n.p[0]), rr(n.outH![1] - n.p[1])] : null }
    })
    outSubs.push({ closed: s.closed || true, pts })
  }
  return outSubs
}

// ---- how a fill derives from the character's colours: the colour itself, a shade of it (the old engine's own shade()), or a mix of it with white or black ----
function classify(fill: string, bases: Record<string, string>): { base: string; op: string; amt: number } | null {
  const f = fill.toLowerCase()
  for (const k of Object.keys(bases)) if (bases[k] && bases[k].toLowerCase() === f) return { base: k, op: 'base', amt: 0 }
  let best: { base: string; op: string; amt: number } | null = null
  for (const k of Object.keys(bases)) {
    const b = bases[k]; if (!b) continue
    for (let t = 0.005; t <= 0.6; t += 0.005) {
      const tt = Math.round(t * 1000) / 1000
      if (shade(b, tt).toLowerCase() === f) return { base: k, op: 'shade', amt: tt }
      if (mix(b, '#ffffff', tt).toLowerCase() === f) best = best || { base: k, op: 'light', amt: tt }
      if (mix(b, '#000000', tt).toLowerCase() === f) best = best || { base: k, op: 'dark', amt: tt }
    }
  }
  return best
}

function exportOne(name: string, raw: any) {
  const portrait = normalizePortrait(raw), p = drawnOf(portrait) as any
  const bases: Record<string, string> = { skin: p.skin, hair: p.hairColor, brow: p.browColor, lip: p.lipColor, eye: p.eyeColor, top: p.topColor, facial: p.facialHairColor, tile: p.tileColor, highlight: p.highlightColor || '', white: '#ffffff' }
  const shapes = tagged(portrait)
  const out: any[] = []
  let literal = 0
  const baseSeen: Record<string, boolean> = {}
  shapes.forEach((s) => {
    const subs = parse(s.d)
    let cl = classify(s.fill, bases)
    // the back hair is a mass of its own, painted in a tone of the hair colour: a base shape, not shading. A shade over it (a real shading shape) comes after a base mass in the same part.
    if (cl && s.part === 'hairBack') {
      if (cl.op === 'base') baseSeen[s.part] = true
      else if (cl.op === 'shade' && !baseSeen[s.part]) cl = { base: cl.base, op: 'tone', amt: cl.amt }
    }
    if (!cl) literal++
    subs.forEach((sub, k) => out.push({ part: s.part, fill: s.fill, opacity: s.opacity, cls: cl, closed: sub.closed, pts: sub.pts, sub: k }))
  })
  return { name, tile: p.tileColor, bases, shapes: out, literal }
}

const chars = JSON.parse(readFileSync(dir + 'user-characters.json', 'utf8')) as { name: string; portrait: any }[]
const result = { default: exportOne('default', defaultPortrait()), chars: chars.map((c) => exportOne(c.name, c.portrait)) }
writeFileSync(dir + 'exact-data.json', JSON.stringify(result))
const sum = (e: any) => `${e.name}: ${e.shapes.length} shapes, ${e.literal} with a colour that is not a shade of the character's own`
console.log(sum(result.default)); result.chars.forEach((c) => console.log(sum(c)))
const parts: Record<string, number> = {}; result.default.shapes.forEach((s: any) => { parts[s.part] = (parts[s.part] || 0) + 1 }); console.log('default parts', JSON.stringify(parts))
// ---- the option lists, each option drawn by the old engine alone (everything else at the default), keeping that part's shapes ----
function optionsOf(field: string, list: { id: string; name: string }[], parts: string[]) {
  return list.map((o) => {
    const e = exportOne(o.id, { ...defaultPortrait(), [field]: o.id })
    return { id: o.id, name: o.name, shapes: e.shapes.filter((s: any) => parts.includes(s.part)) }
  })
}
const options = {
  headShape: optionsOf('headShape', HEADS, ['head']), ears: optionsOf('ears', EARS, ['ears']), eyes: optionsOf('eyes', EYES, ['eyes']),
  brows: optionsOf('brows', BROWS, ['brows']), nose: optionsOf('nose', NOSES, ['nose']), mouth: optionsOf('mouth', MOUTHS, ['mouth']),
}

// ---- compact data files for the mockup ----
const cp = (pts: P[]) => pts.map((q) => q.m === 'c' ? [q.x, q.y, 'c', q.hi![0], q.hi![1], q.ho![0], q.ho![1]] : q.m === 'cs' ? [q.x, q.y, 'cs', q.hi![0], q.hi![1]] : q.m === 'sc' ? [q.x, q.y, 'sc', q.ho![0], q.ho![1]] : [q.x, q.y, 's'])
const cs = (s: any) => ({ p: s.part, f: s.fill, o: s.opacity, c: s.cls ? [s.cls.base, s.cls.op, s.cls.amt] : null, n: cp(s.pts) })
const ce = (e: any) => ({ name: e.name, tile: e.tile, bases: e.bases, shapes: e.shapes.map(cs) })
const cdef = ce(result.default)
const copts: any = {}
Object.keys(options).forEach((k) => { copts[k] = (options as any)[k].map((o: any) => ({ id: o.id, name: o.name, shapes: o.shapes.map(cs) })) })
const wrap = (name: string, v: any) => `/* exact shapes drawn by the old portrait engine, as point lists with explicit handles (generated; do not edit) */
(typeof window !== "undefined" ? window : globalThis).${name} = ${JSON.stringify(v)};
`
writeFileSync(dir + 'project/exact-default.js', wrap('ExactDefault', { shapes: cdef.shapes, options: copts, bases: result.default.bases }))
writeFileSync(dir + 'project/exact-chars.js', wrap('ExactChars', result.chars.map(ce)))
console.log('options', Object.keys(copts).map((k) => k + ':' + copts[k].length).join(' '))
