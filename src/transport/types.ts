import type { Advert } from '@/protocol/advert';

/** Uma conexão GATT já com serviços descobertos. */
export interface Link {
  readonly id: string;
  /** características do serviço QCY (uuid minúsculo) */
  readonly chars: ReadonlySet<string>;
  /** propriedades por característica (r/w/W/n/i), só para diagnóstico */
  readonly props?: Record<string, string>;
  write(char: string, data: Uint8Array): Promise<void>;
  read(char: string): Promise<Uint8Array>;
  /** devolve a função de cancelamento */
  subscribe(char: string, cb: (data: Uint8Array) => void): () => void;
  onClose(cb: () => void): () => void;
  /** volta a conexão ao intervalo balanceado depois da sincronização inicial */
  relax?(): void;
  close(): Promise<void>;
}

export type ScanHit = { id: string; rssi: number | null; name: string | null; advert: Advert };

export type RadioState = 'on' | 'off' | 'unauthorized' | 'unsupported';

export interface Radio {
  state(): Promise<RadioState>;
  onState(cb: (s: RadioState) => void): () => void;
  /** Varredura contínua de baixa latência; devolve a função de parada. */
  scan(cb: (hit: ScanHit) => void, onError?: (e: unknown) => void): () => void;
  connect(id: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<Link>;
}
