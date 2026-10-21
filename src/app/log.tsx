import { useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { CHAR } from '@/protocol/constants';
import { fromHex } from '@/protocol/bytes';
import { getSession, manager } from '@/runtime';
import { name } from '@/session/session';
import { useStore } from '@/store';
import { Btn, Card, List, Row, Screen, T, useTheme } from '@/ui/kit';

const mono = { fontFamily: 'monospace' } as const;

export default function Log() {
  const c = useTheme();
  const [hex, setHex] = useState('');
  const { log, status, target, state } = useStore();
  const ready = status.phase === 'ready';
  return (
    <Screen>
      <List title="Conexão">
        <Row label="Fase" right={<T dim>{status.phase}</T>} hint={status.detail} />
        <Row label="MAC clássico" right={<T dim size={13} style={mono}>{target?.classicMac ?? '—'}</T>} />
        <Row label="Endereço BLE" right={<T dim size={13} style={mono}>{target?.bleId ?? '—'}</T>} />
        <Row label="Tentativas" right={<T dim>{status.attempt}</T>} />
      </List>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Btn label="Reconectar" kind="plain" icon="refresh" onPress={() => manager.nudge('diagnóstico')} /></View>
        <View style={{ flex: 1 }}><Btn label="Compartilhar" kind="plain" icon="share" onPress={() => void Share.share({ message: [...log].reverse().join('\n') })} /></View>
      </View>

      <Card title="O que o fone respondeu">
        <T size={13} style={mono}>
          {state.supported.length ? state.supported.map(name).join(', ') : '—'}
          {'\n'}ruído(12)={String(state.noiseMode)} cena(23)={state.ancScene ? `${state.ancScene.mode}/${state.ancScene.sub}/${state.ancScene.level}` : '—'}
          {'\n'}volume(8)={state.volume ? `${state.volume.left}/${state.volume.right}/${state.volume.max}` : '—'}
        </T>
      </Card>

      <Card title="Sondas">
        <T dim size={13}>
          Descobrir comandos lista o que o fone responde. Sondar ruído testa formatos de troca de modo, um a cada ~3 s:
          ouça o fone e anote a hora do aviso sonoro (cada passo aparece no log).
        </T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn label="Descobrir" kind="plain" icon="radar" disabled={!ready} onPress={() => void getSession()?.discoverCommands()} /></View>
          <View style={{ flex: 1 }}><Btn label="Sondar ruído" kind="plain" icon="noise_aware" disabled={!ready} onPress={() => void getSession()?.probeNoise()} /></View>
        </View>
      </Card>

      <Card title="Enviar bytes (avançado)">
        <T dim size={13}>Hex cru para a característica 1001, ex.: ff03170301. A resposta aparece nos eventos.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput value={hex} onChangeText={setHex} autoCapitalize="none" autoCorrect={false} placeholder="ff03..." accessibilityLabel="Bytes em hexadecimal"
            placeholderTextColor={c.sub} style={[mono, { flex: 1, color: c.text, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }]} />
          <Btn label="Enviar" disabled={!ready || hex.replace(/[^0-9a-f]/gi, '').length < 2}
            onPress={() => getSession()?.sendRaw(CHAR.SETTING, fromHex(hex))} />
        </View>
      </Card>

      <Card title="Eventos" style={{ backgroundColor: '#0d1117' }}>
        {log.length
          ? log.map((l, i) => <T key={i} size={12} style={[mono, { color: '#c9d1d9' }]}>{l}</T>)
          : <T size={13} style={{ color: '#8b949e' }}>Sem eventos ainda.</T>}
      </Card>
    </Screen>
  );
}
