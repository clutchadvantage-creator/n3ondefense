# LYRA recordings

Place original local voice recordings in `tutorial/`, `system/`, `warnings/`,
`events/`, `ambient/`, or `anomalies/` below this folder.

Register each recording in `LYRA_RECORDINGS` in
`src/game/lyra/LyraRegistry.ts`, under its locale and stable message ID. For example:

```ts
'en-US': { 'warning.health': 'warnings/integrity-critical.mp3' }
```

No voice recordings are bundled yet. Unregistered or failed files use an available
local browser voice when enabled, then text. Avoid hard-coding keyboard buttons in
recordings for binding-aware instructions; the visible instruction always uses the
active device and bindings. Do not use remote URLs in this manifest.
