const base = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

/** GATT do protocolo QCY (serviço 0xA001). */
export const SERVICE = base('a001');
export const CHAR = {
  /** write: comandos enquadrados (FF len TLV...) */
  SETTING: base('1001'),
  /** notify/read: respostas e estado enquadrados */
  STATE: base('1002'),
  /** notify/read: bateria [L, R, estojo], bit7 = carregando */
  BATTERY: base('0008'),
  /** read: versão de firmware L/R */
  VERSION: base('0007'),
  /** read/write/notify: botões, pares [keyId, funcId] sem enquadramento */
  BUTTONS: base('000d'),
  /** read/write/notify: EQ legado [tipo, ganhos...] */
  EQ_LEGACY: base('000b'),
} as const;

/** Company IDs usados nos anúncios BLE dos fones (0x521C e 0x522C). */
export const COMPANY_IDS = [0x521c, 0x522c] as const;

export const CMD = {
  RESET_DEFAULT: 1,
  CLEAR_PAIR: 2,
  FACTORY_RESET: 3,
  MUSIC_ACTION: 4,
  LIGHT: 5,
  IN_EAR: 6,
  NOISE_VALUE: 7,
  VOLUME: 8,
  GAME_MODE: 9,
  NOISE_MODE: 12,
  TEST_MODE: 13,
  SLEEP: 16,
  COMPACTNESS: 17,
  LED_MODE: 18,
  POWER_MANAGER: 20,
  BALANCE: 22,
  ANC_SETTING: 23,
  PAIR_NAME: 24,
  VOICE_LANG: 25,
  TONE_VOLUME: 29,
  EQ_PARAMS: 32,
  EQ_PARAMS2: 34,
  KEY_FUNC: 43,
  WEAR: 44,
  BATTERY: 47,
  VERSION: 48,
  SYNC_TIME: 62,
  EQ_LEFT: 70,
  EQ_RIGHT: 71,
  REQUEST: 0xfe,
} as const;

export const SOF = 0xff;
