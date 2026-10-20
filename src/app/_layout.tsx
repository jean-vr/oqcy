import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useRuntime } from '@/runtime';

export default function RootLayout() {
  useRuntime();
  const dark = useColorScheme() === 'dark';
  return (
    <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShadowVisible: false }}>
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
