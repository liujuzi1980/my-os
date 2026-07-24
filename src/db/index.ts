import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { 
  Character, ChatMessage, SystemSettings, WorldBook, UserProfile,
  MemoryEntry, LifeStageSummary, CharacterState, ScheduleItem,
  MCPConnection, ImageRecord, MemoryVector, Anticipation, RoomPlate
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
  characterStates: {
    key: string;
    value: CharacterState;
  };
  schedules: {
    key: string;
    value: ScheduleItem;
    indexes: { 'by-character': string };
  };
  mcpConnections: {
    key: string;
    value: MCPConnection;
  };
  images: {
    key: string;
    value: ImageRecord;
    indexes: { 'by-character': string; 'by-message': string };
  };
  roomPlates: { key: string; value: RoomPlate; };
  anticipations: {
    key: string;
    value: Anticipation;
    indexes: { 'by-character': string }; 
  };
  memoryVectors: {
    key: string;
    value: MemoryVector;
    indexes: { 'by-character': string };
  };
}

const DB_NAME = 'MyOS_v2';
const DB_VERSION = 9;

let dbPromise: Promise<IDBPDatabase<MyOSDB>> | null = null;

/**
 * 标准化记忆条目 —— 自动补全阶段 2 新增字段的默认值
 * 确保旧数据（缺少新字段）读取后也能正常使用
 */
function normalizeMemoryEntry(m: MemoryEntry): MemoryEntry {
  const now = Date.now();
  const valence = m.valence ?? m.emotion?.valence ?? 0;
  const arousal = m.arousal ?? m.emotion?.arousal ?? 0.3;
  const pinned = m.pinned ?? m.isPinned ?? false;

  return {
    ...m,
    emotion: m.emotion || { valence, arousal },
    valence,
    arousal,
    resolved: m.resolved ?? false,
    pinned,
    lastAccessed: m.lastAccessed ?? m.createdAt ?? now,
    lastSurfaced: m.lastSurfaced ?? 0,
    domain: m.domain ?? 'daily',
    tags: m.tags ?? [],
    status: m.status ?? 'active',
    archived: m.archived ?? (m.status === 'archived'),
    source: m.source ?? 'auto',
    sourceMessageIds: m.sourceMessageIds ?? m.relatedMessageIds ?? [],
    relatedMemoryIds: m.relatedMemoryIds ?? [],
    isPinned: pinned,
    accessCount: m.accessCount ?? 0,
  };
}

export function getDB(): Promise<IDBPDatabase<MyOSDB>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<MyOSDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('characterStates')) {
          db.createObjectStore('characterStates', { keyPath: 'characterId' });
        }
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('schedules')) {
          const store = db.createObjectStore('schedules', { keyPath: 'id' });
          store.createIndex('by-character', 'characterId');
        }
      }
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('mcpConnections')) {
          db.createObjectStore('mcpConnections', { keyPath: 'id' });
        }
      }
      // === 阶段 2：新增 images store ===
      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images', { keyPath: 'id' });
          store.createIndex('by-character', 'characterId');
          store.createIndex('by-message', 'messageId');
        }
      }
      if (oldVersion < 9) { if (!db.objectStoreNames.contains('roomPlates')) { db.createObjectStore('roomPlates', { keyPath: 'id' }); } }
      if (oldVersion < 8) {
        if (!db.objectStoreNames.contains('anticipations')) {
          const aStore = db.createObjectStore('anticipations', { keyPath: 'id' });
          aStore.createIndex('by-character', 'characterId');
        }
      }
      if (oldVersion < 7) {
        if (!db.objectStoreNames.contains('memoryVectors')) {
          const vectorStore = db.createObjectStore('memoryVectors', { keyPath: 'id' });
          vectorStore.createIndex('by-character', 'characterId');
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

  // 级联删除聊天记录
  const allChats = await getChatsByCharacter(id);
  const tx = db.transaction('chats', 'readwrite');
  for (const chat of allChats) await tx.store.delete(chat.id);
  await tx.done;

  // 级联删除记忆
  const allMemories = await getMemoriesByCharacter(id);
  const tx2 = db.transaction('memories', 'readwrite');
  for (const m of allMemories) await tx2.store.delete(m.id);
  await tx2.done;

  // 级联删除人生阶段总结
  const allSummaries = await getLifeStageSummaries(id);
  const tx3 = db.transaction('lifeStageSummaries', 'readwrite');
  for (const s of allSummaries) await tx3.store.delete(s.id);
  await tx3.done;

  // 级联删除角色状态
  await deleteCharacterState(id);

  // 级联删除日程
  await deleteSchedulesByCharacter(id);

  // 级联删除图片记录
  const allImages = await getImageRecordsByCharacter(id);
  const tx4 = db.transaction('images', 'readwrite');
  for (const img of allImages) await tx4.store.delete(img.id);
  await tx4.done;

  // 级联删除向量
  await deleteMemoryVectorsByCharacter(id);

  // 级联删除期盼
  await deleteAnticipationsByCharacter(id);
}

// ==================== 角色状态 CRUD ====================

export async function getCharacterState(characterId: string): Promise<CharacterState | undefined> {
  const db = await getDB();
  return db.get('characterStates', characterId);
}

export async function saveCharacterState(state: CharacterState): Promise<void> {
  const db = await getDB();
  await db.put('characterStates', { ...state, stateUpdatedAt: Date.now() });
}

export async function deleteCharacterState(characterId: string): Promise<void> {
  const db = await getDB();
  await db.delete('characterStates', characterId);
}

// ==================== 日程 CRUD（预留）====================

export async function getSchedulesByCharacter(characterId: string): Promise<ScheduleItem[]> {
  const db = await getDB();
  const index = db.transaction('schedules').store.index('by-character');
  return index.getAll(characterId);
}

export async function saveSchedule(schedule: ScheduleItem): Promise<void> {
  const db = await getDB();
  await db.put('schedules', schedule);
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('schedules', id);
}

export async function deleteSchedulesByCharacter(characterId: string): Promise<void> {
  const db = await getDB();
  const all = await getSchedulesByCharacter(characterId);
  const tx = db.transaction('schedules', 'readwrite');
  for (const s of all) await tx.store.delete(s.id);
  await tx.done;
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

// ==================== 记忆系统 CRUD（阶段 2 改造）====================

/**
 * 获取角色的所有记忆（已标准化，兼容旧数据）
 */
export async function getMemoriesByCharacter(characterId: string, tier?: string): Promise<MemoryEntry[]> {
  const db = await getDB();
  const index = db.transaction('memories').store.index('by-character');
  let all = await index.getAll(characterId);
  if (tier) all = all.filter(m => m.tier === tier);
  return all
    .map(normalizeMemoryEntry)
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
}

/**
 * 获取角色的所有记忆（别名，语义更清晰）
 */
export async function getAllMemoriesForCharacter(characterId: string): Promise<MemoryEntry[]> {
  return getMemoriesByCharacter(characterId);
}

export async function saveMemory(memory: MemoryEntry): Promise<void> {
  const db = await getDB();
  await db.put('memories', memory);
}

/**
 * 保存记忆（标准化后存储，确保数据一致性）
 */
export async function saveMemoryV2(memory: MemoryEntry): Promise<void> {
  const db = await getDB();
  await db.put('memories', normalizeMemoryEntry(memory));
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memories', id);
}

/**
 * 更新记忆访问时间（兼容旧方法）
 */
export async function updateMemoryAccess(id: string): Promise<void> {
  const db = await getDB();
  const m = await db.get('memories', id);
  if (m) {
    const normalized = normalizeMemoryEntry(m);
    normalized.lastAccessed = Date.now();
    normalized.accessCount = (normalized.accessCount || 0) + 1;
    await db.put('memories', normalized);
  }
}

/**
 * 部分更新记忆的指定字段
 */
export async function updateMemoryPartial(id: string, updates: Partial<MemoryEntry>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('memories', id);
  if (!existing) return;
  const updated = normalizeMemoryEntry({
    ...existing,
    ...updates,
    lastAccessed: Date.now(),
  });
  await db.put('memories', updated);
}

/**
 * 按领域筛选记忆
 */
export async function getMemoriesByDomain(characterId: string, domain: string): Promise<MemoryEntry[]> {
  const all = await getAllMemoriesForCharacter(characterId);
  return all.filter(m => m.domain === domain);
}

/**
 * 关键词搜索记忆（简单包含匹配，不依赖外部库）
 */
export async function searchMemoriesByKeyword(characterId: string, keyword: string): Promise<MemoryEntry[]> {
  const all = await getAllMemoriesForCharacter(characterId);
  if (!keyword.trim()) return all;
  const lower = keyword.toLowerCase();
  return all.filter(m => 
    m.content.toLowerCase().includes(lower) ||
    (m.tags || []).some(t => t.toLowerCase().includes(lower)) ||
    (m.domain || '').toLowerCase().includes(lower) ||
    (m.summary || '').toLowerCase().includes(lower)
  );
}

/**
 * 获取指定层级的记忆数量（兼容旧方法）
 */
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

// ==================== 图片 CRUD（阶段 2 新增）====================

export async function saveImageRecord(record: ImageRecord): Promise<void> {
  const db = await getDB();
  await db.put('images', record);
}

export async function getImageRecordsByCharacter(characterId: string): Promise<ImageRecord[]> {
  const db = await getDB();
  const index = db.transaction('images').store.index('by-character');
  return index.getAll(characterId);
}

export async function getImageRecordsByMessage(messageId: string): Promise<ImageRecord[]> {
  const db = await getDB();
  const index = db.transaction('images').store.index('by-message');
  return index.getAll(messageId);
}

export async function getImageRecord(id: string): Promise<ImageRecord | undefined> {
  const db = await getDB();
  return db.get('images', id);
}

export async function deleteImageRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('images', id);
}

// ==================== 向量 CRUD（M4 Embedding）====================

export async function getMemoryVectorsByCharacter(characterId: string): Promise<MemoryVector[]> {
  const db = await getDB();
  const index = db.transaction('memoryVectors').store.index('by-character');
  return index.getAll(characterId);
}

export async function saveMemoryVector(vector: MemoryVector): Promise<void> {
  const db = await getDB();
  await db.put('memoryVectors', vector);
}

export async function saveMemoryVectors(vectors: MemoryVector[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('memoryVectors', 'readwrite');
  for (const v of vectors) await tx.store.put(v);
  await tx.done;
}

export async function deleteMemoryVector(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memoryVectors', id);
}

export async function deleteMemoryVectorsByCharacter(characterId: string): Promise<void> {
  const db = await getDB();
  const all = await getMemoryVectorsByCharacter(characterId);
  const tx = db.transaction('memoryVectors', 'readwrite');
  for (const v of all) await tx.store.delete(v.id);
  await tx.done;
}

export async function getAllMemoryVectors(): Promise<MemoryVector[]> {
  const db = await getDB();
  return db.getAll('memoryVectors');
}

// ==================== 期盼生命周期 CRUD（M2）====================

export async function getAnticipationsByCharacter(characterId: string): Promise<Anticipation[]> {
  const db = await getDB();
  const index = db.transaction('anticipations').store.index('by-character');
  return index.getAll(characterId);
}

export async function saveAnticipation(a: Anticipation): Promise<void> {
  const db = await getDB();
  await db.put('anticipations', a);
}

export async function deleteAnticipation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('anticipations', id);
}

export async function deleteAnticipationsByCharacter(characterId: string): Promise<void> {
  const db = await getDB();
  const all = await getAnticipationsByCharacter(characterId);
  const tx = db.transaction('anticipations', 'readwrite');
  for (const a of all) await tx.store.delete(a.id);
  await tx.done;
}

// ==================== 房间门牌 CRUD（M5）====================

export async function getRoomPlate(id: string): Promise<RoomPlate | undefined> {
  const db = await getDB();
  return db.get('roomPlates', id);
}

export async function saveRoomPlate(plate: RoomPlate): Promise<void> {
  const db = await getDB();
  await db.put('roomPlates', plate);
}

export async function deleteRoomPlate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('roomPlates', id);
}

// ==================== MCP 连接 CRUD ====================

export async function getAllMCPConnections(): Promise<MCPConnection[]> {
  const db = await getDB();
  return db.getAll('mcpConnections');
}

export async function getMCPConnection(id: string): Promise<MCPConnection | undefined> {
  const db = await getDB();
  return db.get('mcpConnections', id);
}

export async function saveMCPConnection(connection: MCPConnection): Promise<void> {
  const db = await getDB();
  await db.put('mcpConnections', connection);
}

export async function deleteMCPConnection(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('mcpConnections', id);
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
  mcpConnections: [],
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

// ==================== 数据导出（包含 images）====================

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
    characterStates: await db.getAll('characterStates'),
    schedules: await db.getAll('schedules'),
    mcpConnections: await db.getAll('mcpConnections'),
    images: await db.getAll('images'),
  };
}

// ==================== 数据导入（包含 images）====================

export async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  const db = await getDB();
  const stores = [
    'characters', 'chats', 'settings', 'worldbooks', 'userProfile',
    'memories', 'lifeStageSummaries', 'characterStates', 'schedules',
    'mcpConnections', 'images'
  ] as const;
  for (const storeName of stores) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.store.clear();
    const items = data[storeName] || [];
    for (const item of items) await tx.store.put(item);
    await tx.done;
  }
}
