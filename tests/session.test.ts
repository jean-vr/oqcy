import { describe, expect, it } from 'vitest';
import type { Classic, ClassicChange, ClassicDevice } from '../src/classic';
import { CMD } from '../src/protocol/constants';
import { cmds } from '../src/protocol/messages';
import { ConnectionManager, type Status } from '../src/session/manager';
import type { EarbudSession } from '../src/session/session';
import { MOCK_CLASSIC_MAC, MockRadio } from '../src/transport/mock';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout no teste');
    await wait(10);
  }
}

class FakeClassic implements Classic {
  devices: ClassicDevice[] = [{ mac: MOCK_CLASSIC_MAC, name: 'QCY', connected: false }];
  cbs = new Set<(e: ClassicChange) => void>();
  start() {}
  bonded = () => this.devices;
  onChange(cb: (e: ClassicChange) => void) { this.cbs.add(cb); return () => void this.cbs.delete(cb); }
  emit(connected: boolean, source: ClassicChange['source'] = 'acl') {
    this.devices[0]!.connected = connected;
    this.cbs.forEach((cb) => cb({ mac: MOCK_CLASSIC_MAC, name: 'QCY', source, connected }));
  }
}

function setup(target = { classicMac: MOCK_CLASSIC_MAC } as { classicMac: string; bleId?: string }) {
  const radio = new MockRadio();
  radio.connectDelayMs = 20;
  const classic = new FakeClassic();
  const statuses: Status[] = [];
  let session: EarbudSession | null = null;
  const mgr = new ConnectionManager({
    radio, classic,
    onStatus: (s) => statuses.push(s),
    onSession: (s) => (session = s),
    config: { backoffMs: [20, 40], acquireMs: 800, connectMs: 300, syncMs: 1500, idleAfterFailures: 2, watchdogMs: 100000 },
  });
  mgr.setTarget(target);
  mgr.start();
  return { radio, classic, mgr, statuses, get session() { return session; }, phase: () => statuses.at(-1)?.phase };
}

describe('ConnectionManager + sessão contra o fone simulado', () => {
  it('acha pelo MAC clássico via varredura, sincroniza e lê o estado inicial', async () => {
    const t = setup();
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.EQ_PARAMS2) === true);
    const s = t.session!.state;
    expect(s.battery?.left.level).toBe(82);
    expect(s.battery?.case.charging).toBe(true);
    expect(s.version?.left).toBe('1.2.3');
    expect(s.noiseMode).toBe(1);
    expect(s.volume).toEqual({ left: 60, right: 60, max: 100 });
    expect(s.toggles.inEar).toBe(true);
    expect(s.toggles.gameMode).toBe(false);
    expect(s.eq?.bands).toHaveLength(5);
    expect(s.supported).not.toContain(CMD.SLEEP); // fone simulado não suporta: sem resposta
    t.mgr.stop();
  });

  it('com endereço BLE salvo, conecta direto sem esperar anúncio', async () => {
    const t = setup({ classicMac: MOCK_CLASSIC_MAC, bleId: 'AA:BB:CC:DD:EE:01' });
    t.radio.present = true;
    await until(() => t.phase() === 'ready');
    t.mgr.stop();
  });

  it('comando otimista aplica na hora e o fone confirma; sliders colapsam em um envio', async () => {
    const t = setup();
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.EQ_PARAMS2) === true);
    const volumeWrites = () => t.radio.earbud.writes.filter((w) => w[2] === CMD.VOLUME && w[3] === 3).length;
    const s = t.session!;
    for (const v of [10, 20, 30, 40]) s.optimistic({ kind: 'volume', left: v, right: v, max: 100 }, cmds.volume(v, v));
    expect(s.state.volume?.left).toBe(40); // UI já mudou
    await until(() => t.radio.earbud.fw.get(CMD.VOLUME)![0] === 40);
    expect(volumeWrites()).toBeLessThanOrEqual(2); // 1 em voo + o último
    t.mgr.stop();
  });

  it('reconecta sozinho quando o link cai e quando o fone volta (evento clássico)', async () => {
    const t = setup();
    await until(() => t.phase() === 'ready');
    t.radio.links[0]!.drop();
    await until(() => t.phase() !== 'ready');
    await until(() => t.phase() === 'ready' && t.radio.links.length === 2);

    t.classic.emit(false); // fone foi pro estojo: derruba na hora, sem tentar
    await until(() => t.phase() === 'idle');
    expect(t.session).toBeNull();
    t.classic.emit(true, 'a2dp'); // voltou: conecta imediatamente
    await until(() => t.phase() === 'ready' && t.radio.links.length === 3);
    t.mgr.stop();
  });

  it('para de insistir quando o sistema diz desconectado, e retoma no evento', async () => {
    const t = setup();
    t.radio.present = false;
    await until(() => t.phase() === 'idle', 5000);
    t.radio.present = true;
    t.classic.emit(true);
    await until(() => t.phase() === 'ready');
    t.mgr.stop();
  });
});

import { tuning } from '../src/session/session';

describe('estado que não pode "voltar sozinho"', () => {
  it('eco antigo logo após o ajuste não sobrescreve a UI; o valor final do fone vale', async () => {
    Object.assign(tuning, { holdMs: 300, confirmMs: 400, pollMs: 100000 });
    const t = setup();
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.NOISE_MODE) === true);
    const s = t.session!;
    // fone ainda reporta o modo antigo (1) por um instante; depois aplica o novo (3)
    t.radio.earbud.latencyMs = 25;
    s.optimistic({ kind: 'noiseMode', mode: 3 }, cmds.noiseMode(3));
    t.radio.earbud.fw.set(CMD.NOISE_MODE, Uint8Array.of(1)); // eco velho
    s['onStateChunk'](Uint8Array.of(0xff, 3, CMD.NOISE_MODE, 1, 1)); // notificação velha chega
    expect(s.state.noiseMode).toBe(3); // ignorada
    t.radio.earbud.fw.set(CMD.NOISE_MODE, Uint8Array.of(3));
    await wait(500);
    expect(s.state.noiseMode).toBe(3);
    t.mgr.stop();
  });

  it('sem eco, relê e adota o valor real do fone (rollback explícito)', async () => {
    Object.assign(tuning, { holdMs: 100, confirmMs: 200, pollMs: 100000 });
    const t = setup();
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.NOISE_MODE) === true);
    const s = t.session!;
    t.radio.earbud.ignoreWrites = true; // firmware que ignora o comando
    s.optimistic({ kind: 'noiseMode', mode: 3 }, cmds.noiseMode(3));
    expect(s.state.noiseMode).toBe(3);
    await until(() => s.state.noiseMode === 1, 2000);
    t.mgr.stop();
  });

  it('mudança feita no fone/celular aparece pela releitura periódica', async () => {
    Object.assign(tuning, { holdMs: 100, confirmMs: 200, pollMs: 80 });
    const t = setup();
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.VOLUME) === true);
    t.radio.earbud.fw.set(CMD.VOLUME, Uint8Array.of(33, 33, 100)); // mudou fora do app
    await until(() => t.session!.state.volume?.left === 33, 2000);
    t.mgr.stop();
  });
});

describe('cena de ruído (cmd 23)', () => {
  it('troca pelo cmd 23 quando suportado e o eco normalizado (3,1,0) confirma o modo 3', async () => {
    Object.assign(tuning, { holdMs: 300, confirmMs: 400, pollMs: 100000 });
    const t = setup();
    t.radio.earbud.fw.set(CMD.ANC_SETTING, Uint8Array.of(2, 0, 0));
    await until(() => t.phase() === 'ready');
    await until(() => t.session?.state.supported.includes(CMD.ANC_SETTING) === true);
    const s = t.session!;
    s.setNoiseMode(3);
    expect(s.state.ancScene?.mode).toBe(3);
    await wait(600);
    expect(s.state.ancScene?.mode).toBe(3);
    t.mgr.stop();
  });
});

describe('EQ de presets', () => {
  it('escreve [índice, ganhos] na 000B, atualiza a UI e confirma relendo', async () => {
    const t = setup();
    await until(() => t.phase() === 'ready');
    const s = t.session!;
    const { EQ_PRESETS, presetBytes } = await import('../src/protocol/presets');
    const rock = EQ_PRESETS.find((p) => p.name === 'Rock')!;
    s.setLegacyEq(presetBytes(rock));
    expect(s.state.legacyEq?.type).toBe(4);
    await until(() => t.radio.earbud.legacyEq[0] === 4);
    await wait(1100);
    expect(s.state.legacyEq?.gains).toEqual(rock.gains);
    t.mgr.stop();
  });
});
