import { useState } from 'react';
import { actions } from '@/actions';
import { useStore } from '@/store';
import { List, Row, Screen, Segmented, T, useTheme } from '@/ui/kit';
import { Pressable, View } from 'react-native';

const FUNCS: Record<number, string> = {
  0: 'Nenhuma', 1: 'Play/Pause', 2: 'Anterior', 3: 'Próxima', 4: 'Assistente', 5: 'Volume +', 6: 'Volume −',
  7: 'Modo jogo', 8: 'Atender', 9: 'Recusar', 10: 'Em espera', 11: 'Rediscar',
};
const GESTURE = ['', 'Toque', 'Toque duplo', 'Toque triplo', '4 toques', 'Toque longo'];
// música: 1/2 simples, 3/4 duplo, 5/6 triplo, 7/8 quádruplo, 9/10 longo (ímpar = esquerdo); chamada: 21–30, mesma regra
const gesture = (id: number) => GESTURE[Math.ceil((id > 20 ? id - 20 : id) / 2)] || `Tecla ${id}`;
const side = (id: number) => (id % 2 ? 'Esquerdo' : 'Direito');

export default function Buttons() {
  const c = useTheme();
  const map = useStore((s) => s.state.buttons) ?? {};
  const [open, setOpen] = useState<number | null>(null);
  const [call, setCall] = useState(false);
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  const hasCall = keys.some((k) => k > 20);
  const shown = keys.filter((k) => (k > 20) === (call && hasCall));

  return (
    <Screen>
      {hasCall && <Segmented options={[{ value: 0, label: 'Música' }, { value: 1, label: 'Chamadas' }]} value={call ? 1 : 0} onChange={(v) => { setCall(!!v); setOpen(null); }} />}
      {keys.length === 0 && <T dim style={{ textAlign: 'center', paddingTop: 24 }}>O fone não informou os botões.</T>}
      {(['Esquerdo', 'Direito'] as const).map((sd) => {
        const ks = shown.filter((k) => side(k) === sd);
        if (!ks.length) return null;
        return (
          <List key={sd} title={`Fone ${sd.toLowerCase()}`}>
            {ks.map((k) => (
              <View key={k}>
                <Row label={gesture(k)} right={<T style={{ color: c.accent }}>{FUNCS[map[k]!] ?? `Função ${map[k]}`}</T>} chevron onPress={() => setOpen(open === k ? null : k)} />
                {open === k && (
                  <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
                    {Object.entries(FUNCS).map(([id, name]) => {
                      const on = Number(id) === map[k];
                      return (
                        <Pressable key={id} onPress={() => { actions.button(k, Number(id)); setOpen(null); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? c.accent : c.fill }}>
                          <T size={14} style={{ color: on ? c.onAccent : c.text }}>{name}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </List>
        );
      })}
    </Screen>
  );
}
