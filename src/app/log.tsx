import { useState } from 'react';
import { Share, TextInput } from 'react-native';
import { CHAR } from '@/protocol/constants';
import { fromHex } from '@/protocol/bytes';
import { getSession, manager } from '@/runtime';
import { name } from '@/session/session';
import { useStore } from '@/store';
import { Btn, Card, Screen, T, useTheme } from '@/ui/kit';

export default function Log() {
  const c = useTheme();
  const [hex, setHex] = useState('');
  const { log, status, target, state } = useStore();
  return (
    <Screen>
      <Card title="Estado">
        <T>Fase: {status.phase}{status.detail ? ` — ${status.detail}` : ''}</T>
        <T dim size={13}>MAC clássico: {target?.classicMac ?? '—'}{'\n'}Endereço BLE: {target?.bleId ?? '—'}{'\n'}Tentativas: {status.attempt}</T>
        <Btn label="Reconectar agora" kind="plain" onPress={() => manager.nudge('diagnóstico')} />
        <Btn label="Compartilhar log" kind="plain" onPress={() => void Share.share({ message: [...log].reverse().join('\n') })} />
      </Card>
      <Card title="O que o fone respondeu">
        <T size={13} style={{ fontFamily: 'monospace' }}>
          {state.supported.length ? state.supported.map(name).join(', ') : '—'}
          {'\n'}ruído(12)={String(state.noiseMode)} cena(23)={state.ancScene ? `${state.ancScene.mode}/${state.ancScene.sub}/${state.ancScene.level}` : '—'}
          {'\n'}volume(8)={state.volume ? `${state.volume.left}/${state.volume.right}/${state.volume.max}` : '—'}
        </T>
      </Card>
      <Card title="Sondas (diagnóstico)">
        <T dim size={12}>
          1) Descobrir comandos lista o que o fone responde. 2) Sondar ruído testa formatos de troca de modo, um a cada ~3 s:
          ouça o fone e anote a hora do aviso sonoro (cada passo aparece no log).
        </T>
        <Btn label="Descobrir comandos" kind="plain" disabled={status.phase !== 'ready'} onPress={() => void getSession()?.discoverCommands()} />
        <Btn label="Sondar ruído" kind="plain" disabled={status.phase !== 'ready'} onPress={() => void getSession()?.probeNoise()} />
      </Card>
      <Card title="Enviar bytes (avançado)">
        <T dim size={12}>Hex cru para a característica 1001, ex.: ff03170301. A resposta aparece nos eventos.</T>
        <TextInput value={hex} onChangeText={setHex} autoCapitalize="none" autoCorrect={false} placeholder="ff03..."
          placeholderTextColor={c.sub} style={{ color: c.text, backgroundColor: c.bg, borderRadius: 10, padding: 12, fontFamily: 'monospace' }} />
        <Btn label="Enviar" kind="plain" disabled={status.phase !== 'ready' || hex.replace(/[^0-9a-f]/gi, '').length < 2}
          onPress={() => getSession()?.sendRaw(CHAR.SETTING, fromHex(hex))} />
      </Card>
      <Card title="Eventos">
        {log.length ? log.map((l, i) => <T key={i} size={12} style={{ fontFamily: 'monospace' }}>{l}</T>) : <T dim>Sem eventos ainda.</T>}
      </Card>
    </Screen>
  );
}
