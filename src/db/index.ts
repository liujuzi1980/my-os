import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { 
  Character, ChatMessage, SystemSettings, WorldBook, UserProfile,
  MemoryEntry, LifeStageSummary 
} from '@/types';

interface MyOSDB extends DBSchema {
  characters: { key: string; value: Character; };
  chats: { 
    key: string; 
    value: ChatMessage; 
    indexes: { 'by-character': string; 'by-time': number }; 
  };
  settings: { key: string; value: SystemSettings; };
  worldbooks: { key: string; value: WorldBook; };
  userProfile: { key: string; value: UserProfile; };
  memories: { 
    key: string; 
    value: MemoryEntry; 
    indexes: { 'by-character': string; 'by-tier': string; 'by-time': number }; 
  };
  lifeStageSummaries: { 
    key: string; 
    value: LifeStageSummary; 
    indexes: { 'by-character': string }; 
  };
}

const DB_NAME = 'MyOS';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MyOSDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MyOSDB>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<MyOSDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1: 初始表
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('characters')) {
          db.createObjectStore('characters', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('by-character', 'characterId');
          chatStore.createIndex('by-time', 'timestamp');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('worldbooks')) {
          db.createObjectStore('worldbooks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('userProfile')) {
          db.createObjectStore('userProfile', { keyPath: 'key' });
        }
      }
      // v2: 新增记忆系统
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('memories')) {
          const store = db.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('by-character', 'characterId');
          store.createIndex('by-tier', 'tier');
          store.createIndex('by-time', 'createdAt');
        }
        if (!db.objectStoreNames.contains('lifeStageSummaries')) {
          const store = db.createObjectStore('lifeStageSummaries', { keyPath: 'id' });
          store.createIndex('by-character', 'characterId');
        }
      }
    },
  });

  return dbPromise;
}

// ==================== 角色 CRUD ====================

export async function getAllCharacters(): Promise<Character[]> {
  const db = await getDB();
  return db.getAll('characters');
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const db = await getDB();
  return db.get('characters', id);
}

export async function saveCharacter(character: Character): Promise<void> {
  const db = await getDB();
  await db.put('characters', { ...character, updatedAt: Date.now() });
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('characters', id);
  const allChats = await getChatsByCharacter(id);
  const tx = db.transaction('chats', 'readwrite');
  for (const chat of allChats) await tx.store.delete(chat.id);
  await tx.done;
  const allMemories = await getMemoriesByCharacter(id);
  const tx2 = db.transaction('memories', 'readwrite');
  for (const m of allMemories) await tx2.store.delete(m.id);
  await tx2.done;
  const allSummaries = await getLifeStageSummaries(id);
  const tx3 = db.transaction('lifeStageSummaries', 'readwrite');
  for (const s of allSummaries) await tx3.store.delete(s.id);
  await tx3.done;
}

// ==================== 聊天记录 CRUD ====================

export async function getChatsByCharacter(characterId: string, limit = 100): Promise<ChatMessage[]> {
  const db = await getDB();
  const index = db.transaction('chats').store.index('by-character');
  const all = await index.getAll(characterId);
  return all.sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put('chats', message);
}

export async function deleteAllChats(characterId: string): Promise<void> {
  const db = await getDB();
  const all = await getChatsByCharacter(characterId, 99999);
  const tx = db.transaction('chats', 'readwrite');
  for (const chat of all) await tx.store.delete(chat.id);
  await tx.done;
}

// ==================== 记忆系统 CRUD ====================

export async function getMemoriesByCharacter(characterId: string, tier?: string): Promise<MemoryEntry[]> {
  const db = await getDB();
  const index = db.transaction('memories').store.index('by-character');
  let all = await index.getAll(characterId);
  if (tier) all = all.filter(m => m.tier === tier);
  return all.sort((a, b) => b.lastAccessed - a.lastAccessed);
}

export async function saveMemory(memory: MemoryEntry): Promise<void> {
  const db = await getDB();
  await db.put('memories', memory);
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memories', id);
}

export async function updateMemoryAccess(id: string): Promise<void> {
  const db = await getDB();
  const m = await db.get('memories', id);
  if (m) {
    m.lastAccessed = Date.now();
    m.accessCount = (m.accessCount || 0) + 1;
    await db.put('memories', m);
  }
}

export async function getMemoryCountByTier(characterId: string, tier: string): Promise<number> {
  const db = await getDB();
  const all = await db.transaction('memories').store.index('by-character').getAll(characterId);
  return all.filter(m => m.tier === tier).length;
}

export async function getLifeStageSummaries(characterId: string): Promise<LifeStageSummary[]> {
  const db = await getDB();
  const all = await db.transaction('lifeStageSummaries').store.index('by-character').getAll(characterId);
  return all.sort((a, b) => b.endTime - a.endTime);
}

export async function saveLifeStageSummary(summary: LifeStageSummary): Promise<void> {
  const db = await getDB();
  await db.put('lifeStageSummaries', summary);
}

// ==================== 设置 CRUD ====================

const DEFAULT_SETTINGS: SystemSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  ttsEnabled: false,
  theme: 'dark',
  wallpaper: 'default',
  memoryEngine: { type: 'local' },
};

export async function getSettings(): Promise<SystemSettings> {
  const db = await getDB();
  const stored = await db.get('settings', 'main');
  if (!stored) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: SystemSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { ...settings, key: 'main' });
}

// ==================== 世界书 CRUD ====================

export async function getAllWorldBooks(): Promise<WorldBook[]> {
  const db = await getDB();
  return db.getAll('worldbooks');
}

export async function saveWorldBook(book: WorldBook): Promise<void> {
  const db = await getDB();
  await db.put('worldbooks', book);
}

export async function deleteWorldBook(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('worldbooks', id);
}

// ==================== 用户档案 ====================

export async function getUserProfile(): Promise<UserProfile> {
  const db = await getDB();
  const stored = await db.get('userProfile', 'main');
  return stored || { name: '用户' };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB();
  await db.put('userProfile', { ...profile, key: 'main' });
}

// ==================== 数据导出 ====================

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const db = await getDB();
  return {
    characters: await db.getAll('characters'),
    chats: await db.getAll('chats'),
    settings: [await getSettings()],
    worldbooks: await db.getAll('worldbooks'),
    userProfile: [await getUserProfile()],
    memories: await db.getAll('memories'),
    lifeStageSummaries: await db.getAll('lifeStageSummaries'),
  };
}

export async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  const db = await getDB();
  const stores = ['characters', 'chats', 'settings', 'worldbooks', 'userProfile', 'memories', 'lifeStageSummaries'] as const;
  for (const storeName of stores) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.store.clear();
    const items = data[storeName] || [];
    for (const item of items) await tx.store.put(item);
    await tx.done;
  }
}
