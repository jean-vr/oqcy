import { View } from 'react-native';
import { actions } from '@/actions';
import { EQ_GAIN_LIMIT } from '@/protocol/eq';
import { useStore } from '@/store';
import { Btn, Card, Screen, Slider, SliderRow, T } from '@/ui/kit';

const hz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${f}`);
const db = (g: number) => `${g > 0 ? '+' : ''}${g.toFixed(1)}`;

export default function Eq() {
  const { eq, legacyEq } = useStore((s) => s.state);

  if (!eq) {
    return (
      <Screen>
        <Card title="Equalizador do fone">
          <T dim>
            Este fone usa o EQ de presets (protocolo legado): escolha um efeito na tela inicial. Estado atual: tipo {legacyEq?.type ?? '—'}, ganhos [
            {legacyEq?.gains.join(', ')}].
          </T>
        </Card>
      </Screen>
    );
  }

  const setBand = (i: number, gain: number) =>
    actions.eq({ ...eq, bands: eq.bands.map((b, j) => (j === i ? { ...b, gain } : b)) });
  const bands = eq.bands.map((b, i) => ({ ...b, i })).filter((b) => b.freq > 0);

  return (
    <Screen>
      <Card title="Bandas" right={<T dim size={13}>dB</T>}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: 260 }}>
          {bands.map((b) => (
            <View key={b.i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
              <T size={12} bold style={{ fontVariant: ['tabular-nums'] }}>{db(b.gain)}</T>
              <Slider vertical label={`${hz(b.freq)} Hz`} min={-EQ_GAIN_LIMIT} max={EQ_GAIN_LIMIT} step={0.1} value={b.gain} onChange={(v) => setBand(b.i, v)} />
              <T dim size={12}>{hz(b.freq)}</T>
            </View>
          ))}
        </View>
      </Card>
      <Card title="Ganho geral">
        <SliderRow label="Master" icon="tune" min={-EQ_GAIN_LIMIT} max={EQ_GAIN_LIMIT} step={0.1} value={eq.masterGain}
          display={`${db(eq.masterGain)} dB`} onChange={(v) => actions.eq({ ...eq, masterGain: v })} />
      </Card>
      <Btn label="Zerar tudo" kind="plain" icon="restart_alt" onPress={() => actions.eq({ ...eq, masterGain: 0, bands: eq.bands.map((b) => ({ ...b, gain: 0 })) })} />
    </Screen>
  );
}
