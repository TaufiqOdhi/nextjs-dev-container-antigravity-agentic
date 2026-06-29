import { create } from 'zustand'

interface AppState {
  currentTask: string | null;
  setCurrentTask: (task: string | null) => void;
  logs: string[];
  addLog: (log: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentTask: null,
  setCurrentTask: (task) => set({ currentTask: task }),
  logs: ["Container started", "Next.js initialized"],
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
}))
