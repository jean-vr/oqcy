import { MockRadio } from './mock';
import type { Radio } from './types';

/** Na web não há Bluetooth: roda contra o fone simulado, útil para ver a UI. */
export const createRadio = (): Radio => new MockRadio();
export const IS_SIMULATED = true;
