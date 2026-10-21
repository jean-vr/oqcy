import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Children, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  PanResponder, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View, type LayoutChangeEvent,
  type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const palette = {
  light: {
    bg: '#f2f3f6', card: '#ffffff', fill: '#eef0f4', text: '#0e1013', sub: '#5f6570', line: '#e2e5ea',
    accent: '#2563eb', accentSoft: '#e7eefd', onAccent: '#ffffff', ok: '#16a34a', warn: '#c2690a', bad: '#dc2626',
  },
  dark: {
    bg: '#000000', card: '#16171a', fill: '#222428', text: '#f3f4f6', sub: '#9ba1ab', line: '#2a2c31',
    accent: '#3b82f6', accentSoft: '#15243f', onAccent: '#ffffff', ok: '#34d27b', warn: '#f2a83b', bad: '#ff5f5f',
  },
};
export type Theme = typeof palette.light;
export const useTheme = (): Theme => palette[useColorScheme() === 'dark' ? 'dark' : 'light'];

export function T({ dim, bold, size, style, ...p }: TextProps & { dim?: boolean; bold?: boolean; size?: number }) {
  const c = useTheme();
  return <Text {...p} style={[{ color: dim ? c.sub : c.text, fontSize: size ?? 16, fontWeight: bold ? '600' : '400' }, style]} />;
}

// ponytail: o nome Material serve no Android e na web; no iOS (não suportado pelo app) o ícone não aparece.
export function Icon({ name, size = 22, color }: { name: AndroidSymbol; size?: number; color?: string }) {
  const c = useTheme();
  return <SymbolView name={{ android: name, web: name }} size={size} tintColor={color ?? c.text} />;
}

/** Ícone dentro de um quadrado arredondado colorido, como nas listas de ajustes do sistema. */
export function Badge({ name, color, size = 32 }: { name: AndroidSymbol; color?: string; size?: number }) {
  const c = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: color ?? c.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.6} color="#fff" />
    </View>
  );
}

export function Screen({ children, edges = ['left', 'right'] }: { children: ReactNode; edges?: ('top' | 'left' | 'right')[] }) {
  const c = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Título de seção fica fora do cartão; `right` é uma ação opcional (ex.: "Avançado"). */
export function Card({ title, right, children, dim, style }: { title?: string; right?: ReactNode; children: ReactNode; dim?: boolean; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <View style={{ gap: 8, opacity: dim ? 0.5 : 1 }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <T bold size={13} dim accessibilityRole="header" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</T>
          {right}
        </View>
      ) : null}
      <View style={[{ backgroundColor: c.card, borderRadius: 20, padding: 16, gap: 14 }, style]}>{children}</View>
    </View>
  );
}

/** Lista agrupada: cartão sem padding vertical, com divisórias finas entre as linhas. */
export function List({ title, children, dim }: { title?: string; children: ReactNode; dim?: boolean }) {
  const c = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <Card title={title} dim={dim} style={{ paddingVertical: 4, gap: 0 }}>
      {rows.map((r, i) => (
        <View key={i} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : undefined}>{r}</View>
      ))}
    </Card>
  );
}

export function Row({ label, hint, icon, iconColor, right, onPress, chevron, danger, disabled }: {
  label: string; hint?: string; icon?: AndroidSymbol; iconColor?: string; right?: ReactNode;
  onPress?: () => void; chevron?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}
    >
      {icon ? <Badge name={icon} color={danger ? c.bad : iconColor} /> : null}
      <View style={{ flex: 1 }}>
        <T style={danger ? { color: c.bad } : undefined}>{label}</T>
        {hint ? <T dim size={13}>{hint}</T> : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron_right" size={20} color={c.sub} /> : null}
    </Pressable>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onChange(!on)}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? c.accent : c.line, padding: 3, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', marginLeft: on ? 20 : 0 }} />
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: {
  options: { value: V; label: string }[]; value: V | undefined; onChange: (v: V) => void;
}) {
  const c = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? c.card : 'transparent' }}
          >
            <T size={14} bold={sel} style={{ color: sel ? c.text : c.sub, textAlign: 'center' }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled, icon }: {
  label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean; icon?: AndroidSymbol;
}) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.bad : c.fill;
  const fg = kind === 'plain' ? c.text : c.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: bg,
        minHeight: 48, paddingHorizontal: 18, borderRadius: 14, opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <T bold style={{ color: fg }}>{label}</T>
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, label, size = 44, primary }: { icon: AndroidSymbol; onPress: () => void; label: string; size?: number; primary?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? c.accent : c.fill, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={size * 0.5} color={primary ? c.onAccent : c.text} />
    </Pressable>
  );
}

/* O PanResponder é criado uma vez e lê as props mais recentes por ref (o React Compiler não enxerga isso como seguro). */
/* eslint-disable react-hooks/refs */
/** Slider em JS puro: funciona igual no Android, iOS e web (sem módulo nativo). `vertical` = fader de EQ. */
export function Slider({ value, min, max, step = 1, onChange, disabled, vertical, label }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; vertical?: boolean; label?: string;
}) {
  const c = useTheme();
  const length = useRef(1);
  const p0 = useRef(0);
  // Sempre as props mais recentes: o PanResponder é criado uma vez e não pode capturar callbacks velhos.
  const latest = useRef({ value, min, max, step, onChange, disabled, vertical });
  useEffect(() => { latest.current = { value, min, max, step, onChange, disabled, vertical }; });

  const [pan] = useState(() => {
    const emit = (pos: number) => {
      const p = latest.current;
      const t0 = Math.max(0, Math.min(1, pos / length.current));
      const t = p.vertical ? 1 - t0 : t0;
      const v = Math.max(p.min, Math.min(p.max, +(Math.round((p.min + t * (p.max - p.min)) / p.step) * p.step).toFixed(4)));
      if (v !== p.value) { p.value = v; p.onChange(v); }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { p0.current = latest.current.vertical ? e.nativeEvent.locationY : e.nativeEvent.locationX; emit(p0.current); },
      onPanResponderMove: (_, g) => emit(p0.current + (latest.current.vertical ? g.dy : g.dx)),
    });
  });

  const step1 = (dir: 1 | -1) => onChange(Math.max(min, Math.min(max, +(value + dir * step).toFixed(4))));
  const toPct = (v: number) => (max === min ? 0 : Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)));
  const pct = toPct(value);
  // Faixa bipolar (ex.: ±dB): o preenchimento sai do zero, não da ponta.
  const from = min < 0 && max > 0 ? toPct(0) : 0;
  const lo = Math.min(from, pct), len = Math.abs(pct - from);
  const a11y = {
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: label,
    accessibilityValue: { min, max, now: value },
    accessibilityActions: [{ name: 'increment' as const }, { name: 'decrement' as const }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => step1(e.nativeEvent.actionName === 'increment' ? 1 : -1),
  };

  if (vertical) {
    return (
      <View
        {...pan.panHandlers} {...a11y}
        onLayout={(e: LayoutChangeEvent) => { length.current = e.nativeEvent.layout.height || 1; }}
        style={{ flex: 1, width: 36, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}
      >
        <View pointerEvents="none" style={{ flex: 1, width: 6, borderRadius: 3, backgroundColor: c.line }}>
          <View style={{ position: 'absolute', bottom: `${lo}%`, height: `${len}%`, width: 6, borderRadius: 3, backgroundColor: c.accent }} />
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center' }]}>
          <View style={{ position: 'absolute', bottom: `${pct}%`, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: c.accent, transform: [{ translateY: 12 }] }} />
        </View>
      </View>
    );
  }
  return (
    <View
      {...pan.panHandlers} {...a11y}
      onLayout={(e: LayoutChangeEvent) => { length.current = e.nativeEvent.layout.width || 1; }}
      style={{ height: 36, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}>
        <View style={{ marginLeft: `${lo}%`, width: `${len}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
        <View style={{ marginLeft: `${pct}%`, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: c.accent, transform: [{ translateX: -12 }] }} />
      </View>
    </View>
  );
}

/* eslint-enable react-hooks/refs */

export function SliderRow({ label, value, display, icon, ...p }: { label: string; display?: string; icon?: AndroidSymbol } & React.ComponentProps<typeof Slider>) {
  const c = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Icon name={icon} size={20} color={c.sub} /> : null}
        <T style={{ flex: 1 }}>{label}</T>
        <T dim style={{ fontVariant: ['tabular-nums'] }}>{display ?? String(value)}</T>
      </View>
      <Slider value={value} label={label} {...p} />
    </View>
  );
}

/** Cápsula vertical de bateria: cor muda em 30% e 15%. */
export function Battery({ label, level: raw, charging, icon }: { label: string; level?: number; charging?: boolean; icon: AndroidSymbol }) {
  const c = useTheme();
  const level = raw ? raw : undefined; // 0 = sem leitura (ex.: estojo ausente)
  const color = level === undefined ? c.sub : level <= 15 ? c.bad : level <= 30 ? c.warn : c.ok;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${level === undefined ? 'sem leitura' : `${level}%`}${charging ? ', carregando' : ''}`}
      style={{ flex: 1, alignItems: 'center', gap: 8 }}
    >
      <View style={{ width: 58, height: 92, borderRadius: 20, backgroundColor: c.fill, overflow: 'hidden', justifyContent: 'flex-end' }}>
        <View style={{ height: `${level ?? 0}%`, backgroundColor: color, opacity: 0.22 }} />
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 2 }]}>
          <Icon name={icon} size={26} color={level === undefined ? c.sub : c.text} />
          {charging ? <Icon name="bolt" size={16} color={c.ok} /> : null}
        </View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <T bold size={20} style={{ color: level === undefined ? c.sub : c.text, fontVariant: ['tabular-nums'] }}>{level === undefined ? '—' : `${level}%`}</T>
        <T dim size={13}>{label}</T>
      </View>
    </View>
  );
}
