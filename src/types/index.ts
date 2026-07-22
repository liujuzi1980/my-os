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
  // === 情感坐标 + 心声（新增）===
  valence?: number;        // -1.0 ~ 1.0
  arousal?: number;        // 0.0 ~ 1.0
  innerMonologue?: string; // 心声（内心戏）
  emotionHistory?: Array<{ valence: number; arousal: number; timestamp: number; trigger: string }>;
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

  // === 生图相关（阶段 4 新增）===
  faceReferenceImage?: string;    // base64 锁脸图
  imagePositivePrompt?: string;   // 生图正面提示词（角色固定特征描述）
  imageNegativePrompt?: string;   // 生图负面提示词（需要避免的内容）
}

// ==================== 记忆层级系统 ====================

export type MemoryTier = 'core' | 'experience' | 'feeling' | 'plan' | 'archive';

/**
 * 记忆条目 —— 阶段 2 扩充版
 * 
 * 所有新增字段均为可选（?），确保 100% 兼容旧数据。
 * 读取时通过 normalizeMemoryEntry() 自动补全缺失字段的默认值。
 */
export interface MemoryEntry {
  id: string;
  characterId: string;
  content: string;
  summary?: string;        // 长内容摘要（grow 时生成）

  // === 情感坐标 ===
  emotion: EmotionCoordinate;
  valence?: number;        // 冗余，方便计算
  arousal?: number;

  // === 权重相关（新增）===
  importance: number;      // 1-10
  resolved?: boolean;      // 是否已解决（未解决的记忆权重更高）
  pinned?: boolean;        // 是否钉选（钉选记忆永不衰减）

  // === 时间相关 ===
  createdAt: number;
  lastAccessed: number;    // 上次被触碰（引用/检索/修改），语义同 lastTouched
  lastSurfaced?: number;   // 上次浮现到对话中的时间

  // === 分类 ===
  tier: MemoryTier;        // 保留兼容旧数据
  domain?: string;         // 领域：relationship / work / hobby / daily / promise
  tags?: string[];         // 标签

  // === 归档 ===
  status: 'active' | 'fading' | 'archived';
  archived?: boolean;      // 是否已归档（衰减到阈值后自动归档）
  archiveReason?: string;  // 归档原因：decay / manual / merge

  // === 来源 ===
  source?: 'auto' | 'manual' | 'dream';
  sourceMessageIds?: string[];
  relatedMemoryIds?: string[];
  relatedMessageIds?: string[];  // 兼容别名

  // === 兼容旧字段 ===
  isPinned?: boolean;      // 同 pinned，读取旧数据时复制
  feel?: string;
  accessCount?: number;    // 访问次数（旧字段，保留兼容）
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

// ==================== 图片元数据（生图功能预留）====================

export interface ImageRecord {
  id: string;
  characterId: string;
  messageId: string;

  // === 存储 ===
  url: string;              // 图片 URL（当前 base64，未来对象存储）
  storageType: 'base64' | 'r2' | 'cos';  // 存储类型，便于迁移

  // === 生图相关 ===
  prompt?: string;          // 生成提示词
  negativePrompt?: string;  // 反向提示词
  model?: string;           // 使用的生图模型
  seed?: number;            // 随机种子

  // === 图片信息 ===
  width: number;
  height: number;
  size: number;             // 文件大小（字节）
  mimeType: string;

  // === 缩略图 ===
  thumbnailUrl?: string;    // 缩略图 URL（前端 canvas 生成）

  // === 时间 ===
  generatedAt: number;
  expiresAt?: number;       // 临时 URL 过期时间
}

// ==================== 记忆桶（按领域分组）====================

export interface MemoryBucket {
  id: string;
  characterId: string;
  domain: string;
  name: string;
  description: string;
  memories: MemoryEntry[];
  createdAt: number;
  updatedAt: number;
}

// ==================== 记忆检索选项 ====================

export interface MemorySearchOptions {
  limit?: number;
  domains?: string[];
  valenceRange?: { min: number; max: number };
  arousalRange?: { min: number; max: number };
  timeRange?: { start: number; end: number };
  includeArchived?: boolean;
  includeResolved?: boolean;
  excludeIds?: string[];
}

export interface MemorySearchResult {
  memory: MemoryEntry;
  score: number;
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
  innerMonologue?: string; // 新增：心声（内心戏）
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
  | 'mcp'
  | 'desktop';  // ← 新增：桌面应用

export interface AppDefinition {
  id: AppID;
  name: string;
  icon: string;
  color: string;
  component: React.LazyExoticComponent<React.ComponentType>;
  implemented?: boolean;  // ← 新增：是否已实现（未实现显示灰色）
}

// ==================== 桌面配置（新增）====================

export interface DesktopPageConfig {
  id: number;
  appIds: AppID[];
}

// ==================== 生图配置（阶段 4 新增）====================

export interface ImageGenerationConfig {
  apiBaseUrl: string;      // 生图 API 地址
  apiKey: string;          // 生图 API Key
  model: string;           // 生图模型
  enabled: boolean;        // 是否启用生图
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
  amapKey?: string;        // 高德地图 API Key
  // === 阶段 4：生图配置 ===
  imageGeneration?: ImageGenerationConfig;
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

// ==================== 情感系统类型（新增）====================

export interface EmotionHistoryPoint {
  valence: number;
  arousal: number;
  timestamp: number;
  trigger: string;
}

export interface ParsedAIResponse {
  reply: string;
  thought?: string;
  valence?: number;
  arousal?: number;
}