import Native, { type ClassicChange, type ClassicDevice } from '../../modules/oqcy-classic/src/OqcyClassicModule';

export type { ClassicChange, ClassicDevice };

/** Estado do Bluetooth clássico (o que o sistema vê). Vazio fora do Android. */
export interface Classic {
  start(): void;
  bonded(): ClassicDevice[];
  onChange(cb: (e: ClassicChange) => void): () => void;
}

export const nativeClassic: Classic = {
  start: () => { try { Native?.start(); } catch { /* sem permissão ainda */ } },
  bonded: () => { try { return Native?.getBonded() ?? []; } catch { return []; } },
  onChange: (cb) => {
    const sub = Native?.addListener('onChange', cb);
    return () => sub?.remove();
  },
};
