export const toHex = (b: ArrayLike<number>): string =>
  Array.from(b as ArrayLike<number>, (x) => (x & 0xff).toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const h = hex.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
export const i16le = (b: Uint8Array, i: number): number => (u16le(b, i) << 16) >> 16;

export const base64ToBytes = (s: string): Uint8Array => {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
export const bytesToBase64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
