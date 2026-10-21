import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { nativeClassic } from '@/classic';
import { manager, radio } from '@/runtime';
import { useStore } from '@/store';
import type { ScanHit } from '@/transport/types';
import { Card, Icon, List, Row, Screen, T, useTheme } from '@/ui/kit';

const STEPS = [
  'Pareie o fone nas configurações de Bluetooth do celular (o áudio usa o Bluetooth do sistema).',
  'Abra o estojo ou ligue o fone perto do celular.',
  'Toque no fone quando ele aparecer abaixo.',
];

export default function Pair() {
  const c = useTheme();
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
      <Card>
        {STEPS.map((st, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <T bold size={13} style={{ color: c.accent }}>{i + 1}</T>
            </View>
            <T size={15} style={{ flex: 1 }}>{st}</T>
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <ActivityIndicator size="small" color={c.sub} />
        <T dim size={14}>{list.length ? `${list.length} encontrado${list.length > 1 ? 's' : ''} · procurando…` : 'Procurando fones por perto…'}</T>
      </View>

      {list.length > 0 && (
        <List>
          {list.map((h) => {
            const paired = bonded.some((b) => b.mac.toUpperCase() === h.advert.classicMac);
            const bat = [h.advert.left, h.advert.right].filter(Boolean).map((b) => `${b!.level}%`).join(' · ');
            return (
              <Row
                key={h.advert.classicMac}
                icon="earbuds"
                label={h.name ?? `Modelo 0x${h.advert.modelId.toString(16)}`}
                hint={`${h.advert.classicMac} · ${h.rssi ?? '?'} dBm${bat ? ` · bateria ${bat}` : ''}`}
                right={paired ? <Icon name="check_circle" size={20} color={c.ok} /> : undefined}
                chevron
                onPress={() => pick(h)}
              />
            );
          })}
        </List>
      )}
    </Screen>
  );
}
