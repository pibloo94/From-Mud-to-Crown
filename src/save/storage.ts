// Guardado en archivo del dispositivo.
// - Chrome/Edge de escritorio: el jugador elige un archivo una vez y despues se escribe en el solo.
// - Resto (Firefox, Safari, movil): se descarga un .json y se carga con un selector de archivos.
// - Ademas se guarda una copia de seguridad en el navegador, solo como red por si se olvida guardar.
import type { GameState } from '../sim/types';
import { deserialize, SaveError, serialize, SAVE_FORMAT } from './serialize';

interface FilePickerWindow {
  showSaveFilePicker?: (opts: object) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (opts: object) => Promise<FileSystemFileHandle[]>;
}
type WritableHandle = FileSystemFileHandle & {
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
};

const BACKUP_KEY = 'fmtc-backup';
const PICKER_TYPES = [{ description: 'From Mud to Crown', accept: { 'application/json': ['.json'] } }];

let fileHandle: WritableHandle | null = null;

const pickerWindow = (): FilePickerWindow => window as unknown as FilePickerWindow;

export const supportsFilePicker = (): boolean =>
  typeof pickerWindow().showSaveFilePicker === 'function' && window.self === window.top;

export const hasLinkedFile = (): boolean => fileHandle !== null;

export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled' | 'error';

/** Guarda la partida. Con `saveAs` siempre pregunta donde guardar. */
export async function saveGame(state: GameState, saveAs = false): Promise<SaveOutcome> {
  const text = serialize(state);
  writeBackup(text);
  if (supportsFilePicker()) {
    try {
      if (!fileHandle || saveAs) {
        fileHandle = (await pickerWindow().showSaveFilePicker!({
          suggestedName: suggestedName(),
          types: PICKER_TYPES,
        })) as WritableHandle;
      }
      await writeTo(fileHandle, text);
      return 'saved';
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
      fileHandle = null;
      return downloadFile(text) ? 'downloaded' : 'error';
    }
  }
  return downloadFile(text) ? 'downloaded' : 'error';
}

/** Guardado automatico: copia en el navegador y, si hay archivo elegido, tambien en el archivo. */
export async function autosave(state: GameState): Promise<boolean> {
  const text = serialize(state);
  writeBackup(text);
  if (!fileHandle) return false;
  try {
    await writeTo(fileHandle, text);
    return true;
  } catch {
    return false;
  }
}

/** Abre un archivo de partida. Devuelve null si el jugador cancela. Lanza SaveError si no es valido. */
export async function loadGameFromFile(): Promise<GameState | null> {
  if (supportsFilePicker() && pickerWindow().showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow().showOpenFilePicker!({ types: PICKER_TYPES, multiple: false });
      const text = await (await handle.getFile()).text();
      const state = deserialize(text);
      fileHandle = handle as WritableHandle;
      return state;
    } catch (err) {
      if (isAbort(err)) return null;
      if (err instanceof SaveError) throw err;
    }
  }
  const text = await pickFileWithInput();
  if (text === null) return null;
  return deserialize(text);
}

export function readBackup(): { state: GameState; savedAt: Date } | null {
  try {
    const text = localStorage.getItem(BACKUP_KEY);
    if (!text) return null;
    const savedAt = new Date(JSON.parse(text).savedAt);
    return { state: deserialize(text), savedAt };
  } catch {
    return null;
  }
}

export function forgetLinkedFile(): void {
  fileHandle = null;
}

// ------------------------------------------------------------------ auxiliares

function writeBackup(text: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, text);
  } catch {
    /* sin almacenamiento disponible: solo queda el archivo */
  }
}

async function writeTo(handle: WritableHandle, text: string): Promise<void> {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

function downloadFile(text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}

function pickFileWithInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function suggestedName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${SAVE_FORMAT.replace('-save', '')}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
