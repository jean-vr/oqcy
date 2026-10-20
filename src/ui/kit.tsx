import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  PanResponder, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View, type LayoutChangeEvent,
  type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const palette = {
  light: { bg: '#f4f5f7', card: '#ffffff', text: '#101114', sub: '#6b7078', line: '#e3e5ea', accent: '#0a84ff', ok: '#1fa855', warn: '#e08a00', bad: '#d6393a' },
  dark: { bg: '#0b0c0e', card: '#17191d', text: '#f2f3f5', sub: '#9aa0a8', line: '#272a30', accent: '#4aa3ff', ok: '#3ccf79', warn: '#f0a020', bad: '#ff5d5e' },
};
export const useTheme = () => palette[useColorScheme() === 'dark' ? 'dark' : 'light'];

export function T({ dim, bold, size, style, ...p }: TextProps & { dim?: boolean; bold?: boolean; size?: number }) {
  const c = useTheme();
  return <Text {...p} style={[{ color: dim ? c.sub : c.text, fontSize: size ?? 16, fontWeight: bold ? '600' : '400' }, style]} />;
}

export function Screen({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ title, children, dim, style }: { title?: string; children: ReactNode; dim?: boolean; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 12, opacity: dim ? 0.55 : 1 }, style]}>
      {title ? <T dim size={13} bold style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</T> : null}
      {children}
    </View>
  );
}

export function Row({ label, hint, right, onPress }: { label: string; hint?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T dim size={13}>{hint}</T> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={() => onChange(!on)}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? c.ok : c.line, padding: 3, opacity: disabled ? 0.5 : 1 }}
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
    <View style={{ flexDirection: 'row', backgroundColor: c.bg, borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? c.card : 'transparent' }}
          >
            <T size={14} bold={sel} style={{ color: sel ? c.accent : c.sub, textAlign: 'center' }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.bad : c.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ backgroundColor: bg, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <T bold style={{ color: kind === 'plain' ? c.text : '#fff' }}>{label}</T>
    </Pressable>
  );
}

/* O PanResponder é criado uma vez e lê as props mais recentes por ref (o React Compiler não enxerga isso como seguro). */
/* eslint-disable react-hooks/refs */
/** Slider em JS puro: funciona igual no Android, iOS e web (sem módulo nativo). */
export function Slider({ value, min, max, step = 1, onChange, disabled }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const c = useTheme();
  const width = useRef(1);
  const x0 = useRef(0);
  // Sempre as props mais recentes: o PanResponder é criado uma vez e não pode capturar callbacks velhos.
  const latest = useRef({ value, min, max, step, onChange, disabled });
  useEffect(() => { latest.current = { value, min, max, step, onChange, disabled }; });

  const [pan] = useState(() => {
    const emit = (x: number) => {
      const p = latest.current;
      const t = Math.max(0, Math.min(1, x / width.current));
      const v = Math.max(p.min, Math.min(p.max, +(Math.round((p.min + t * (p.max - p.min)) / p.step) * p.step).toFixed(4)));
      if (v !== p.value) { p.value = v; p.onChange(v); }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { x0.current = e.nativeEvent.locationX; emit(x0.current); },
      onPanResponderMove: (_, g) => emit(x0.current + g.dx),
    });
  });

  const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width || 1; }}
      style={{ height: 36, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
        <View style={{ marginLeft: `${pct}%`, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 2, borderColor: c.accent, transform: [{ translateX: -11 }] }} />
      </View>
    </View>
  );
}

/* eslint-enable react-hooks/refs */

export function SliderRow({ label, value, display, ...p }: { label: string; display?: string } & React.ComponentProps<typeof Slider>) {
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T>{label}</T>
        <T dim>{display ?? String(value)}</T>
      </View>
      <Slider value={value} {...p} />
    </View>
  );
}

export function Battery({ label, level: raw, charging }: { label: string; level?: number; charging?: boolean }) {
  const c = useTheme();
  const level = raw ? raw : undefined; // 0 = sem leitura (ex.: estojo ausente)
  const color = level === undefined ? c.sub : level <= 15 ? c.bad : level <= 30 ? c.warn : c.ok;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <T dim size={13}>{label}</T>
      <T bold size={26} style={{ color }}>{level === undefined ? '—' : `${level}%`}</T>
      <View style={{ width: '70%', height: 6, borderRadius: 3, backgroundColor: c.line }}>
        <View style={{ width: `${level ?? 0}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      <T size={12} dim>{charging ? '⚡ carregando' : ' '}</T>
    </View>
  );
}
