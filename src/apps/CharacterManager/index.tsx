import { useState } from 'react';
import { useOSStore } from '@/context/OSStore';
import { saveCharacter, deleteCharacter } from '@/db';
import { 
  Plus, Trash2, Edit3, MessageCircle, X, Bot, Sparkles, Heart,
  Frown, Meh, Smile, HeartCrack
} from 'lucide-react';
import type { Character, RelationshipStage } from '@/types';

const RELATIONSHIP_STAGES: { value: RelationshipStage; label: string; desc: string }[] = [
  { value: 'stranger', label: '陌生人', desc: '礼貌疏离，边界感强' },
  { value: 'acquaintance', label: '刚认识', desc: '偶尔闲聊，仍有距离' },
  { value: 'friend', label: '熟人', desc: '互损玩笑，分享日常' },
  { value: 'close', label: '好朋友', desc: '分享脆弱，高度接纳' },
  { value: 'intimate', label: '亲密', desc: '彼此依赖，最放松的存在' },
];

function getAffectionIcon(affection: number) {
  if (affection <= 15) return <Frown size={16} className="text-gray-400" />;
  if (affection <= 35) return <Meh size={16} className="text-yellow-400" />;
  if (affection <= 55) return <Smile size={16} className="text-green-400" />;
  if (affection <= 75) return <Heart size={16} className="text-pink-400" />;
  return <HeartCrack size={16} className="text-red-400" />;
}

function getAffectionColor(affection: number): string {
  if (affection <= 15) return 'from-gray-500 to-gray-600';
  if (affection <= 35) return 'from-yellow-500 to-orange-500';
  if (affection <= 55) return 'from-green-500 to-emerald-500';
  if (affection <= 75) return 'from-pink-500 to-rose-500';
  return 'from-red-500 to-pink-500';
}

function getAffectionLabel(affection: number): string {
  if (affection <= 15) return '陌生人';
  if (affection <= 35) return '刚认识';
  if (affection <= 55) return '熟人';
  if (affection <= 75) return '好朋友';
  return '亲密无间';
}

export default function CharacterManagerApp() {
  const { characters, activeCharacterId, setActiveCharacter, addCharacter, removeCharacter, setCurrentApp } = useOSStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Partial<Character>>({});
  const [activeTab, setActiveTab] = useState<'basic' | 'memory' | 'status'>('basic');

  const handleNewCharacter = () => {
    setEditingCharacter({
      id: crypto.randomUUID(),
      name: '',
      systemPrompt: '',
      worldview: '',
      personality: '',
      affection: 0,
      relationshipStage: 'stranger',
      currentEmotion: '',
      currentStatus: '',
      memorySummary: '',
      impression: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setActiveTab('basic');
    setIsEditing(true);
  };

  const handleEdit = (char: Character) => {
    setEditingCharacter({ ...char });
    setActiveTab('basic');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingCharacter.name?.trim() || !editingCharacter.systemPrompt?.trim()) {
      alert('请填写角色名称和设定');
      return;
    }

    const char: Character = {
      id: editingCharacter.id || crypto.randomUUID(),
      name: editingCharacter.name.trim(),
      systemPrompt: editingCharacter.systemPrompt.trim(),
      worldview: editingCharacter.worldview?.trim(),
      personality: editingCharacter.personality?.trim(),
      affection: editingCharacter.affection ?? 0,
      relationshipStage: editingCharacter.relationshipStage || 'stranger',
      currentEmotion: editingCharacter.currentEmotion?.trim(),
      currentStatus: editingCharacter.currentStatus?.trim(),
      memorySummary: editingCharacter.memorySummary?.trim(),
      impression: editingCharacter.impression?.trim(),
      createdAt: editingCharacter.createdAt || Date.now(),
      updatedAt: Date.now(),
      worldBooks: editingCharacter.worldBooks,
    };

    await addCharacter(char);
    setIsEditing(false);
    setEditingCharacter({});
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个角色吗？聊天记录也会一并删除。')) {
      await removeCharacter(id);
    }
  };

  const handleSelect = (id: string) => {
    setActiveCharacter(id);
    setCurrentApp('message');
  };

  // ========== 编辑界面 ==========
  if (isEditing) {
    const affection = editingCharacter.affection ?? 0;

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h1 className="text-white/90 text-lg font-semibold">
            {editingCharacter.id && characters.find(c => c.id === editingCharacter.id) ? '编辑角色' : '新建角色'}
          </h1>
          <button onClick={() => setIsEditing(false)} className="p-2 rounded-full hover:bg-white/10">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-white/5">
          {[
            { key: 'basic' as const, label: '基础设定' },
            { key: 'memory' as const, label: '记忆 & 印象' },
            { key: 'status' as const, label: '当前状态' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.key ? 'text-white/90' : 'text-white/40 hover:text-white/60'}
              `}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {/* ===== 基础设定 Tab ===== */}
          {activeTab === 'basic' && (
            <>
              <div>
                <label className="text-white/60 text-sm block mb-1.5">角色名称 *</label>
                <input
                  type="text"
                  value={editingCharacter.name || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, name: e.target.value })}
                  placeholder="例如：Sully"
                  className="glass-input w-full text-sm"
                />
              </div>

              <div>
                <label className="text-white/60 text-sm block mb-1.5">角色设定 *</label>
                <p className="text-white/30 text-xs mb-1.5">描述这个角色的身份、背景、说话方式</p>
                <textarea
                  value={editingCharacter.systemPrompt || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, systemPrompt: e.target.value })}
                  placeholder="例如：你是一只黑客猫猫，说话带点故障风..."
                  rows={5}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              <div>
                <label className="text-white/60 text-sm block mb-1.5">世界观背景</label>
                <textarea
                  value={editingCharacter.worldview || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, worldview: e.target.value })}
                  placeholder="角色所处的世界背景..."
                  rows={3}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              <div>
                <label className="text-white/60 text-sm block mb-1.5">性格特征</label>
                <textarea
                  value={editingCharacter.personality || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, personality: e.target.value })}
                  placeholder="例如：傲娇、护短、话痨..."
                  rows={2}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              {/* 好感度 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/60 text-sm">好感度</label>
                  <div className="flex items-center gap-1.5">
                    {getAffectionIcon(affection)}
                    <span className={`text-sm font-medium bg-gradient-to-r ${getAffectionColor(affection)} bg-clip-text text-transparent`}>
                      {affection}
                    </span>
                    <span className="text-white/40 text-xs">/ 100</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={affection}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, affection: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${affection <= 15 ? '#6b7280' : affection <= 35 ? '#f59e0b' : affection <= 55 ? '#10b981' : affection <= 75 ? '#ec4899' : '#ef4444'} ${affection}%, rgba(255,255,255,0.1) ${affection}%)`,
                  }}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-white/30 text-xs">陌生人</span>
                  <span className={`text-xs font-medium ${affection > 0 ? 'text-white/70' : 'text-white/30'}`}>
                    {getAffectionLabel(affection)}
                  </span>
                  <span className="text-white/30 text-xs">亲密无间</span>
                </div>
              </div>

              {/* 关系阶段 */}
              <div>
                <label className="text-white/60 text-sm block mb-2">关系阶段</label>
                <div className="space-y-2">
                  {RELATIONSHIP_STAGES.map(stage => (
                    <button
                      key={stage.value}
                      onClick={() => setEditingCharacter({ ...editingCharacter, relationshipStage: stage.value })}
                      className={`w-full p-3 rounded-xl text-left transition-all border
                        ${editingCharacter.relationshipStage === stage.value
                          ? 'bg-white/10 border-white/20' 
                          : 'bg-white/5 border-transparent hover:bg-white/8'}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${editingCharacter.relationshipStage === stage.value ? 'text-white/90' : 'text-white/60'}`}>
                          {stage.label}
                        </span>
                        {editingCharacter.relationshipStage === stage.value && (
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                        )}
                      </div>
                      <p className="text-white/40 text-xs mt-0.5">{stage.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ===== 记忆 & 印象 Tab ===== */}
          {activeTab === 'memory' && (
            <>
              <div>
                <label className="text-white/60 text-sm block mb-1.5">记忆摘要</label>
                <p className="text-white/30 text-xs mb-1.5">角色对用户的已知信息（会自动更新，也可手动编辑）</p>
                <textarea
                  value={editingCharacter.memorySummary || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, memorySummary: e.target.value })}
                  placeholder="例如：用户叫小明，喜欢喝冰美式，最近在准备面试..."
                  rows={6}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>

              <div>
                <label className="text-white/60 text-sm block mb-1.5">印象档案</label>
                <p className="text-white/30 text-xs mb-1.5">角色对用户的性格分析和情感态度</p>
                <textarea
                  value={editingCharacter.impression || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, impression: e.target.value })}
                  placeholder="例如：小明是个细心但有点焦虑的人，我们关系越来越好了..."
                  rows={5}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>
            </>
          )}

          {/* ===== 当前状态 Tab ===== */}
          {activeTab === 'status' && (
            <>
              <div>
                <label className="text-white/60 text-sm block mb-1.5">当前情绪</label>
                <p className="text-white/30 text-xs mb-1.5">角色此刻的心情，会影响回复语气</p>
                <input
                  type="text"
                  value={editingCharacter.currentEmotion || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, currentEmotion: e.target.value })}
                  placeholder="例如：刚睡醒有点困 / 心情很好 / 有点烦躁"
                  className="glass-input w-full text-sm"
                />
              </div>

              <div>
                <label className="text-white/60 text-sm block mb-1.5">当前正在做的事</label>
                <p className="text-white/30 text-xs mb-1.5">角色此刻的活动，增加真实感</p>
                <input
                  type="text"
                  value={editingCharacter.currentStatus || ''}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, currentStatus: e.target.value })}
                  placeholder="例如：正在画稿，手边有一杯冷掉的咖啡 / 刚去拿了快递回来"
                  className="glass-input w-full text-sm"
                />
              </div>

              <div className="glass-card p-4">
                <p className="text-white/50 text-sm mb-2">💡 提示</p>
                <p className="text-white/30 text-xs leading-relaxed">
                  情绪和状态会在每次对话时注入到 AI 的上下文中，让角色的回复更有"此刻感"。
                  比如设置为"刚睡醒有点困"，角色可能会回复得更慵懒、更简短。
                </p>
              </div>
            </>
          )}

          <button 
            onClick={handleSave}
            className="glass-btn-primary w-full py-3 flex items-center justify-center gap-2 mt-4"
          >
            <Sparkles size={18} />
            保存角色
          </button>
        </div>
      </div>
    );
  }

  // ========== 列表界面 ==========
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <h1 className="text-white/90 text-lg font-semibold">角色管理</h1>
        <button 
          onClick={handleNewCharacter}
          className="p-2 rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors"
        >
          <Plus size={20} className="text-blue-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {characters.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <Bot size={48} className="mb-4 opacity-40" />
            <p className="text-sm">还没有角色</p>
            <button onClick={handleNewCharacter} className="glass-btn-primary mt-4">
              创建第一个角色
            </button>
          </div>
        )}

        {characters.map((char) => {
          const affection = char.affection ?? 0;
          return (
            <div 
              key={char.id}
              className={`
                glass-card p-4 flex items-center gap-4 cursor-pointer
                ${activeCharacterId === char.id ? 'border-blue-500/40 bg-blue-500/5' : ''}
              `}
            >
              <div 
                onClick={() => handleSelect(char.id)}
                className="flex-1 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                  {char.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white/90 font-medium truncate">{char.name}</h3>
                    {activeCharacterId === char.id && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      {getAffectionIcon(affection)}
                      <span className="text-white/40 text-xs">{affection}</span>
                    </div>
                    <span className="text-white/25 text-xs">·</span>
                    <span className="text-white/40 text-xs">
                      {RELATIONSHIP_STAGES.find(s => s.value === char.relationshipStage)?.label || '陌生人'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button 
                  onClick={() => handleSelect(char.id)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="聊天"
                >
                  <MessageCircle size={18} className="text-white/50" />
                </button>
                <button 
                  onClick={() => handleEdit(char)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="编辑"
                >
                  <Edit3 size={18} className="text-white/50" />
                </button>
                <button 
                  onClick={() => handleDelete(char.id)}
                  className="p-2 rounded-full hover:bg-red-500/20 transition-colors"
                  title="删除"
                >
                  <Trash2 size={18} className="text-red-400/70" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
