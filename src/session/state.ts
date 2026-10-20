import type { EqProfile } from '@/protocol/eq';
import { TOGGLES, type BatteryState, type Event } from '@/protocol/messages';

export type ToggleName = keyof typeof TOGGLES;

export type EarbudState = {
  battery?: BatteryState;
  version?: { left: string; right: string };
  noiseMode?: number;
  noiseValue?: number;
  ancScene?: { mode: number; sub: number; level: number };
  volume?: { left: number; right: number; max: number };
  balance?: number;
  name?: string;
  power?: { offAfterMin: number; elapsedMin: number };
  toneVolume?: { value: number; max: number };
  buttons?: Record<number, number>;
  wear?: { enabled: boolean; musicIndex: number; ancIndex: number; tone?: boolean };
  eq?: EqProfile;
  legacyEq?: { type: number; gains: number[] };
  toggles: Partial<Record<ToggleName, boolean>>;
  /** comandos que o fone respondeu — define quais controles aparecem na UI */
  supported: number[];
};

export const emptyState = (): EarbudState => ({ toggles: {}, supported: [] });

const toggleByCmd = new Map<number, ToggleName>(
  (Object.entries(TOGGLES) as [ToggleName, number][]).map(([name, cmd]) => [cmd, name]),
);

/** Comando de origem de cada evento, para marcar suporte e cancelar o re-sync otimista. */
export function eventCmd(e: Event): number | null {
  switch (e.kind) {
    case 'toggle': case 'eq': case 'value': case 'raw': return e.cmd;
    case 'noiseMode': return 12;
    case 'noiseValue': return 7;
    case 'ancScene': return 23;
    case 'volume': return 8;
    case 'balance': return 22;
    case 'name': return 24;
    case 'power': return 20;
    case 'toneVolume': return 29;
    case 'buttons': return 43;
    case 'wear': return 44;
  }
}

export function reduce(s: EarbudState, e: Event): EarbudState {
  const cmd = eventCmd(e);
  const next: EarbudState = cmd !== null && !s.supported.includes(cmd) ? { ...s, supported: [...s.supported, cmd] } : { ...s };
  switch (e.kind) {
    case 'noiseMode': next.noiseMode = e.mode; break;
    case 'noiseValue': next.noiseValue = e.value; break;
    case 'ancScene': next.ancScene = { mode: e.mode, sub: e.sub, level: e.level }; break;
    case 'volume': next.volume = { left: e.left, right: e.right, max: e.max }; break;
    case 'balance': next.balance = e.value; break;
    case 'name': next.name = e.name; break;
    case 'power': next.power = { offAfterMin: e.offAfterMin, elapsedMin: e.elapsedMin }; break;
    case 'toneVolume': next.toneVolume = { value: e.value, max: e.max }; break;
    case 'buttons': next.buttons = { ...s.buttons, ...e.map }; break;
    case 'wear': next.wear = { enabled: e.enabled, musicIndex: e.musicIndex, ancIndex: e.ancIndex, tone: e.tone }; break;
    case 'eq': if (e.cmd !== 70 && e.cmd !== 71) next.eq = e.profile; break;
    case 'toggle': {
      const name = toggleByCmd.get(e.cmd);
      if (name) next.toggles = { ...s.toggles, [name]: e.on };
      break;
    }
  }
  return next;
}
