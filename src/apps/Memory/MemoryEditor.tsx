import { useState, useEffect } from 'react';
import { deriveMood, getEmotionColor } from '@/core/EmotionUtils';
import { 
  X, Save, Pin, CheckCircle2, Archive, 
  Tag, SlidersHorizontal, BrainCircuit, ChevronLeft
} from 'lucide-react';
import type { MemoryEntry } from '@/types';

interface MemoryEditorProps {
  memory: MemoryEntry;
  onSave: (updated: MemoryEntry) => void;
  onClose: () => void;
}

const DOMAINS = [
  { key: 'relationship', label: '关系' },
  { key: 'work', label: '工作' },
  { key: 'hobby', label: '爱好' },
  { key: 'daily', label: '日常' },
  { key: 'promise', label: '约定' },
];



export default function MemoryEditor({ memory, onSave, onClose }: MemoryEditorProps) {
  const [content, setContent] = useState(memory.content);
  const [valence, setValence] = useState(memory.valence ?? memory.emotion?.valence ?? 0);
  const [arousal, setArousal] = useState(memory.arousal ?? memory.emotion?.arousal ?? 0.3);
  const [importance, setImportance] = useState(memory.importance || 5);
  const [domain, setDomain] = useState(memory.domain || 'daily');
  const [tags, setTags] = useState((memory.tags || []).join(', '));
  const [pinned, setPinned] = useState(memory.pinned || memory.isPinned || false);
  const [resolved, setResolved] = useState(memory.resolved ?? false);
  const [archived, setArchived] = useState(memory.archived || memory.status === 'archived' || false);
  const [isSaving, setIsSaving] = useState(false);

  // 实时情绪标签
  const mood = deriveMood(valence, arousal);
  const emotionColor = getEmotionColor(valence, arousal);

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = async () => {
    setIsSaving(true);
    const updated: MemoryEntry = {
      ...memory,
      content: content.trim(),
      valence,
      arousal,
      importance,
      domain,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      pinned,
      resolved,
      archived,
      emotion: { valence, arousal },
      lastAccessed: Date.now(),
    };
    await onSave(updated);
    setIsSaving(false);
  };

  return (
    <div 
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md bg-[#1e1e2e] rounded-t-2xl border-t border-white/10 shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#1e1e2e] z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={20} className="text-white/70" />
            </button>
            <div className="flex items-center gap-2">
              <BrainCircuit size={18} className="text-purple-400" />
              <h2 className="text-white/90 text-base font-semibold">编辑记忆</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {isSaving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} className="text-white/50" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 内容 */}
          <div>
            <label className="text-white/50 text-xs block mb-1.5">记忆内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="glass-input w-full text-sm resize-none"
              placeholder="记忆内容..."
            />
          </div>

          {/* 情感坐标 */}
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal size={14} className="text-white/40" />
              <span className="text-white/60 text-xs">情感坐标</span>
              <span 
                className="text-xs font-medium px-2 py-0.5 rounded-full ml-auto"
                style={{ 
                  backgroundColor: `${emotionColor}22`,
                  color: emotionColor 
                }}
              >
                {mood}
              </span>
            </div>

            {/* Valence */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/40 text-xs">效价 (valence)</span>
                <span className="text-white/60 text-xs font-mono">{valence.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={valence}
                onChange={(e) => setValence(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ef4444 ${(1 + valence) / 2 * 100}%, #3b82f6 ${(1 + valence) / 2 * 100}%)`,
                }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-white/20 text-[10px]">负面</span>
                <span className="text-white/20 text-[10px]">中性</span>
                <span className="text-white/20 text-[10px]">正面</span>
              </div>
            </div>

            {/* Arousal */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/40 text-xs">唤醒度 (arousal)</span>
                <span className="text-white/60 text-xs font-mono">{arousal.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={arousal}
                onChange={(e) => setArousal(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${arousal * 100}%, #1e293b ${arousal * 100}%)`,
                }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-white/20 text-[10px]">平静</span>
                <span className="text-white/20 text-[10px]">激烈</span>
              </div>
            </div>
          </div>

          {/* 重要性 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-white/50 text-xs">重要性</label>
              <span className="text-white/60 text-xs font-mono">{importance}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={importance}
              onChange={(e) => setImportance(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #eab308 ${importance * 10}%, rgba(255,255,255,0.1) ${importance * 10}%)`,
              }}
            />
            <div className="flex justify-between mt-0.5">
              <span className="text-white/20 text-[10px]">不重要</span>
              <span className="text-white/20 text-[10px]">极其重要</span>
            </div>
          </div>

          {/* 领域 */}
          <div>
            <label className="text-white/50 text-xs block mb-1.5">领域</label>
            <div className="grid grid-cols-3 gap-2">
              {DOMAINS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDomain(key)}
                  className={`px-3 py-2 rounded-lg text-xs transition-all ${
                    domain === key
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="text-white/50 text-xs block mb-1.5 flex items-center gap-1">
              <Tag size={10} /> 标签（逗号分隔）
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="例如：重要, 工作, 待办"
              className="glass-input w-full text-sm"
            />
          </div>

          {/* 开关组 */}
          <div className="space-y-3">
            {/* 钉选 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin size={14} className="text-purple-400" />
                <span className="text-white/60 text-sm">钉选记忆</span>
                <span className="text-white/20 text-[10px]">永不衰减</span>
              </div>
              <button
                onClick={() => setPinned(!pinned)}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  pinned ? 'bg-purple-500' : 'bg-white/20'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                  pinned ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* 已解决 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400" />
                <span className="text-white/60 text-sm">已解决</span>
                <span className="text-white/20 text-[10px]">降低权重</span>
              </div>
              <button
                onClick={() => setResolved(!resolved)}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  resolved ? 'bg-green-500' : 'bg-white/20'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                  resolved ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* 归档 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={14} className="text-gray-400" />
                <span className="text-white/60 text-sm">归档</span>
                <span className="text-white/20 text-[10px]">极低权重</span>
              </div>
              <button
                onClick={() => setArchived(!archived)}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  archived ? 'bg-gray-500' : 'bg-white/20'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                  archived ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>
          </div>

          {/* 元信息 */}
          <div className="glass-card p-3 space-y-1">
            <p className="text-white/20 text-[10px]">
              创建时间：{new Date(memory.createdAt).toLocaleString('zh-CN')}
            </p>
            <p className="text-white/20 text-[10px]">
              最后访问：{new Date(memory.lastAccessed).toLocaleString('zh-CN')}
            </p>
            {memory.lastSurfaced && (
              <p className="text-white/20 text-[10px]">
                上次浮现：{new Date(memory.lastSurfaced).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
