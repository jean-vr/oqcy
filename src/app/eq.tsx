import { actions } from '@/actions';
import { EQ_GAIN_LIMIT } from '@/protocol/eq';
import { useStore } from '@/store';
import { Btn, Card, Screen, SliderRow, T } from '@/ui/kit';

const hz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(1)} kHz` : `${f} Hz`);

export default function Eq() {
  const { eq, legacyEq } = useStore((s) => s.state);

  if (!eq) {
    return (
      <Screen>
        <Card title="Equalizador do fone">
          <T dim>
            Este fone usa o EQ de presets (protocolo legado). Estado atual: tipo {legacyEq?.type ?? '—'}, ganhos [
            {legacyEq?.gains.join(', ')}]. A edição de presets ainda não foi implementada.
          </T>
        </Card>
      </Screen>
    );
  }

  const setBand = (i: number, gain: number) =>
    actions.eq({ ...eq, bands: eq.bands.map((b, j) => (j === i ? { ...b, gain } : b)) });

  return (
    <Screen>
      <Card title="Ganho geral">
        <SliderRow label="Master" min={-EQ_GAIN_LIMIT} max={EQ_GAIN_LIMIT} step={0.1} value={eq.masterGain}
          display={`${eq.masterGain.toFixed(1)} dB`} onChange={(v) => actions.eq({ ...eq, masterGain: v })} />
      </Card>
      <Card title="Bandas">
        {eq.bands.filter((b) => b.freq > 0).map((b, i) => (
          <SliderRow key={i} label={hz(b.freq)} min={-EQ_GAIN_LIMIT} max={EQ_GAIN_LIMIT} step={0.1} value={b.gain}
            display={`${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)} dB`} onChange={(v) => setBand(i, v)} />
        ))}
      </Card>
      <Btn label="Zerar" kind="plain" onPress={() => actions.eq({ ...eq, masterGain: 0, bands: eq.bands.map((b) => ({ ...b, gain: 0 })) })} />
    </Screen>
  );
}
