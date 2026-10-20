import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { nativeClassic } from '@/classic';
import { manager, radio } from '@/runtime';
import { useStore } from '@/store';
import type { ScanHit } from '@/transport/types';
import { Card, Row, Screen, T } from '@/ui/kit';

export default function Pair() {
  const [hits, setHits] = useState<Record<string, ScanHit>>({});
  const bonded = nativeClassic.bonded();

  useEffect(() => {
    const stop = radio.scan((h) => setHits((p) => ({ ...p, [h.advert.classicMac]: h })));
    return stop;
  }, []);

  const pick = (h: ScanHit) => {
    const t = { classicMac: h.advert.classicMac, bleId: h.id, name: h.name ?? undefined };
    useStore.getState().setTarget(t);
    manager.setTarget(t);
    router.back();
  };

  const list = Object.values(hits).sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));
  return (
    <Screen>
      <T dim>
        Abra o estojo/ligue o fone perto do celular. Se ainda não pareou, faça isso primeiro nas configurações de Bluetooth
        do Android (o áudio usa o Bluetooth do sistema; o oqcy cuida só dos ajustes).
      </T>
      <Card title={list.length ? 'Encontrados' : 'Procurando…'}>
        {list.map((h) => {
          const paired = bonded.some((b) => b.mac.toUpperCase() === h.advert.classicMac);
          const bat = [h.advert.left, h.advert.right].filter(Boolean).map((b) => `${b!.level}%`).join(' · ');
          return (
            <Row
              key={h.advert.classicMac}
              label={h.name ?? `Modelo 0x${h.advert.modelId.toString(16)}`}
              hint={`${h.advert.classicMac} · ${h.rssi ?? '?'} dBm${bat ? ` · bat ${bat}` : ''}${paired ? ' · pareado' : ''}`}
              right={<T style={{ color: '#0a84ff' }}>Usar</T>}
              onPress={() => pick(h)}
            />
          );
        })}
      </Card>
    </Screen>
  );
}
