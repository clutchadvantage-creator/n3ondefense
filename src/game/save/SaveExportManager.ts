import type { ExportedSaveFile, LocalPlayerSave } from './LocalSaveTypes';
import { buildExportedSaveFile } from './SaveMigrationManager';

const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export const sanitizeSaveFileName = (name: string): string => {
  const normalized = name.trim().replace(/\s+/g, '-').replace(INVALID_FILE_CHARS, '').replace(/-+/g, '-');
  return normalized.length > 0 ? normalized : 'local-profile';
};

export const buildSaveExport = (save: LocalPlayerSave): ExportedSaveFile => buildExportedSaveFile(save);

export const exportSaveFile = (file: ExportedSaveFile, profileName: string): void => {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date(file.exportedAt).toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `n3on-defense-${sanitizeSaveFileName(profileName)}-save-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};
