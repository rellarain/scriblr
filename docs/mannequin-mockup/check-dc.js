// Smoke test of a .dc.html artboard without the editor runtime: runs its logic class against a stub, checks every {{hole}} resolves,
// then calls every handler it returns (with a fake event) and renders again, to catch exceptions and missing values.
const fs = require('fs')
const path = require('path')
require('./project/designer-engine.js'); try { require('./project/exact-default.js'); require('./project/exact-chars.js') } catch (e) { /* no review data */ }
const file = process.argv[2]
const html = fs.readFileSync(path.resolve(file), 'utf8')
const script = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]
const tpl = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(html)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, '')

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {} }
  setState(p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p) }
  forceUpdate() {}
}
const Component = new Function('DCLogic', 'Mannequin', script + '\n;return Component;')(DCLogic, globalThis.Mannequin)
const c = new Component({})
let problems = 0
const bad = (m) => { problems++; console.log('PROBLEM', m) }

// balance
for (const tag of ['sc-for', 'sc-if', 'div', 'button', 'section', 'nav', 'aside', 'span', 'label', 'p']) {
  const o = (tpl.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length, k = (tpl.match(new RegExp('</' + tag + '>', 'g')) || []).length
  if (o !== k) bad(`unbalanced <${tag}>: ${o} open, ${k} close`)
}

function holes(vals) {
  const stack = []
  const re = /<sc-for\b([^>]*)>|<\/sc-for>|\{\{\s*([^}]+?)\s*\}\}/g
  let m
  while ((m = re.exec(tpl))) {
    if (m[0].startsWith('<sc-for')) {
      const list = /list="\{\{\s*([^}\s]+)\s*\}\}"/.exec(m[1]), as = /as="([^"]+)"/.exec(m[1])
      if (!list || !as) { bad('sc-for without list/as: ' + m[0]); stack.push({ as: '?', items: [] }); continue }
      const parts = list[1].split('.')
      let cur = vals
      for (const p of parts) cur = cur == null ? undefined : cur[p]
      let items = cur
      if (stack.length && parts[0] === stack[stack.length - 1].as) items = undefined
      stack.push({ as: as[1], items: Array.isArray(items) ? items : [], listName: list[1], missing: !Array.isArray(items) && !(stack.length && parts[0] === stack[stack.length - 1].as) })
      if (!Array.isArray(items) && !(stack.length > 1 && parts[0] === stack[stack.length - 2].as)) bad('list not an array: ' + list[1])
      continue
    }
    if (m[0] === '</sc-for>') { stack.pop(); continue }
    const expr = m[2]
    if (expr === 'true' || expr === 'false' || expr === '$index') continue
    if (!/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(expr)) { bad('hole is not a plain lookup: {{' + expr + '}}'); continue }
    const parts = expr.split('.')
    const scope = [...stack].reverse().find((s) => s.as === parts[0])
    if (scope) {
      if (parts.length > 1 && scope.items.length) {
        for (const it of scope.items) if (!(parts[1] in it)) { bad(`item field missing: {{${expr}}} in ${scope.listName}`); break }
      }
    } else if (!(parts[0] in vals)) bad('value missing: {{' + expr + '}}')
    else if (vals[parts[0]] === undefined) bad('value undefined: {{' + expr + '}}')
  }
}

const fakeStage = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 704, height: 616 }) }
const fakeEl = { closest: () => fakeStage, setPointerCapture() {}, getBoundingClientRect: fakeStage.getBoundingClientRect, parentElement: fakeStage }
const ev = (extra) => Object.assign({ target: { value: '40' }, currentTarget: fakeEl, stopPropagation() {}, preventDefault() {}, clientX: 300, clientY: 250, pointerId: 1, key: 'ArrowRight', shiftKey: false }, extra || {})

function exercise(vals, label) {
  const calls = []
  const visit = (v, p, depth) => {
    if (typeof v === 'function') { calls.push([p, v]); return }
    if (depth > 2 || v == null || typeof v !== 'object') return
    if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => visit(x, p + '[' + i + ']', depth + 1))
    else Object.keys(v).forEach((k) => visit(v[k], p + '.' + k, depth + 1))
  }
  Object.keys(vals).forEach((k) => visit(vals[k], k, 0))
  let n = 0
  for (const [p, fn] of calls) {
    try { fn(ev()); n++ } catch (e) { bad(`handler ${p} threw: ${e.message}\n${(e.stack || '').split('\n').slice(1, 3).join('\n')}`) }
    try { const v2 = c.renderVals(); } catch (e) { bad(`render after ${p} threw: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); break }
  }
  return n
}

let vals = c.renderVals()
holes(vals)
console.log('initial render ok, keys:', Object.keys(vals).length)
// walk through the tabs and a few selections, checking holes each time
const tabNames = (process.argv[3] || 'shape,rig,forms,ranges,colour').split(',')
const sels = JSON.parse(process.argv[4] || '[["shape","skull"],["shape","eyeWL"],["object","eyes"],["group","head"],["shape","hairBack"],["group","armL"],["group","torso"],["shape","shirt"]]')
if (c.state.tab !== undefined) {
  for (const t of tabNames) for (const [k, id] of sels) {
    c.setState({ tab: t, selKind: k, selId: id, selPt: 0 })
    try { vals = c.renderVals(); holes(vals) } catch (e) { bad(`render tab=${t} sel=${k}:${id} threw: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`) }
  }
}
let total = 0
if (c.state.tab !== undefined) {
  for (const t of tabNames) for (const [k, id] of sels) {
    c.setState({ tab: t, selKind: k, selId: id, selPt: 0 })
    vals = c.renderVals()
    total += exercise(vals, t + ':' + id)
    // start over from a fresh component state of the same model every few: keep going (undo etc. are exercised)
  }
} else {
  const patches = JSON.parse(process.argv[5] || '[{}]')
  for (const p of patches) {
    c.setState(p)
    try { vals = c.renderVals(); holes(vals) } catch (e) { bad(`render ${JSON.stringify(p)} threw: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); continue }
    total += exercise(vals, JSON.stringify(p))
  }
}
console.log('handlers called:', total)
console.log(problems ? 'PROBLEMS: ' + problems : 'ok')
