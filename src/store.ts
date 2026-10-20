import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { emptyState, type EarbudState } from '@/session/state';
import type { Status, Target } from '@/session/manager';

const LOG_MAX = 400;

type Store = {
  target: Target | null;
  status: Status;
  state: EarbudState;
  log: string[];
  setTarget: (t: Target | null) => void;
  pushLog: (line: string) => void;
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      target: null,
      status: { phase: 'idle', attempt: 0 },
      state: emptyState(),
      log: [],
      setTarget: (target) => set({ target }),
      pushLog: (line) =>
        set((s) => ({ log: [`${new Date().toLocaleTimeString()} ${line}`, ...s.log].slice(0, LOG_MAX) })),
    }),
    {
      name: 'oqcy',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ target: s.target }),
    },
  ),
);
