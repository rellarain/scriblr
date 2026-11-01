// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginPointerDrag, zoneRef, type DropZone } from './pointerDrag'

const pointer = (type: string, x: number, y: number) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, button: 0, clientX: x, clientY: y })
const box = (el: HTMLElement, left: number, top: number, width: number, height: number) => {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
}
const zone = (): DropZone & { calls: string[] } => {
  const calls: string[] = []
  return { calls, over: (x, y) => calls.push(`over ${x},${y}`), leave: () => calls.push('leave'), drop: (x, y) => calls.push(`drop ${x},${y}`) }
}

afterEach(() => { document.body.innerHTML = '' })

function setup() {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  const source = document.createElement('div')
  source.textContent = 'row'
  outer.append(inner, source)
  document.body.append(outer)
  box(outer, 0, 0, 300, 300)
  box(inner, 50, 50, 100, 100)
  box(source, 10, 200, 80, 20)
  const a = zone()
  const b = zone()
  zoneRef('k', a)(outer)
  zoneRef('k', b)(inner)
  return { outer, inner, source, a, b }
}

describe('beginPointerDrag', () => {
  it('does not start until the pointer has moved a few pixels', () => {
    const { source, a } = setup()
    const onStart = vi.fn()
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 }, onStart })
    window.dispatchEvent(pointer('pointermove', 21, 205))
    expect(onStart).not.toHaveBeenCalled()
    window.dispatchEvent(pointer('pointerup', 21, 205))
    expect(a.calls).toEqual([])
    expect(document.querySelector('.dragPicture')).toBeNull()
  })

  it('draws the dragged thing as a picture that follows the pointer at its own size, and takes it away at the end', () => {
    const { source } = setup()
    const onEnd = vi.fn()
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 }, onEnd })
    window.dispatchEvent(pointer('pointermove', 40, 230))
    const picture = document.querySelector<HTMLElement>('.dragPicture')!
    expect(picture.textContent).toBe('row')
    expect(picture.style.width).toBe('80px')
    expect(picture.style.left).toBe('30px') // 40 - the 10px the thing was grabbed in from its left
    expect(picture.style.top).toBe('225px')
    window.dispatchEvent(pointer('pointerup', 40, 230))
    expect(document.querySelector('.dragPicture')).toBeNull()
    expect(onEnd).toHaveBeenCalled()
  })

  it('tells the innermost zone under the pointer where it is, leaves the one it came out of, and drops on the last', () => {
    const { source, a, b } = setup()
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 } })
    window.dispatchEvent(pointer('pointermove', 250, 250)) // only in the outer zone
    window.dispatchEvent(pointer('pointermove', 100, 100)) // in both: the inner
    window.dispatchEvent(pointer('pointerup', 100, 100))
    expect(a.calls).toEqual(['over 250,250', 'leave'])
    expect(b.calls).toEqual(['over 100,100', 'drop 100,100'])
  })

  it('ignores zones of another kind', () => {
    const { source } = setup()
    const other = zone()
    const el = document.createElement('div')
    document.body.append(el)
    box(el, 0, 0, 1000, 1000)
    zoneRef('other', other)(el)
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 } })
    window.dispatchEvent(pointer('pointermove', 100, 100))
    window.dispatchEvent(pointer('pointerup', 100, 100))
    expect(other.calls).toEqual([])
  })

  it('cancels with Escape: the zone is left, not dropped on', () => {
    const { source, b } = setup()
    const onEnd = vi.fn()
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 }, onEnd })
    window.dispatchEvent(pointer('pointermove', 100, 100))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(b.calls).toEqual(['over 100,100', 'leave'])
    expect(onEnd).toHaveBeenCalled()
    window.dispatchEvent(pointer('pointermove', 100, 100))
    expect(b.calls).toHaveLength(2) // nothing is listening any more
  })

  it('is not started by a press of another button', () => {
    const { source } = setup()
    const onStart = vi.fn()
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205, button: 2 }, onStart })
    window.dispatchEvent(pointer('pointermove', 100, 100))
    expect(onStart).not.toHaveBeenCalled()
  })
})

describe('zoneRef', () => {
  it('forgets an element when its ref is detached, and an element can be a zone of two kinds', () => {
    const { source } = setup()
    const el = document.createElement('div')
    document.body.append(el)
    box(el, 0, 300, 100, 100)
    const gone = zone()
    const a = zone()
    const b = zone()
    const goneRef = zoneRef('k', gone)
    goneRef(el)
    goneRef(null)
    zoneRef('k', a)(el)
    zoneRef('other', b)(el)
    beginPointerDrag({ kind: 'k', source, event: { clientX: 20, clientY: 205 } })
    window.dispatchEvent(pointer('pointermove', 50, 350))
    window.dispatchEvent(pointer('pointerup', 50, 350))
    expect(gone.calls).toEqual([])
    expect(a.calls).toEqual(['over 50,350', 'drop 50,350'])
    expect(b.calls).toEqual([])
  })
})
