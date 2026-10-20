import { BlePlxRadio } from './ble-plx';
import type { Radio } from './types';

export const createRadio = (): Radio => new BlePlxRadio();
export const IS_SIMULATED = false;
