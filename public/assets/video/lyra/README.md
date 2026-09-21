# Advanced operations field recording

Put the new Supreme gameplay recording here, for example `supreme-operations.mp4`.
Then set `LYRA_ADVANCED_PREVIEW` in `src/game/lyra/LyraRegistry.ts` to
`assets/video/lyra/supreme-operations.mp4`.

The onboarding monitor loads only when its preview step is shown. Playback is
muted, starts on request, and stops/releases the media on Continue, Skip, or scene
retirement. Until footage is supplied, it shows the tactical briefing fallback.
