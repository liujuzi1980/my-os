import { useState, useRef, useEffect, useCallback } from 'react';
import { useOSStore } from '@/context/OSStore';
import { getChatsByCharacter, saveChatMessage, deleteAllChats, exportAllData } from '@/db';
import { ContextBuilder } from '@/core/ContextBuilder';
import { MemoryEngine } from '@/core/MemoryEngine';
import { MemoryCore } from '@/core/MemoryCore';
import { AnticipationEngine } from '@/core/AnticipationEngine';
import { MemorySearch } from '@/core/MemorySearch';
import { VectorEmbedding } from '@/core/VectorEmbedding';
import { mcpManager } from '@/core/MCPClientManager';
import { parseAIResponse } from './parser';
import { InnerMonologue } from '@/components/InnerMonologue';
import { deriveMood, smoothEmotion, getEmotionColor } from '@/core/EmotionUtils';
import { 
  Send, Phone, ChevronLeft, MoreVertical, Bot, 
  RotateCcw, Trash2, Copy, X, AlertTriangle, Check,
  Quote, Edit3, Star, Layers, ArrowLeft, Download,
  Wrench, Loader2, Image, Sparkles
} from 'lucide-react';
import { ImageService, ImageGenerationError } from '@/services/ImageService';
import type { ImageRecord } from '@/types';
import type { ChatMessage, MessageRole, MemoryEntry } from '@/types';
import { getAmapToolDescriptions, callAmapTool } from '@/services/amap';

// ==================== 类型定义 ====================

interface MessageMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
}

interface ToolCall {
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

// ==================== 常量 ====================

const USER_MENU_ITEMS: MessageMenuItem[] = [
  { key: 'copy', label: '复制', icon: <Copy size={15} /> },
  { key: 'favorite', label: '收藏', icon: <Star size={15} /> },
  { key: 'edit', label: '编辑', icon: <Edit3 size={15} /> },
  { key: 'recall', label: '撤回', icon: <RotateCcw size={15} /> },
  { key: 'multiSelect', label: '多选', icon: <Layers size={15} /> },
  { key: 'delete', label: '删除', icon: <Trash2 size={15} />, danger: true },
];

const AI_MENU_ITEMS: MessageMenuItem[] = [
  { key: 'quote', label: '引用回复', icon: <Quote size={15} /> },
  { key: 'copy', label: '复制', icon: <Copy size={15} /> },
  { key: 'favorite', label: '收藏', icon: <Star size={15} /> },
  { key: 'edit', label: '编辑', icon: <Edit3 size={15} /> },
  { key: 'regenerate', label: '重roll', icon: <RotateCcw size={15} /> },
  { key: 'regenerate_image', label: '重新生图', icon: <Sparkles size={15} /> },
  { key: 'delete_image', label: '删除图片', icon: <Image size={15} />, danger: true },
  { key: 'multiSelect', label: '多选', icon: <Layers size={15} /> },
  { key: 'delete', label: '删除', icon: <Trash2 size={15} />, danger: true },
];

// ==================== 情感颜色工具（本地定义，避免外部依赖缺失）====================


// ==================== 工具调用解析 ====================

function cleanToolBlocks(content: string): string {
  return content.replace(/```tool\s*[\s\S]*?```/g, '').trim();
}

function parseToolCalls(content: string): { text: string; toolCalls: ToolCall[] } {
  const toolCallRegex = /```tool\s*\n([\s\S]*?)\n```/g;
  const toolCalls: ToolCall[] = [];
  let text = content;
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool && parsed.arguments) {
        toolCalls.push({
          connectionId: parsed.connectionId || '',
          toolName: parsed.tool,
          arguments: parsed.arguments,
        });
        text = text.replace(match[0], '');
      }
    } catch {
      // 解析失败，保留原文
    }
  }

  return { text: text.trim(), toolCalls };
}

function buildToolResultPrompt(toolName: string, result: unknown): string {
  return `[工具调用结果]\n工具：${toolName}\n结果：${JSON.stringify(result, null, 2)}\n请根据以上结果继续回复用户。`;
}

// ==================== 记忆工具结果构建 ====================

function buildMemoryBreathResult(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return '[记忆浮现结果] 没有浮现出相关记忆。';
  }
  const lines = memories.map(m => {
    const pin = (m.pinned || m.isPinned) ? '📌' : '';
    const resolved = (m.resolved ?? false) ? '✅' : '❓';
    return `${pin}${resolved} ${m.content}`;
  });
  return `[记忆浮现结果] 浮现了 ${memories.length} 条记忆：\n${lines.join('\n')}`;
}

// ==================== 消息气泡组件 ====================

interface MessageBubbleProps {
  msg: ChatMessage;
  characterName: string;
  isMenuOpen: boolean;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editText: string;
  copyFeedback: boolean;
  favoriteFeedback: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleSelect: () => void;
  onMenuAction: (action: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (text: string) => void;
  imageUrl?: string;
}

function MessageBubble({
  msg, characterName, isMenuOpen, isMultiSelectMode, isSelected,
  isEditing, editText, copyFeedback, favoriteFeedback,
  onToggleMenu, onCloseMenu, onToggleSelect, onMenuAction,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange,
  imageUrl,
}: MessageBubbleProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onCloseMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, onCloseMenu]);

  useEffect(() => {
    if (isMenuOpen && bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const menuHeight = (msg.role === 'user' ? USER_MENU_ITEMS : AI_MENU_ITEMS).length * 40 + 10;
      if (rect.top < menuHeight + 60) {
        setMenuPosition('bottom');
      } else {
        setMenuPosition('top');
      }
    }
  }, [isMenuOpen, msg.role]);

  const menuItems = msg.role === 'user' ? USER_MENU_ITEMS : AI_MENU_ITEMS;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isMultiSelectMode) onToggleMenu();
  };

  const handleClick = () => {
    if (isMultiSelectMode) {
      onToggleSelect();
    } else {
      onToggleMenu();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMultiSelectMode) return;
    const timer = setTimeout(() => {
      onToggleMenu();
    }, 500);
    const clear = () => clearTimeout(timer);
    e.currentTarget.addEventListener('touchend', clear, { once: true });
    e.currentTarget.addEventListener('touchmove', clear, { once: true });
  };

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-start gap-2`}>
      {isMultiSelectMode && (
        <button onClick={onToggleSelect} className="mt-3 flex-shrink-0">
          {isSelected ? (
            <div className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center">
              <Check size={12} className="text-white" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-md border-2 border-white/20" />
          )}
        </button>
      )}

      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
          {characterName[0]}
        </div>
      )}

      <div className="relative max-w-[75%]" ref={bubbleRef}>
        {isMenuOpen && !isMultiSelectMode && (
          <div 
            ref={menuRef}
            className={`absolute z-50 left-1/2 -translate-x-1/2 glass-panel shadow-2xl overflow-hidden whitespace-nowrap ${
              menuPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
            style={{ minWidth: '140px' }}
          >
            {menuItems.map((item, idx) => (
              <button
                key={item.key}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[MenuItem] clicked:', item.key, 'label:', item.label);
                  alert('点击了: ' + item.label + ' (' + item.key + ')');
                  onMenuAction(item.key);
                }}
                className={`
                  w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left transition-colors
                  hover:bg-white/10
                  ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-white/80'}
                  ${idx !== menuItems.length - 1 ? 'border-b border-white/5' : ''}
                `}
              >
                <span className={item.danger ? 'text-red-400' : 'text-white/50'}>
                  {item.icon}
                </span>
                <span className="text-[13px]">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {isEditing ? (
          <div className="glass-card p-3">
            <input
              type="text"
              value={editText}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              className="glass-input w-full text-sm mb-2"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onCancelEdit} className="text-white/50 text-xs px-3 py-1">取消</button>
              <button onClick={onSaveEdit} className="bg-blue-500/80 text-white text-xs px-3 py-1 rounded-lg">完成</button>
            </div>
          </div>
        ) : (
          <div>
            {/* 文字气泡 —— 有图片且文字为空时不显示 */}
            {!(msg.imageUrl && !cleanToolBlocks(msg.content)) && (
              <div
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onTouchStart={handleTouchStart}
                className={`
                  ${msg.role === 'user' ? 'message-bubble-user' : 'message-bubble-ai'}
                  ${msg.isRegenerated ? 'border-yellow-400/30' : ''}
                  ${isMenuOpen ? 'ring-2 ring-white/20' : ''}
                  ${isMultiSelectMode ? 'cursor-pointer' : 'cursor-pointer select-none'}
                  transition-all duration-150
                `}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{cleanToolBlocks(msg.content)}</p>
                {msg.isRegenerated && (
                  <span className="text-[10px] text-yellow-400/60 mt-1 block">已重新生成</span>
                )}
              </div>
            )}
            {/* 心声 */}
            {msg.role === 'assistant' && msg.innerMonologue && (
              <InnerMonologue thought={msg.innerMonologue} />
            )}
            {/* POI 卡片 */}
            {msg.poiData && msg.poiData.length > 0 && (
              <div className="mt-2 space-y-1.5 max-w-full">
                {msg.poiData.map((poi, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80 text-sm font-medium truncate">{poi.name}</span>
                      {poi.rating && <span className="text-yellow-400 text-xs">⭐ {poi.rating}</span>}
                    </div>
                    <p className="text-white/35 text-xs mt-0.5 truncate">{poi.address}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {poi.distance && <span className="text-white/25 text-xs">📍 {parseInt(poi.distance) > 1000 ? (parseInt(poi.distance)/1000).toFixed(1) + 'km' : poi.distance + 'm'}</span>}
                      {poi.tel && <span className="text-white/25 text-xs">📞 {poi.tel}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* 天气卡片 */}
            {msg.weatherData && (
              <div className="mt-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 rounded-xl p-3 max-w-full">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/40 text-xs">{msg.weatherData.city}</p>
                    <p className="text-white/90 text-base font-semibold">{msg.weatherData.weather}</p>
                  </div>
                  <p className="text-white/90 text-xl font-bold">{msg.weatherData.temperature}°C</p>
                </div>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                  {msg.weatherData.wind && <span className="text-white/30 text-xs">🌬 {msg.weatherData.wind}</span>}
                  {msg.weatherData.humidity && <span className="text-white/30 text-xs">💧 湿度 {msg.weatherData.humidity}</span>}
                </div>
              </div>
            )}
            {/* 图片渲染（阶段 4 新增） */}
            {(imageUrl || msg.imageUrl) && (
              <div 
                className="mt-2 max-w-full cursor-pointer"
                onClick={handleClick}
                onContextMenu={handleContextMenu}
              >
                <img
                  src={imageUrl || msg.imageUrl}
                  alt="生成的图片"
                  className="rounded-xl max-w-full border border-white/10"
                  style={{ maxHeight: '400px', objectFit: 'cover' }}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        )}

        {copyFeedback && (
          <div className={`absolute -bottom-6 ${msg.role === 'user' ? 'right-0' : 'left-0'} text-[10px] text-green-400 whitespace-nowrap bg-black/60 px-2 py-0.5 rounded-full`}>
            已复制
          </div>
        )}

        {favoriteFeedback && (
          <div className={`absolute -bottom-6 ${msg.role === 'user' ? 'right-0' : 'left-0'} text-[10px] text-yellow-400 whitespace-nowrap bg-black/60 px-2 py-0.5 rounded-full`}>
            已收藏
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 工具调用中组件 ====================

function ToolCallIndicator({ toolName }: { toolName: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
        <Wrench size={14} />
      </div>
      <div className="message-bubble-ai py-3 px-4">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="text-orange-400 animate-spin" />
          <span className="text-sm text-white/70">正在调用工具：{toolName}...</span>
        </div>
      </div>
    </div>
  );
}


// ==================== 自动记忆提取（前端规则引擎，零 API 消耗）====================

/**
 * 基于关键词和规则自动提取用户消息中的记忆
 * 
 * 不调用 LLM，纯前端规则匹配，零 API 消耗、不限流、响应快。
 * 覆盖 80% 的常见场景，剩余 20% 靠 AI 主动调用 memory_hold 补充。
 */
function autoHoldMemory(
  userContent: string,
  characterId: string
): { recorded: boolean; content?: string; domain?: string; importance?: number } {
  const text = userContent.trim();
  if (text.length < 5) return { recorded: false };

  // === 规则 1：明确指令 "记住/记得/别忘了" ===
  const rememberPattern = /(?:记住|记得|别忘了|记一下|记下来)[，,：:\s]*(.{3,100})/;
  const rememberMatch = text.match(rememberPattern);
  if (rememberMatch) {
    return {
      recorded: true,
      content: rememberMatch[1].trim(),
      domain: 'daily',
      importance: 7,
    };
  }

  // === 规则 2：个人偏好 "喜欢/讨厌/爱/不爱/习惯" ===
  const preferencePattern = /(?:我|他|她|我们|他们)(?:喜欢|讨厌|爱|不爱|习惯|偏好|热衷|痴迷|受不了|受不了|反感)(.{2,50})/;
  const preferenceMatch = text.match(preferencePattern);
  if (preferenceMatch) {
    return {
      recorded: true,
      content: `${text.includes('我') ? '用户' : '对方'}${preferenceMatch[0].match(/喜欢|讨厌|爱|不爱|习惯|偏好|热衷|痴迷|受不了|反感/)?.[0] || '喜欢'}${preferenceMatch[1].trim()}`,
      domain: 'daily',
      importance: 6,
    };
  }

  // === 规则 3：约定/计划 "明天/下周/下个月/到时候/约好了" ===
  const planPattern = /(?:明天|后天|下周|下个月|这周末|到时候|约好了|定了|计划|打算|准备|要)(.{2,80})/;
  const planMatch = text.match(planPattern);
  if (planMatch) {
    return {
      recorded: true,
      content: `用户${planMatch[0].trim()}`,
      domain: 'promise',
      importance: 8,
    };
  }

  // === 规则 4：重要事件 "考试/面试/生日/旅行/搬家/聚会" ===
  const eventKeywords = ['考试', '面试', '生日', '旅行', '旅游', '搬家', '聚会', '聚餐', '约会', '纪念日', '婚礼', '葬礼'];
  for (const kw of eventKeywords) {
    if (text.includes(kw)) {
      // 提取包含关键词的句子
      const sentencePattern = new RegExp(`[^。！？\n]{0,30}${kw}[^。！？\n]{0,30}`);
      const sentenceMatch = text.match(sentencePattern);
      return {
        recorded: true,
        content: sentenceMatch ? sentenceMatch[0].trim() : `用户提到了${kw}`,
        domain: 'daily',
        importance: 8,
      };
    }
  }

  // === 规则 5：情感表达 "开心/难过/生气/焦虑/紧张/兴奋" ===
  const emotionKeywords = ['开心', '高兴', '难过', '伤心', '生气', '愤怒', '焦虑', '紧张', '兴奋', '激动', '失望', '沮丧', '疲惫', '累'];
  for (const kw of emotionKeywords) {
    if (text.includes(kw)) {
      const sentencePattern = new RegExp(`[^。！？\n]{0,20}${kw}[^。！？\n]{0,30}`);
      const sentenceMatch = text.match(sentencePattern);
      return {
        recorded: true,
        content: sentenceMatch ? `用户感到${sentenceMatch[0].trim()}` : `用户感到${kw}`,
        domain: 'daily',
        importance: 6,
      };
    }
  }

  // === 规则 6：关系信息 "我男/女朋友/老公/老婆/妈妈/爸爸/朋友叫" ===
  const relationPattern = /(?:我|他|她)(?:的|和)?(?:男朋友|女朋友|老公|老婆|男票|女票|对象|妈妈|爸爸|父亲|母亲|哥哥|姐姐|弟弟|妹妹|同事|老板|领导|老师|同学)(?:叫|是|姓|名字|名叫)?(.{1,20})/;
  const relationMatch = text.match(relationPattern);
  if (relationMatch) {
    return {
      recorded: true,
      content: relationMatch[0].trim(),
      domain: 'relationship',
      importance: 7,
    };
  }

  // === 规则 7：饮食偏好 "吃/喝/口味/辣/甜/酸/苦" ===
  const foodPattern = /(?:吃|喝|口味|口味偏|爱吃|不爱吃|喜欢喝|不喜欢喝|常去|经常去)(.{2,40})/;
  const foodMatch = text.match(foodPattern);
  if (foodMatch && (text.includes('喜欢') || text.includes('爱') || text.includes('习惯') || text.includes('常'))) {
    return {
      recorded: true,
      content: `用户${foodMatch[0].trim()}`,
      domain: 'daily',
      importance: 5,
    };
  }

  return { recorded: false };
}

// ==================== 主组件 ====================

export default function MessageApp() {
  const { 
    activeCharacterId, 
    getActiveCharacter, 
    getCharacterState,
    updateCharacterState,
    settings,
    userProfile,
    setCurrentApp,
    setIsLoading,
    updateCharacter,
    mcpConnectionStates,
    mcpConnections,
  } = useOSStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isToolCalling, setIsToolCalling] = useState(false);
  const [currentToolName, setCurrentToolName] = useState('');

  const [openMenuMsgId, setOpenMenuMsgId] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 高德地图数据缓存
  const poiDataRef = useRef<ChatMessage['poiData']>(undefined);
  const weatherDataRef = useRef<ChatMessage['weatherData']>(undefined);
  const lastGeocodeRef = useRef<{ lng: number; lat: number } | null>(null);
  const lastUserQueryRef = useRef<string>('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [quotingMsg, setQuotingMsg] = useState<ChatMessage | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'multi'>('single');
  const [deleteMsgId, setDeleteMsgId] = useState<string | null>(null);
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const [favoriteFeedbackId, setFavoriteFeedbackId] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<{ valence: number; arousal: number } | null>(null);

  // === 阶段 4：生图相关状态（AI 自主触发模式）===
  const [imageSizeWarning, setImageSizeWarning] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const isFirstMessageRef = useRef(true);
  // 阶段 B：已浮现记忆去重池，避免调高 limit 后每轮都吐同几条
  const surfacedIdsRingRef = useRef<string[]>([]);

  const character = getActiveCharacter();

  // 加载聊天记录 + 更新离线时间 + 加载角色状态
  useEffect(() => {
    if (activeCharacterId && character && !initializedRef.current) {
      initializedRef.current = true;
      loadMessages();
      checkImageStorage();
      const updated = ContextBuilder.updateLastVisit(character);
      updateCharacter(updated);
    }
  }, [activeCharacterId, character, updateCharacter]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isToolCalling]);

  const loadMessages = async () => {
    if (!activeCharacterId) return;
    const chats = await getChatsByCharacter(activeCharacterId, 100);
    setMessages(chats);
  };

  // === 阶段 4：检查图片存储限额 ===
  const checkImageStorage = async () => {
    if (!activeCharacterId) return;
    try {
      const totalSize = await ImageService.getTotalImageSize(activeCharacterId);
      const limit = 500 * 1024 * 1024; // 500MB
      if (totalSize > limit) {
        setImageSizeWarning(`图片存储已使用 ${ImageService.formatSize(totalSize)}，建议导出备份后清理`);
      } else if (totalSize > limit * 0.8) {
        setImageSizeWarning(`图片存储已使用 ${ImageService.formatSize(totalSize)}，接近 500MB 限额`);
      } else {
        setImageSizeWarning('');
      }
    } catch (e) {
      console.error('[ImageStorage] check failed:', e);
    }
  };

  // 加载角色情感状态
  useEffect(() => {
    if (character) {
      const s = getCharacterState(character.id);
      if (s?.valence !== undefined && s?.arousal !== undefined) {
        setCurrentEmotion({ valence: s.valence, arousal: s.arousal });
      }
    }
  }, [character?.id, getCharacterState]);

  // 获取已连接且启用的 MCP 工具
  const getConnectedMCPTools = useCallback(() => {
    const result: { connectionName: string; connectionId: string; tools: import('@/types').MCPTool[] }[] = [];
    for (const conn of mcpConnections) {
      if (!conn.enabled) continue;
      const state = mcpConnectionStates[conn.id];
      if (state?.status === 'connected' && state.tools.length > 0) {
        result.push({
          connectionName: conn.name,
          connectionId: conn.id,
          tools: state.tools,
        });
      }
    }
    return result;
  }, [mcpConnections, mcpConnectionStates]);

  // ==================== LLM 调用 ====================

  const callLLM = async (
    extraSystemMessages?: Array<{ role: string; content: string }>,
    surfacedMemories?: MemoryEntry[]
  ): Promise<{ content: string | null; error?: string }> => {
    if (!character) {
      return { content: null, error: '未选择角色' };
    }
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      return { content: null, error: 'API Key 为空，请在设置中填写' };
    }
    if (!settings.apiBaseUrl) {
      return { content: null, error: 'API Base URL 为空' };
    }
    if (!settings.model) {
      return { content: null, error: '模型未选择' };
    }

    setIsTyping(true);
    setIsLoading(true);

    try {
      let state = getCharacterState(character.id);
      if (!state) {
        state = {
          characterId: character.id,
          mood: '平静',
          emotionalResidue: '平静',
          currentActivity: '闲着',
          stateUpdatedAt: Date.now(),
        };
      }

      const isFirstMessage = isFirstMessageRef.current;
      const mcpTools = getConnectedMCPTools();
      const builder = ContextBuilder.create(character, state, userProfile, mcpTools, settings);
      const { messages: contextMessages, newState } = await builder.buildCoreContext(
        isFirstMessage, 
        settings.chatHistoryRounds ?? 15, 
        surfacedMemories
      );

      // === 注入高德地图工具描述和系统提示 ===
      const systemIndex = contextMessages.findLastIndex(m => m.role === 'system');
      if (systemIndex >= 0) {
        if (!extraSystemMessages || extraSystemMessages.length === 0) {
          const amapDesc = getAmapToolDescriptions();
          contextMessages.splice(systemIndex + 1, 0, { role: 'system', content: amapDesc });
        }
        const lastSystemIndex = contextMessages.findLastIndex(m => m.role === 'system');
        contextMessages.splice(lastSystemIndex + 1, 0, {
          role: 'system',
          content: `【地图工具使用原则】
1. 查地点坐标用 amap_geocode，搜周边用 amap_search_nearby。
2. 搜周边时 location 参数必须用 geocode 返回的坐标，不要猜。
3. 高德对商场内部店铺覆盖不全，如实汇报搜索结果即可，搜不到就直说。`
        });
      }

      if (extraSystemMessages && extraSystemMessages.length > 0) {
        const systemIndex = contextMessages.findLastIndex(m => m.role === 'system');
        if (systemIndex >= 0) {
          contextMessages.splice(systemIndex + 1, 0, ...extraSystemMessages);
        } else {
          contextMessages.unshift(...extraSystemMessages);
        }
      }

      console.log('[LLM 请求]', {
        url: settings.apiBaseUrl,
        model: settings.model,
        messageCount: contextMessages.length,
        mcpTools: mcpTools.map(t => ({ name: t.connectionName, toolCount: t.tools.length })),
        surfacedMemories: surfacedMemories?.length || 0,
      });

      const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: contextMessages,
          temperature: 0.8,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error('[LLM 响应错误]', response.status, errorText);
        return { 
          content: null, 
          error: `API 返回错误 ${response.status}: ${errorText.slice(0, 200)}` 
        };
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[LLM 响应格式异常]', data);
        return { content: null, error: 'API 响应格式异常' };
      }

      const aiContent = data.choices[0].message.content;

      await updateCharacterState(character.id, newState);

      return { content: aiContent };
    } catch (error: any) {
      console.error('[LLM 调用异常]', error);
      let errorMsg = '网络请求失败';
      if (error.message?.includes('Failed to fetch')) {
        errorMsg = '网络请求失败，可能是 CORS 问题或 API 地址不可达';
      } else if (error.message) {
        errorMsg = error.message;
      }
      return { content: null, error: errorMsg };
    } finally {
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  // ==================== 处理工具调用 ====================

  const handleToolCalls = async (content: string): Promise<string> => {
    const { text, toolCalls } = parseToolCalls(content);

    if (toolCalls.length === 0) {
      return content;
    }

    const extraSystemMessages: Array<{ role: string; content: string }> = [];

    for (const toolCall of toolCalls) {
      // === 阶段 2：记忆工具（新增）===
      if (toolCall.toolName.startsWith('memory_')) {
        if (!character) continue;
        const memoryCore = new MemoryCore(character.id, settings);

        try {
          switch (toolCall.toolName) {
            case 'memory_breath': {
              const memories = await memoryCore.breath({ 
                limit: settings.memoryBreathLimit ?? 5, 
                includeResolved: false 
              });
              extraSystemMessages.push({
                role: 'system',
                content: buildMemoryBreathResult(memories),
              });
              break;
            }
            case 'memory_hold': {
              const args = toolCall.arguments as Record<string, unknown>;
              const memory = await memoryCore.hold({
                content: String(args.content || ''),
                feel: args.feel ? String(args.feel) : undefined,
                pinned: Boolean(args.pinned),
                domain: args.domain ? String(args.domain) : undefined,
                tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
                valence: typeof args.valence === 'number' ? args.valence : undefined,
                arousal: typeof args.arousal === 'number' ? args.arousal : undefined,
                importance: typeof args.importance === 'number' ? args.importance : undefined,
                source: 'auto',
                relatedMessageIds: [],
              });
              extraSystemMessages.push({
                role: 'system',
                content: `[记忆已记录] 你记下了：${memory.content}（重要性：${memory.importance}，领域：${memory.domain}）`,
              });
              break;
            }
            case 'memory_grow': {
              const args = toolCall.arguments as Record<string, unknown>;
              const content = String(args.content || '');
              const memories = await memoryCore.grow(content);
              extraSystemMessages.push({
                role: 'system',
                content: `[记忆已整理] 将内容拆分为 ${memories.length} 条记忆：\n${memories.map(m => `- ${m.content}`).join('\n')}`,
              });
              break;
            }
            case 'memory_trace': {
              const args = toolCall.arguments as Record<string, unknown>;
              const memory = await memoryCore.trace({
                memoryId: String(args.memoryId || ''),
                resolved: typeof args.resolved === 'boolean' ? args.resolved : undefined,
                pinned: typeof args.pinned === 'boolean' ? args.pinned : undefined,
                valence: typeof args.valence === 'number' ? args.valence : undefined,
                arousal: typeof args.arousal === 'number' ? args.arousal : undefined,
                importance: typeof args.importance === 'number' ? args.importance : undefined,
                domain: typeof args.domain === 'string' ? args.domain : undefined,
                tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
                content: typeof args.content === 'string' ? args.content : undefined,
                summary: typeof args.summary === 'string' ? args.summary : undefined,
              });
              extraSystemMessages.push({
                role: 'system',
                content: `[记忆已修正] ${memory ? `成功更新记忆：${memory.content}` : '记忆未找到'}`,
              });
              break;
            }
            case 'memory_search': {
              const args = toolCall.arguments as Record<string, unknown>;
              const embedder = VectorEmbedding.fromSettings({ embeddingConfig: settings.embeddingConfig });
              const searchEngine = new MemorySearch(character.id, embedder || undefined);
              const query = String(args.query || '');
              const limit = typeof args.limit === 'number' ? args.limit : 8;
              const results = await searchEngine.search(query, { limit, includeArchived: false });
              const lines = results.map(r => `- [${r.score.toFixed(2)}] ${r.memory.content}`);
              extraSystemMessages.push({
                role: 'system',
                content: `[记忆检索结果] query="${query}" 命中 ${results.length} 条：\n${lines.join('\n') || '（无结果）'}\n请据此继续回复用户，自然即可，不必提及你"搜索了记忆"。`,
              });
              break;
            }
            default: {
              extraSystemMessages.push({
                role: 'system',
                content: `[记忆工具错误] 未知的记忆工具：${toolCall.toolName}。可用工具：memory_breath, memory_hold, memory_grow, memory_trace。`,
              });
            }
          }
        } catch (e: any) {
          extraSystemMessages.push({
            role: 'system',
            content: `[记忆工具错误] ${toolCall.toolName} 执行失败：${e.message || '未知错误'}`,
          });
        }
        continue;
      }

      // === 高德地图工具（保留原有逻辑）===
      if (toolCall.toolName.startsWith('amap_')) {
        const knownTools = ['amap_geocode', 'amap_search_nearby', 'amap_weather'];
        if (!knownTools.includes(toolCall.toolName)) {
          extraSystemMessages.push({
            role: 'system',
            content: `[工具调用失败] 工具 ${toolCall.toolName} 不存在。可用工具：amap_geocode, amap_search_nearby, amap_weather。请直接回复用户。`,
          });
          continue;
        }
        setIsToolCalling(true);
        setCurrentToolName(toolCall.toolName);
        try {
          let result = await callAmapTool(settings.amapKey || '', toolCall.toolName, toolCall.arguments);

          if (toolCall.toolName === 'amap_geocode') {
            const r = result as any;
            if (r.location) {
              const [lng, lat] = String(r.location).split(',').map(Number);
              if (!isNaN(lng) && !isNaN(lat)) {
                lastGeocodeRef.current = { lng, lat };
              }
            }

            const userContent = lastUserQueryRef.current;
            const isNearbyQuery = /附近|周边|周围|旁边|里面|内|有什么|有啥|有哪些|店|铺|商家/.test(userContent);

            if (isNearbyQuery && lastGeocodeRef.current) {
              setCurrentToolName('amap_search_nearby');
              const searchArgs: Record<string, unknown> = {
                location: `${lastGeocodeRef.current.lng},${lastGeocodeRef.current.lat}`,
                radius: 500,
              };

              console.log('[amap] 自动补调周边搜索，坐标:', searchArgs.location);

              const searchResult = await callAmapTool(settings.amapKey || '', 'amap_search_nearby', searchArgs);

              const sr = searchResult as any;
              if (sr.results && Array.isArray(sr.results)) {
                poiDataRef.current = sr.results.slice(0, 10).map((item: any) => ({
                  name: item.name || '',
                  address: item.address || '',
                  distance: item.distance || '',
                  rating: item.rating || '',
                  tel: item.tel || '',
                }));
              }

              extraSystemMessages.push({
                role: 'system',
                content: buildToolResultPrompt('amap_search_nearby', searchResult),
              });
            }
          }

          if (toolCall.toolName === 'amap_search_nearby' && lastGeocodeRef.current && toolCall.arguments.location) {
            const [aiLng, aiLat] = String(toolCall.arguments.location).split(',').map(Number);
            if (!isNaN(aiLng) && !isNaN(aiLat)) {
              const dist = Math.abs(aiLng - lastGeocodeRef.current.lng) + Math.abs(aiLat - lastGeocodeRef.current.lat);
              if (dist > 0.01) {
                console.log(`[amap] 自动修正 search_nearby 坐标: ${toolCall.arguments.location} -> ${lastGeocodeRef.current.lng},${lastGeocodeRef.current.lat}`);
                toolCall.arguments.location = `${lastGeocodeRef.current.lng},${lastGeocodeRef.current.lat}`;
                result = await callAmapTool(settings.amapKey || '', toolCall.toolName, toolCall.arguments);
              }
            }

            const r = result as any;
            if (r.results && Array.isArray(r.results)) {
              poiDataRef.current = r.results.slice(0, 10).map((item: any) => ({
                name: item.name || '',
                address: item.address || '',
                distance: item.distance || '',
                rating: item.rating || '',
                tel: item.tel || '',
              }));
            }
          }

          extraSystemMessages.push({
            role: 'system',
            content: buildToolResultPrompt(toolCall.toolName, result),
          });

          if (toolCall.toolName === 'amap_weather') {
            const r = result as any;
            if (r.live) {
              weatherDataRef.current = {
                city: r.live.city,
                weather: r.live.weather,
                temperature: r.live.temperature,
                wind: `${r.live.winddirection || ''} ${r.live.windpower || ''}级`,
                humidity: `${r.live.humidity}%`,
              };
            }
          }
        } catch (e: any) {
          extraSystemMessages.push({
            role: 'system',
            content: `[工具调用失败] ${toolCall.toolName}: ${e.message || '调用失败'}`,
          });
        } finally {
          setIsToolCalling(false);
          setCurrentToolName('');
        }
        continue;
      }

      // === 生图工具（阶段 4 新增）===
      if (toolCall.toolName === 'generate_image') {
        if (!character || !settings.imageGeneration?.enabled) {
          extraSystemMessages.push({
            role: 'system',
            content: '[生图工具错误] 生图功能未启用或未选择角色，无法生成图片。',
          });
          continue;
        }

        setIsToolCalling(true);
        setCurrentToolName('generate_image');

        try {
          const args = toolCall.arguments as Record<string, unknown>;
          const scenePrompt = String(args.prompt || '');
          const scene = String(args.scene || 'scene');

          if (!scenePrompt.trim()) {
            extraSystemMessages.push({
              role: 'system',
              content: '[生图工具错误] prompt 不能为空，请提供场景描述。',
            });
            setIsToolCalling(false);
            setCurrentToolName('');
            continue;
          }

          // 拼接最终 prompt：角色正面提示词 + AI 场景描述
          const positivePrompt = character.imagePositivePrompt || '';
          const negativePrompt = character.imageNegativePrompt || '';
          const finalPrompt = positivePrompt
            ? `${positivePrompt}, ${scenePrompt}`
            : scenePrompt;

          console.log('[generate_image] 最终 prompt:', finalPrompt);
          console.log('[generate_image] negative prompt:', negativePrompt);

          // 调用生图服务
          const imageService = ImageService.fromConfig(settings.imageGeneration);
          if (!imageService) {
            extraSystemMessages.push({
              role: 'system',
              content: '[生图工具错误] 生图服务初始化失败，请检查生图配置。',
            });
            setIsToolCalling(false);
            setCurrentToolName('');
            continue;
          }

          const imageRecord = await imageService.generateImage({
            prompt: finalPrompt,
            negativePrompt: negativePrompt || undefined,
            characterId: character.id,
            messageId: '', // 会在发送消息时更新
          });

          // 将图片作为 AI 消息发送到聊天中
          const aiImageMsg: ChatMessage = {
            id: crypto.randomUUID(),
            characterId: character.id,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            imageUrl: imageRecord.url,
          };
          await saveChatMessage(aiImageMsg);
          setMessages(prev => [...prev, aiImageMsg]);

          // 更新 imageRecord 的 messageId
          imageRecord.messageId = aiImageMsg.id;
          const { saveImageRecord } = await import('@/db');
          await saveImageRecord(imageRecord);

          extraSystemMessages.push({
            role: 'system',
            content: `[生图成功] 图片已生成并发送给用户。场景：${scenePrompt}`,
          });

          // 检查存储限额
          await checkImageStorage();
        } catch (e: any) {
          console.error('[generate_image] failed:', e);
          let errorMsg = '图片生成失败';
          if (e instanceof ImageGenerationError) {
            switch (e.code) {
              case 'auth': errorMsg = 'API Key 无效，请检查生图设置'; break;
              case 'network': errorMsg = '网络错误，请检查 API 地址'; break;
              case 'content_policy': errorMsg = '内容审核未通过，请修改描述'; break;
              case 'rate_limit': errorMsg = '请求过于频繁，请稍后再试'; break;
              default: errorMsg = e.message;
            }
          } else if (e instanceof Error) {
            errorMsg = e.message;
          }
          extraSystemMessages.push({
            role: 'system',
            content: `[生图工具错误] ${errorMsg}`,
          });
        } finally {
          setIsToolCalling(false);
          setCurrentToolName('');
        }
        continue;
      }

      // === MCP 工具（保留原有逻辑）===
      let targetConnectionId = toolCall.connectionId;

      if (!targetConnectionId) {
        for (const conn of mcpConnections) {
          const state = mcpConnectionStates[conn.id];
          if (state?.status === 'connected' && state.tools.some(t => t.name === toolCall.toolName)) {
            targetConnectionId = conn.id;
            break;
          }
        }
      }

      if (!targetConnectionId) {
        extraSystemMessages.push({
          role: 'system',
          content: `[工具调用失败]\n工具：${toolCall.toolName}\n错误：找不到可用的 MCP 连接`,
        });
        continue;
      }

      setIsToolCalling(true);
      setCurrentToolName(toolCall.toolName);

      try {
        const result = await mcpManager.callTool(targetConnectionId, toolCall.toolName, toolCall.arguments);
        extraSystemMessages.push({
          role: 'system',
          content: buildToolResultPrompt(toolCall.toolName, result),
        });
      } catch (e: any) {
        extraSystemMessages.push({
          role: 'system',
          content: `[工具调用失败]\n工具：${toolCall.toolName}\n错误：${e.message || '调用失败'}`,
        });
      } finally {
        setIsToolCalling(false);
        setCurrentToolName('');
      }
    }

    if (extraSystemMessages.length > 0) {
      const { content: finalContent, error } = await callLLM(extraSystemMessages);
      if (finalContent) {
        // 清理 JSON 情感坐标，只保留 reply 正文
        const parsed = parseAIResponse(finalContent);
        return parsed.reply;
      }
      if (error) {
        return `${text}\n\n（工具调用后处理失败：${error}）`;
      }
    }

    return text;
  };

  // ==================== 图片消息操作（阶段 4 新增）====================

  /**
   * 删除图片消息 —— 删除消息 + 关联的 ImageRecord
   */
  const handleDeleteImage = async (msg: ChatMessage) => {
    console.log('[handleDeleteImage] called, msg.id:', msg.id, 'imageUrl:', !!msg.imageUrl);
    if (!character || !msg.imageUrl) {
      console.log('[handleDeleteImage] early return: character=', !!character, 'imageUrl=', !!msg.imageUrl);
      return;
    }

    try {
      // 1. 从 IndexedDB 删除关联的图片记录
      const { getImageRecordsByMessage, deleteImageRecord } = await import('@/db');
      const imageRecords = await getImageRecordsByMessage(msg.id);
      for (const record of imageRecords) {
        await deleteImageRecord(record.id);
      }

      // 2. 删除消息本身
      const db = await import('@/db').then(m => m.getDB());
      await db.delete('chats', msg.id);

      // 3. 从界面移除
      setMessages(prev => prev.filter(m => m.id !== msg.id));

      console.log('[DeleteImage] 已删除图片消息:', msg.id);
    } catch (e) {
      console.error('[DeleteImage] 删除失败:', e);
    }
  };

  /**
   * 重新生成图片 —— 用同样的 prompt 重新调用生图
   */
  const handleRegenerateImage = async (msg: ChatMessage) => {
    console.log('[handleRegenerateImage] called, msg.id:', msg.id);
    if (!character || !msg.imageUrl || !settings.imageGeneration?.enabled) {
      console.log('[handleRegenerateImage] early return');
      return;
    }

    setIsToolCalling(true);
    setCurrentToolName('generate_image');

    try {
      // 1. 查找关联的图片记录，获取原始 prompt
      const { getImageRecordsByMessage } = await import('@/db');
      const imageRecords = await getImageRecordsByMessage(msg.id);
      const originalRecord = imageRecords[0];

      if (!originalRecord?.prompt) {
        console.error('[RegenerateImage] 找不到原始 prompt');
        return;
      }

      // 2. 从 prompt 中分离出场景描述（去掉角色正面提示词前缀）
      const positivePrompt = character.imagePositivePrompt || '';
      let scenePrompt = originalRecord.prompt;
      if (positivePrompt && scenePrompt.startsWith(positivePrompt)) {
        scenePrompt = scenePrompt.slice(positivePrompt.length).replace(/^,\s*/, '');
      }

      console.log('[RegenerateImage] 重新生图，scene prompt:', scenePrompt);

      // 3. 调用生图服务
      const imageService = ImageService.fromConfig(settings.imageGeneration);
      if (!imageService) return;

      const newRecord = await imageService.generateImage({
        prompt: originalRecord.prompt, // 使用完整 prompt（包含角色描述）
        negativePrompt: originalRecord.negativePrompt || undefined,
        characterId: character.id,
        messageId: msg.id,
      });

      // 4. 更新消息的 imageUrl
      const db = await import('@/db').then(m => m.getDB());
      const updatedMsg = { ...msg, imageUrl: newRecord.url };
      await db.put('chats', updatedMsg);
      setMessages(prev => prev.map(m => m.id === msg.id ? updatedMsg : m));

      // 5. 更新 imageRecord 的 messageId
      newRecord.messageId = msg.id;
      const { saveImageRecord } = await import('@/db');
      await saveImageRecord(newRecord);

      // 6. 删除旧图片记录
      if (originalRecord) {
        const { deleteImageRecord } = await import('@/db');
        await deleteImageRecord(originalRecord.id);
      }

      console.log('[RegenerateImage] 图片已重新生成');
    } catch (e) {
      console.error('[RegenerateImage] 重新生图失败:', e);
    } finally {
      setIsToolCalling(false);
      setCurrentToolName('');
    }
  };

    // ==================== 生图功能（阶段 4：AI 自主触发模式）====================
  // 生图由 AI 通过 generate_image 工具自主触发，不再提供手动输入入口
  // 工具拦截逻辑在 handleToolCalls 中处理// ==================== 发送消息 ====================

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !character || !settings.apiKey) return;

    let content = inputText.trim();
    if (quotingMsg) {
      content = `[引用 ${quotingMsg.role === 'user' ? '用户' : character.name}: ${quotingMsg.content.slice(0, 50)}${quotingMsg.content.length > 50 ? '...' : ''}]\n${content}`;
      setQuotingMsg(null);
    }

    setInputText('');

    lastUserQueryRef.current = content;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    await saveChatMessage(userMsg);
    setMessages(prev => [...prev, userMsg]);

    // === 阶段 2：自动提取并记录用户消息中的记忆（前端规则引擎）===
    const autoHeldMemory = autoHoldMemory(content, character.id);
    if (autoHeldMemory.recorded && autoHeldMemory.content) {
      (async () => {
        try {
          const memoryCore = new MemoryCore(character.id, settings);
          await memoryCore.hold({
            content: autoHeldMemory.content!,
            domain: autoHeldMemory.domain || 'daily',
            importance: autoHeldMemory.importance || 5,
            source: 'auto',
          });
          console.log('[autoHoldMemory] recorded:', autoHeldMemory.content);
        } catch (e) {
          console.error('[autoHoldMemory] save failed:', e);
        }
      })();
    }

    // M2：检测用户消息里的期盼 + 检查兑现 + 老化
    (async () => {
      try {
        const ae = new AnticipationEngine(character.id);
        const detected = ae.detectAnticipation(content);
        if (detected) {
          const created = await ae.create(detected, content);
          console.log('[Anticipation] created:', created.content);
        }
        await ae.checkFulfillment(content);
        const roundCount2 = (character.conversationRound || 0) + 1;
        if (roundCount2 % 20 === 0) {
          await ae.advanceAging();
        }
      } catch (e) {
        console.error('[Anticipation] processing failed:', e);
      }
    })();

    // === 阶段 2：对话开头自动 breath，浮现高权重记忆 ===
    let surfacedMemories: MemoryEntry[] = [];
    try {
      const memoryCore = new MemoryCore(character.id, settings);
      // 阶段 B：排除最近几轮已浮现过的记忆，保留最近 3×limit 条 id
      const breathLimit = settings.memoryBreathLimit ?? 5;
      surfacedMemories = await memoryCore.breath({
        limit: breathLimit,
        includeResolved: false,
        excludeIds: surfacedIdsRingRef.current,
      });
      // 把本轮浮现的 id 推入池，只保留最近 3 轮的 id 防止池无限增长
      const newIds = surfacedMemories.map(m => m.id);
      surfacedIdsRingRef.current = [...surfacedIdsRingRef.current, ...newIds].slice(-3 * breathLimit);
      const skippedByDedup = surfacedIdsRingRef.current.length - newIds.length;
      console.log('[Message] breath surfaced', surfacedMemories.length, 'memories', skippedByDedup > 0 ? '(dedup pool)' : '');
    } catch (e) {
      console.error('[Message] breath failed:', e);
    }

    // 构建额外 system messages（包含自动记录的记忆）
    const extraSystemMessages: Array<{ role: string; content: string }> = [];
    if (autoHeldMemory.recorded && autoHeldMemory.content) {
      extraSystemMessages.push({
        role: 'system',
        content: `[你刚刚记下了] ${autoHeldMemory.content}。你可以自然地提到这件事，也可以不提。`,
      });
    }

    const { content: aiContent, error } = await callLLM(
      extraSystemMessages.length > 0 ? extraSystemMessages : undefined,
      surfacedMemories
    );

    if (!aiContent || error) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        characterId: character.id,
        role: 'assistant',
        content: `（发送失败：${error || '未知错误'}）`,
        timestamp: Date.now(),
      };
      await saveChatMessage(errorMsg);
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    const parsed = parseAIResponse(aiContent);
    const finalContent = parsed.reply;

    const currentState = getCharacterState(character.id);
    if (currentState && (parsed.valence !== undefined || parsed.arousal !== undefined)) {
      const newValence = parsed.valence !== undefined 
        ? smoothEmotion(currentState.valence ?? 0, parsed.valence, 0.3)
        : currentState.valence;
      const newArousal = parsed.arousal !== undefined
        ? smoothEmotion(currentState.arousal ?? 0.3, parsed.arousal, 0.3)
        : currentState.arousal;
      // 追加情感历史点，供 EmotionChart 绘制曲线（最近 50 条）
      const now = Date.now();
      const emotionHistory = [
        ...(currentState.emotionHistory || []),
        {
          valence: newValence ?? 0,
          arousal: newArousal ?? 0.3,
          timestamp: now,
          trigger: (lastUserQueryRef.current || '对话').slice(0, 50),
        },
      ].slice(-50);
      await updateCharacterState(character.id, {
        ...currentState,
        valence: newValence,
        arousal: newArousal,
        innerMonologue: parsed.thought || currentState.innerMonologue,
        mood: deriveMood(newValence ?? 0, newArousal ?? 0.3),
        stateUpdatedAt: now,
        emotionHistory,
      });
      console.log('[Emotion]', {
        mood: deriveMood(newValence ?? 0, newArousal ?? 0.3),
        v: newValence,
        a: newArousal,
        thought: parsed.thought,
      });
      setCurrentEmotion({ valence: newValence ?? 0, arousal: newArousal ?? 0.3 });
    }

    const finalContent2 = await handleToolCalls(finalContent);

    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'assistant',
      content: finalContent2,
      timestamp: Date.now(),
      poiData: poiDataRef.current,
      weatherData: weatherDataRef.current,
      innerMonologue: parsed.thought,
    };
    poiDataRef.current = undefined;
    weatherDataRef.current = undefined;
    await saveChatMessage(aiMsg);
    setMessages(prev => [...prev, aiMsg]);

    isFirstMessageRef.current = false;

    // [MEMORY] 异步脱水（保留原有逻辑）
    (async () => {
      try {
        const engine = new MemoryEngine(character.id, settings);
        const recent = await getChatsByCharacter(character.id, 12);
        const newMemories = await engine.dehydrate(recent);
        if (newMemories.length > 0) {
          await engine.storeMemories(newMemories);
        }
        const roundCount = (character.conversationRound || 0) + 1;
        if (roundCount % 20 === 0) {
          await engine.decay();
        }
        await updateCharacter({ ...character, conversationRound: roundCount });
      } catch (e) {
        console.error('[Memory] background dehydration failed:', e);
      }
    })();
  }, [inputText, character, settings, activeCharacterId, quotingMsg, userProfile, getCharacterState, updateCharacterState, mcpConnections, mcpConnectionStates, updateCharacter]);

  // ==================== 消息操作 ====================

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopyFeedbackId(msgId);
    setTimeout(() => setCopyFeedbackId(null), 1500);
  };

  const handleFavorite = (msgId: string) => {
    setFavoriteFeedbackId(msgId);
    setTimeout(() => setFavoriteFeedbackId(null), 1500);
  };

  const handleRecall = async (msgId: string) => {
    if (!character) return;
    const db = await import('@/db').then(m => m.getDB());
    await db.delete('chats', msgId);

    const recallNotice: ChatMessage = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'system',
      content: '（用户撤回了一条消息）',
      timestamp: Date.now(),
    };
    await saveChatMessage(recallNotice);
    setMessages(prev => prev.filter(m => m.id !== msgId).concat(recallNotice));
  };

  // ==================== 重roll ====================

  const handleRegenerate = async (msg: ChatMessage) => {
    if (!character) return;

    const db = await import('@/db').then(m => m.getDB());
    await db.delete('chats', msg.id);
    setMessages(prev => prev.filter(m => m.id !== msg.id));

    setIsTyping(true);
    setIsLoading(true);

    try {
      let state = getCharacterState(character.id);
      if (!state) {
        state = {
          characterId: character.id,
          mood: '平静',
          emotionalResidue: '平静',
          currentActivity: '闲着',
          stateUpdatedAt: Date.now(),
        };
      }

      const mcpTools = getConnectedMCPTools();
      const builder = ContextBuilder.create(character, state, userProfile, mcpTools, settings);
      const { messages: contextMessages, newState } = await builder.buildCoreContext(false, settings.chatHistoryRounds ?? 15);

      const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: contextMessages,
          temperature: 0.9,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error('[LLM 响应错误]', response.status, errorText);
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          characterId: character.id,
          role: 'assistant',
          content: `（重新生成失败：API 返回错误 ${response.status}）`,
          timestamp: Date.now(),
          isRegenerated: true,
        };
        await saveChatMessage(errorMsg);
        setMessages(prev => [...prev, errorMsg]);
        return;
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          characterId: character.id,
          role: 'assistant',
          content: '（重新生成失败：API 响应格式异常）',
          timestamp: Date.now(),
          isRegenerated: true,
        };
        await saveChatMessage(errorMsg);
        setMessages(prev => [...prev, errorMsg]);
        return;
      }

      let aiContent = data.choices[0].message.content;

      const parsed = parseAIResponse(aiContent);
      if (parsed.thought || parsed.valence !== undefined || parsed.arousal !== undefined) {
        aiContent = parsed.reply;
        const currentState = getCharacterState(character.id);
        if (currentState) {
          const newValence = parsed.valence !== undefined 
            ? smoothEmotion(currentState.valence ?? 0, parsed.valence, 0.3)
            : currentState.valence;
          const newArousal = parsed.arousal !== undefined
            ? smoothEmotion(currentState.arousal ?? 0.3, parsed.arousal, 0.3)
            : currentState.arousal;
          // 追加情感历史点（重roll 路径），供 EmotionChart 绘制曲线
          const regenTrigger = (messages.filter(m => m.role === 'user').pop()?.content || lastUserQueryRef.current || '重roll').slice(0, 50);
          const regenNow = Date.now();
          const regenHistory = [
            ...(currentState.emotionHistory || []),
            {
              valence: newValence ?? 0,
              arousal: newArousal ?? 0.3,
              timestamp: regenNow,
              trigger: regenTrigger,
            },
          ].slice(-50);
          await updateCharacterState(character.id, {
            ...currentState,
            valence: newValence,
            arousal: newArousal,
            innerMonologue: parsed.thought || currentState.innerMonologue,
            mood: deriveMood(newValence ?? 0, newArousal ?? 0.3),
            stateUpdatedAt: regenNow,
            emotionHistory: regenHistory,
          });
          setCurrentEmotion({ valence: newValence ?? 0, arousal: newArousal ?? 0.3 });
        }
      }

      aiContent = await handleToolCalls(aiContent);

      await updateCharacterState(character.id, newState);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        characterId: character.id,
        role: 'assistant',
        content: aiContent,
        timestamp: Date.now(),
        isRegenerated: true,
        poiData: poiDataRef.current,
        weatherData: weatherDataRef.current,
        innerMonologue: parsed.thought,
      };
      poiDataRef.current = undefined;
      weatherDataRef.current = undefined;
      await saveChatMessage(aiMsg);
      setMessages(prev => [...prev, aiMsg]);
    } catch (error: any) {
      console.error('[重roll 异常]', error);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        characterId: character.id,
        role: 'assistant',
        content: `（重新生成失败：${error.message || '网络错误'}）`,
        timestamp: Date.now(),
        isRegenerated: true,
      };
      await saveChatMessage(errorMsg);
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  const handleQuote = (msg: ChatMessage) => {
    setQuotingMsg(msg);
    inputRef.current?.focus();
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editText.trim()) return;
    const db = await import('@/db').then(m => m.getDB());
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const updated = { ...msg, content: editText.trim() };
    await db.put('chats', updated);
    setMessages(prev => prev.map(m => m.id === msgId ? updated : m));
    setEditingMsgId(null);
    setEditText('');
  };

  const handleMenuAction = (msg: ChatMessage, action: string) => {
    console.log('[handleMenuAction] action:', action, 'msg.id:', msg.id, 'hasImage:', !!msg.imageUrl);
    setOpenMenuMsgId(null);

    switch (action) {
      case 'copy':
        handleCopy(msg.content, msg.id);
        break;
      case 'favorite':
        handleFavorite(msg.id);
        break;
      case 'edit':
        setEditingMsgId(msg.id);
        setEditText(msg.content);
        break;
      case 'recall':
        handleRecall(msg.id);
        break;
      case 'quote':
        handleQuote(msg);
        break;
      case 'multiSelect':
        setIsMultiSelectMode(true);
        setSelectedIds(new Set([msg.id]));
        break;
      case 'regenerate':
        handleRegenerate(msg);
        break;
      case 'regenerate_image':
        handleRegenerateImage(msg);
        break;
      case 'delete_image':
        handleDeleteImage(msg);
        break;
      case 'delete':
        setDeleteTarget('single');
        setDeleteMsgId(msg.id);
        setShowDeleteConfirm(true);
        break;
    }
  };

  const toggleSelection = (msgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const selectable = messages.filter(m => m.role !== 'system').map(m => m.id);
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable));
    }
  };

  const exitMultiSelect = () => {
    setIsMultiSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteMulti = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget('multi');
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    setShowDeleteConfirm(false);
    const db = await import('@/db').then(m => m.getDB());
    const tx = db.transaction('chats', 'readwrite');

    if (deleteTarget === 'single' && deleteMsgId) {
      await tx.store.delete(deleteMsgId);
      setMessages(prev => prev.filter(m => m.id !== deleteMsgId));
    } else if (deleteTarget === 'multi') {
      for (const id of selectedIds) await tx.store.delete(id);
      setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
      exitMultiSelect();
    }
    await tx.done;
    setDeleteMsgId(null);
  };

  const handleClearChat = async () => {
    if (!activeCharacterId || !character) return;
    setShowClearConfirm(false);
    await deleteAllChats(activeCharacterId);
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMsgId) {
        handleSaveEdit(editingMsgId);
      } else {
        sendMessage();
      }
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const enabledMcpCount = mcpConnections.filter(c => c.enabled).length;
  const connectedMcpCount = mcpConnections.filter(c => {
    const state = mcpConnectionStates[c.id];
    return c.enabled && state?.status === 'connected';
  }).length;

  if (!character) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Bot size={48} className="text-white/20 mb-4" />
        <p className="text-white/40 text-lg">还没有角色</p>
        <button onClick={() => setCurrentApp('character')} className="glass-btn-primary mt-4">
          创建角色
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-gradient-to-b from-[#252540] via-[#1e2a45] to-[#1a3050] relative">
      {/* ==================== 顶部栏 ==================== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        {isMultiSelectMode ? (
          <div className="flex items-center gap-3 flex-1">
            <button onClick={exitMultiSelect} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} className="text-white/70" />
            </button>
            <span className="text-white/90 font-medium text-sm">已选 {selectedIds.size} 条</span>
            <button onClick={handleSelectAll} className="text-blue-400 text-sm ml-auto">
              {selectedIds.size === messages.filter(m => m.role !== 'system').length ? '取消全选' : '全选'}
            </button>
          </div>
        ) : (
          <>
            {/* 左侧：头像 + 角色信息 */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button onClick={() => setCurrentApp('desktop')} className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
  <ChevronLeft size={20} className="text-white/70" />
</button>

              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  {character.name[0]}
                </div>
                {/* 情感角标：颜色反映情绪，悬停看数值 */}
                {currentEmotion && (
                  <div 
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1a1a2e] z-10"
                    style={{ backgroundColor: getEmotionColor(currentEmotion.valence, currentEmotion.arousal) }}
                    title={`${deriveMood(currentEmotion.valence, currentEmotion.arousal)} (v:${currentEmotion.valence.toFixed(2)}, a:${currentEmotion.arousal.toFixed(2)})`}
                  />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-white/90 font-medium text-sm truncate">{character.name}</p>
                <p className="text-white/40 text-xs flex items-center gap-1.5">
                  {isTyping ? (
                    <span className="text-blue-400">正在输入...</span>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block flex-shrink-0" />
                      <span>在线</span>
                    </>
                  )}
                  {currentEmotion && (
                    <span 
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                      style={{ 
                        backgroundColor: `${getEmotionColor(currentEmotion.valence, currentEmotion.arousal)}20`,
                        color: getEmotionColor(currentEmotion.valence, currentEmotion.arousal)
                      }}
                    >
                      {deriveMood(currentEmotion.valence, currentEmotion.arousal)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 右侧：工具按钮 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {enabledMcpCount > 0 && (
                <button
                  onClick={() => setCurrentApp('mcp')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    connectedMcpCount > 0 
                      ? 'bg-green-500/10 text-green-400' 
                      : 'bg-white/5 text-white/30'
                  }`}
                  title="MCP 连接状态"
                >
                  <Wrench size={12} />
                  {connectedMcpCount}/{enabledMcpCount}
                </button>
              )}
              <button 
                onClick={async () => {
                  const data = await exportAllData();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `myos-backup-${new Date().toISOString().slice(0,10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="导出备份"
              >
                <Download size={16} className="text-white/50" />
              </button>
              <button onClick={() => setShowClearConfirm(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="清空对话">
                <Trash2 size={16} className="text-white/50" />
              </button>
              <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <Phone size={18} className="text-white/60" />
              </button>
              <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <MoreVertical size={18} className="text-white/60" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ==================== 消息列表 ==================== */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <Bot size={40} className="mb-3 opacity-50" />
            <p className="text-sm">开始和 {character.name} 聊天吧</p>
            {character.affection !== undefined && character.affection <= 15 && (
              <p className="text-white/20 text-xs mt-2">你们还不太熟，{character.name} 会比较客气</p>
            )}
            {connectedMcpCount > 0 && (
              <p className="text-green-400/40 text-xs mt-1 flex items-center gap-1">
                <Wrench size={10} />
                {connectedMcpCount} 个 MCP 工具可用
              </p>
            )}
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="text-center my-2">
                <span className="text-white/25 text-xs bg-white/5 px-3 py-1 rounded-full">{msg.content}</span>
              </div>
            );
          }

          return (
            <div key={msg.id}>
              <div className="text-center my-1">
                <span className="text-white/40 text-[10px]">{formatTime(msg.timestamp)}</span>
              </div>
              <MessageBubble
                msg={msg}
                characterName={character.name}
                imageUrl={msg.imageUrl}
                isMenuOpen={openMenuMsgId === msg.id}
                isMultiSelectMode={isMultiSelectMode}
                isSelected={selectedIds.has(msg.id)}
                isEditing={editingMsgId === msg.id}
                editText={editText}
                copyFeedback={copyFeedbackId === msg.id}
                favoriteFeedback={favoriteFeedbackId === msg.id}
                onToggleMenu={() => {
                  setOpenMenuMsgId(openMenuMsgId === msg.id ? null : msg.id);
                }}
                onCloseMenu={() => setOpenMenuMsgId(null)}
                onToggleSelect={() => toggleSelection(msg.id)}
                onMenuAction={(action) => handleMenuAction(msg, action)}
                onStartEdit={() => { setEditingMsgId(msg.id); setEditText(msg.content); }}
                onSaveEdit={() => handleSaveEdit(msg.id)}
                onCancelEdit={() => { setEditingMsgId(null); setEditText(''); }}
                onEditChange={setEditText}
              />
            </div>
          );
        })}

        {isToolCalling && (
          <ToolCallIndicator toolName={currentToolName} />
        )}

        {isTyping && !isToolCalling && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {character.name[0]}
            </div>
            <div className="message-bubble-ai py-3 px-4">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ==================== 多选模式底部栏 ==================== */}
      {isMultiSelectMode && (
        <div className="dock-blur px-4 py-3 flex items-center justify-center border-t border-white/5 flex-shrink-0">
          <button
            onClick={handleDeleteMulti}
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl transition-all ${
              selectedIds.size === 0 
                ? 'opacity-30 cursor-not-allowed text-white/50' 
                : 'hover:bg-red-500/20 text-red-400 bg-red-500/10'
            }`}
          >
            <Trash2 size={18} />
            <span className="text-sm font-medium">删除 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
          </button>
        </div>
      )}

      {/* ==================== 普通输入框 ==================== */}
      {!isMultiSelectMode && (
        <div className="flex-shrink-0">
          {quotingMsg && (
            <div className="mx-4 mt-2 mb-1 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5 flex items-center gap-2">
              <Quote size={12} className="text-blue-400 flex-shrink-0" />
              <p className="text-white/50 text-xs truncate flex-1">
                {quotingMsg.role === 'user' ? '用户' : character.name}: {quotingMsg.content.slice(0, 50)}{quotingMsg.content.length > 50 ? '...' : ''}
              </p>
              <button onClick={() => setQuotingMsg(null)} className="p-0.5 rounded-full hover:bg-white/10 flex-shrink-0">
                <X size={12} className="text-white/40" />
              </button>
            </div>
          )}
                     <div className="px-4 py-2 border-t border-white/5">
             <div className="flex items-center gap-2 bg-white/[0.07] backdrop-blur-2xl rounded-full px-4 py-1.5 border border-white/[0.08]">
               <input
                 ref={inputRef}
                 type="text"
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 onKeyDown={handleKeyDown}
                 placeholder={quotingMsg ? '回复引用...' : '输入消息...'}
                 className="flex-1 bg-transparent border-none outline-none text-white/80 text-sm placeholder-white/30"
               />
               <button
                 onClick={sendMessage}
                 disabled={!inputText.trim() || isTyping || isToolCalling}
                 className={'w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ' + (inputText.trim() && !isTyping && !isToolCalling ? 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/30' : 'bg-white/5 cursor-not-allowed')}
               >
                 <Send size={16} className="text-white" />
               </button>
             </div>
           </div>
        </div>
      )}

      {/* ==================== 清空对话确认弹窗 ==================== */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-xs mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-yellow-400" />
              <h3 className="text-white/90 font-medium">清空对话</h3>
            </div>
            <p className="text-white/50 text-sm mb-6">确定要清空和 {character.name} 的所有聊天记录吗？此操作不可恢复。</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="glass-btn flex-1">取消</button>
              <button onClick={handleClearChat} className="glass-btn bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 flex-1">清空</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 删除确认弹窗 ==================== */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-xs mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400" />
              <h3 className="text-white/90 font-medium">{deleteTarget === 'multi' ? '删除 ' + selectedIds.size + ' 条消息' : '删除消息'}</h3>
            </div>
            <p className="text-white/50 text-sm mb-6">{deleteTarget === 'multi' ? '确定要删除选中的消息吗？此操作不可恢复。' : '确定要删除这条消息吗？此操作不可恢复。'}</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteMsgId(null); }} className="glass-btn flex-1">取消</button>
              <button onClick={executeDelete} className="glass-btn bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 flex-1">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 存储限额警告（阶段 4 新增）==================== */}
      {imageSizeWarning && (
        <div className="absolute bottom-20 left-4 right-4 z-40">
          <div className="glass-card bg-yellow-500/10 border-yellow-500/30 p-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-300/80 text-xs flex-1">{imageSizeWarning}</p>
            <button 
              onClick={() => setImageSizeWarning('')}
              className="text-yellow-400/60 hover:text-yellow-400 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
