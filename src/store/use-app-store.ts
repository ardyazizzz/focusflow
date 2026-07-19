import { create } from 'zustand';

// ── Types ────────────────────────────────────────────────────────────────────

export type AppTab =
  | 'focus'
  | 'capture'
  | 'backlog'
  | 'foundation'
  | 'coach'
  | 'settings';

export interface PomodoroState {
  isRunning: boolean;
  timeRemaining: number; // seconds
  taskId: string | null;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppState {
  // ── State ────────────────────────────────────────────────────────────────
  activeTab: AppTab;
  pomodoroState: PomodoroState;
  coachMessages: CoachMessage[];
  foundationExpandedGoal: string | null;

  // ── Navigation ───────────────────────────────────────────────────────────
  setActiveTab: (tab: AppTab) => void;

  // ── Pomodoro ─────────────────────────────────────────────────────────────
  startPomodoro: (taskId: string, durationMinutes: number) => void;
  pausePomodoro: () => void;
  resumePomodoro: () => void;
  stopPomodoro: () => void;
  tickPomodoro: () => void;
  completePomodoro: () => void;

  // ── Coach ────────────────────────────────────────────────────────────────
  addCoachMessage: (role: CoachMessage['role'], content: string) => void;
  clearCoachMessages: () => void;

  // ── Foundation ───────────────────────────────────────────────────────────
  setFoundationExpandedGoal: (goalId: string | null) => void;
}

// ── Initial values ────────────────────────────────────────────────────────────

const INITIAL_POMODORO: PomodoroState = {
  isRunning: false,
  timeRemaining: 0,
  taskId: null,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  activeTab: 'focus',
  pomodoroState: { ...INITIAL_POMODORO },
  coachMessages: [],
  foundationExpandedGoal: null,

  // ── Navigation ───────────────────────────────────────────────────────────
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Pomodoro ─────────────────────────────────────────────────────────────
  startPomodoro: (taskId, durationMinutes) =>
    set({
      pomodoroState: {
        isRunning: true,
        timeRemaining: durationMinutes * 60,
        taskId,
      },
    }),

  pausePomodoro: () =>
    set((state) => ({
      pomodoroState: { ...state.pomodoroState, isRunning: false },
    })),

  resumePomodoro: () =>
    set((state) => ({
      pomodoroState: { ...state.pomodoroState, isRunning: true },
    })),

  stopPomodoro: () =>
    set({ pomodoroState: { ...INITIAL_POMODORO } }),

  tickPomodoro: () => {
    const { timeRemaining } = get().pomodoroState;
    if (timeRemaining <= 0) {
      get().completePomodoro();
      return;
    }
    set((state) => ({
      pomodoroState: { ...state.pomodoroState, timeRemaining: timeRemaining - 1 },
    }));
  },

  completePomodoro: () =>
    set({ pomodoroState: { ...INITIAL_POMODORO } }),

  // ── Coach ────────────────────────────────────────────────────────────────
  addCoachMessage: (role, content) =>
    set((state) => ({
      coachMessages: [...state.coachMessages, { role, content }],
    })),

  clearCoachMessages: () => set({ coachMessages: [] }),

  // ── Foundation ───────────────────────────────────────────────────────────
  setFoundationExpandedGoal: (goalId) =>
    set({ foundationExpandedGoal: goalId }),
}));