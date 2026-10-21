import { router } from 'expo-router';
import type { AndroidSymbol } from 'expo-symbols';
import { actions } from '@/actions';
import { EQ_PRESETS, matchPreset } from '@/protocol/presets';
import { ANC_SCENES, isAncOn, NOISE_MODES } from '@/protocol/noise';
import { manager } from '@/runtime';
import { useStore } from '@/store';
import { IS_SIMULATED } from '@/transport/radio';
import { Battery, Btn, Card, Icon, IconBtn, List, Row, Screen, SliderRow, T, useTheme } from '@/ui/kit';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type { Phase } from '@/session/manager';
import type { ToggleName } from '@/session/state';

const PHASE: Record<Phase, string> = {
  off: 'Bluetooth desligado', idle: 'Desconectado', searching: 'Procurando…', connecting: 'Conectando…',
  syncing: 'Sincronizando…', ready: 'Conectado', backoff: 'Reconectando…',
};

/** O fone reporta o volume em escala de 0 a 127 (volume absoluto do Bluetooth); o "15" do 3º byte é outra coisa. */
const VOLUME_MAX = 127;

const NOISE_ICON: Record<number, AndroidSymbol> = { 0x63: 'noise_aware', 0x02: 'noise_control_off', 0xa4: 'hearing' };
const SCENE_ICON: Record<number, AndroidSymbol> = { 0x41: 'home', 0x51: 'directions_bus', 0x61: 'campaign', 0x71: 'air' };

const TOGGLES: [ToggleName, string, string, AndroidSymbol][] = [
  ['gameMode', 'Modo jogo', 'Menor latência', 'sports_esports'],
  ['inEar', 'Detecção de uso', 'Pausa ao tirar', 'sensors'],
  ['led', 'LED', 'Indicador luminoso', 'lightbulb'],
  ['sleep', 'Modo sono', 'Para dormir', 'bedtime'],
];

/** Mini-curva dos 10 ganhos (±8 dB): barras a partir da linha do zero. */
function Curve({ gains, color }: { gains: number[]; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 }}>
      {gains.map((g, i) => (
        <View key={i} style={{ width: 4, height: 32, justifyContent: g >= 0 ? 'flex-end' : 'flex-start' }}>
          <View style={{ height: Math.max(2, (Math.abs(g) / 8) * 16), borderRadius: 2, backgroundColor: color, marginBottom: g >= 0 ? 16 : 0, marginTop: g < 0 ? 16 : 0 }} />
        </View>
      ))}
    </View>
  );
}

export default function Home() {
  const c = useTheme();
  const { target, status, state: s } = useStore();
  const ready = status.phase === 'ready';
  const busy = !ready && status.phase !== 'idle' && status.phase !== 'off';
  const mode = s.noiseMode;
  const dot = ready ? c.ok : busy ? c.warn : c.bad;
  const preset = matchPreset(s.legacyEq);
  const toggles = TOGGLES.filter(([n]) => s.toggles[n] !== undefined);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <T bold size={30} numberOfLines={1} style={{ letterSpacing: -0.6 }}>{s.name || target?.name || 'oqcy'}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {busy ? <ActivityIndicator size="small" color={dot} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
            <T dim size={14}>{PHASE[status.phase]}{IS_SIMULATED ? ' · simulado' : ''}</T>
          </View>
        </View>
        <IconBtn icon="settings" label="Ajustes" onPress={() => router.push('/settings')} />
      </View>

      {!target ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 16 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="earbuds" size={44} color={c.accent} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <T bold size={20}>Nenhum fone por aqui</T>
            <T dim style={{ textAlign: 'center' }}>Pareie o fone nas configurações de Bluetooth do celular e depois adicione aqui.</T>
          </View>
          <Btn label="Adicionar fone" icon="add" onPress={() => router.push('/pair')} />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: 20 }}>
            <View style={{ flexDirection: 'row', opacity: ready ? 1 : 0.5 }}>
              <Battery label="Esquerdo" icon="earbuds" level={s.battery?.left.level} charging={s.battery?.left.charging} />
              <Battery label="Direito" icon="earbuds" level={s.battery?.right.level} charging={s.battery?.right.charging} />
              <Battery label="Estojo" icon="earbuds_battery" level={s.battery?.case.level} charging={s.battery?.case.charging} />
            </View>
            {!ready && (
              <View style={{ gap: 10 }}>
                {status.detail ? <T dim size={13} style={{ textAlign: 'center' }}>{status.detail}</T> : null}
                <Btn label={status.phase === 'idle' ? 'Conectar' : 'Reconectar agora'} icon="bluetooth_searching" onPress={() => manager.nudge('toque do usuário')} />
              </View>
            )}
          </Card>

          {mode !== undefined && (
            <Card title="Controle de ruído" dim={!ready}>
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
                {NOISE_MODES.map((m) => {
                  const on = m.value === 0x63 ? isAncOn(mode) : m.value === mode;
                  return (
                    <Pressable key={m.value} onPress={() => actions.noiseMode(m.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}>
                      <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.fill }}>
                        <Icon name={NOISE_ICON[m.value]!} size={28} color={on ? c.onAccent : c.text} />
                      </View>
                      <T size={14} bold={on} style={{ color: on ? c.text : c.sub }}>{m.label}</T>
                    </Pressable>
                  );
                })}
              </View>
              {isAncOn(mode) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ANC_SCENES.map((sc) => {
                    const on = sc.value === mode;
                    return (
                      <Pressable key={sc.value} onPress={() => actions.noiseMode(sc.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={{ flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
                          backgroundColor: on ? c.accentSoft : c.fill, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
                        <Icon name={SCENE_ICON[sc.value]!} size={22} color={on ? c.accent : c.sub} />
                        <View style={{ flex: 1 }}>
                          <T bold size={14} numberOfLines={2}>{sc.label}</T>
                          <T dim size={12} numberOfLines={1}>{sc.hint}</T>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {!NOISE_MODES.some((m) => m.value === mode) && !isAncOn(mode) && (
                <T dim size={13} style={{ textAlign: 'center' }}>Modo informado pelo fone: 0x{mode.toString(16)}</T>
              )}
            </Card>
          )}

          {s.legacyEq && (
            <Card title="Som" dim={!ready} style={{ paddingHorizontal: 0 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
                {EQ_PRESETS.map((p) => {
                  const on = preset?.index === p.index;
                  return (
                    <Pressable key={p.index} onPress={() => actions.eqPreset(p)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={{ width: 112, padding: 12, gap: 10, borderRadius: 16, backgroundColor: on ? c.accent : c.fill }}>
                      <Curve gains={p.gains} color={on ? c.onAccent : c.accent} />
                      <T bold size={14} numberOfLines={1} style={{ color: on ? c.onAccent : c.text }}>{p.name}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {!preset && <T dim size={12} style={{ paddingHorizontal: 16 }}>EQ personalizado (tipo {s.legacyEq.type})</T>}
            </Card>
          )}

          {s.volume && (
            <Card title="Reprodução" dim={!ready}>
              <SliderRow
                label="Volume do fone" icon="volume_up" min={0} max={VOLUME_MAX}
                value={Math.min(VOLUME_MAX, Math.max(s.volume.left, s.volume.right))}
                display={`${Math.round((Math.max(s.volume.left, s.volume.right) / VOLUME_MAX) * 100)}%`}
                onChange={(v) => actions.volume(v, v, s.volume!.max)}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
                <IconBtn icon="skip_previous" label="Anterior" onPress={() => actions.media(3)} />
                <IconBtn icon="play_pause" label="Tocar ou pausar" size={60} primary onPress={() => actions.media(1)} />
                <IconBtn icon="skip_next" label="Próxima" onPress={() => actions.media(4)} />
              </View>
            </Card>
          )}

          {toggles.length > 0 && (
            <Card title="Recursos" dim={!ready} style={{ backgroundColor: 'transparent', padding: 0 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
                {toggles.map(([n, label, hint, icon]) => {
                  const on = !!s.toggles[n];
                  return (
                    <Pressable key={n} onPress={() => actions.toggle(n, !on)} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }}
                      style={({ pressed }) => ({ width: '48.5%', padding: 14, gap: 14, borderRadius: 20, backgroundColor: on ? c.accent : c.card, opacity: pressed ? 0.8 : 1 })}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Icon name={icon} size={26} color={on ? c.onAccent : c.text} />
                        <T size={12} bold style={{ color: on ? c.onAccent : c.sub }}>{on ? 'Ligado' : 'Desligado'}</T>
                      </View>
                      <View>
                        <T bold size={15} style={{ color: on ? c.onAccent : c.text }}>{label}</T>
                        <T size={12} style={{ color: on ? c.onAccent : c.sub, opacity: on ? 0.85 : 1 }}>{hint}</T>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}

          <List title="Mais">
            {s.eq && <Row icon="equalizer" iconColor="#8b5cf6" label="Equalizador" hint="Ajuste banda a banda" chevron onPress={() => router.push('/eq')} />}
            {s.buttons && <Row icon="touch_app" iconColor="#f59e0b" label="Botões" hint="Gestos de toque" chevron onPress={() => router.push('/buttons')} />}
            <Row icon="monitor_heart" iconColor="#64748b" label="Diagnóstico" hint="Log e ferramentas de conexão" chevron onPress={() => router.push('/log')} />
          </List>
        </>
      )}
    </Screen>
  );
}
