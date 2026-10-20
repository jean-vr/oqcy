import { CHAR, CMD } from '@/protocol/constants';
import { toHex } from '@/protocol/bytes';
import { decodeFrame, encodeFrame, FrameAssembler } from '@/protocol/frame';
import {
  cmds, decodeBattery, decodeButtons, decodeTlv, decodeVersion, type Event,
} from '@/protocol/messages';
import type { Link } from '@/transport/types';
import { emptyState, eventCmd, reduce, type EarbudState } from './state';

/** Estados que pedimos ao conectar. Só aparecem na UI os que o fone responder. */
const INIT_REQUESTS = [
  CMD.NOISE_MODE, CMD.NOISE_VALUE, CMD.ANC_SETTING, CMD.VOLUME, CMD.IN_EAR, CMD.GAME_MODE,
  CMD.SLEEP, CMD.LED_MODE, CMD.BALANCE, CMD.PAIR_NAME, CMD.POWER_MANAGER, CMD.TONE_VOLUME,
  CMD.KEY_FUNC, CMD.WEAR, CMD.EQ_PARAMS2,
];

type Queued = { key?: string; char: string; data: Uint8Array; quiet?: boolean };

/** Chave de comparação eco x pedido. Cena de ruído: só o modo (o fone normaliza sub/nível). */
const holdKey = (e: Event) => (e.kind === 'ancScene' ? `anc:${e.mode}` : JSON.stringify(e));

const CMD_NAME = new Map<number, string>(Object.entries(CMD).map(([k, v]) => [v, k]));
export const name = (cmd: number) => CMD_NAME.get(cmd) ?? `cmd${cmd}`;

/**
 * holdMs: janela em que ecos "velhos" do fone não sobrescrevem o que o usuário acabou de ajustar.
 * confirmMs: sem eco nesse prazo, relê o valor real (maior que holdMs, para a releitura valer).
 * pollMs: releitura periódica do que o fone muda sem avisar.
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const tuning = { holdMs: 2200, confirmMs: 2500, pollMs: 3000 };
/** Estados que o fone pode mudar sem avisar (volume pelo celular, botões, app de outro aparelho). */
const POLLED = [CMD.VOLUME, CMD.NOISE_MODE, CMD.ANC_SETTING];

export class EarbudSession {
  state: EarbudState = emptyState();
  private readonly asm = new FrameAssembler();
  private readonly listeners = new Set<(s: EarbudState) => void>();
  private readonly cleanups: (() => void)[] = [];
  private readonly queue: Queued[] = [];
  private pumping = false;
  private closed = false;
  private readonly awaiting = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly held = new Map<number, { key: string; until: number }>();
  private lastRx = '';
  private lastRxLogAt = 0;
  private poller: ReturnType<typeof setInterval> | undefined;
  /** pedidos explícitos ainda sem resposta (cmd -> quantos seguidos) */
  private readonly unanswered = new Map<number, number>();
  lastRxAt = Date.now();

  constructor(
    readonly link: Link,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  subscribe(cb: (s: EarbudState) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** `fromDevice`: eventos do fone respeitam a janela de proteção do último ajuste do usuário. */
  private apply(e: Event, fromDevice = true) {
    this.lastRxAt = Date.now();
    const cmd = eventCmd(e);
    if (cmd !== null && fromDevice) {
      const h = this.held.get(cmd);
      if (h && Date.now() < h.until) {
        if (holdKey(e) !== h.key) {
          this.log(`← ${name(cmd)} ignorado (eco antigo): ${JSON.stringify(e)}`);
          return;
        }
        this.held.delete(cmd); // o fone confirmou exatamente o que enviamos
      }
      this.clearAwait(cmd);
    }
    if (cmd !== null && fromDevice) this.unanswered.delete(cmd);
    this.state = reduce(this.state, e);
    this.listeners.forEach((l) => l(this.state));
  }

  private patch(p: Partial<EarbudState>) {
    this.lastRxAt = Date.now();
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l(this.state));
  }

  private onStateChunk = (chunk: Uint8Array) => {
    for (const frame of this.asm.push(chunk)) {
      // Respostas idênticas em sequência (releitura periódica) não vão para o log.
      const hex = toHex(frame);
      if (hex !== this.lastRx || Date.now() - this.lastRxLogAt > 30000) {
        this.log(`← ${hex}`);
        this.lastRx = hex;
        this.lastRxLogAt = Date.now();
      }
      for (const t of decodeFrame(frame)) this.apply(decodeTlv(t));
    }
  };

  /**
   * Assina, lê o instantâneo (1002 traz vários estados num quadro só) e pede o que faltou.
   * Resolve assim que o instantâneo + bateria chegaram: o resto preenche em segundo plano.
   */
  async init() {
    if (this.link.props) this.log(`GATT: ${JSON.stringify(this.link.props)}`);
    const has = (c: string) => this.link.chars.has(c);
    const sub = (c: string, cb: (d: Uint8Array) => void) => has(c) && this.cleanups.push(this.link.subscribe(c, cb));
    sub(CHAR.STATE, this.onStateChunk);
    sub(CHAR.BATTERY, (d) => { this.log(`← 0008 ${toHex(d)}`); const b = decodeBattery(d); if (b) this.patch({ battery: b }); });
    sub(CHAR.BUTTONS, (d) => this.apply({ kind: 'buttons', map: decodeButtons(d) }));
    sub(CHAR.EQ_LEGACY, (d) => d.length && this.patch({ legacyEq: { type: d[0]!, gains: [...d.subarray(1)].map((g) => (g << 24) >> 24) } }));

    const safe = <T>(p: Promise<T>) => p.catch((e) => (this.log(`leitura falhou: ${e?.message ?? e}`), undefined));
    const [snap, bat, ver, btn, eq] = await Promise.all([
      has(CHAR.STATE) ? safe(this.link.read(CHAR.STATE)) : undefined,
      has(CHAR.BATTERY) ? safe(this.link.read(CHAR.BATTERY)) : undefined,
      has(CHAR.VERSION) ? safe(this.link.read(CHAR.VERSION)) : undefined,
      has(CHAR.BUTTONS) ? safe(this.link.read(CHAR.BUTTONS)) : undefined,
      has(CHAR.EQ_LEGACY) ? safe(this.link.read(CHAR.EQ_LEGACY)) : undefined,
    ]);
    if (snap?.length) this.onStateChunk(snap);
    const b = bat && decodeBattery(bat);
    const v = ver && decodeVersion(ver);
    this.patch({
      ...(b ? { battery: b } : {}),
      ...(v ? { version: v } : {}),
      ...(eq?.length ? { legacyEq: { type: eq[0]!, gains: [...eq.subarray(1)].map((g) => (g << 24) >> 24) } } : {}),
    });
    if (btn?.length) this.apply({ kind: 'buttons', map: decodeButtons(btn) });

    this.setPolling(true);
    this.send(cmds.syncTime(new Date()));
    this.requestMissing();
    setTimeout(() => this.requestMissing(), 1500); // 1 retry para o que não respondeu
  }

  /** Releitura leve do que o fone muda sem avisar. Pausar com o app em segundo plano. */
  setPolling(on: boolean) {
    clearInterval(this.poller);
    this.poller = on
      ? setInterval(() => {
          for (const cmd of POLLED) {
            if (!this.state.supported.includes(cmd) || this.held.has(cmd)) continue;
            const miss = this.unanswered.get(cmd) ?? 0;
            if (miss >= 2) continue; // o fone não responde a esse pedido: para de perguntar
            this.unanswered.set(cmd, miss + 1);
            this.request(cmd, true);
          }
        }, tuning.pollMs)
      : undefined;
  }

  private requestMissing() {
    for (const cmd of INIT_REQUESTS) if (!this.state.supported.includes(cmd)) this.request(cmd);
  }

  request(cmd: number, quiet = false) {
    this.enqueue({ key: `req:${cmd}`, char: CHAR.SETTING, data: encodeFrame(cmds.request(cmd)), quiet });
  }

  /**
   * Modelos com cena de ruído (cmd 23) ignoram o cmd 12: foi o que o log de um fone real mostrou
   * (escrita 0c01/0c03, resposta sempre 0c02). Transparência usa sub 2 (convenção do app original).
   */
  setNoiseMode(mode: number) {
    if (this.state.supported.includes(CMD.ANC_SETTING)) {
      const sub = mode === 3 ? 2 : 0;
      this.optimistic({ kind: 'ancScene', mode, sub, level: 0 }, cmds.ancScene(mode, sub, 0));
    } else this.optimistic({ kind: 'noiseMode', mode }, cmds.noiseMode(mode));
  }

  /** Envia comandos. `key` colapsa envios pendentes iguais (sliders: só o último vale). */
  send(tlv: Uint8Array, key?: string) {
    this.enqueue({ key, char: CHAR.SETTING, data: encodeFrame(tlv) });
  }

  private async drained() {
    do await sleep(30);
    while (this.queue.length || this.pumping);
  }

  /** Diagnóstico: pergunta ao fone, um a um, os ids 1..100 e registra quais ele responde. */
  async discoverCommands() {
    this.log('sonda: descobrindo comandos…');
    for (let id = 1; id <= 100; id++) if (id !== CMD.REQUEST) this.request(id);
    await this.drained();
    await sleep(1500);
    const ids = [...this.state.supported].sort((a, b) => a - b);
    this.log(`sonda: o fone respondeu aos ids ${ids.join(',')}`);
  }

  /**
   * Diagnóstico: tenta formatos de troca de modo de ruído, com pausa para o usuário ouvir o aviso sonoro.
   * Cada passo registra um rótulo com a hora; depois relê 12 e 23.
   */
  async probeNoise() {
    // Ordem pensada para ouvir: liga o ANC, passa pelos valores de intensidade, depois ambiente e os mesmos valores.
    const seq: [string, number][] = [
      ['desligado', 0x02], ['ANC ligado', 0x63],
      ['0x41 (com ANC)', 0x41], ['0x51 (com ANC)', 0x51], ['0x61 (com ANC)', 0x61], ['0x71 (com ANC)', 0x71],
      ['ANC ligado de novo', 0x63], ['passthrough', 0xa4],
      ['0x41 (com passthrough)', 0x41], ['0x51 (com passthrough)', 0x51], ['0x61 (com passthrough)', 0x61], ['0x71 (com passthrough)', 0x71],
      ['desligado', 0x02],
    ];
    const steps = seq.map(([l, v]): [string, Uint8Array] => [l, cmds.noiseMode(v)]);
    for (const [i, [label, tlv]] of steps.entries()) {
      this.log(`sonda ${i + 1}/${steps.length}: ${label}`);
      this.send(tlv);
      await this.drained();
      await sleep(600);
      this.request(CMD.NOISE_MODE);
      this.request(CMD.ANC_SETTING);
      await this.drained();
      await sleep(3500);
    }
    this.log('sonda: fim');
  }

  /** EQ de presets: escreve [índice, ganhos] na 000B e relê para confirmar (a característica não notifica). */
  setLegacyEq(bytes: Uint8Array) {
    const gains = [...bytes.subarray(1)].map((g) => (g << 24) >> 24);
    this.patch({ legacyEq: { type: bytes[0]!, gains } });
    this.enqueue({ key: 'legacyEq', char: CHAR.EQ_LEGACY, data: bytes });
    setTimeout(() => {
      if (this.closed) return;
      this.link.read(CHAR.EQ_LEGACY).then((d) => {
        if (d.length && !this.closed) this.patch({ legacyEq: { type: d[0]!, gains: [...d.subarray(1)].map((g) => (g << 24) >> 24) } });
      }).catch(() => {});
    }, 900);
  }

  /** Diagnóstico: escreve bytes crus numa característica (ex.: `ff03170301`) e deixa o log mostrar a resposta. */
  sendRaw(char: string, data: Uint8Array) {
    this.enqueue({ char, data });
  }

  /** Botões usam a característica 000d, sem enquadramento. */
  writeButtons(data: Uint8Array) {
    this.enqueue({ key: 'buttons', char: CHAR.BUTTONS, data });
  }

  /** Aplica já na UI e, se o eco do fone não vier em 1.5 s, relê o valor real (rollback). */
  optimistic(e: Event, tlv: Uint8Array | null, key?: string) {
    this.apply(e, false);
    const cmd = eventCmd(e);
    if (tlv) this.send(tlv, key ?? (cmd !== null ? `set:${cmd}` : undefined));
    if (cmd !== null) {
      this.held.set(cmd, { key: holdKey(e), until: Date.now() + tuning.holdMs });
      this.clearAwait(cmd);
      this.awaiting.set(cmd, setTimeout(() => {
        this.awaiting.delete(cmd);
        this.held.delete(cmd);
        this.log(`sem eco de ${name(cmd)}: relendo o valor real`);
        this.request(cmd);
      }, tuning.confirmMs));
    }
  }

  private clearAwait(cmd: number) {
    const t = this.awaiting.get(cmd);
    if (t) {
      clearTimeout(t);
      this.awaiting.delete(cmd);
    }
  }

  private enqueue(item: Queued) {
    if (this.closed) return;
    const dup = item.key ? this.queue.find((q) => q.key === item.key) : undefined;
    if (dup) dup.data = item.data;
    else this.queue.push(item);
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length && !this.closed) {
        const item = this.queue.shift()!;
        try {
          if (!item.quiet) this.log(`→ ${item.char.slice(4, 8)} ${toHex(item.data)}`);
          await this.link.write(item.char, item.data);
        } catch (e) {
          this.log(`escrita falhou: ${(e as Error)?.message ?? e}`);
          if (!this.closed) { this.queue.length = 0; break; } // link caiu: o gerenciador reconecta
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Teste de vida barato: ler a bateria. */
  async ping(timeoutMs = 4000): Promise<boolean> {
    if (!this.link.chars.has(CHAR.BATTERY)) return true;
    try {
      const d = await Promise.race([
        this.link.read(CHAR.BATTERY),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      const b = decodeBattery(d);
      if (b) this.patch({ battery: b });
      return true;
    } catch {
      return false;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.setPolling(false);
    this.awaiting.forEach(clearTimeout);
    this.awaiting.clear();
    this.cleanups.forEach((c) => c());
    this.listeners.clear();
    await this.link.close();
  }
}
