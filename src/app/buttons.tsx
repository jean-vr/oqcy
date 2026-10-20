import { useState } from 'react';
import { actions } from '@/actions';
import { useStore } from '@/store';
import { Card, Row, Screen, T, useTheme } from '@/ui/kit';
import { Pressable, View } from 'react-native';

const FUNCS: Record<number, string> = {
  0: 'Nenhuma', 1: 'Play/Pause', 2: 'Anterior', 3: 'Próxima', 4: 'Assistente', 5: 'Volume +', 6: 'Volume −',
  7: 'Modo jogo', 8: 'Atender', 9: 'Recusar', 10: 'Em espera', 11: 'Rediscar',
};
const GESTURE = ['', 'toque', 'toque duplo', 'toque triplo', '4 toques', 'toque longo'];
// música: 1/2 simples, 3/4 duplo, 5/6 triplo, 7/8 quádruplo, 9/10 longo (ímpar = esquerdo)
const keyName = (id: number) => {
  if (id >= 1 && id <= 10) return `${id % 2 ? 'Esquerdo' : 'Direito'} · ${GESTURE[Math.ceil(id / 2)]}`;
  if (id >= 21 && id <= 30) return `Chamada · ${id % 2 ? 'Esquerdo' : 'Direito'} · ${GESTURE[Math.ceil((id - 20) / 2)]}`;
  return `Tecla ${id}`;
};

export default function Buttons() {
  const c = useTheme();
  const map = useStore((s) => s.state.buttons) ?? {};
  const [open, setOpen] = useState<number | null>(null);
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);

  return (
    <Screen>
      <Card title="Gestos">
        {keys.length === 0 && <T dim>O fone não informou os botões.</T>}
        {keys.map((k) => (
          <View key={k}>
            <Row label={keyName(k)} right={<T dim>{FUNCS[map[k]!] ?? `Função ${map[k]}`}</T>} onPress={() => setOpen(open === k ? null : k)} />
            {open === k && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
                {Object.entries(FUNCS).map(([id, name]) => (
                  <Pressable key={id} onPress={() => { actions.button(k, Number(id)); setOpen(null); }}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Number(id) === map[k] ? c.accent : c.bg }}>
                    <T size={14} style={{ color: Number(id) === map[k] ? '#fff' : c.text }}>{name}</T>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
