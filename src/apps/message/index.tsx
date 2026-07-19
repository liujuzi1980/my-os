import { useState, useRef, useEffect, useCallback } from 'react';
import { useOSStore } from '@/context/OSStore';
import { getChatsByCharacter, saveChatMessage, deleteAllChats, exportAllData } from '@/db';
import { ContextBuilder } from '@/core/ContextBuilder';
import { MemoryEngine } from '@/core/MemoryEngine';
import { mcpManager } from '@/core/MCPClientManager';
import { 
  Send, Image, Phone, ChevronLeft, MoreVertical, Bot, 
  RotateCcw, Trash2, Copy, X, AlertTriangle, Check,
  Quote, Edit3, Star, Layers, ArrowLeft, Download,
  Wrench, Loader2
} from 'lucide-react';
import type { ChatMessage, MessageRole } from '@/types';
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
  { key: 'multiSelect', label: '多选', icon: <Layers size={15} /> },
  { key: 'delete', label: '删除', icon: <Trash2 size={15} />, danger: true },
];

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
}

function MessageBubble({
  msg, characterName, isMenuOpen, isMultiSelectMode, isSelected,
  isEditing, editText, copyFeedback, favoriteFeedback,
  onToggleMenu, onCloseMenu, onToggleSelect, onMenuAction,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange,
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
  }, [isMenuOpen]);

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
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{cleanToolBlocks(msg.content)}</p>
              {msg.isRegenerated && (
                <span className="text-[10px] text-yellow-400/60 mt-1 block">已重新生成</span>
              )}
            </div>
            {/* POI 卡片 */}
            {msg.poiData && msg.poiData.length > 0 && (
              <div className="mt-2 space-y-1.5">
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
              <div className="mt-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 rounded-xl p-3">
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
  // 缓存最近一次 geocode 结果，用于自动补调周边搜索或修正 AI 传错的坐标
  const lastGeocodeRef = useRef<{ lng: number; lat: number } | null>(null);
  // 缓存当前用户查询内容（绕过 React 状态异步，确保自动补调能读到正确的关键词）
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const isFirstMessageRef = useRef(true);

  const character = getActiveCharacter();

  // 加载聊天记录 + 更新离线时间 + 加载角色状态
  useEffect(() => {
    if (activeCharacterId && character && !initializedRef.current) {
      initializedRef.current = true;
      loadMessages();
      const updated = ContextBuilder.updateLastVisit(character);
      updateCharacter(updated);
    }
  }, [activeCharacterId]);

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

  const callLLM = async (extraSystemMessages?: Array<{ role: string; content: string }>): Promise<{ content: string | null; error?: string }> => {
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
      const builder = ContextBuilder.create(character, state, userProfile, mcpTools);
      const { messages: contextMessages, newState } = await builder.buildCoreContext(isFirstMessage, 15);

      // === 注入高德地图工具描述和系统提示 ===
      const systemIndex = contextMessages.findLastIndex(m => m.role === 'system');
      if (systemIndex >= 0) {
        // 工具描述只在初次调用时注入（没有额外系统消息时认为是初次）
        if (!extraSystemMessages || extraSystemMessages.length === 0) {
          const amapDesc = getAmapToolDescriptions();
          contextMessages.splice(systemIndex + 1, 0, { role: 'system', content: amapDesc });
        }
        // 系统提示每次都要注入，确保 AI 知道如何基于工具结果回复用户
        const lastSystemIndex = contextMessages.findLastIndex(m => m.role === 'system');
        contextMessages.splice(lastSystemIndex + 1, 0, {
          role: 'system',
          content: `【地图工具使用原则】
1. 查地点坐标用 amap_geocode，搜周边用 amap_search_nearby。
2. 搜周边时 location 参数必须用 geocode 返回的坐标，不要猜。
3. 高德对商场内部店铺覆盖不全，如实汇报搜索结果即可，搜不到就直说。`
        });
      }

      // 如果有额外的系统消息（如工具调用结果），插入到最后一条系统消息之后
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

      // 更新状态时间戳
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
      // === 高德地图工具（直接 API 调用，不走 MCP）===
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

          // ===== 保存 geocode 结果，并自动补调周边搜索 =====
          if (toolCall.toolName === 'amap_geocode') {
            const r = result as any;
            if (r.location) {
              const [lng, lat] = String(r.location).split(',').map(Number);
              if (!isNaN(lng) && !isNaN(lat)) {
                lastGeocodeRef.current = { lng, lat };
              }
            }

            // 判断用户是否在问周边/里面有什么（通用匹配，不硬编码关键词）
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

              // 保存 POI 卡片数据（最多10条，让AI自己筛选）
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

          // ===== 防御性修正 search_nearby 的坐标（如果 AI 自己调了）=====
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

            // 保存 POI 卡片数据
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

          // 保存天气卡片数据
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

      // 查找对应的 connectionId（如果未指定，尝试在所有已连接中查找）
      let targetConnectionId = toolCall.connectionId;

      if (!targetConnectionId) {
        // 尝试通过工具名查找连接
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

    // 如果有工具调用结果，再次请求 LLM 生成最终回复
    if (extraSystemMessages.length > 0) {
      const { content: finalContent, error } = await callLLM(extraSystemMessages);
      if (finalContent) {
        return finalContent;
      }
      if (error) {
        return `${text}\n\n（工具调用后处理失败：${error}）`;
      }
    }

    return text;
  };

  // ==================== 发送消息 ====================

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !character || !settings.apiKey) return;

    let content = inputText.trim();
    if (quotingMsg) {
      content = `[引用 ${quotingMsg.role === 'user' ? '用户' : character.name}: ${quotingMsg.content.slice(0, 50)}${quotingMsg.content.length > 50 ? '...' : ''}]\n${content}`;
      setQuotingMsg(null);
    }

    setInputText('');

    // 缓存当前用户查询，供自动补调逻辑读取（避免 React 状态异步导致读到旧消息）
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

    const { content: aiContent, error } = await callLLM();

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

    // 处理可能的工具调用
    const finalContent = await handleToolCalls(aiContent);

    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      poiData: poiDataRef.current,
      weatherData: weatherDataRef.current,
    };
    poiDataRef.current = undefined;
    weatherDataRef.current = undefined;
    await saveChatMessage(aiMsg);
    setMessages(prev => [...prev, aiMsg]);

    // 第一条消息已处理，后续不再注入离线感知
    isFirstMessageRef.current = false;

    // [MEMORY] 异步脱水
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
  }, [inputText, character, settings, activeCharacterId, quotingMsg, userProfile, getCharacterState, updateCharacterState, mcpConnections, mcpConnectionStates]);

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

  // ==================== 重roll（重新生成）====================

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
      const builder = ContextBuilder.create(character, state, userProfile, mcpTools);
      const { messages: contextMessages, newState } = await builder.buildCoreContext(false, 15);

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

      // 处理可能的工具调用
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

  // 获取已启用的 MCP 连接数
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
    <div className="flex flex-col h-full bg-gradient-to-b from-[#1a1a2e]/50 to-transparent relative">
      {/* 顶部栏 */}
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
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentApp('character')} className="p-1.5 rounded-full hover:bg-white/10 transition-colors lg:hidden">
                <ChevronLeft size={20} className="text-white/70" />
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {character.name[0]}
              </div>
              <div>
                <p className="text-white/90 font-medium text-sm">{character.name}</p>
                <p className="text-white/40 text-xs flex items-center gap-1">
                  {isTyping ? '正在输入...' : <><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />在线</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* MCP 状态指示 */}
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4">
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

        {messages.map((msg, index) => {
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
                <span className="text-white/20 text-[10px]">{formatTime(msg.timestamp)}</span>
              </div>
              <MessageBubble
                msg={msg}
                characterName={character.name}
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

        {/* 工具调用中指示器 */}
        {isToolCalling && (
          <ToolCallIndicator toolName={currentToolName} />
        )}

        {/* AI 输入中指示器 */}
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

      {/* 多选模式底部操作栏 */}
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

      {/* 普通输入框 */}
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
          <div className="px-4 py-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                <Image size={20} className="text-white/50" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={quotingMsg ? '回复引用...' : '输入消息...'}
                className="glass-input flex-1 text-sm"
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || isTyping || isToolCalling}
                className={`p-2.5 rounded-full transition-all flex-shrink-0 ${inputText.trim() && !isTyping && !isToolCalling ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90' : 'bg-white/5 cursor-not-allowed'}`}
              >
                <Send size={18} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空对话确认弹窗 */}
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

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-xs mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400" />
              <h3 className="text-white/90 font-medium">{deleteTarget === 'multi' ? `删除 ${selectedIds.size} 条消息` : '删除消息'}</h3>
            </div>
            <p className="text-white/50 text-sm mb-6">{deleteTarget === 'multi' ? '确定要删除选中的消息吗？此操作不可恢复。' : '确定要删除这条消息吗？此操作不可恢复。'}</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteMsgId(null); }} className="glass-btn flex-1">取消</button>
              <button onClick={executeDelete} className="glass-btn bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 flex-1">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
