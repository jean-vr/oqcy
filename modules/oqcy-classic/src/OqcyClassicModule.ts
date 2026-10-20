import { requireOptionalNativeModule } from 'expo';

export type ClassicDevice = { mac: string; name: string; connected: boolean };
export type ClassicChange = { mac: string; name: string; source: 'acl' | 'a2dp' | 'headset' | 'adapter'; connected: boolean };

type Native = {
  start(): void;
  getBonded(): ClassicDevice[];
  addListener(event: 'onChange', cb: (e: ClassicChange) => void): { remove(): void };
};

/** null fora do Android (web/iOS): o app segue funcionando só com BLE. */
export default requireOptionalNativeModule<Native>('OqcyClassic');
