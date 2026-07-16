import { create } from 'zustand';
import type { Character, AppID, SystemSettings, Notification, UserProfile } from '@/types';
import { 
  getAllCharacters, 
  getCharacter, 
  saveCharacter, 
  deleteCharacter,
  getSettings,
  saveSettings,
  getUserProfile,
  saveUserProfile,
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

export const useOSStore = create<OSState>((set, get) => ({
  currentApp: 'message',
  setCurrentApp: async (app) => {
    set({ currentApp: app });
    // 持久化：保存到 settings，切回来后能恢复
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
      set({ activeCharacterId: chars[0].id });
    }
  },
  setActiveCharacter: (id) => set({ activeCharacterId: id }),
  addCharacter: async (character) => {
    await saveCharacter(character);
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
    await get().loadCharacters();
  },
  getActiveCharacter: () => {
    const { characters, activeCharacterId } = get();
    return characters.find(c => c.id === activeCharacterId);
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
    // 恢复上次所在的页面
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
