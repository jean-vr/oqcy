import { toHex } from './bytes';
import { COMPANY_IDS } from './constants';

export type Advert = {
  companyId: number;
  /** id do modelo (big-endian nos bytes 0-1) */
  modelId: number;
  colorIndex: number;
  left?: { level: number; charging: boolean };
  right?: { level: number; charging: boolean };
  case?: { level: number; charging: boolean };
  /** MAC do Bluetooth clássico (A2DP/HFP) — liga o BLE ao fone pareado no sistema */
  classicMac: string;
  /** segundo MAC (outro lado do TWS); igual ao clássico quando zerado */
  otherMac: string;
};

const mac = (d: Uint8Array, order: number[]) =>
  order.map((i) => (d[i] ?? 0).toString(16).padStart(2, '0')).join(':').toUpperCase();

const battery = (b: number) => {
  const level = b & 0x7f;
  const ok = level > 0 && level <= 100;
  return ok ? { level, charging: (b & 0x80) !== 0 } : undefined;
};

/**
 * `raw` = manufacturer data com o company id (2 bytes LE) na frente, como o
 * Android/ble-plx entregam. Retorna null se não for um anúncio QCY.
 * O anúncio já traz bateria e MAC clássico: dá estado sem abrir conexão GATT.
 */
export function parseAdvert(raw: Uint8Array): Advert | null {
  if (raw.length < 2) return null;
  const companyId = raw[0]! | (raw[1]! << 8);
  if (!(COMPANY_IDS as readonly number[]).includes(companyId)) return null;
  const body = raw.subarray(2);
  if (body.length < 20) return null;
  const d = new Uint8Array(24);
  d.set(body.subarray(0, 24));

  const classicMac = mac(d, [12, 11, 13, 16, 15, 14]);
  let otherMac = mac(d, [19, 18, 20, 23, 22, 21]);
  if (otherMac === '00:00:00:00:00:00') otherMac = classicMac;

  return {
    companyId,
    modelId: (d[0]! << 8) | d[1]!,
    colorIndex: (d[3]! & 0x0e) >> 1,
    left: battery(d[5]!),
    right: battery(d[6]!),
    case: battery(d[7]!),
    classicMac,
    otherMac,
  };
}

export const advertKey = (a: Advert) => toHex([a.modelId >> 8, a.modelId & 0xff]) + a.classicMac;

/** Família de protocolo pelo byte baixo do id do modelo (mesma regra do app original). */
export function family(modelId: number): string {
  const hi = modelId & 0xf0;
  if (hi === 0x70 || modelId === 0x200) return 'JL (Jieli)';
  if (hi === 0x40) return 'WQ';
  if (hi === 0x90) return 'ZR';
  if (hi === 0xc0) return 'RTK (Realtek)';
  if (hi === 0xd0) return 'BES';
  return 'QCY padrão';
}
