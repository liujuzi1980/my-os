// ==================== MCP 相关 ====================

export type MCPTransportType = 'sse' | 'http';

export interface MCPConnection {
  id: string;
  name: string;
  transport: MCPTransportType;
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPConnectionState {
  connectionId: string;
  status: MCPConnectionStatus;
  error?: string;
  tools: MCPTool[];
  resources: MCPResource[];
  lastConnectedAt?: number;
}

// ==================== 角色相关 ====================

export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'close' | 'intimate';

export interface EmotionCoordinate {
  valence: number;
  arousal: number;
}

// ==================== 角色状态系统（简化版）====================

export interface CharacterState {
  characterId: string;
  mood: string;
  emotionalResidue: string;
  currentActivity: string;
  stateUpdatedAt: number;
}

// ==================== 日程系统（预留，未来做独立App）====================

export type ActivityType = 'work' | 'rest' | 'leisure' | 'sleep' | 'meal' | 'commute' | 'exercise';

export interface ScheduleItem {
  id: string;
  characterId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activity: string;
  activityType: ActivityType;
  description?: string;
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

  // === 离线感知 ===
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
  importance: number;
  domain: string;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  status: 'active' | 'fading' | 'archived';
  sourceMessageIds: string[];
  relatedMemoryIds: string[];
  isPinned: boolean;
  feel?: string;
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
  poiData?: Array<{ name: string; address: string; distance?: string; rating?: string; tel?: string }>;
  weatherData?: { city?: string; weather?: string; temperature?: string; wind?: string; humidity?: string };
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
  | 'gallery'
  | 'mcp';

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
  lastApp?: AppID;
  mcpConnections: MCPConnection[];
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
