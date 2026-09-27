# RWG boss component assets

`rwg-boss-components.blend` contains 22 component scenes. Each scene retains its meshes, bevel modifiers, materials, lights and orthographic camera. The companion authoring script rebuilds this source and the transparent PNGs in `public/assets/bosses/`.

```powershell
$env:BLENDER_USER_CONFIG = Join-Path (Get-Location) 'artifacts/blender-config'
$env:BLENDER_USER_EXTENSIONS = Join-Path (Get-Location) 'artifacts/blender-extensions'
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/blender/build-boss-assets.py
```

The asset pipeline uses Blender's background Python interface because Blender MCP tools were not exposed in the implementation session. Blender 5.2.2 LTS produced the checked-in renders. No Blender dependency is needed to build or run the game.

Chassis, weapons and the reference complete legs use 384 × 384 RGBA renders with a 4-unit orthographic camera looking down Z. +X points forward; +Y points up in the source and becomes negative screen Y. Chassis and weapons display at 160 × 160, giving 40 game pixels per model unit. Articulated upper/lower legs use cropped 256 × 128 renders; joint and foot sprites use 128 × 128. Their pivots and physical segment endpoints are defined together in the authoring script and `BossLegRig.ts`.

`BossModelAssets.ts` preloads 19 immutable textures once; the three original complete-leg renders remain source references. `BossLegLocomotion.ts` supplies world-space planted contacts, bounded two-link poses and individual wall clearance; `BossLegRig.ts` positions the original model's split components. Encounter-clock transforms retain cannon recoil, generator rotation, hammer windup/swing/spin/recovery and arrival. The game never runs a 3D renderer, loads the `.blend`, or generates animation frames during play. The 19 RGBA surfaces represent 5.0625 MiB before driver overhead.

The existing generated boss textures remain available under their original IDs for compatibility. Health, rewards, boss IDs and attack ownership remain in the existing game systems.
