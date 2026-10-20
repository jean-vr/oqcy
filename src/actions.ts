import { CMD } from '@/protocol/constants';
import { presetBytes, type EqPreset } from '@/protocol/presets';
import { encodeEq, type EqProfile } from '@/protocol/eq';
import { cmds, encodeButtons, TOGGLES } from '@/protocol/messages';
import { getSession as s } from '@/runtime';
import type { ToggleName } from '@/session/state';

/** Todas as ações são otimistas: a UI muda na hora, o fone confirma ou a leitura corrige. */
export const actions = {
  noiseMode: (mode: number) => s()?.optimistic({ kind: 'noiseMode', mode }, cmds.noiseMode(mode)),
  noiseValue: (value: number) => s()?.optimistic({ kind: 'noiseValue', value }, cmds.noiseValue(value)),
  toggle: (name: ToggleName, on: boolean) =>
    s()?.optimistic({ kind: 'toggle', cmd: TOGGLES[name], on }, cmds.toggle(TOGGLES[name], on)),
  volume: (left: number, right: number, max: number) =>
    s()?.optimistic({ kind: 'volume', left, right, max }, cmds.volume(left, right)),
  balance: (value: number) => s()?.optimistic({ kind: 'balance', value }, cmds.balance(value)),
  toneVolume: (value: number, max: number) =>
    s()?.optimistic({ kind: 'toneVolume', value, max }, cmds.toneVolume(value)),
  powerOff: (minutes: number) =>
    s()?.optimistic({ kind: 'power', offAfterMin: minutes, elapsedMin: 0 }, cmds.powerOff(minutes)),
  rename: (name: string) => s()?.optimistic({ kind: 'name', name }, cmds.rename(name)),
  media: (a: 1 | 2 | 3 | 4) => s()?.send(cmds.musicAction(a)),
  eq: (profile: EqProfile) =>
    s()?.optimistic({ kind: 'eq', cmd: CMD.EQ_PARAMS2, profile }, encodeEq(profile), 'eq'),
  eqPreset: (p: EqPreset) => s()?.setLegacyEq(presetBytes(p)),
  button: (keyId: number, funcId: number) => {
    s()?.optimistic({ kind: 'buttons', map: { [keyId]: funcId } }, null);
    s()?.writeButtons(encodeButtons({ [keyId]: funcId }));
  },
  find: (on: boolean) => s()?.send(cmds.find(on)),
  resetDefault: () => s()?.send(cmds.resetDefault()),
  clearPairing: () => s()?.send(cmds.clearPairing()),
  factoryReset: () => s()?.send(cmds.factoryReset()),
};
