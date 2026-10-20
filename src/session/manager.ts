import type { Classic } from '@/classic';
import type { Link, Radio, RadioState, ScanHit } from '@/transport/types';
import { family } from '@/protocol/advert';
import { EarbudSession } from './session';

export type Phase = 'off' | 'idle' | 'searching' | 'connecting' | 'syncing' | 'ready' | 'backoff';
export type Target = { classicMac: string; bleId?: string; name?: string };
export type Status = { phase: Phase; detail?: string; attempt: number };

export type Config = {
  connectMs: number;
  acquireMs: number;
  syncMs: number;
  backoffMs: number[];
  /** falhas seguidas, com o sistema dizendo "desconectado", antes de parar de tentar e esperar o evento clássico */
  idleAfterFailures: number;
  watchdogMs: number;
};

export const defaultConfig: Config = {
  connectMs: 6000,
  acquireMs: 15000,
  syncMs: 8000,
  backoffMs: [300, 1000, 2000, 4000, 8000, 15000],
  idleAfterFailures: 3,
  watchdogMs: 20000,
};

export type Deps = {
  radio: Radio;
  classic: Classic;
  log?: (msg: string) => void;
  onStatus: (s: Status) => void;
  onSession: (s: EarbudSession | null) => void;
  onTargetUpdate?: (t: Target) => void;
  config?: Partial<Config>;
};

const same = (a?: string, b?: string) => !!a && !!b && a.toUpperCase() === b.toUpperCase();

/**
 * Mantém o fone conectado. Diferenças em relação ao app original:
 *  - corrida "conexão direta ao último endereço BLE" x "varredura de baixa latência filtrada pelo MAC clássico";
 *  - eventos do Bluetooth clássico (ACL/A2DP) disparam a conexão na hora e derrubam a sessão quando o fone
 *    sai do celular, em vez de esperar o timeout do GATT;
 *  - backoff exponencial com jitter em vez de tentativa fixa + trava de 1 s;
 *  - watchdog de vida (leitura de bateria) que detecta link "meio morto".
 */
export class ConnectionManager {
  private readonly cfg: Config;
  private target: Target | null = null;
  private session: EarbudSession | null = null;
  private status: Status = { phase: 'idle', attempt: 0 };
  private running = false;
  private busy = false;
  private gen = 0;
  private attempts = 0;
  private radioState: RadioState = 'on';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private cancelAcquire: (() => void) | undefined;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly d: Deps) {
    this.cfg = { ...defaultConfig, ...d.config };
  }

  private log = (m: string) => this.d.log?.(m);

  private setStatus(phase: Phase, detail?: string) {
    this.status = { phase, detail, attempt: this.attempts };
    this.d.onStatus(this.status);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.d.classic.start();
    this.offs.push(
      this.d.radio.onState((s) => {
        const was = this.radioState;
        this.radioState = s;
        if (s !== 'on') {
          this.dropSession('bluetooth desligado');
          this.setStatus('off', s === 'unauthorized' ? 'sem permissão' : 'Bluetooth desligado');
        } else if (was !== 'on') this.nudge('bluetooth ligado');
      }),
      this.d.classic.onChange((e) => this.onClassic(e.mac, e.source, e.connected)),
    );
    this.nudge('start');
  }

  stop() {
    this.running = false;
    this.offs.splice(0).forEach((f) => f());
    this.dropSession('parado');
    this.cancelAcquire?.();
    clearTimeout(this.timer);
  }

  setTarget(t: Target | null) {
    this.target = t;
    this.dropSession('alvo mudou');
    this.cancelAcquire?.();
    this.attempts = 0;
    if (t) this.nudge('novo alvo');
    else this.setStatus('idle', 'nenhum fone selecionado');
  }

  /** Tentar agora (app voltou ao primeiro plano, usuário tocou, evento do sistema…). */
  nudge(reason: string, resetBackoff = true) {
    if (!this.running || !this.target || this.status.phase === 'ready') return;
    this.log(`nudge: ${reason}`);
    clearTimeout(this.timer);
    if (resetBackoff) this.attempts = 0;
    void this.tick();
  }

  private onClassic(mac: string, source: string, connected: boolean) {
    if (source === 'adapter' || !this.target || !same(mac, this.target.classicMac)) return;
    this.log(`clássico ${source} ${connected ? 'conectou' : 'desconectou'}`);
    if (connected) this.nudge(`clássico ${source}`);
    else if (source === 'acl') {
      // Fone saiu do alcance/foi pro estojo: não esperar o timeout de supervisão do GATT.
      this.dropSession('desconectado do celular');
      this.setStatus('idle', 'fone desconectado do celular');
    }
  }

  private classicSays(): 'connected' | 'disconnected' | 'unknown' {
    const dev = this.d.classic.bonded().find((b) => same(b.mac, this.target?.classicMac));
    return !dev ? 'unknown' : dev.connected ? 'connected' : 'disconnected';
  }

  private dropSession(why: string) {
    clearInterval(this.watchdog);
    const s = this.session;
    if (!s) return;
    this.log(`sessão encerrada: ${why}`);
    this.session = null;
    this.d.onSession(null);
    void s.close();
  }

  private async tick() {
    if (!this.running || !this.target || this.busy || this.radioState !== 'on') return;
    this.busy = true;
    const gen = ++this.gen;
    try {
      this.setStatus('searching');
      const link = await this.acquire(gen);
      if (gen !== this.gen) return void link.close();
      this.setStatus('syncing');
      const session = new EarbudSession(link, this.log);
      const closeOff = link.onClose(() => { closeOff(); if (this.session === session) this.lost('link caiu'); });
      await withTimeout(session.init(), this.cfg.syncMs, 'sincronização');
      if (gen !== this.gen) return void session.close();
      this.session = session;
      this.attempts = 0;
      this.target = { ...this.target, bleId: link.id };
      this.d.onTargetUpdate?.(this.target);
      this.setStatus('ready');
      this.d.onSession(session);
      link.relax?.();
      this.watchdog = setInterval(() => void this.check(session), this.cfg.watchdogMs);
    } catch (e) {
      if (gen !== this.gen) return;
      this.fail((e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  private async check(s: EarbudSession) {
    if (this.session !== s || Date.now() - s.lastRxAt < this.cfg.watchdogMs) return;
    if (!(await s.ping()) && !(await s.ping())) this.lost('sem resposta');
  }

  private lost(why: string) {
    this.dropSession(why);
    this.attempts = 0;
    this.setStatus('backoff', why);
    this.timer = setTimeout(() => void this.tick(), 300);
  }

  private fail(why: string) {
    this.attempts++;
    this.log(`tentativa ${this.attempts} falhou: ${why}`);
    if (this.attempts >= this.cfg.idleAfterFailures && this.classicSays() === 'disconnected') {
      this.setStatus('idle', 'fone desconectado do celular');
      return; // próximo gatilho: evento clássico, bluetooth ligado ou toque do usuário
    }
    const table = this.cfg.backoffMs;
    const base = table[Math.min(this.attempts - 1, table.length - 1)]!;
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.setStatus('backoff', `${why} — nova tentativa em ${(delay / 1000).toFixed(1)}s`);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  /** Corrida: conexão direta ao último endereço x varredura. O primeiro link que sincronizar vence. */
  private acquire(gen: number): Promise<Link> {
    const target = this.target!;
    return new Promise<Link>((resolve, reject) => {
      const attempts = new Map<string, AbortController>();
      const lastFail = new Map<string, number>();
      let settled = false;
      let stopScan = () => {};
      let announced = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        stopScan();
        attempts.forEach((c) => c.abort());
        this.cancelAcquire = undefined;
        fn();
      };
      const deadline = setTimeout(() => finish(() => reject(new Error('não encontrei o fone'))), this.cfg.acquireMs);
      this.cancelAcquire = () => finish(() => reject(new Error('cancelado')));

      const tryId = (id: string) => {
        if (settled || gen !== this.gen || attempts.has(id)) return;
        if (Date.now() - (lastFail.get(id) ?? 0) < 1000) return;
        attempts.forEach((c, k) => { if (k !== id) { c.abort(); attempts.delete(k); } }); // endereço antigo
        const ctl = new AbortController();
        attempts.set(id, ctl);
        this.setStatus('connecting');
        this.log(`conectando a ${id}`);
        this.d.radio.connect(id, { timeoutMs: this.cfg.connectMs, signal: ctl.signal }).then(
          (link) => (settled ? void link.close() : finish(() => resolve(link))),
          (e) => { if (attempts.get(id) === ctl) { attempts.delete(id); lastFail.set(id, Date.now()); } this.log(`${id}: ${e?.message ?? e}`); },
        );
      };

      stopScan = this.d.radio.scan(
        (hit: ScanHit) => {
          if (same(hit.advert.classicMac, target.classicMac) || same(hit.advert.otherMac, target.classicMac) || hit.id === target.bleId) {
            if (!announced) {
              announced = true;
              const a = hit.advert;
              this.log(`anúncio: empresa 0x${a.companyId.toString(16)} modelo 0x${a.modelId.toString(16)} (${family(a.modelId)}) cor ${a.colorIndex} id ${hit.id}`);
            }
            tryId(hit.id);
          }
        },
        (e) => this.log(`scan: ${(e as Error)?.message ?? e}`),
      );
      if (target.bleId) tryId(target.bleId); // atalho: sem esperar anúncio
    });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${what}: timeout`)), ms);
    p.then((v) => (clearTimeout(t), res(v)), (e) => (clearTimeout(t), rej(e)));
  });
}
