// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIGURE_MAX_LOCKS, FIGURE_MAX_MINE } from '../../../../api/types'
import { LIMITS } from './engine/limits'
import { AXIS_RANGE, DESCRIPTION_MAX, ROLE_MAX, FRAME_BIGGEST, FRAME_MIN, KIND_MAX, NAME_MAX, RANGE_NAME_MAX, SWATCH_NAME_MAX, TILE_DEFAULT } from './modelContent'

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
    ['ModelOverride', 'ModelOverride'], ['ModelForm', 'ModelForm'], ['ModelAxis', 'ModelAxis'], ['ModelPreset', 'ModelPreset'], ['ModelClass', 'ModelClass'],
    ['ModelGenre', 'ModelGenre'], ['ModelSwatch', 'ModelSwatch'], ['ModelColour', 'ModelColour'], ['ModelSlot', 'ModelSlot'],
    ['ModelTint', 'ModelTint'], ['ModelGradient', 'ModelGradient'], ['ModelLook', 'ModelLook'], ['ModelFade', 'ModelFade'],
    ['ModelBone', 'ModelBone'], ['ModelBoneEnd', 'ModelBoneEnd'], ['ModelFrame', 'ModelFrame'], ['ModelGrip', 'ModelGrip'],
    ['ModelHsl', 'ModelHsl'],
    // the figure of a character (phase 6)
    ['CharacterFigure', 'CharacterFigure'], ['FigureColour', 'FigureColour'], ['FigureModel', 'FigureModel'],
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
    for (const alias of ['ModelAnchorKind', 'ModelRangeUnit', 'ModelDriveKind', 'ModelScaleTarget', 'ModelScaleAxis', 'ModelBindKind', 'ModelTintKind', 'ModelGradDir', 'ModelBlend', 'ModelFit', 'ModelBoneEndKind', 'ModelFallSide']) {
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
  it('for the figure of a character: the writer\'s own styles and the objects and groups it locks', () => {
    expect(FIGURE_MAX_MINE).toBe(number('FIGURE_MAX_MINE'))
    expect(FIGURE_MAX_LOCKS).toBe(number('FIGURE_MAX_LOCKS'))
  })
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
    expect(LIMITS.chainWarn).toBe(number('MODEL_CHAIN_WARN'))
    expect(LIMITS.gripsWarn).toBe(number('MODEL_GRIPS_WARN'))
    expect(LIMITS.gripsMax).toBe(number('MODEL_GRIPS_MAX'))
    expect(ROLE_MAX).toBe(number('MODEL_ROLE_MAX'))
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
  it('for forms and presets', () => {
    expect(LIMITS.axesWarn).toBe(number('MODEL_AXES_WARN'))
    expect(LIMITS.axesMax).toBe(number('MODEL_AXES_MAX'))
    expect(LIMITS.formsWarn).toBe(number('MODEL_FORMS_WARN'))
    expect(LIMITS.formsMax).toBe(number('MODEL_FORMS_MAX'))
    expect(LIMITS.presetsWarn).toBe(number('MODEL_PRESETS_WARN'))
    expect(LIMITS.presetsMax).toBe(number('MODEL_PRESETS_MAX'))
    expect(KIND_MAX).toBe(number('MODEL_KIND_MAX'))
    expect(LIMITS.classesWarn).toBe(number('MODEL_CLASSES_WARN'))
    expect(LIMITS.classesMax).toBe(number('MODEL_CLASSES_MAX'))
    expect(LIMITS.membersWarn).toBe(number('MODEL_MEMBERS_WARN'))
    expect(LIMITS.membersMax).toBe(number('MODEL_MEMBERS_MAX'))
    expect(LIMITS.presetFormsMax).toBe(number('MODEL_PRESET_FORMS_MAX'))
  })
  it('for colour: genres, slots, default colours and the starter palette', () => {
    expect(LIMITS.genresWarn).toBe(number('MODEL_GENRES_WARN'))
    expect(LIMITS.genresMax).toBe(number('MODEL_GENRES_MAX'))
    expect(LIMITS.slotsWarn).toBe(number('MODEL_SLOTS_WARN'))
    expect(LIMITS.slotsMax).toBe(number('MODEL_SLOTS_MAX'))
    expect(LIMITS.coloursWarn).toBe(number('MODEL_COLOURS_WARN'))
    expect(LIMITS.coloursMax).toBe(number('MODEL_COLOURS_MAX'))
    expect(LIMITS.paletteMax).toBe(number('MODEL_PALETTE_MAX'))
    expect(SWATCH_NAME_MAX).toBe(number('MODEL_SWATCH_NAME_MAX'))
  })
  it('for paint effects: shading shapes, cut-outs and the paint changes of a form', () => {
    expect(LIMITS.shadesWarn).toBe(number('MODEL_SHADES_WARN'))
    expect(LIMITS.shadesMax).toBe(number('MODEL_SHADES_MAX'))
    expect(LIMITS.cutsMax).toBe(number('MODEL_CUTS_MAX'))
    expect(LIMITS.looksMax).toBe(number('MODEL_LOOKS_MAX'))
  })
  it('for proportions and frames: bones, frames, what a frame hides, the smallest and biggest frame and the starter card colour', () => {
    expect(LIMITS.bonesWarn).toBe(number('MODEL_BONES_WARN'))
    expect(LIMITS.bonesMax).toBe(number('MODEL_BONES_MAX'))
    expect(LIMITS.framesWarn).toBe(number('MODEL_FRAMES_WARN'))
    expect(LIMITS.framesMax).toBe(number('MODEL_FRAMES_MAX'))
    expect(LIMITS.frameHideMax).toBe(number('MODEL_FRAME_HIDE_MAX'))
    expect(FRAME_MIN).toBe(number('MODEL_FRAME_MIN'))
    expect(FRAME_BIGGEST).toBe(number('MODEL_FRAME_BIGGEST'))
    expect(TILE_DEFAULT).toBe(/MODEL_TILE_DEFAULT\s*=\s*"(#[0-9a-f]{6})"/.exec(schema)?.[1])
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
