import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings, Session, TodoItem } from '@/types';

// UI State
interface UIState {
  isSideNavOpen: boolean;
  isRightDrawerOpen: boolean;
  selectedClaimId: string | null;
  selectedEvidenceId: string | null;
}

// App State
interface AppState {
  // Current Session
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;

  // Sessions list
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;

  // User Settings
  userSettings: UserSettings;
  setUserSettings: (settings: Partial<UserSettings>) => void;

  // UI State
  uiState: UIState;
  setUIState: (state: Partial<UIState>) => void;
  toggleSideNav: () => void;
  toggleRightDrawer: () => void;
  selectClaim: (claimId: string | null) => void;

  // Todo items (local cache)
  todos: TodoItem[];
  setTodos: (todos: TodoItem[]) => void;
  updateTodo: (todoId: string, updates: Partial<TodoItem>) => void;

  // Client Session Token
  clientToken: string | null;
  setClientToken: (token: string | null) => void;
  ensureClientToken: () => string;
}

// Generate random token
const generateToken = (): string => {
  return `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Default settings
const defaultSettings: UserSettings = {
  save_enabled: true,
  retention_days: 30,
  default_language: 'ja',
  privacy_accepted: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Current Session
      currentSessionId: null,
      setCurrentSessionId: (id) => set({ currentSessionId: id }),

      // Sessions
      sessions: [],
      setSessions: (sessions) => set({ sessions }),
      addSession: (session) => 
        set((state) => ({ 
          sessions: [session, ...state.sessions].slice(0, 10) // Keep last 10
        })),
      removeSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.session_id !== sessionId),
          currentSessionId: state.currentSessionId === sessionId 
            ? null 
            : state.currentSessionId,
        })),

      // User Settings
      userSettings: defaultSettings,
      setUserSettings: (settings) =>
        set((state) => ({
          userSettings: { ...state.userSettings, ...settings },
        })),

      // UI State
      uiState: {
        isSideNavOpen: true,
        isRightDrawerOpen: false,
        selectedClaimId: null,
        selectedEvidenceId: null,
      },
      setUIState: (state) =>
        set((prev) => ({
          uiState: { ...prev.uiState, ...state },
        })),
      toggleSideNav: () =>
        set((state) => ({
          uiState: {
            ...state.uiState,
            isSideNavOpen: !state.uiState.isSideNavOpen,
          },
        })),
      toggleRightDrawer: () =>
        set((state) => ({
          uiState: {
            ...state.uiState,
            isRightDrawerOpen: !state.uiState.isRightDrawerOpen,
          },
        })),
      selectClaim: (claimId) =>
        set((state) => ({
          uiState: { ...state.uiState, selectedClaimId: claimId },
        })),

      // Todos
      todos: [],
      setTodos: (todos) => set({ todos }),
      updateTodo: (todoId, updates) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === todoId ? { ...t, ...updates } : t
          ),
        })),

      // Client Token
      clientToken: null,
      setClientToken: (token) => set({ clientToken: token }),
      ensureClientToken: () => {
        let token = get().clientToken;
        if (!token) {
          token = generateToken();
          set({ clientToken: token });
          // Also set in localStorage for API client
          if (typeof window !== 'undefined') {
            localStorage.setItem('client_session_token', token);
          }
        }
        return token;
      },
    }),
    {
      name: 'reviewer-zero-storage',
      partialize: (state) => ({
        userSettings: state.userSettings,
        sessions: state.sessions,
        clientToken: state.clientToken,
      }),
    }
  )
);
