# LYRA recordings

Place original local voice recordings in `tutorial/`, `system/`, `warnings/`,
`events/`, `ambient/`, or `anomalies/` below this folder.

Register each recording in `LYRA_RECORDINGS` in
`src/game/lyra/LyraRegistry.ts`, under its locale and stable message ID. For example:

```ts
'en-US': { 'warning.health': 'warnings/integrity-critical.mp3' }
```

The original 17 first-run recordings live directly in this folder. Their filenames
and exact default-control transcripts are maintained in `LyraTutorialScript.ts`;
the registry derives their stable IDs automatically. Sixteen additional warnings,
context, ambient, and Store/Garage teaching recordings are mapped explicitly in
`LyraRegistry.ts`, for 33 registered files. Unregistered or failed files
use an available local browser voice when enabled, then text.

Control-specific recordings play only when the displayed instruction matches their
transcript exactly. Controller prompts and remapped controls use accurate local TTS
or text rather than speaking the wrong button. Do not use remote URLs in this manifest.

Restart the Vite development server after adding new audio files. Audio-directory
watching is disabled to avoid Windows file-lock errors during asset updates.

Run `node --experimental-strip-types scripts/audit-lyra-voice-coverage.mjs` from the
project root to refresh the remaining recording checklist and exact text in
`docs/lyra-missing-voice-lines.md`.
