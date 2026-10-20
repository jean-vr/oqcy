import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, TextInput } from 'react-native';
import { actions } from '@/actions';
import { manager } from '@/runtime';
import { useStore } from '@/store';
import { Btn, Card, Row, Screen, Segmented, SliderRow, T, useTheme } from '@/ui/kit';

const confirm = (title: string, ok: () => void) => {
  if (Platform.OS === 'web') return void (globalThis.confirm?.(title) && ok());
  Alert.alert(title, undefined, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: ok }]);
};

const POWER = [{ value: 0, label: 'Nunca' }, { value: 10, label: '10 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 h' }, { value: 120, label: '2 h' }];

export default function Settings() {
  const c = useTheme();
  const { state: s, target, status } = useStore();
  const [name, setName] = useState(s.name ?? '');
  const ready = status.phase === 'ready';

  return (
    <Screen>
      <Card title="Nome do fone" dim={!ready}>
        <TextInput
          value={name} onChangeText={setName} maxLength={30} placeholder="Nome no Bluetooth" placeholderTextColor={c.sub}
          style={{ color: c.text, backgroundColor: c.bg, borderRadius: 10, padding: 12, fontSize: 16 }}
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
          {s.toneVolume && <SliderRow label="Volume dos avisos" min={0} max={s.toneVolume.max} value={s.toneVolume.value} onChange={(v) => actions.toneVolume(v, s.toneVolume!.max)} />}
          {s.balance !== undefined && <SliderRow label="Balanço E/D" min={0} max={100} value={s.balance} display={s.balance === 50 ? 'centro' : String(s.balance)} onChange={actions.balance} />}
        </Card>
      )}

      <Card title="Informações">
        <Row label="Firmware" right={<T dim>{s.version ? `${s.version.left}${s.version.right && s.version.right !== s.version.left ? ` / ${s.version.right}` : ''}` : '—'}</T>} />
        <Row label="MAC clássico" right={<T dim size={13}>{target?.classicMac ?? '—'}</T>} />
      </Card>

      <Card title="Fone" >
        <Btn label="Trocar de fone" kind="plain" onPress={() => router.push('/pair')} />
        <Btn label="Esquecer este fone" kind="plain" onPress={() => { useStore.getState().setTarget(null); manager.setTarget(null); router.back(); }} />
      </Card>

      <Card title="Zona de perigo" dim={!ready}>
        <Btn label="Restaurar ajustes padrão" kind="danger" disabled={!ready} onPress={() => confirm('Restaurar ajustes padrão do fone?', actions.resetDefault)} />
        <Btn label="Limpar pareamentos do fone" kind="danger" disabled={!ready} onPress={() => confirm('Limpar pareamentos? Você precisará parear de novo.', actions.clearPairing)} />
        <Btn label="Reset de fábrica" kind="danger" disabled={!ready} onPress={() => confirm('Reset de fábrica do fone?', actions.factoryReset)} />
      </Card>
    </Screen>
  );
}
