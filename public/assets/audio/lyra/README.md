# LYRA recordings

Place original local voice recordings in `tutorial/`, `system/`, `warnings/`,
`events/`, `ambient/`, or `anomalies/` below this folder.

Register each recording in `LYRA_RECORDINGS` in
`src/game/lyra/LyraRegistry.ts`, under its locale and stable message ID. For example:

```ts
'en-US': { 'warning.health': 'warnings/integrity-critical.mp3' }
```

The 17 supplied first-run recordings live directly in this folder. Their filenames
and exact default-control transcripts are maintained in `LyraTutorialScript.ts`;
the registry derives their stable IDs automatically. Unregistered or failed files
use an available local browser voice when enabled, then text.

Control-specific recordings play only when the displayed instruction matches their
transcript exactly. Controller prompts and remapped controls use accurate local TTS
or text rather than speaking the wrong button. Do not use remote URLs in this manifest.

Restart the Vite development server after adding new audio files. Audio-directory
watching is disabled to avoid Windows file-lock errors during asset updates.
