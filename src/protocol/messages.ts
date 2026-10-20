import { u16le } from './bytes';
import { CMD } from './constants';
import { decodeEq, type EqProfile } from './eq';
import { requestTlv, tlv, type Tlv } from './frame';

export type Battery = { level: number; charging: boolean };
export type BatteryState = { left: Battery; right: Battery; case: Battery };

/** Cada byte: bit7 = carregando, bits0-6 = nível. */
export function decodeBattery(d: Uint8Array): BatteryState | null {
  if (d.length < 3) return null;
  const at = (i: number): Battery => ({ level: d[i]! & 0x7f, charging: (d[i]! & 0x80) !== 0 });
  return { left: at(0), right: at(1), case: at(2) };
}

export function decodeVersion(d: Uint8Array): { left: string; right: string } | null {
  if (d.length < 3) return null;
  const v = (i: number) => `${d[i]}.${d[i + 1]}.${d[i + 2]}`;
  return { left: v(0), right: d.length >= 6 ? v(3) : '' };
}

/** Pares [keyId, funcId] — usados na característica de botões e no TLV 43. */
export function decodeButtons(d: Uint8Array): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 0; i + 1 < d.length; i += 2) out[(d[i]! << 24) >> 24] = d[i + 1]!;
  return out;
}
export const encodeButtons = (map: Record<number, number>): Uint8Array =>
  Uint8Array.from(Object.entries(map).flatMap(([k, v]) => [Number(k) & 0xff, v & 0xff]));

export type Event =
  | { kind: 'noiseMode'; mode: number }
  | { kind: 'noiseValue'; value: number }
  | { kind: 'ancScene'; mode: number; sub: number; level: number }
  | { kind: 'volume'; left: number; right: number; max: number }
  | { kind: 'toggle'; cmd: number; on: boolean }
  | { kind: 'balance'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'power'; offAfterMin: number; elapsedMin: number }
  | { kind: 'toneVolume'; value: number; max: number }
  | { kind: 'buttons'; map: Record<number, number> }
  | { kind: 'wear'; enabled: boolean; musicIndex: number; ancIndex: number; tone?: boolean }
  | { kind: 'eq'; cmd: number; profile: EqProfile }
  | { kind: 'value'; cmd: number; value: number }
  | { kind: 'raw'; cmd: number; data: Uint8Array };

/** Comandos cujo payload é "1 = ligado, 2 = desligado". */
export const TOGGLES = {
  inEar: CMD.IN_EAR,
  gameMode: CMD.GAME_MODE,
  sleep: CMD.SLEEP,
  led: CMD.LED_MODE,
  testMode: CMD.TEST_MODE,
} as const;
const toggleCmds = new Set<number>(Object.values(TOGGLES));

export function decodeTlv({ cmd, data: d }: Tlv): Event {
  if (toggleCmds.has(cmd) && d.length >= 1) return { kind: 'toggle', cmd, on: d[0] === 1 };
  switch (cmd) {
    case CMD.NOISE_MODE:
      if (d.length >= 1) return { kind: 'noiseMode', mode: d[0]! };
      break;
    case CMD.NOISE_VALUE:
      if (d.length >= 1) return { kind: 'noiseValue', value: d[0]! };
      break;
    case CMD.ANC_SETTING:
      if (d.length >= 3) return { kind: 'ancScene', mode: d[0]!, sub: d[1]!, level: d[2]! };
      break;
    case CMD.VOLUME:
      if (d.length >= 3) return { kind: 'volume', left: d[0]!, right: d[1]!, max: d[2]! };
      break;
    case CMD.BALANCE:
      if (d.length >= 1) return { kind: 'balance', value: d[0]! };
      break;
    case CMD.PAIR_NAME: {
      const end = d.indexOf(0);
      return { kind: 'name', name: new TextDecoder().decode(end < 0 ? d : d.subarray(0, end)) };
    }
    case CMD.POWER_MANAGER:
      if (d.length >= 4) {
        const off = u16le(d, 0);
        const cur = u16le(d, 2);
        return { kind: 'power', offAfterMin: off, elapsedMin: off > 0 && off < 0xffff && cur === 0 ? 1 : cur };
      }
      break;
    case CMD.TONE_VOLUME:
      if (d.length >= 1) return { kind: 'toneVolume', value: d[0]!, max: d[1] ?? 100 };
      break;
    case CMD.KEY_FUNC:
      return { kind: 'buttons', map: decodeButtons(d) };
    case CMD.WEAR:
      if (d.length >= 3)
        return {
          kind: 'wear',
          enabled: d[0] === 1,
          musicIndex: d[1]!,
          ancIndex: d[2]!,
          ...(d.length >= 4 ? { tone: d[3] === 1 } : {}),
        };
      break;
    case CMD.EQ_PARAMS:
    case CMD.EQ_PARAMS2:
    case CMD.EQ_LEFT:
    case CMD.EQ_RIGHT: {
      const profile = decodeEq(d, cmd !== CMD.EQ_PARAMS);
      if (profile) return { kind: 'eq', cmd, profile };
      break;
    }
    default:
      if (d.length >= 1 && d.length <= 2) return { kind: 'value', cmd, value: d.length > 1 ? u16le(d, 0) : d[0]! };
  }
  return { kind: 'raw', cmd, data: d };
}

/* ---- Escritas (TLV; o chamador enquadra com encodeFrame) ---- */
export const cmds = {
  request: requestTlv,
  noiseMode: (mode: number) => tlv(CMD.NOISE_MODE, mode),
  noiseValue: (v: number) => tlv(CMD.NOISE_VALUE, v),
  ancScene: (mode: number, sub: number, level: number) => tlv(CMD.ANC_SETTING, mode, sub, level),
  volume: (left: number, right: number) => tlv(CMD.VOLUME, left, right, 0),
  balance: (v: number) => tlv(CMD.BALANCE, v),
  toggle: (cmd: number, on: boolean) => tlv(cmd, on ? 1 : 2),
  musicAction: (a: 1 | 2 | 3 | 4) => tlv(CMD.MUSIC_ACTION, a),
  toneVolume: (v: number) => tlv(CMD.TONE_VOLUME, v),
  powerOff: (minutes: number) => tlv(CMD.POWER_MANAGER, minutes & 0xff, (minutes >> 8) & 0xff, 0, 0),
  rename: (name: string) => {
    const b = new TextEncoder().encode(name);
    return Uint8Array.from([CMD.PAIR_NAME, b.length, ...b]);
  },
  wear: (enabled: boolean, musicIndex: number, ancIndex: number, tone?: boolean) =>
    tlv(CMD.WEAR, enabled ? 1 : 0, musicIndex, ancIndex, ...(tone === undefined ? [] : [tone ? 1 : 0])),
  syncTime: (d: Date) =>
    tlv(CMD.SYNC_TIME, d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), 1 << d.getDay()),
  find: (on: boolean) => tlv(CMD.LIGHT, on ? 1 : 0),
  resetDefault: () => tlv(CMD.RESET_DEFAULT),
  clearPairing: () => tlv(CMD.CLEAR_PAIR),
  factoryReset: () => tlv(CMD.FACTORY_RESET),
};
