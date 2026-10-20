import { CMD, SOF } from './constants';

export type Tlv = { cmd: number; data: Uint8Array };

export const tlv = (cmd: number, ...data: number[]): Uint8Array =>
  Uint8Array.from([cmd, data.length, ...data]);

/** FF len TLV...; len = bytes dos TLVs. Vários TLVs cabem num único write. */
export function encodeFrame(...tlvs: Uint8Array[]): Uint8Array {
  const body = tlvs.reduce((n, t) => n + t.length, 0);
  if (body > 255) throw new RangeError('frame > 255 bytes');
  const out = new Uint8Array(body + 2);
  out[0] = SOF;
  out[1] = body;
  let o = 2;
  for (const t of tlvs) {
    out.set(t, o);
    o += t.length;
  }
  return out;
}

/** Pede o estado de um comando: FE 01 id. */
export const requestTlv = (cmd: number): Uint8Array => tlv(CMD.REQUEST, cmd);

/** Total esperado do quadro a partir do cabeçalho, ou null se ainda não há 2 bytes. */
export const frameLength = (b: Uint8Array): number | null => (b.length < 2 ? null : b[1]! + 2);

/** Decodifica TLVs; ignora cauda truncada em vez de descartar o quadro inteiro. */
export function decodeFrame(b: Uint8Array): Tlv[] {
  const out: Tlv[] = [];
  const end = Math.min(b.length, (b[1] ?? 0) + 2);
  for (let i = 2; i + 2 <= end; ) {
    const cmd = b[i]!;
    const len = b[i + 1]!;
    if (i + 2 + len > end) break;
    out.push({ cmd, data: b.subarray(i + 2, i + 2 + len) });
    i += 2 + len;
  }
  return out;
}

/**
 * Remonta quadros que chegam fatiados em várias notificações (MTU pequeno).
 * O app original assumia um quadro por notificação e descartava o resto.
 */
export class FrameAssembler {
  private buf = new Uint8Array(0);
  private lastAt = 0;

  constructor(private readonly staleMs = 500) {}

  push(chunk: Uint8Array, now = Date.now()): Uint8Array[] {
    if (this.buf.length && now - this.lastAt > this.staleMs) this.buf = new Uint8Array(0);
    this.lastAt = now;
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const frames: Uint8Array[] = [];
    for (;;) {
      const need = frameLength(this.buf);
      if (need === null || this.buf.length < need) break;
      frames.push(this.buf.slice(0, need));
      this.buf = this.buf.slice(need);
    }
    return frames;
  }

  reset() {
    this.buf = new Uint8Array(0);
  }
}
