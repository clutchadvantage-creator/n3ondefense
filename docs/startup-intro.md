# RuntWerkxGaming startup

The authored animation is still pending. Startup currently shows a centered **RuntWerkxGaming / PRESENTS** title card on a dark background for at least 1.6 seconds, while Boot prepares the game. The existing N3ONDefense splash follows once preparation and the title card are both ready. Existing same-session splash skipping and Options splash replay remain unchanged.

Boot's temporary Graphics object is now hidden while generating textures and destroyed before awaiting scene imports. Its final scratch drawing can no longer remain visible in the upper-left corner while startup waits.

When the animation is ready, place it at `public/assets/video/runtwerkxgaming-intro.mp4` and set `STARTUP_INTRO_VIDEO` in `src/game/ui/StartupIntro.ts` to `assets/video/runtwerkxgaming-intro.mp4`. Rebuild the game. The deployment base is handled through `publicAssetUrl`, including relative-base builds. The file is not requested while the setting is null.

Optional video playback is inline and muted for browser autoplay, with Skip Intro, an error fallback and bounded load/playback waits. Boot shutdown retires the overlay, listeners, timeout and video source. The title fade respects reduced-motion settings. The supplied animation and any desired audio treatment still need review when the file arrives; the fallback is not a substitute for the final authored animation.

Short checks use `node scripts/run-layout-audit.mjs artifacts/startup-intro-browser.json ./audit-startup-intro.browser.js` in the isolated DEV browser. They exercise fallback duration, readiness, early shutdown, cleanup, and simulated optional-video completion/skip/error events. They do not validate a real animation file that has not been supplied.

All **10 startup checks passed** with no fixture errors. The production build and all **784 unit tests** also passed alongside the boss-rules correction. The previously completed HEIST pickup work remains unchanged; its shared behavior and 19-check validation are recorded in [pickup-consistency.md](pickup-consistency.md).
