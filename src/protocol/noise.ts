/**
 * Valores do comando 12 (modo de ruído) do QCY HT05 ANC. Origem: duas capturas HCI do app oficial
 * + confirmação do usuário (02/63/A4). Faixas dos cenários do ANC, observadas no app oficial:
 * Interior 65–67, Viagens diárias 81–83, Barulho 97–99, Vento 113; Transparente 160–166 (padrão 164).
 */
export const NOISE_MODES = [
  { value: 0x63, label: 'Cancelamento' },
  { value: 0x02, label: 'Desligado' },
  { value: 0xa4, label: 'Ambiente' },
] as const;

/** Só valem com o ANC ligado. O fone devolve o próprio valor do cenário como modo atual. */
export const ANC_SCENES = [
  { value: 0x41, label: 'Interior', hint: 'Ambiente silencioso' },
  { value: 0x51, label: 'Viagens diárias', hint: 'Ambientes ruidosos' },
  { value: 0x61, label: 'Barulho', hint: 'Muito ruidoso' },
  { value: 0x71, label: 'Ruído contra o vento', hint: 'Vento' },
] as const;

export const isAncOn = (v: number | undefined) =>
  v === 0x63 || ANC_SCENES.some((s) => s.value === v);
