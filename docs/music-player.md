# Options music player

Options → Audio includes an RWG RADIO panel using the existing menu styling.
It shows the current song and soundtrack context, with Previous, Play/Pause,
and Next controls supporting mouse and controller navigation.

- Menu controls browse the menu playlist; in-game controls browse gameplay music.
- Pause remains in effect across scene transitions until Play is selected.
  This is a session playback choice, not a saved volume setting.
- Skipping while paused selects another song without starting playback.
- HEIST uses its dedicated track. Play/Pause remains available, while Previous
  and Next are disabled. Leaving HEIST restores normal soundtrack control.
- Existing volume sliders continue to control music volume.
- Both menu songs are preloaded and reused when the playlist wraps, avoiding a
  fresh media load at each ending. The source files have no long silent tails.
- Playback time updates also advance music fades when the game stops rendering.
  This prevents the first song restarting silently after a completed menu cycle.

Validation: the music lifecycle tests cover manual pause, track navigation,
scene changes, pending playback, and HEIST autoplay recovery. The browser audit
in `scripts/audit-music-player.browser.js` exercises the real Options controls
using an isolated test profile, including four automatic menu song transitions.
Compact and desktop layouts were checked at
768×900 and 1440×900.

`scripts/audit-menu-loop.browser.js` plays both complete menu tracks at 4× speed
without seeking through them, with the rendering loop asleep. It checks playback
position and restored volume after both transitions, including the return to the
first song. Its result is available as `globalThis.__menuLoopAudit`.
