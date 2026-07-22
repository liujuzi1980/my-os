import { useState, useEffect, useCallback } from 'react';
import { useOSStore } from '@/context/OSStore';
import { getAllMemoriesForCharacter, updateMemoryPartial } from '@/db';
import { deriveMood } from '@/core/EmotionUtils';
import { 
  Brain, Search, Pin, CheckCircle2, Archive, 
  ChevronDown, ChevronUp, Edit3, X, Save,
  SlidersHorizontal
} from 'lucide-react';
import type { MemoryEntry } from '@/types';
import MemoryEditor from './MemoryEditor';
import EmotionChart from './EmotionChart';

// ==================== 领域配置 ====================

const DOMAINS = [
  { key: 'relationship', label: '关系', color: '#ec4899' },
  { key: 'work', label: '工作', color: '#3b82f6' },
  { key: 'hobby', label: '爱好', color: '#10b981' },
  { key: 'daily', label: '日常', color: '#f59e0b' },
  { key: 'promise', label: '约定', color: '#8b5cf6' },
  { key: 'unknown', label: '其他', color: '#6b7280' },
];

function getDomainConfig(domain?: string) {
  return DOMAINS.find(d => d.key === domain) || DOMAINS[DOMAINS.length - 1];
}

// ==================== 情感颜色 ====================

function getEmotionColor(valence: number, arousal: number): string {
  if (valence > 0.3 && arousal > 0.5) return '#f59e0b'; // 兴奋
  if (valence > 0.3 && arousal <= 0.5) return '#10b981'; // 满足
  if (valence > 0 && arousal > 0.5) return '#8b5cf6';    // 期待
  if (valence <= 0 && arousal > 0.5) return '#ef4444';   // 焦虑
  if (valence < -0.3 && arousal > 0.5) return '#dc2626'; // 愤怒
  if (valence < -0.3 && arousal <= 0.5) return '#6b7280'; // 沮丧
  if (valence < 0 && arousal <= 0.5) return '#64748b';   // 疲惫
  return '#3b82f6'; // 平静
}

// ==================== 记忆权重计算（简化版）====================

function calculateWeight(memory: MemoryEntry): number {
  if (memory.pinned || memory.isPinned) return 9999;
  if (memory.archived) return 0.1;

  const daysSinceTouch = (Date.now() - (memory.lastAccessed || memory.createdAt)) / (1000 * 60 * 60 * 24);
  const stability = 1 + (memory.arousal || 0.3) * 2 + ((memory.importance || 5) / 10);
  const retention = Math.exp(-0.05 * daysSinceTouch / stability);

  let weight = (memory.importance || 5) * retention;
  if (!(memory.resolved ?? false)) weight *= 1.5;
  if (daysSinceTouch < 1) weight *= 1.2;

  return weight;
}

// ==================== 主组件 ====================

export default function MemoryApp() {
  const { activeCharacterId, getActiveCharacter } = useOSStore();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'chart'>('list');
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(['daily']));
  const [loading, setLoading] = useState(true);

  const character = getActiveCharacter();

  // 加载记忆
  const loadMemories = useCallback(async () => {
    if (!activeCharacterId) {
      setMemories([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getAllMemoriesForCharacter(activeCharacterId);
      setMemories(data);
    } catch (e) {
      console.error('[MemoryApp] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // 过滤记忆
  const filteredMemories = memories.filter(m => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.content.toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (m.domain || '').toLowerCase().includes(q)
    );
  });

  // 按领域分组
  const groupedMemories = filteredMemories.reduce((groups, m) => {
    const domain = m.domain || 'unknown';
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(m);
    return groups;
  }, {} as Record<string, MemoryEntry[]>);

  // 每组内按权重排序（钉选置顶）
  Object.keys(groupedMemories).forEach(domain => {
    groupedMemories[domain].sort((a, b) => {
      const wa = calculateWeight(a);
      const wb = calculateWeight(b);
      return wb - wa;
    });
  });

  // 切换领域展开
  const toggleDomain = (domain: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  // 保存编辑
  const handleSave = async (updated: MemoryEntry) => {
    try {
      await updateMemoryPartial(updated.id, {
        content: updated.content,
        valence: updated.valence,
        arousal: updated.arousal,
        importance: updated.importance,
        domain: updated.domain,
        tags: updated.tags,
        pinned: updated.pinned,
        resolved: updated.resolved,
        archived: updated.archived,
      });
      // 乐观更新
      setMemories(prev => prev.map(m => m.id === updated.id ? updated : m));
      setEditingMemory(null);
    } catch (e) {
      console.error('[MemoryApp] save failed:', e);
    }
  };

  if (!character) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-white/40">
        <Brain size={48} className="mb-4 opacity-40" />
        <p className="text-sm">请先选择一个角色</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-purple-400" />
          <h1 className="text-white/90 text-base font-semibold">记忆管理</h1>
          <span className="text-white/30 text-xs ml-1">{character.name}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 rounded-md text-xs transition-all ${
              activeTab === 'list' ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/60'
            }`}
          >
            记忆列表
          </button>
          <button
            onClick={() => setActiveTab('chart')}
            className={`px-3 py-1.5 rounded-md text-xs transition-all ${
              activeTab === 'chart' ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/60'
            }`}
          >
            情感曲线
          </button>
        </div>
      </div>

      {/* 内容区 */}
      {activeTab === 'list' && (
        <div className="flex-1 overflow-y-auto">
          {/* 搜索框 */}
          <div className="px-4 py-3 sticky top-0 bg-[#1a1a2e]/95 backdrop-blur-sm z-10 border-b border-white/5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索记忆内容、标签..."
                className="glass-input w-full pl-9 pr-4 py-2 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/30 text-xs">
                共 {filteredMemories.length} 条记忆
              </span>
              <span className="text-white/20 text-xs">
                钉选 {memories.filter(m => m.pinned || m.isPinned).length} · 
                未解决 {memories.filter(m => !(m.resolved ?? false)).length}
              </span>
            </div>
          </div>

          {/* 记忆列表 */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-white/30 text-sm">加载中...</div>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/30">
              <Archive size={32} className="mb-2 opacity-40" />
              <p className="text-sm">暂无记忆</p>
              <p className="text-xs text-white/20 mt-1">和角色聊天后，记忆会自动生成</p>
            </div>
          ) : (
            <div className="px-4 py-2 space-y-2">
              {DOMAINS.map(({ key, label, color }) => {
                const domainMemories = groupedMemories[key] || [];
                if (domainMemories.length === 0) return null;

                const isExpanded = expandedDomains.has(key);

                return (
                  <div key={key} className="rounded-xl overflow-hidden">
                    {/* 领域标题 */}
                    <button
                      onClick={() => toggleDomain(key)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 hover:bg-white/8 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-white/70 text-sm font-medium">{label}</span>
                        <span className="text-white/30 text-xs">({domainMemories.length})</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-white/40" />
                      ) : (
                        <ChevronDown size={14} className="text-white/40" />
                      )}
                    </button>

                    {/* 记忆条目 */}
                    {isExpanded && (
                      <div className="divide-y divide-white/5">
                        {domainMemories.map((memory) => {
                          const v = memory.valence ?? memory.emotion?.valence ?? 0;
                          const a = memory.arousal ?? memory.emotion?.arousal ?? 0.3;
                          const emotionColor = getEmotionColor(v, a);
                          const weight = calculateWeight(memory);
                          const isPinned = memory.pinned || memory.isPinned;
                          const isResolved = memory.resolved ?? false;
                          const isArchived = memory.archived || memory.status === 'archived';

                          return (
                            <button
                              key={memory.id}
                              onClick={() => setEditingMemory(memory)}
                              className={`
                                w-full flex items-start gap-3 px-3 py-3 text-left transition-colors
                                ${isArchived ? 'opacity-40' : 'hover:bg-white/5'}
                              `}
                            >
                              {/* 情感圆点 */}
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: emotionColor }}
                                title={`${deriveMood(v, a)} (v:${v.toFixed(2)}, a:${a.toFixed(2)})`}
                              />

                              {/* 内容 */}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${isArchived ? 'line-through text-white/30' : 'text-white/80'}`}>
                                  {memory.content}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {/* 重要性 */}
                                  <div className="flex items-center gap-0.5">
                                    {Array.from({ length: 10 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`w-1 h-3 rounded-full ${
                                          i < (memory.importance || 5) ? 'bg-yellow-400/60' : 'bg-white/10'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  {/* 状态标签 */}
                                  {isPinned && (
                                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                      <Pin size={8} /> 钉选
                                    </span>
                                  )}
                                  {!isResolved && (
                                    <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
                                      未解决
                                    </span>
                                  )}
                                  {isArchived && (
                                    <span className="text-[10px] bg-gray-500/20 text-gray-300 px-1.5 py-0.5 rounded">
                                      已归档
                                    </span>
                                  )}
                                  {/* 权重分数 */}
                                  <span className="text-[10px] text-white/20 ml-auto">
                                    {weight > 100 ? '∞' : weight.toFixed(1)}
                                  </span>
                                </div>
                                {/* 标签 */}
                                {(memory.tags || []).length > 0 && (
                                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                    {memory.tags?.map(tag => (
                                      <span
                                        key={tag}
                                        className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded"
                                      >
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 编辑图标 */}
                              <Edit3 size={14} className="text-white/20 flex-shrink-0 mt-1" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 情感曲线 Tab */}
      {activeTab === 'chart' && (
        <div className="flex-1 overflow-y-auto">
          <EmotionChart />
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingMemory && (
        <MemoryEditor
          memory={editingMemory}
          onSave={handleSave}
          onClose={() => setEditingMemory(null)}
        />
      )}
    </div>
  );
}