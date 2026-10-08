# SkyBreach city canyon

SkyBreach's side scenery now consists of standing skyscrapers instead of roof-only map tiles and horizontal platform sprites. The gameplay camera, movement, damage, spawning and collision boundaries retain their existing rules.

`SkyBreachCityArt.ts` projects each roof as an oblique polygon and extrudes two visible facades down to the street. Six building silhouettes provide towers, spires, industrial plants and stepped rooftops. Facades have lit window floors, structural ribs, panels and readable signs; rooftops have parapets, neon trim, vents, condensers, machinery and antenna lights. Mirrored right-side architecture keeps its signage readable. Separate ground shadows and opaque walls provide occlusion.

`SkyBreachWorld` places buildings densely along both sides in three elevation bands. Taller foreground bands scroll faster than the distant city and streets; buildings within each band share a speed so rows stay populated during long runs. Images are preallocated and recycled only after their complete roof and wall have left the view. Building geometry is baked into a finite shared texture set when SkyBreach initializes, with no new geometry or textures generated during scrolling. Roads and service yards remain at street level, and ground tanks still follow the existing road coordinates.

Live rooftop AA uses the same extruded architecture, anchored at the existing enemy position. Only the visual tower and its ground shadow extend below the weapon. Its physics body, aiming, firing, scrolling and retirement rules are unchanged. Death and scene shutdown retire both decorations through the existing ownership path.

## Validation

- `npm test`: 879 tests passed; production TypeScript/Vite build and `git diff --check` passed.
- `scripts/audit-skybreach-city.browser.js`: real Arena entry, finite skyline and texture counts, opaque walls, pause, two minutes of scrolling, preserved camera/collision rules, AA roof anchoring and shadow/death cleanup, then return to Arena with all city objects destroyed.
- Browser runs at 1600x1000, 1280x720 and 1280x960: 35 checks each, 105 total. Both sides retained at least ten visible buildings during the scrolling samples. Inspected combat and assisted scenery captures at the gameplay camera scale.
- Existing AA movement audit now expects an extruded tower rather than the removed flat platform texture.

Local reports and screenshots are under `artifacts/sky-city-*`. The assisted scenery captures hide the Dreadnought locally to expose the buildings; separate captures retain it to check combat visibility. These checks cover rendering and lifecycle, not a full campaign performance benchmark.
