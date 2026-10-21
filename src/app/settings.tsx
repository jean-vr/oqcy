import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';
import { actions } from '@/actions';
import { manager } from '@/runtime';
import { useStore } from '@/store';
import { Btn, Card, List, Row, Screen, Segmented, SliderRow, T, useTheme } from '@/ui/kit';

const confirm = (title: string, ok: () => void) => {
  if (Platform.OS === 'web') return void (globalThis.confirm?.(title) && ok());
  Alert.alert(title, undefined, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: ok }]);
};

const POWER = [{ value: 0, label: 'Nunca' }, { value: 10, label: '10 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 h' }, { value: 120, label: '2 h' }];

export default function Settings() {
  const c = useTheme();
  const { state: s, target, status } = useStore();
  const [draft, setName] = useState<string>();
  const name = draft ?? s.name ?? ''; // segue o fone até o usuário editar
  const ready = status.phase === 'ready';
  const fw = s.version ? `${s.version.left}${s.version.right && s.version.right !== s.version.left ? ` / ${s.version.right}` : ''}` : '—';

  return (
    <Screen>
      <Card title="Nome do fone" dim={!ready}>
        <TextInput
          value={name} onChangeText={setName} maxLength={30} placeholder="Nome no Bluetooth" placeholderTextColor={c.sub}
          accessibilityLabel="Nome do fone"
          style={{ color: c.text, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
        />
        <Btn label="Salvar nome" disabled={!ready || !name.trim() || name === s.name} onPress={() => actions.rename(name.trim())} />
      </Card>

      {s.power && (
        <Card title="Desligamento automático" dim={!ready}>
          <Segmented options={POWER} value={s.power.offAfterMin} onChange={actions.powerOff} />
          <T dim size={12}>Valores em minutos; ainda não validados em todos os modelos.</T>
        </Card>
      )}

      {(s.toneVolume || s.balance !== undefined) && (
        <Card title="Áudio" dim={!ready}>
          {s.toneVolume && <SliderRow label="Volume dos avisos" icon="campaign" min={0} max={s.toneVolume.max} value={s.toneVolume.value} onChange={(v) => actions.toneVolume(v, s.toneVolume!.max)} />}
          {s.balance !== undefined && (
            <View>
              <SliderRow label="Balanço" icon="swap_horiz" min={0} max={100} value={s.balance} display={s.balance === 50 ? 'Centro' : String(s.balance)} onChange={actions.balance} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T dim size={12}>Esquerdo</T>
                <T dim size={12}>Direito</T>
              </View>
            </View>
          )}
        </Card>
      )}

      <List title="Informações">
        <Row icon="memory" iconColor="#64748b" label="Firmware" right={<T dim>{fw}</T>} />
        <Row icon="bluetooth" iconColor="#2563eb" label="MAC clássico" right={<T dim size={13}>{target?.classicMac ?? '—'}</T>} />
      </List>

      <List title="Fone">
        <Row icon="swap_horiz" iconColor="#0ea5e9" label="Trocar de fone" chevron onPress={() => router.push('/pair')} />
        <Row icon="link_off" iconColor="#64748b" label="Esquecer este fone" onPress={() => { useStore.getState().setTarget(null); manager.setTarget(null); router.back(); }} />
      </List>

      <List title="Zona de perigo" dim={!ready}>
        <Row icon="restart_alt" danger disabled={!ready} label="Restaurar ajustes padrão" onPress={() => confirm('Restaurar ajustes padrão do fone?', actions.resetDefault)} />
        <Row icon="bluetooth_disabled" danger disabled={!ready} label="Limpar pareamentos do fone" hint="Você precisará parear de novo" onPress={() => confirm('Limpar pareamentos? Você precisará parear de novo.', actions.clearPairing)} />
        <Row icon="delete_forever" danger disabled={!ready} label="Reset de fábrica" onPress={() => confirm('Reset de fábrica do fone?', actions.factoryReset)} />
      </List>
    </Screen>
  );
}
