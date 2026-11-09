import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent } from '../modelContent'
import { drawOrder, treeRank } from './order'
import { newShape } from './edit'
import { templateBox } from './templates'

const shape = (id: string, z = 40): ModelShape => ({ ...newShape(id, id, 'oval', templateBox('oval', 100, 100, 20)), z })

function model(): ModelContent {
  return {
    ...blankContent('M'),
    shapes: [shape('hairA'), shape('shirtA'), shape('skinA'), shape('skinB'), shape('lone')],
    objects: [
      { id: 'oHair', name: 'Hair', layer: 'hair', shapes: ['hairA'] },
      { id: 'oShirt', name: 'Shirt', layer: 'clothing', shapes: ['shirtA'] },
      { id: 'oSkin', name: 'Skin', layer: 'body', shapes: ['skinA', 'skinB'] },
    ],
    groups: [{ id: 'g', name: 'G', parent: null, objects: ['oHair', 'oShirt', 'oSkin'], pivot: null, attach: null }],
  }
}

describe('draw order', () => {
  it('puts the Body layer behind Clothing behind Hair when the z values are equal', () => {
    const c = model()
    expect(drawOrder(c).map(s => s.id)).toEqual(['skinA', 'skinB', 'shirtA', 'hairA', 'lone'])
  })

  it('follows the order of an object\'s shapes: the later one is in front', () => {
    const c = model()
    c.objects[2] = { ...c.objects[2], shapes: ['skinB', 'skinA'] }
    expect(drawOrder(c).map(s => s.id).slice(0, 2)).toEqual(['skinB', 'skinA'])
  })

  it('lets a z of its own win over the tree', () => {
    const c = model()
    c.shapes = c.shapes.map(s => (s.id === 'hairA' ? { ...s, z: 10 } : s))
    expect(drawOrder(c).map(s => s.id)[0]).toBe('hairA')
  })

  it('draws a shape that is in no object last of its z, and orders a subset', () => {
    const c = model()
    expect(treeRank(c).get('lone')).toBe(4)
    expect(drawOrder(c, [c.shapes[4], c.shapes[0]]).map(s => s.id)).toEqual(['hairA', 'lone'])
  })

  it('takes another z (the back view\'s)', () => {
    const c = model()
    const back = (s: ModelShape) => (s.id === 'skinA' ? 90 : 40)
    expect(drawOrder(c, c.shapes, back).map(s => s.id).pop()).toBe('skinA')
  })
})
