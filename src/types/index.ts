// ==================== 角色相关 ====================

export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'close' | 'intimate';

export interface EmotionCoordinate {
  valence: number; // -1 ~ 1, 效价: 负面 ↔ 正面
  arousal: number; // -1 ~ 1, 唤醒度: 平静 ↔ 激动
}

export interface Character {
  id: string;
  name: string;
  avatar?: string;
  systemPrompt: string;
  worldview?: string;
  personality?: string;
  createdAt: number;
  updatedAt: number;

  // === 动态关系字段 ===
  affection?: number;
  relationshipStage?: RelationshipStage;
  currentEmotion?: string;
  currentStatus?: string;

  // === 记忆相关 ===
  memorySummary?: string;
  impression?: string;
  worldBooks?: string[];

  // === 新增：离线感知 ===
  lastVisitTime?: number;
  conversationRound?: number;
}

// ==================== 记忆层级系统 ====================

export type MemoryTier = 'core' | 'experience' | 'feeling' | 'plan' | 'archive';

export interface MemoryEntry {
  id: string;
  characterId: string;
  content: string;
  tier: MemoryTier;
  emotion: EmotionCoordinate;
  importance: number;        // 1-10
  domain: string;            // relationship / work / hobby / general
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  status: 'active' | 'fading' | 'archived';
  sourceMessageIds: string[];
  relatedMemoryIds: string[];
  isPinned: boolean;
  feel?: string;             // 第一人称感受痕迹
}

export interface LifeStageSummary {
  id: string;
  characterId: string;
  stageName: string;
  startTime: number;
  endTime: number;
  summary: string;
  keyMemories: string[];
  emotionSnapshot: EmotionCoordinate;
}

// ==================== 消息相关 ====================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  characterId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  imageUrl?: string;
  isRegenerated?: boolean;
}

// ==================== App 相关 ====================

export type AppID = 
  | 'message' 
  | 'phone' 
  | 'room' 
  | 'settings'
  | 'character'
  | 'group'
  | 'diary'
  | 'spark'
  | 'worldbook'
  | 'gallery';

export interface AppDefinition {
  id: AppID;
  name: string;
  icon: string;
  color: string;
  component: React.LazyExoticComponent<React.ComponentType>;
}

// ==================== 系统设置 ====================

export type MemoryEngineType = 'local' | 'ombre';

export interface MemoryEngineConfig {
  type: MemoryEngineType;
  ombreEndpoint?: string;
  ombreApiKey?: string;
}

export interface SystemSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  ttsEnabled: boolean;
  ttsApiKey?: string;
  ttsGroupId?: string;
  theme: 'dark' | 'light';
  wallpaper: string;
  memoryEngine: MemoryEngineConfig;
  lastApp?: AppID;           // 记住上次所在的页面
}

// ==================== 通知 ====================

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  appId?: AppID;
}

// ==================== 用户档案 ====================

export interface UserProfile {
  name: string;
  bio?: string;
  mbti?: string;
  tags?: string[];
}

// ==================== 世界书 ====================

export interface WorldBook {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

// ==================== LLM API 相关 ====================

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

// ==================== 脱水结果 ====================

export interface DehydratedMemory {
  content: string;
  tier: MemoryTier;
  valence: number;
  arousal: number;
  importance: number;
  domain: string;
  feel?: string;
}
