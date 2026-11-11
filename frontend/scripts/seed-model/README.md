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
- `body.ts` takes the body (shapes, bridges, groups, sliders) from the mockup; `presets.ts` holds the ages, builds and expressions; `build.ts` puts it all together.
- `run.ts` compares the body with the mockup's own solve at rest (it must be 0.00), reports the publish faults, writes the JSON and `preview.tsx` writes a page that draws every option next to the old portrait.

The model has to stay under the size limit of a copy (250 KB, counted by the server); `backend/tests/test_character_models_basic.py` and `src/assets/Interfaces/admin/characters/seedModel.test.ts` check it.
