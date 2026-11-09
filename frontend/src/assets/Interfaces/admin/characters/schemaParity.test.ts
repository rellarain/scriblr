// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIMITS } from './engine/limits'
import { AXIS_RANGE, DESCRIPTION_MAX, NAME_MAX, RANGE_NAME_MAX } from './modelContent'

// The backend validates a model with extra='ignore', so a field the frontend sends that the schema does not know is dropped without a word. These
// tests read schema.py and api/types.ts side by side so the two cannot drift apart unnoticed, and check the limits are the same numbers.
const here = __dirname
const schema = readFileSync(path.resolve(here, '../../../../../../backend/app/storage/schema.py'), 'utf-8')
const types = readFileSync(path.resolve(here, '../../../../api/types.ts'), 'utf-8')

// The fields of a Pydantic class: the annotated names at the top level of its body.
function pythonFields(name: string): string[] {
  const start = schema.indexOf(`class ${name}(BaseModel):`)
  expect(start, `class ${name} in schema.py`).toBeGreaterThan(-1)
  const rest = schema.slice(start + 1)
  const end = rest.search(/\n(?:class |def |[A-Za-z_])/)   // the next top-level statement
  const body = rest.slice(0, end < 0 ? undefined : end)
  return [...body.matchAll(/^ {4}([a-zA-Z_]\w*)\s*:/gm)].map(m => m[1]).sort()
}
// The fields of a TypeScript interface written on one line or several.
function tsFields(name: string): string[] {
  const m = new RegExp(`export interface ${name} \\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`).exec(types)
  expect(m, `interface ${name} in api/types.ts`).not.toBeNull()
  const depthZero = m![1].replace(/\{[^{}]*\}/g, '')   // drop nested object types, e.g. the item of an array
  return [...depthZero.matchAll(/(?:^|[;\n,{])\s*([a-zA-Z_]\w*)\??\s*:/g)].map(x => x[1]).sort()
}

describe('the model types match the backend schema', () => {
  const pairs: Array<[python: string, ts: string]> = [
    ['ModelPoint', 'ModelPoint'], ['ModelShape', 'ModelShape'], ['ModelObject', 'ModelObject'], ['ModelGroup', 'ModelGroup'],
    ['ModelContent', 'ModelContent'], ['PublishedModel', 'PublishedModel'], ['ModelEntry', 'ModelEntry'], ['ModelCatalog', 'ModelCatalog'],
    ['ModelAttach', 'ModelAttach'], ['ModelMove', 'ModelMove'], ['ModelDrive', 'ModelDrive'], ['ModelRange', 'ModelRange'], ['ModelBind', 'ModelBind'],
  ]
  for (const [python, ts] of pairs) {
    it(`${ts} has the fields of ${python}`, () => {
      const fields = pythonFields(python)
      expect(fields.length).toBeGreaterThanOrEqual(2)   // the reader found the class, not an empty match
      expect(tsFields(ts)).toEqual(fields)
    })
  }

  it('lists the same point modes, layers and views', () => {
    const literal = (alias: string) => [...(new RegExp(`${alias}\\s*=\\s*Literal\\[([^\\]]*)\\]`).exec(schema)?.[1] ?? '').matchAll(/"([^"]*)"/g)].map(m => m[1]).sort()
    const union = (alias: string) => [...(new RegExp(`export type ${alias} = ([^\\n]*)`).exec(types)?.[1] ?? '').matchAll(/'([^']*)'/g)].map(m => m[1]).sort()
    expect(union('ModelPointMode')).toEqual(literal('ModelPointMode'))
    expect(union('ModelLayer')).toEqual(literal('ModelLayer'))
    expect(union('ModelView')).toEqual(literal('ModelView'))
    expect(union('ModelPointMode').length).toBe(4)
    for (const alias of ['ModelAnchorKind', 'ModelRangeUnit', 'ModelDriveKind', 'ModelScaleTarget', 'ModelScaleAxis', 'ModelBindKind']) {
      expect(union(alias), alias).toEqual(literal(alias))
      expect(union(alias).length, alias).toBeGreaterThan(1)
    }
  })
})

describe('the limits are the backend\'s numbers', () => {
  const number = (name: string) => {
    const m = new RegExp(`^${name}\\s*=\\s*([\\d* ]+)`, 'm').exec(schema)
    expect(m, name).not.toBeNull()
    return m![1].split('*').map(x => Number(x.trim())).reduce((a, b) => a * b, 1)
  }
  it('for points, objects, shapes and the size of a copy', () => {
    expect(LIMITS.pointsWarn).toBe(number('MODEL_POINTS_WARN'))
    expect(LIMITS.pointsMax).toBe(number('MODEL_POINTS_MAX'))
    expect(LIMITS.objectsPerGroupWarn).toBe(number('MODEL_OBJECTS_PER_GROUP_WARN'))
    expect(LIMITS.objectsPerGroupMax).toBe(number('MODEL_OBJECTS_PER_GROUP_MAX'))
    expect(LIMITS.shapesPerObjectWarn).toBe(number('MODEL_SHAPES_PER_OBJECT_WARN'))
    expect(LIMITS.shapesPerObjectMax).toBe(number('MODEL_SHAPES_PER_OBJECT_MAX'))
    expect(LIMITS.copyWarnBytes).toBe(number('MODEL_COPY_WARN_BYTES'))
    expect(LIMITS.copyMaxBytes).toBe(number('MODEL_COPY_MAX_BYTES'))
  })
  it('for the rig: the pivot chain, sliders, what a slider drives and the length of the name of a slider', () => {
    expect(LIMITS.chainMax).toBe(number('MODEL_CHAIN_MAX'))
    expect(LIMITS.rangesWarn).toBe(number('MODEL_RANGES_WARN'))
    expect(LIMITS.rangesMax).toBe(number('MODEL_RANGES_MAX'))
    expect(LIMITS.drivesWarn).toBe(number('MODEL_DRIVES_WARN'))
    expect(LIMITS.drivesMax).toBe(number('MODEL_DRIVES_MAX'))
    expect(RANGE_NAME_MAX).toBe(number('MODEL_RANGE_NAME_MAX'))
  })
  it('for point links and how many shapes, objects and groups a model holds', () => {
    expect(LIMITS.linksWarn).toBe(number('MODEL_LINKS_WARN'))
    expect(LIMITS.linksMax).toBe(number('MODEL_LINKS_MAX'))
    expect(LIMITS.shapesMax).toBe(number('MODEL_MAX_SHAPES'))
    expect(LIMITS.objectsMax).toBe(number('MODEL_MAX_OBJECTS'))
    expect(LIMITS.groupsMax).toBe(number('MODEL_MAX_GROUPS'))
  })
  it('for the mirror line', () => {
    const m = /MODEL_AXIS_RANGE\s*=\s*\(([-\d.]+),\s*([-\d.]+)\)/.exec(schema)
    expect([Number(m?.[1]), Number(m?.[2])]).toEqual([AXIS_RANGE.min, AXIS_RANGE.max])
  })
  it('for the length of a name and a description', () => {
    expect(NAME_MAX).toBe(number('MODEL_NAME_MAX'))
    expect(DESCRIPTION_MAX).toBe(number('MODEL_DESCRIPTION_MAX'))
  })
})
