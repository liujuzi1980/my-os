import { useState, useRef, useEffect, useCallback } from 'react';
import { useOSStore } from '@/context/OSStore';
import { getChatsByCharacter, saveChatMessage, deleteAllChats, exportAllData } from '@/db';
import { ContextBuilder } from '@/core/ContextBuilder';
import { MemoryEngine } from '@/core/MemoryEngine';
import { 
  Send, Image, Phone, ChevronLeft, MoreVertical, Bot, 
  RotateCcw, Trash2, Copy, X, AlertTriangle, Check,
  Quote, Edit3, Star, Layers, ArrowLeft, Download
} from 'lucide-react';
import type { ChatMessage, MessageRole } from '@/types';

// ==================== 类型定义 ====================

interface MessageMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
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
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            {msg.isRegenerated && (
              <span className="text-[10px] text-yellow-400/60 mt-1 block">已重新生成</span>
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
  } = useOSStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [openMenuMsgId, setOpenMenuMsgId] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  }, [messages, isTyping]);

  const loadMessages = async () => {
    if (!activeCharacterId) return;
    const chats = await getChatsByCharacter(activeCharacterId, 100);
    setMessages(chats);
  };

  // ==================== LLM 调用（简化版）====================

  const callLLM = async (): Promise<{ content: string | null; error?: string }> => {
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
      const builder = ContextBuilder.create(character, state, userProfile);
      const { messages: contextMessages, newState } = await builder.buildCoreContext(isFirstMessage, 15);

      console.log('[LLM 请求]', {
        url: settings.apiBaseUrl,
        model: settings.model,
        messageCount: contextMessages.length,
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

  // ==================== 发送消息 ====================

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !character || !settings.apiKey) return;

    let content = inputText.trim();
    if (quotingMsg) {
      content = `[引用 ${quotingMsg.role === 'user' ? '用户' : character.name}: ${quotingMsg.content.slice(0, 50)}${quotingMsg.content.length > 50 ? '...' : ''}]\n${content}`;
      setQuotingMsg(null);
    }

    setInputText('');

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

    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'assistant',
      content: aiContent,
      timestamp: Date.now(),
    };
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
  }, [inputText, character, settings, activeCharacterId, quotingMsg, userProfile, getCharacterState, updateCharacterState]);

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

    // 删除这条AI消息
    const db = await import('@/db').then(m => m.getDB());
    await db.delete('chats', msg.id);
    setMessages(prev => prev.filter(m => m.id !== msg.id));

    // 标记为重新生成
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

      // 重roll时不是第一条消息，不注入离线感知
      const builder = ContextBuilder.create(character, state, userProfile);
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
          temperature: 0.9, // 重roll时提高temperature让回复更不同
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

      const aiContent = data.choices[0].message.content;

      // 更新状态时间戳
      await updateCharacterState(character.id, newState);

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        characterId: character.id,
        role: 'assistant',
        content: aiContent,
        timestamp: Date.now(),
        isRegenerated: true,
      };
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

        {isTyping && (
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
                disabled={!inputText.trim() || isTyping}
                className={`p-2.5 rounded-full transition-all flex-shrink-0 ${inputText.trim() && !isTyping ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90' : 'bg-white/5 cursor-not-allowed'}`}
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
