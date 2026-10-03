# RuntWerkxGaming startup

Startup plays `public/assets/video/runtwerkxgaming-intro.mp4`, then proceeds to the N3ONDefense splash once Boot has finished preparing assets. The former **RuntWerkxGaming / PRESENTS** card has been removed entirely, including its fallback and styles. While media loads, only a dark surface is shown. Missing or failed media resolves intro readiness immediately without adding a title-card delay.

Playback remains inline and muted for browser autoplay, with Skip Intro and bounded load/playback waits. Boot shutdown removes the overlay, listeners, timeout and video source. Existing same-session splash skipping and Options splash replay are unchanged. Boot's texture-generation Graphics object remains hidden and is destroyed before awaiting scene imports.

Run the short browser checks in the isolated DEV browser:

```powershell
node scripts/run-layout-audit.mjs artifacts/startup-intro-browser.json ./audit-startup-intro.browser.js
```

All 14 checks passed, including actual MP4 decoding and natural completion (1920 x 1080, 6.567 seconds), missing media, simulated failure, skip, readiness and cleanup. No old title card is created before playback or after failure.

## Menu music continuity

Profile selection stops its scene before Main Menu finishes preloading. Previously the music observer interpreted that interval with no active scene as `silent`, paused the menu track, and restarted it with a new fade. It now retains menu music ownership through that interval. Initial Boot remains silent, gameplay still selects its own soundtrack, profile volume preferences still apply, and game destruction stops playback.

A browser trace of the real profile-selection handler reproduced the old pause/play pair and the menu-to-silent-to-menu transition. After the fix, the same transition retained the track, advanced playback time, and made no pause/play calls. This was an instrumented headless check, not a listening test. A regression test also covers multiple empty frames, unchanged playback time/volume, profile volume changes and shutdown. All 803 unit tests and the production build passed.
