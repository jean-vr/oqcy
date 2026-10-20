import { i16le, u16le } from './bytes';
import { CMD } from './constants';
import { tlv } from './frame';

export type EqBand = { freq: number; gain: number; q: number; type: number };
export type EqProfile = { index: number; masterGain: number; bands: EqBand[] };

export const EQ_GAIN_LIMIT = 12.7;
const clampGain = (g: number) => Math.max(-EQ_GAIN_LIMIT, Math.min(EQ_GAIN_LIMIT, g));
const s16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

/** cmd 34/70/71 usam 7 bytes por banda (freq, ganho, Q, tipo); cmd 32 usa 6 (sem tipo). */
export function decodeEq(d: Uint8Array, withType: boolean): EqProfile | null {
  const step = withType ? 7 : 6;
  if (d.length <= 9) return null;
  const bands: EqBand[] = [];
  for (let i = 3; i + step <= d.length; i += step) {
    bands.push({
      freq: u16le(d, i),
      gain: i16le(d, i + 2) / 100,
      q: u16le(d, i + 4) / 100,
      type: withType ? d[i + 6]! : 255,
    });
  }
  return { index: d[0]!, masterGain: i16le(d, 1) / 100, bands };
}

/** Gera o TLV de ajuste de EQ. `cmd` = EQ_PARAMS2 (todos), EQ_LEFT ou EQ_RIGHT. */
export function encodeEq(
  p: EqProfile,
  cmd: number = CMD.EQ_PARAMS2,
): Uint8Array {
  const body = [p.index, ...s16(Math.round(p.masterGain * 100))];
  for (const b of p.bands) {
    body.push(
      ...s16(Math.round(b.freq)),
      ...s16(Math.round(clampGain(b.gain) * 100)),
      ...s16(Math.round(b.q * 100)),
      b.type,
    );
  }
  return tlv(cmd, ...body);
}
