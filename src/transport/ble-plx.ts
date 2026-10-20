import { BleManager, ConnectionPriority, ScanMode, State, type Device } from 'react-native-ble-plx';
import { parseAdvert } from '@/protocol/advert';
import { base64ToBytes, bytesToBase64 } from '@/protocol/bytes';
import { SERVICE } from '@/protocol/constants';
import type { Link, Radio, RadioState, ScanHit } from './types';

const mapState = (s: State): RadioState =>
  s === State.PoweredOn ? 'on' : s === State.Unauthorized ? 'unauthorized' : s === State.Unsupported ? 'unsupported' : 'off';

const MTU = 247;

export class BlePlxRadio implements Radio {
  private readonly mgr = new BleManager();

  state = async () => mapState(await this.mgr.state());

  onState(cb: (s: RadioState) => void) {
    const sub = this.mgr.onStateChange((s) => cb(mapState(s)), true);
    return () => sub.remove();
  }

  scan(cb: (hit: ScanHit) => void, onError?: (e: unknown) => void) {
    // O ble-plx só filtra por serviço; o filtro por company id é feito aqui (barato).
    // LowLatency: o app original usava o modo balanceado (1), que atrasa o primeiro anúncio.
    void this.mgr.startDeviceScan(null, { scanMode: ScanMode.LowLatency, allowDuplicates: true }, (err, dev) => {
      if (err) return onError?.(err);
      if (!dev?.manufacturerData) return;
      const advert = parseAdvert(base64ToBytes(dev.manufacturerData));
      if (advert) cb({ id: dev.id, rssi: dev.rssi, name: dev.localName ?? dev.name, advert });
    });
    return () => void this.mgr.stopDeviceScan().catch(() => {});
  }

  async connect(id: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<Link> {
    const { signal } = opts;
    const aborted = () => signal?.aborted && new Error('aborted');
    const onAbort = () => void this.mgr.cancelDeviceConnection(id).catch(() => {});
    signal?.addEventListener('abort', onAbort);
    try {
      let dev = await this.mgr.connectToDevice(id, { timeout: opts.timeoutMs, requestMTU: MTU });
      if (aborted()) throw aborted();
      // Prioridade alta só durante a sincronização inicial; voltamos ao balanceado depois.
      void dev.requestConnectionPriority(ConnectionPriority.High).catch(() => {});
      dev = await dev.discoverAllServicesAndCharacteristics();
      if (aborted()) throw aborted();
      const chars = await dev.characteristicsForService(SERVICE);
      if (!chars.length) throw new Error('serviço QCY (A001) ausente');
      // Como o Android: se a característica aceita "sem resposta", é esse o tipo padrão de escrita.
      // Diagnóstico: todas as características do aparelho (modelos antigos usam outras além da 1001/1002).
      const all: Record<string, string> = {};
      const short = (u: string) => (/^0000....-0000-1000-8000-00805f9b34fb$/i.test(u) ? u.slice(4, 8) : u);
      const flags = (c: (typeof chars)[number]) =>
        `${c.isReadable ? 'r' : ''}${c.isWritableWithResponse ? 'w' : ''}${c.isWritableWithoutResponse ? 'W' : ''}${c.isNotifiable ? 'n' : ''}${c.isIndicatable ? 'i' : ''}`;
      try {
        for (const svc of await dev.services())
          for (const c of await svc.characteristics()) all[`${short(svc.uuid)}/${short(c.uuid)}`] = flags(c);
      } catch { /* só diagnóstico */ }
      const noResponse = new Set(chars.filter((c) => c.isWritableWithoutResponse).map((c) => c.uuid.toLowerCase()));
      return new PlxLink(this.mgr, dev, new Set(chars.map((c) => c.uuid.toLowerCase())), noResponse, all);
    } catch (e) {
      void this.mgr.cancelDeviceConnection(id).catch(() => {});
      throw e;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

class PlxLink implements Link {
  readonly id: string;
  constructor(
    private readonly mgr: BleManager,
    private readonly dev: Device,
    readonly chars: ReadonlySet<string>,
    private readonly noResponse: Set<string>,
    readonly props: Record<string, string>,
  ) {
    this.id = dev.id;
  }

  async write(char: string, data: Uint8Array) {
    const b64 = bytesToBase64(data);
    const send = (noRsp: boolean) =>
      noRsp
        ? this.mgr.writeCharacteristicWithoutResponseForDevice(this.id, SERVICE, char, b64)
        : this.mgr.writeCharacteristicWithResponseForDevice(this.id, SERVICE, char, b64);
    const first = this.noResponse.has(char);
    try {
      await send(first);
    } catch (e) {
      // Propriedades anunciadas nem sempre batem com o firmware: tenta o outro tipo e memoriza.
      await send(!first).catch(() => { throw e; });
      if (first) this.noResponse.delete(char); else this.noResponse.add(char);
    }
  }

  async read(char: string) {
    const c = await this.mgr.readCharacteristicForDevice(this.id, SERVICE, char);
    return c.value ? base64ToBytes(c.value) : new Uint8Array(0);
  }

  subscribe(char: string, cb: (d: Uint8Array) => void) {
    const sub = this.mgr.monitorCharacteristicForDevice(this.id, SERVICE, char, (err, c) => {
      if (!err && c?.value) cb(base64ToBytes(c.value));
    });
    return () => sub.remove();
  }

  onClose(cb: () => void) {
    const sub = this.mgr.onDeviceDisconnected(this.id, () => cb());
    return () => sub.remove();
  }

  relax() {
    void this.mgr.requestConnectionPriorityForDevice(this.id, ConnectionPriority.Balanced).catch(() => {});
  }

  async close() {
    await this.mgr.cancelDeviceConnection(this.id).catch(() => {});
  }
}
