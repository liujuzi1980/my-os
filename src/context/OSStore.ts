import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Character, AppID, SystemSettings, Notification, UserProfile, CharacterState, ScheduleItem, MCPConnection, MCPConnectionState } from '@/types';
import { 
  getAllCharacters, 
  getCharacter, 
  saveCharacter, 
  deleteCharacter,
  getSettings,
  saveSettings,
  getUserProfile,
  saveUserProfile,
  getCharacterState,
  saveCharacterState,
  getSchedulesByCharacter,
  getAllMCPConnections,
  saveMCPConnection,
  deleteMCPConnection,
} from '@/db';

interface OSState {
  currentApp: AppID;
  setCurrentApp: (app: AppID) => void;

  characters: Character[];
  activeCharacterId: string | null;
  loadCharacters: () => Promise<void>;
  setActiveCharacter: (id: string | null) => void;
  addCharacter: (character: Character) => Promise<void>;
  updateCharacter: (character: Character) => Promise<void>;
  removeCharacter: (id: string) => Promise<void>;
  getActiveCharacter: () => Character | undefined;

  // === 角色状态系统（简化版）===
  characterStates: Record<string, CharacterState>;
  loadCharacterState: (characterId: string) => Promise<void>;
  updateCharacterState: (characterId: string, partial: Partial<CharacterState>) => Promise<void>;
  getCharacterState: (characterId: string) => CharacterState | undefined;
  initCharacterState: (characterId: string) => Promise<void>;

  // === 日程系统（预留）===
  schedules: Record<string, ScheduleItem[]>;
  loadSchedules: (characterId: string) => Promise<void>;

  settings: SystemSettings;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<SystemSettings>) => Promise<void>;

  userProfile: UserProfile;
  loadUserProfile: () => Promise<void>;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<void>;

  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // === MCP 连接管理 ===
  mcpConnections: MCPConnection[];
  mcpConnectionStates: Record<string, MCPConnectionState>;
  loadMCPConnections: () => Promise<void>;
  addMCPConnection: (connection: MCPConnection) => Promise<void>;
  updateMCPConnection: (connection: MCPConnection) => Promise<void>;
  removeMCPConnection: (id: string) => Promise<void>;
  setMCPConnectionState: (connectionId: string, state: Partial<MCPConnectionState>) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

// 默认状态
function createDefaultState(characterId: string): CharacterState {
  return {
    characterId,
    mood: '平静',
    emotionalResidue: '平静',
    currentActivity: '闲着',
    stateUpdatedAt: Date.now(),
  };
}

export const useOSStore = create<OSState>()(
  persist(
    (set, get) => ({
      currentApp: 'message',
      setCurrentApp: async (app) => {
        // 离开聊天回桌面：把当前心情落为情绪余波，下次对话开头会注入 prompt
        const prevApp = get().currentApp;
        if (app === 'desktop' && prevApp === 'message') {
          const activeId = get().activeCharacterId;
          if (activeId) {
            const st = get().characterStates[activeId];
            if (st && st.mood) {
              await get().updateCharacterState(activeId, { emotionalResidue: st.mood });
            }
          }
        }
        set({ currentApp: app });
        const { settings } = get();
        if (settings.lastApp !== app) {
          const newSettings = { ...settings, lastApp: app };
          await saveSettings(newSettings);
          set({ settings: newSettings });
        }
      },

      characters: [],
      activeCharacterId: null,
      loadCharacters: async () => {
        try {
          const chars = await getAllCharacters();
          if (chars && Array.isArray(chars) && chars.length > 0) {
            set({ characters: chars });
            if (!get().activeCharacterId) {
              const firstId = chars[0].id;
              set({ activeCharacterId: firstId });
              await get().loadCharacterState(firstId);
            }
          }
        } catch (e) {
          console.error('loadCharacters failed:', e);
        }
      },
      setActiveCharacter: async (id) => {
        // 离开当前角色前：把当前心情落为情绪余波，下次对话开头会注入 prompt
        const prevId = get().activeCharacterId;
        if (prevId && prevId !== id) {
          const prevState = get().characterStates[prevId];
          if (prevState && prevState.mood) {
            await get().updateCharacterState(prevId, { emotionalResidue: prevState.mood });
          }
        }
        set({ activeCharacterId: id });
        if (id) {
          await get().loadCharacterState(id);
        }
      },
      addCharacter: async (character) => {
        await saveCharacter(character);
        await get().initCharacterState(character.id);
        await get().loadCharacters();
      },
      updateCharacter: async (character) => {
        await saveCharacter(character);
        await get().loadCharacters();
      },
      removeCharacter: async (id) => {
        await deleteCharacter(id);
        const { activeCharacterId } = get();
        if (activeCharacterId === id) {
          const remaining = get().characters.filter(c => c.id !== id);
          set({ activeCharacterId: remaining[0]?.id || null });
        }
        set((state) => {
          const newStates = { ...state.characterStates };
          delete newStates[id];
          const newSchedules = { ...state.schedules };
          delete newSchedules[id];
          return { characterStates: newStates, schedules: newSchedules };
        });
        await get().loadCharacters();
      },
      getActiveCharacter: () => {
        const { characters, activeCharacterId } = get();
        return characters.find(c => c.id === activeCharacterId);
      },

      // === 角色状态系统（简化版）===
      characterStates: {},

      loadCharacterState: async (characterId) => {
        if (get().characterStates[characterId]) {
          return;
        }
        try {
          let state = await getCharacterState(characterId);
          if (!state) {
            state = createDefaultState(characterId);
            await saveCharacterState(state);
          }
          set((s) => ({
            characterStates: { ...s.characterStates, [characterId]: state! },
          }));
        } catch (e) {
          console.error('loadCharacterState failed:', e);
        }
      },

      updateCharacterState: async (characterId, partial) => {
        const current = get().characterStates[characterId];
        if (!current) {
          await get().loadCharacterState(characterId);
          const refreshed = get().characterStates[characterId];
          if (!refreshed) return;
        }

        const base = get().characterStates[characterId]!;
        const newState: CharacterState = {
          ...base,
          ...partial,
          stateUpdatedAt: Date.now(),
        };

        await saveCharacterState(newState);
        set((s) => ({
          characterStates: { ...s.characterStates, [characterId]: newState },
        }));
      },

      getCharacterState: (characterId) => {
        return get().characterStates[characterId];
      },

      initCharacterState: async (characterId) => {
        if (get().characterStates[characterId]) {
          return;
        }
        try {
          const existing = await getCharacterState(characterId);
          if (!existing) {
            const state = createDefaultState(characterId);
            await saveCharacterState(state);
            set((s) => ({
              characterStates: { ...s.characterStates, [characterId]: state },
            }));
          }
        } catch (e) {
          console.error('initCharacterState failed:', e);
        }
      },

      // === 日程系统（预留）===
      schedules: {},

      loadSchedules: async (characterId) => {
        try {
          const items = await getSchedulesByCharacter(characterId);
          if (items && Array.isArray(items) && items.length > 0) {
            set((s) => ({
              schedules: { ...s.schedules, [characterId]: items },
            }));
          }
        } catch (e) {
          console.error('loadSchedules failed:', e);
        }
      },

      settings: {
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
        ttsEnabled: false,
        theme: 'dark',
        wallpaper: 'default',
        memoryEngine: { type: 'local' },
        mcpConnections: [],
        amapKey: '',
        // === 阶段 4：生图配置默认值 ===
        imageGeneration: {
          apiBaseUrl: '',
          apiKey: '',
          model: '',
          enabled: false,
        },
        // === 阶段 B：记忆/上下文可调参数默认值 ===
        memoryBreathLimit: 5,
        chatHistoryRounds: 15,
      },
      loadSettings: async () => {
        try {
          const settings = await getSettings();
          if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
            const current = get().settings;
            if (current.apiKey && !settings.apiKey) {
              return;
            }
            set({ settings });
            if (settings.lastApp) {
              set({ currentApp: settings.lastApp });
            }
          }
        } catch (e) {
          console.error('loadSettings failed:', e);
        }
      },
      updateSettings: async (partial) => {
        const newSettings = { ...get().settings, ...partial };
        await saveSettings(newSettings);
        set({ settings: newSettings });
      },

      userProfile: { name: '用户' },
      loadUserProfile: async () => {
        try {
          const profile = await getUserProfile();
          if (profile && typeof profile === 'object' && Object.keys(profile).length > 0) {
            const current = get().userProfile;
            if (current.name && current.name !== '用户' && profile.name === '用户') {
              return;
            }
            set({ userProfile: profile });
          }
        } catch (e) {
          console.error('loadUserProfile failed:', e);
        }
      },
      updateUserProfile: async (partial) => {
        const newProfile = { ...get().userProfile, ...partial };
        await saveUserProfile(newProfile);
        set({ userProfile: newProfile });
      },

      notifications: [],
      addNotification: (notif) => {
        const notification: Notification = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };
        set((state) => ({
          notifications: [notification, ...state.notifications].slice(0, 50),
        }));
      },
      markNotificationRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },
      clearNotifications: () => set({ notifications: [] }),

      // === MCP 连接管理 ===
      mcpConnections: [],
      mcpConnectionStates: {},

      loadMCPConnections: async () => {
        try {
          const connections = await getAllMCPConnections();
          if (connections && Array.isArray(connections)) {
            set({ mcpConnections: connections });
            // 同步到 settings
            const { settings } = get();
            if (JSON.stringify(settings.mcpConnections) !== JSON.stringify(connections)) {
              const newSettings = { ...settings, mcpConnections: connections };
              await saveSettings(newSettings);
              set({ settings: newSettings });
            }
          }
        } catch (e) {
          console.error('loadMCPConnections failed:', e);
        }
      },

      addMCPConnection: async (connection) => {
        await saveMCPConnection(connection);
        await get().loadMCPConnections();
      },

      updateMCPConnection: async (connection) => {
        await saveMCPConnection(connection);
        await get().loadMCPConnections();
      },

      removeMCPConnection: async (id) => {
        await deleteMCPConnection(id);
        set((state) => {
          const newStates = { ...state.mcpConnectionStates };
          delete newStates[id];
          return { mcpConnectionStates: newStates };
        });
        await get().loadMCPConnections();
      },

      setMCPConnectionState: (connectionId, partial) => {
        set((state) => ({
          mcpConnectionStates: {
            ...state.mcpConnectionStates,
            [connectionId]: {
              ...state.mcpConnectionStates[connectionId],
              connectionId,
              ...partial,
            } as MCPConnectionState,
          },
        }));
      },

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: 'my-os-storage-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        userProfile: state.userProfile,
        characters: state.characters,
        activeCharacterId: state.activeCharacterId,
        characterStates: state.characterStates,
        schedules: state.schedules,
        currentApp: state.currentApp,
        notifications: state.notifications,
        mcpConnections: state.mcpConnections,
        mcpConnectionStates: state.mcpConnectionStates,
      }),
    }
  )
);
