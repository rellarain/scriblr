import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent } from '../modelContent'
import { drawOrder, layerUnits, orderedUnits, treeRank } from './order'
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

// Two garments (a vest and a coat, the coat in front) with a twin each side for the sleeve, and a family of hats, on a body: the parts a writer moves among their layer.
function wardrobe(): ModelContent {
  const c = model()
  return {
    ...c,
    shapes: [...c.shapes, shape('vest'), shape('coat'), shape('coatTwin'), shape('hatA'), shape('hatB'), shape('hatBTwin')].map(s => (s.id === 'coatTwin' ? { ...s, mirrorOf: 'coat' } : s)),
    objects: [
      ...c.objects,
      { id: 'oVest', name: 'Vest', layer: 'clothing', shapes: ['vest'] },
      { id: 'oCoat', name: 'Coat', layer: 'clothing', shapes: ['coat'] },
      { id: 'oCoat2', name: 'Coat (twin)', layer: 'clothing', shapes: ['coatTwin'], mirrorOf: 'oCoat' },
      { id: 'oHatTpl', name: 'Hat', layer: 'hair', shapes: [] },
      { id: 'oHatA', name: 'Cap', layer: 'hair', shapes: ['hatA'], classOf: 'kHat' },
      { id: 'oHatB', name: 'Beret', layer: 'hair', shapes: ['hatB'], classOf: 'kHat' },
      { id: 'oHatB2', name: 'Beret (twin)', layer: 'hair', shapes: ['hatBTwin'], mirrorOf: 'oHatB' },
    ],
    classes: [{ id: 'kHat', name: 'Hats', template: 'oHatTpl', exclusive: true }],
    groups: [{ id: 'g', name: 'G', parent: null, objects: ['oHair', 'oShirt', 'oSkin', 'oVest', 'oCoat', 'oCoat2', 'oHatTpl', 'oHatA', 'oHatB', 'oHatB2'], pivot: null, attach: null }],
  }
}
const ids = (c: ModelContent, zoff?: Record<string, number>) => drawOrder(c, c.shapes, undefined, undefined, zoff).map(s => s.id)

describe('the parts of a layer', () => {
  it('are an object with its twins, or a family with all its members, from the back to the front', () => {
    const units = layerUnits(wardrobe(), 'clothing')
    expect(units.map(u => [u.key, u.objects.map(o => o.id), u.base])).toEqual([['oShirt', ['oShirt'], 0], ['oVest', ['oVest'], 1], ['oCoat', ['oCoat', 'oCoat2'], 2]])
    const hats = layerUnits(wardrobe(), 'hair')
    expect(hats.map(u => u.key)).toEqual(['oHair', 'oHatTpl'])
    expect(hats[1].objects.map(o => o.id).sort()).toEqual(['oHatA', 'oHatB', 'oHatB2', 'oHatTpl'])
    expect(layerUnits(wardrobe(), 'body').map(u => u.key)).toEqual(['oSkin'])
  })
  it('are moved by the places they are given, with the others making way', () => {
    const c = wardrobe()
    expect(orderedUnits(c, 'clothing', {}).map(u => u.key)).toEqual(['oShirt', 'oVest', 'oCoat'])
    expect(orderedUnits(c, 'clothing', { oCoat: -1, oVest: 1 }).map(u => u.key)).toEqual(['oShirt', 'oCoat', 'oVest'])
    expect(orderedUnits(c, 'clothing', { oShirt: 3 }).map(u => u.key)).toEqual(['oVest', 'oCoat', 'oShirt'])
    // a tie goes to the part the model puts further back
    expect(orderedUnits(c, 'clothing', { oShirt: 2 }).map(u => u.key)).toEqual(['oVest', 'oShirt', 'oCoat'])
  })
})

describe('drawing with layer offsets', () => {
  it('without any, is the order the model gives', () => {
    const c = wardrobe()
    expect(ids(c, {})).toEqual(ids(c))
    expect(ids(c).slice(0, 8)).toEqual(['skinA', 'skinB', 'shirtA', 'vest', 'coat', 'coatTwin', 'hairA', 'hatA'])
  })
  it('puts a garment over the one that was over it, and leaves the other layers where they are', () => {
    const c = wardrobe()
    const moved = ids(c, { oVest: 1, oCoat: -1 })
    expect(moved.indexOf('coat')).toBeLessThan(moved.indexOf('vest'))
    expect(moved.indexOf('coatTwin')).toBeLessThan(moved.indexOf('vest'))
    expect(moved.filter(id => !['vest', 'coat', 'coatTwin'].includes(id))).toEqual(ids(c).filter(id => !['vest', 'coat', 'coatTwin'].includes(id)))
    expect(moved).toHaveLength(ids(c).length)
  })
  it('takes the twins along: a part and its twin stay together', () => {
    const moved = ids(wardrobe(), { oCoat: -3 })
    expect(moved.slice(2, 6)).toEqual(['coat', 'coatTwin', 'shirtA', 'vest'])
  })
  it('moves a whole family with the key of its template', () => {
    const c = wardrobe()
    const moved = ids(c, { oHair: 2 })
    expect(moved.indexOf('hatA')).toBeLessThan(moved.indexOf('hairA'))
    expect(moved.indexOf('hatB')).toBeLessThan(moved.indexOf('hairA'))
  })
  it('does not depend on what is shown: a garment that is not drawn does not shift the others', () => {
    const c = wardrobe()
    const shown = drawOrder(c, c.shapes.filter(s => s.id !== 'vest'), undefined, undefined, { oCoat: -3, oShirt: 1 }).map(s => s.id).filter(x => ['shirtA', 'coat'].includes(x))
    expect(shown).toEqual(['coat', 'shirtA'])
  })
  it('is a permutation whatever it is given, including places that are too far or from a model that has changed', () => {
    const c = wardrobe()
    const cases: Array<Record<string, number>> = [{ oShirt: 50, oCoat: -50 }, { oShirt: 3, oVest: 3, oCoat: 3 }, { oGone: 4 }, { oVest: -1, oShirt: -1 }]
    for (const zoff of cases) {
      expect([...ids(c, zoff)].sort()).toEqual([...ids(c)].sort())
    }
  })
})
