export type EqPreset = { index: number; name: string; gains: number[] };

/**
 * Presets "Meus efeitos sonoros" do QCY HT05: escritos na característica 000B como [índice, 10 ganhos int8].
 * Bytes tirados de uma captura HCI do app oficial; índice = ordem em que o app os grava.
 * O "Clássico" não foi capturado: ganhos observados no app oficial; índice 6 inferido pela ordem da tela.
 */
export const EQ_PRESETS: EqPreset[] = [
  { index: 1, name: 'Predefinido', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { index: 2, name: 'Popular', gains: [-6, 5, -3, -2, 5, 4, -4, -3, 6, 4] },
  { index: 3, name: 'Bass pesados', gains: [6, 5, 4, 3, 0, 0, 0, 0, 0, 0] },
  { index: 4, name: 'Rock', gains: [5, 4, 2, 1, -3, -4, 2, 1, 4, 5] },
  { index: 5, name: 'Suave', gains: [5, -5, -4, -4, 3, 2, 4, 4, 0, 0] },
  { index: 6, name: 'Clássico', gains: [5, 5, 1, 2, -1, 1, -4, -6, -7, -8] },
];

export const presetBytes = (p: EqPreset): Uint8Array => Uint8Array.from([p.index, ...p.gains.map((g) => g & 0xff)]);

export const matchPreset = (eq: { type: number; gains: number[] } | undefined): EqPreset | undefined =>
  eq && EQ_PRESETS.find((p) => p.index === eq.type && p.gains.every((g, i) => g === (((eq.gains[i] ?? 0) << 24) >> 24)));
