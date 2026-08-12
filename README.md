# N3ONDefense

A polished first-playable top-down browser defense game built with Vite, TypeScript, and Phaser 3.

Production site: [https://n3ondefense.org](https://n3ondefense.org)

Production leaderboard API: [https://api.n3ondefense.org](https://api.n3ondefense.org)

## Features

- Dark futuristic neon visual style with geometric Phaser rendering
- Full game loop:
  - Explore arena
  - Choose Site A/B/C
  - Hold E to plant
  - Defend for 90s
  - Stop defuser enemies
  - Win by detonation or lose by death/defuse
- Enemy wave system with scaling difficulty
- Enemy classes:
  - Grunt
  - Shooter
  - Defuser
  - Tank
  - Disruptor
- Defensive abilities with cooldowns, costs, and max active counts:
  - Electric fence
  - Auto turret
  - Mine
- Energy resource system with regeneration
- Pickups for health, energy, buffs, credits, and core tokens
- Progression and persistence (LocalStorage):
  - Credits and Core Tokens
  - Permanent upgrades
  - Cosmetic unlock/equip
  - Audio settings
- Separate scenes:
  - Boot
  - Main menu
  - Arena
  - Upgrade store
  - Cosmetics store
  - Results

## Tech Stack

- Vite
- TypeScript (strict mode)
- Phaser 3
- HTML/CSS shell UI around Phaser canvas

## Install

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Type check:

```bash
npx tsc --noEmit
```

4. Production build:

```bash
npm run build
```

The website build keeps Vite's root base and writes to `dist/`. The separate itch.io HTML5 build uses a relative asset base and writes to `dist-itch/`:

```bash
npm run build:itch
```

Create an itch.io-ready archive (with `index.html` at the ZIP root) at `release/n3ondefense-itch.zip`:

```bash
npm run package:itch
```

Local leaderboard API development uses:

```env
VITE_API_BASE_URL=http://localhost:8010
```

Production builds use:

```env
VITE_API_BASE_URL=https://api.n3ondefense.org
```

## Controls

- WASD: Move
- Mouse: Aim
- Left Mouse: Fire
- E: Interact/Plant
- Q: Place electric fence
- F: Place auto turret
- R: Place mine
- Space: Dash
- 1/2/3: Select active ability preview
- Esc: Pause/resume

## Architecture

### Data

- src/data/weapons.ts: Weapon baseline stats
- src/data/upgrades.ts: Upgrade definitions and cost scaling
- src/data/cosmetics.ts: Cosmetic catalog
- src/data/waves.ts: Wave composition/scaling

### Game Systems

- src/game/systems/SaveSystem.ts: LocalStorage save/load/persist
- src/game/systems/GameStateMachine.ts: Central phase/state handling
- src/game/systems/WaveManager.ts: Spawning cadence + wave progression
- src/game/systems/Hud.ts: In-game HUD renderer
- src/game/systems/AudioManager.ts: Placeholder procedural sound architecture

### Game Domain

- src/game/entities/Player.ts: Player stats, damage, energy, buffs
- src/game/enemies/Enemy.ts: Enemy base model and type stats
- src/game/abilities/Fence.ts: Fence object lifecycle and data
- src/game/abilities/Turret.ts: Turret object lifecycle and data
- src/game/abilities/Mine.ts: Mine arming/explosion object data

### Scenes

- src/game/scenes/BootScene.ts
- src/game/scenes/MainMenuScene.ts
- src/game/scenes/ArenaScene.ts
- src/game/scenes/UpgradeStoreScene.ts
- src/game/scenes/CosmeticsStoreScene.ts
- src/game/scenes/ResultScene.ts

### App Shell

- src/main.ts: Bootstraps shell + Phaser game
- src/style.css: Neon shell styling and responsive layout
- src/ui/settingsPanel.ts: Volume sliders persisted to LocalStorage

## First Playable Loop Verification

Implemented and wired end-to-end:

1. Start from main menu
2. Move and shoot
3. Fight enemies
4. Pick one of three sites
5. Plant bomb by holding E
6. Defend through waves
7. Stop defusers
8. Place fences/turrets/mines
9. Collect pickups and currencies
10. Win by detonation
11. Lose by death or full defuse
12. Receive mission rewards
13. Buy upgrades
14. Equip cosmetics
15. Replay with saved progression

## Notes and Known Simplifications

- Fence is implemented as a one-click short barrier placement (intended simplification).
- Enemy navigation uses steering + collision constraints instead of heavyweight pathfinding.
- Audio uses procedural placeholder tones and volume routing architecture.

## Future Expansion Ideas

- Multi-weapon loadouts (shotgun, railgun, arc, launcher)
- Advanced pathfinding around dynamic obstacles
- Better enemy squad tactics and flanking
- Additional arenas and objective variants
- Improved VFX (post-processing bloom, layered particles)
- Full authored audio and adaptive music
- Challenge modifiers, achievements, and mission contracts
