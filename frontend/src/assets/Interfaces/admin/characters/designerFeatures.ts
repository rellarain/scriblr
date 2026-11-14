// What the app offers of the character Designer for now (the shape editor plan, 2026-11-14). The admin's Designer is only a shape editor: templates, points and segments,
// transform, connections and symmetry, with the other tools (the rig and its sliders, forms, presets, colour, frames, previews, twins, angles) off the screen. Their code and
// any saved data are kept, and they come back one by one. The writers' own designer (My models, Configuration > Writers' designer) is off the screen too, its models kept.
export type DesignerTools = 'all' | 'shapes'

// The tools the admin's Designer console shows. The console's own default is every tool (`'all'`), so a test that renders it plainly still finds the old tools.
export const DESIGNER_TOOLS: DesignerTools = 'shapes'
// Whether writers have a designer of their own (the Characters console's My models, Configuration > Writers' designer, Edit this model).
export const WRITER_DESIGNER = false
// Whether a page offers to add the basic model that came with Scriblr (it is no longer seeded on start).
export const OFFER_BASIC_MODEL = false
