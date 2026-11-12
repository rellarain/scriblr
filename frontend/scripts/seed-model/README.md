# Seed model generator

Builds **Adult (basic)**, the model that comes with Scriblr, and writes it to `backend/app/seed/basic_model.json` (which the server publishes on a fresh install and offers with
*Add the basic model*). Nothing here is shipped: only the JSON it writes is.

```bash
npx vite-node scripts/seed-model/run.ts [preview-dir] [seed-file]   # build, check, write the JSON and a preview page
npx vite-node scripts/seed-model/check-fit.ts 0.08                  # how well the old outlines are fitted again at a tolerance
```

- `exact.ts` reads the old portrait engine's exact shapes (`docs/mannequin-mockup/exact-default.js`) and the mockup's own model (`designer-engine.js`).
- `outline.ts` + `fit.ts` fit the many sampled points of an old outline with a few curve points (Schneider's algorithm), within a tolerance, and tell mirror images.
- `face.ts` makes the head, ears, brows, eyes, nose and mouth: one object each, one form per option, a twin object for each pair.
- `hair.ts` makes the hair: the mockup's fourteen sections (plane x side) rooted on the skull's edge, each with Length and Texture sliders and a cut, and fourteen hairstyles as presets. `build.ts` also makes the beard and the moustache from the old engine's facial hair options (`docs/mannequin-mockup/export-exact.ts` exports them: run it again, then copy `exact-default.js` over the one in `docs/mannequin-mockup/`, when the old drawing's shapes change) and the *Facial hair* presets.
- `build.ts` also builds the fantasy parts (ears, eye styles, extra eyes, horns, crowns, wreaths, hoods, necklaces) from the options `export-exact.ts` writes for them; `face.ts` lays the options of more than one axis on the same channels (`also`) and gives each fantasy part its colour slot.
- `items.ts` builds the held items (phase 6c-3b): `prepareItems` takes the old drawing's items without their hand and sleeve, puts every item's grip at the middle of the mannequin's palm, draws them a quarter larger (and no more than 34 units above the hand), adds the band of skin for the fingers and the unrolled scroll; `itemSpec`/`mirrorItem` make one object for each hand (the right is the left's mirror image with an axis of its own); `itemParts` hangs each in a group under its hand, with an *Item angle* slider, a grip point and the Pose presets; `poseArmsApart` gives each arm slider (raise, elbow, wrist) a slider for each side.
- `clothes.ts` makes the clothes: the mockup's shirt, sleeves, trousers and shoes (every point following the body, with its thickness), the fifteen necklines as hole forms and what each brings, and, drawn here, a jacket, a coat, a skirt, a dress and underwear; the right-hand pieces are mirrored once the body has its twins (`finishClothes`).
- `body.ts` takes the body (shapes, bridges, groups, sliders) from the mockup; `presets.ts` holds the ages, builds and expressions; `build.ts` puts it all together.
- `run.ts` compares the body with the mockup's own solve at rest (it must be 0.00), reports the publish faults, writes the JSON and `preview.tsx` writes a page that draws every option next to the old portrait.

The model has to stay under the size limit of a copy (2048 KB, counted by the server, with every default written out); `backend/tests/test_character_models_basic.py` and `src/assets/Interfaces/admin/characters/seedModel.test.ts` check it.
- `convert-preview.tsx` (`npx vite-node scripts/seed-model/convert-preview.tsx [dir]`) writes a page with twenty-four old portraits (hand-picked cases and random ones) next to what Convert makes of them on the basic model, with the lines the preview would list: a look at the mapping in `figureConvert.ts` after a change to the model or the conversion.
