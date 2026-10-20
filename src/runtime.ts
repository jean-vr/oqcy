import { useEffect } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { nativeClassic } from '@/classic';
import { ConnectionManager } from '@/session/manager';
import type { EarbudSession } from '@/session/session';
import { useStore } from '@/store';
import { createRadio, IS_SIMULATED } from '@/transport/radio';

export const radio = createRadio();
let session: EarbudSession | null = null;
export const getSession = () => session;
let unsubSession: (() => void) | undefined;

const { getState: store } = useStore;

export const manager = new ConnectionManager({
  radio,
  classic: nativeClassic,
  log: (m) => store().pushLog(m),
  onStatus: (status) => useStore.setState({ status }),
  onSession: (s) => {
    unsubSession?.();
    session = s;
    // Ao cair, mantém o último estado conhecido (a UI marca como desatualizado).
    if (s) useStore.setState({ state: s.state });
    unsubSession = s?.subscribe((state) => useStore.setState({ state }));
  },
  onTargetUpdate: (t) => store().setTarget(t),
});

/** Android 12+: SCAN + CONNECT. Android ≤ 11: localização (exigida pelo scan BLE). */
export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const p = PermissionsAndroid.PERMISSIONS;
  const wanted = Platform.Version >= 31 ? [p.BLUETOOTH_SCAN, p.BLUETOOTH_CONNECT] : [p.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((w) => res[w] === PermissionsAndroid.RESULTS.GRANTED);
}

let started = false;
async function boot() {
  if (started) return;
  started = true;
  const ok = await ensurePermissions();
  store().pushLog(ok ? 'permissões ok' : 'permissões negadas');
  // Demo na web: já aponta para o fone simulado.
  if (IS_SIMULATED && !store().target) store().setTarget({ classicMac: '11:22:33:44:55:66', name: 'QCY T13 (simulado)' });
  manager.setTarget(store().target);
  manager.start();
}

/** Liga o gerenciador uma vez e o "acorda" quando o app volta ao primeiro plano. */
export function useRuntime() {
  useEffect(() => {
    void boot();
    const sub = AppState.addEventListener('change', (s) => {
      session?.setPolling(s === 'active');
      if (s === 'active') manager.nudge('primeiro plano', false);
    });
    return () => sub.remove();
  }, []);
}
