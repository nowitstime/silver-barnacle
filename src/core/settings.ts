import { load, save } from './storage';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  shake: boolean;
  /** Small damage numbers on every hit. */
  numbers: boolean;
}

const DEFAULTS: Settings = { sound: true, haptics: true, shake: true, numbers: true };

export function loadSettings(): Settings {
  const s = { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) };
  // Older builds stored sound on its own.
  const legacy = load<boolean | null>('sound', null);
  if (legacy !== null && load<unknown>('settings', null) === null) s.sound = legacy;
  return s;
}

export function saveSettings(s: Settings): void {
  save('settings', s);
}
