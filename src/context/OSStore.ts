import { create } from 'zustand';
import type { Character, AppID, SystemSettings, Notification, UserProfile, CharacterState, ScheduleItem } from '@/types';
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

export const useOSStore = create<OSState>((set, get) => ({
  currentApp: 'message',
  setCurrentApp: async (app) => {
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
    const chars = await getAllCharacters();
    set({ characters: chars });
    if (chars.length > 0 && !get().activeCharacterId) {
      const firstId = chars[0].id;
      set({ activeCharacterId: firstId });
      await get().loadCharacterState(firstId);
    }
  },
  setActiveCharacter: async (id) => {
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
    let state = await getCharacterState(characterId);
    if (!state) {
      state = createDefaultState(characterId);
      await saveCharacterState(state);
    }
    set((s) => ({
      characterStates: { ...s.characterStates, [characterId]: state! },
    }));
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
    const existing = await getCharacterState(characterId);
    if (!existing) {
      const state = createDefaultState(characterId);
      await saveCharacterState(state);
      set((s) => ({
        characterStates: { ...s.characterStates, [characterId]: state },
      }));
    }
  },

  // === 日程系统（预留）===
  schedules: {},

  loadSchedules: async (characterId) => {
    const items = await getSchedulesByCharacter(characterId);
    set((s) => ({
      schedules: { ...s.schedules, [characterId]: items },
    }));
  },

  settings: {
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    ttsEnabled: false,
    theme: 'dark',
    wallpaper: 'default',
    memoryEngine: { type: 'local' },
  },
  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings });
    if (settings.lastApp) {
      set({ currentApp: settings.lastApp });
    }
  },
  updateSettings: async (partial) => {
    const newSettings = { ...get().settings, ...partial };
    await saveSettings(newSettings);
    set({ settings: newSettings });
  },

  userProfile: { name: '用户' },
  loadUserProfile: async () => {
    const profile = await getUserProfile();
    set({ userProfile: profile });
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

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error }),
}));
