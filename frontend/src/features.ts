// What is built but held back for a later version (docs/roadmap.md). Phase 1 makes WUI, UUI, VUI, HUI and AUI version 1, with no
// placeholders, so what belongs to version 2 is off the screen: its code and any saved data are kept, and it comes back when this is on.
//
// Off in phase 1 (WUI v2, with RUI in phase 2):
// - publishing to readers: Dash > Readers, Outline > Publish, a chapter's Publish button and its published copies in the Preview, the
//   For readers sections of Characters and Maps, and the Footnote tool's content flags and Published switch;
// - Items: Project > Items, items in the "Link to…" picker, and a character's carried items.
//
// A test of something held back turns it on with `vi.mock('<path>/features', () => ({ V2_FEATURES: true }))`.
export const V2_FEATURES = false
