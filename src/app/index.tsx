import { router } from 'expo-router';
import { actions } from '@/actions';
import { EQ_PRESETS, matchPreset } from '@/protocol/presets';
import { ANC_SCENES, isAncOn, NOISE_MODES } from '@/protocol/noise';
import { manager } from '@/runtime';
import { useStore } from '@/store';
import { IS_SIMULATED } from '@/transport/radio';
import { Battery, Btn, Card, Row, Screen, Segmented, SliderRow, T, Toggle, useTheme } from '@/ui/kit';
import { Pressable, View } from 'react-native';
import type { Phase } from '@/session/manager';
import type { ToggleName } from '@/session/state';

const PHASE: Record<Phase, string> = {
  off: 'Bluetooth desligado', idle: 'Desconectado', searching: 'Procurando…', connecting: 'Conectando…',
  syncing: 'Sincronizando…', ready: 'Conectado', backoff: 'Reconectando…',
};

/** O fone reporta o volume em escala de 0 a 127 (volume absoluto do Bluetooth); o "15" do 3º byte é outra coisa. */
const VOLUME_MAX = 127;

const NOISE = NOISE_MODES.map((m) => ({ value: m.value as number, label: m.label }));

const TOGGLES: [ToggleName, string, string][] = [
  ['gameMode', 'Modo jogo', 'Menor latência de áudio'],
  ['inEar', 'Detecção de uso', 'Pausa ao tirar o fone'],
  ['led', 'LED', 'Indicador luminoso'],
  ['sleep', 'Modo sono', ''],
];

export default function Home() {
  const c = useTheme();
  const { target, status, state: s } = useStore();
  const ready = status.phase === 'ready';
  const mode = s.noiseMode;
  const color = ready ? c.ok : status.phase === 'idle' || status.phase === 'off' ? c.bad : c.warn;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <View style={{ flex: 1 }}>
          <T bold size={28}>{s.name || target?.name || 'oqcy'}</T>
          <T size={14} style={{ color }}>● {PHASE[status.phase]}{IS_SIMULATED ? ' · simulado' : ''}</T>
          {status.detail && !ready ? <T dim size={12}>{status.detail}</T> : null}
        </View>
        <Btn label="Ajustes" kind="plain" onPress={() => router.push('/settings')} />
      </View>

      {!target ? (
        <Card title="Nenhum fone">
          <T dim>Pareie o fone nas configurações de Bluetooth do celular e depois adicione aqui.</T>
          <Btn label="Adicionar fone" onPress={() => router.push('/pair')} />
        </Card>
      ) : (
        <>
          {!ready && (
            <Btn label={status.phase === 'idle' ? 'Tentar conectar' : 'Reconectar agora'} kind="plain" onPress={() => manager.nudge('toque do usuário')} />
          )}

          <Card title="Bateria" dim={!ready}>
            <View style={{ flexDirection: 'row' }}>
              <Battery label="Esquerdo" level={s.battery?.left.level} charging={s.battery?.left.charging} />
              <Battery label="Direito" level={s.battery?.right.level} charging={s.battery?.right.charging} />
              <Battery label="Estojo" level={s.battery?.case.level} charging={s.battery?.case.charging} />
            </View>
          </Card>

          {mode !== undefined && (
            <Card title="Controle de ruído" dim={!ready}>
              <Segmented options={NOISE} value={isAncOn(mode) ? 0x63 : mode} onChange={actions.noiseMode} />
              {isAncOn(mode) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ANC_SCENES.map((sc) => (
                    <Pressable key={sc.value} onPress={() => actions.noiseMode(sc.value)}
                      style={{ flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 12, backgroundColor: sc.value === mode ? c.accent : c.bg }}>
                      <T bold size={14} style={{ color: sc.value === mode ? '#fff' : c.text }}>{sc.label}</T>
                      <T size={12} style={{ color: sc.value === mode ? '#fff' : c.sub }}>{sc.hint}</T>
                    </Pressable>
                  ))}
                </View>
              )}
              {!NOISE_MODES.some((m) => m.value === mode) && !isAncOn(mode) && (
                <T dim size={13}>Valor do fone: 0x{mode.toString(16)}</T>
              )}
            </Card>
          )}

          {s.legacyEq && (
            <Card title="Meus efeitos sonoros" dim={!ready}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {EQ_PRESETS.map((p) => {
                  const on = matchPreset(s.legacyEq)?.index === p.index;
                  return (
                    <Pressable key={p.index} onPress={() => actions.eqPreset(p)}
                      style={{ flexGrow: 1, flexBasis: '30%', padding: 12, borderRadius: 12, alignItems: 'center', backgroundColor: on ? c.accent : c.bg }}>
                      <T bold size={14} style={{ color: on ? '#fff' : c.text }}>{p.name}</T>
                    </Pressable>
                  );
                })}
              </View>
              {!matchPreset(s.legacyEq) && <T dim size={12}>EQ personalizado (tipo {s.legacyEq.type})</T>}
            </Card>
          )}

          {s.volume && (
            <Card title="Volume do fone" dim={!ready}>
              <SliderRow
                label="Volume" min={0} max={VOLUME_MAX}
                value={Math.min(VOLUME_MAX, Math.max(s.volume.left, s.volume.right))}
                display={`${Math.round((Math.max(s.volume.left, s.volume.right) / VOLUME_MAX) * 100)}%`}
                onChange={(v) => actions.volume(v, v, s.volume!.max)}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['⏮', 3], ['⏯', 1], ['⏭', 4]] as const).map(([l, a]) => (
                  <View key={a} style={{ flex: 1 }}><Btn label={l} kind="plain" onPress={() => actions.media(a)} /></View>
                ))}
              </View>
            </Card>
          )}

          {TOGGLES.some(([n]) => s.toggles[n] !== undefined) && (
            <Card title="Recursos" dim={!ready}>
              {TOGGLES.filter(([n]) => s.toggles[n] !== undefined).map(([n, label, hint]) => (
                <Row key={n} label={label} hint={hint} right={<Toggle on={!!s.toggles[n]} onChange={(v) => actions.toggle(n, v)} />} />
              ))}
            </Card>
          )}

          <Card dim={!ready}>
            {(s.eq || s.legacyEq) && <Row label="Equalizador" right={<T dim>›</T>} onPress={() => router.push('/eq')} />}
            {s.buttons && <Row label="Botões" right={<T dim>›</T>} onPress={() => router.push('/buttons')} />}
            <Row label="Diagnóstico de conexão" right={<T dim>›</T>} onPress={() => router.push('/log')} />
          </Card>
        </>
      )}
    </Screen>
  );
}
