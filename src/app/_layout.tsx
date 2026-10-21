import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useRuntime } from '@/runtime';
import { useTheme } from '@/ui/kit';

export default function RootLayout() {
  useRuntime();
  const dark = useColorScheme() === 'dark';
  const c = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, primary: c.accent, border: c.line } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShadowVisible: false, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ title: 'Adicionar fone' }} />
        <Stack.Screen name="eq" options={{ title: 'Equalizador' }} />
        <Stack.Screen name="buttons" options={{ title: 'Botões' }} />
        <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
        <Stack.Screen name="log" options={{ title: 'Diagnóstico' }} />
      </Stack>
    </ThemeProvider>
  );
}
