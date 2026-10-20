import type { Advert } from '@/protocol/advert';
import { CHAR, CMD } from '@/protocol/constants';
import { encodeEq } from '@/protocol/eq';
import { decodeFrame, encodeFrame, FrameAssembler, tlv } from '@/protocol/frame';
import type { Link, Radio, RadioState, ScanHit } from './types';

export const MOCK_CLASSIC_MAC = '11:22:33:44:55:66';

const advert: Advert = {
  companyId: 0x521c, modelId: 0x4a61, colorIndex: 1,
  left: { level: 82, charging: false }, right: { level: 78, charging: false }, case: { level: 55, charging: true },
  classicMac: MOCK_CLASSIC_MAC, otherMac: MOCK_CLASSIC_MAC,
};

/** Fone simulado: responde ao protocolo real. Serve para web, demo e testes sem hardware. */
export class MockEarbud {
  fw = new Map<number, Uint8Array>([
    [CMD.NOISE_MODE, Uint8Array.of(1)],
    [CMD.NOISE_VALUE, Uint8Array.of(3)],
    [CMD.VOLUME, Uint8Array.of(60, 60, 100)],
    [CMD.IN_EAR, Uint8Array.of(1)],
    [CMD.GAME_MODE, Uint8Array.of(2)],
    [CMD.LED_MODE, Uint8Array.of(1)],
    [CMD.BALANCE, Uint8Array.of(50)],
    [CMD.PAIR_NAME, new TextEncoder().encode('QCY T13 (simulado)')],
    [CMD.POWER_MANAGER, Uint8Array.of(0x2c, 0x01, 0, 0)],
    [CMD.KEY_FUNC, Uint8Array.of(1, 1, 2, 1, 3, 3, 4, 3, 9, 4, 10, 4)],
    [CMD.EQ_PARAMS2, encodeEq({
      index: 1, masterGain: 0,
      bands: [60, 250, 1000, 4000, 12000].map((freq) => ({ freq, gain: 0, q: 1, type: 2 })),
    }).subarray(2)],
  ]);
  battery = [82, 78, 55 | 0x80];
  legacyEq: Uint8Array = Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  private subs = new Map<string, Set<(d: Uint8Array) => void>>();
  private asm = new FrameAssembler();
  writes: Uint8Array[] = [];
  closeHandlers = new Set<() => void>();
  latencyMs = 25;
  /** simula firmware que aceita o write mas não aplica nem responde */
  ignoreWrites = false;

  notify(char: string, data: Uint8Array) { this.subs.get(char)?.forEach((cb) => cb(data)); }
  private reply(...t: Uint8Array[]) { setTimeout(() => this.notify(CHAR.STATE, encodeFrame(...t)), this.latencyMs); }

  handleWrite(char: string, data: Uint8Array) {
    this.writes.push(data);
    if (char === CHAR.EQ_LEGACY) { this.legacyEq = data; return; }
    if (char !== CHAR.SETTING) return;
    if (this.ignoreWrites && data[2] !== CMD.REQUEST) return;
    for (const frame of this.asm.push(data)) {
      for (const { cmd, data: d } of decodeFrame(frame)) {
        if (cmd === CMD.REQUEST) {
          const v = this.fw.get(d[0]!);
          if (v) this.reply(tlv(d[0]!, ...v)); // sem resposta = não suportado
        } else if (cmd !== CMD.SYNC_TIME) {
          const wasToggle = d.length === 1 && this.fw.has(cmd);
          if (this.fw.has(cmd) || wasToggle || cmd === CMD.EQ_PARAMS2) this.fw.set(cmd, d);
          this.reply(tlv(cmd, ...(this.fw.get(cmd) ?? d)));
        }
      }
    }
  }

  snapshot() { return encodeFrame(tlv(CMD.NOISE_MODE, ...this.fw.get(CMD.NOISE_MODE)!), tlv(CMD.VOLUME, ...this.fw.get(CMD.VOLUME)!)); }

  link(id: string): Link & { drop(): void } {
    const self = this;
    const chars = new Set(Object.values(CHAR));
    return {
      id, chars,
      write: async (c, d) => { await sleep(self.latencyMs); self.handleWrite(c, d); },
      read: async (c) => {
        await sleep(self.latencyMs);
        if (c === CHAR.STATE) return self.snapshot();
        if (c === CHAR.BATTERY) return Uint8Array.from(self.battery);
        if (c === CHAR.VERSION) return Uint8Array.of(1, 2, 3, 1, 2, 3);
        if (c === CHAR.BUTTONS) return self.fw.get(CMD.KEY_FUNC)!;
        if (c === CHAR.EQ_LEGACY) return self.legacyEq;
        return new Uint8Array(0);
      },
      subscribe(c, cb) {
        const set = self.subs.get(c) ?? new Set();
        set.add(cb); self.subs.set(c, set);
        return () => set.delete(cb);
      },
      onClose(cb) { self.closeHandlers.add(cb); return () => self.closeHandlers.delete(cb); },
      close: async () => {},
      drop() { self.closeHandlers.forEach((h) => h()); },
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockRadio implements Radio {
  readonly earbud = new MockEarbud();
  /** quantas conexões devem falhar antes de dar certo */
  failures = 0;
  connectDelayMs = 150;
  present = true;
  links: (Link & { drop(): void })[] = [];
  private stateCbs = new Set<(s: RadioState) => void>();
  private current: RadioState = 'on';

  state = async () => this.current;
  onState(cb: (s: RadioState) => void) { this.stateCbs.add(cb); cb(this.current); return () => void this.stateCbs.delete(cb); }
  setState(s: RadioState) { this.current = s; this.stateCbs.forEach((cb) => cb(s)); }

  scan(cb: (hit: ScanHit) => void) {
    const t = setInterval(() => {
      if (this.present) cb({ id: 'AA:BB:CC:DD:EE:01', rssi: -52, name: 'QCY T13', advert });
    }, 200);
    return () => clearInterval(t);
  }

  async connect(id: string, opts: { timeoutMs: number; signal?: AbortSignal }) {
    await sleep(this.connectDelayMs);
    if (opts.signal?.aborted) throw new Error('aborted');
    if (!this.present || this.failures-- > 0) throw new Error('connect failed');
    const l = this.earbud.link(id);
    this.links.push(l);
    return l;
  }
}
