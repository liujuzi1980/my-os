import type { 
  MemoryEntry, LifeStageSummary, EmotionCoordinate, ChatMessage, 
  SystemSettings, DehydratedMemory 
} from '@/types';
import { 
  getMemoriesByCharacter, saveMemoryV2, deleteMemory, 
  getLifeStageSummaries, saveLifeStageSummary,
  updateMemoryAccess, getMemoryCountByTier,
} from '@/db';
import { MemoryAnalyzer } from './MemoryAnalyzer';
import { MemoryCore } from './MemoryCore';
import { MemorySearch } from './MemorySearch';

export interface RetrievalResult {
  memory: MemoryEntry;
  score: number;
}

/**
 * MemoryEngine —— 兼容层
 * 
 * 保留原有公共接口，内部转发到 MemoryCore / MemorySearch。
 * 旧代码（如 message/index.tsx）可直接使用，无需修改。
 * 
 * 同时暴露 coreEngine / searchEngine 属性，供新代码直接使用新能力。
 */
export class MemoryEngine {
  private characterId: string;
  private analyzer: MemoryAnalyzer;
  private settings: SystemSettings;
  private _core: MemoryCore;
  private _search: MemorySearch;

  constructor(characterId: string, settings: SystemSettings) {
    this.characterId = characterId;
    this.settings = settings;
    this.analyzer = new MemoryAnalyzer(settings);
    this._core = new MemoryCore(characterId, settings);
    this._search = new MemorySearch(characterId);

    if (settings.memoryEngine?.type === 'ombre') {
      console.warn('[MemoryEngine] Ombre-Brain backend not yet implemented. Falling back to local.');
    }
  }

  // ========== 对外暴露 MemoryCore 的新方法（供新代码使用）==========

  get coreEngine(): MemoryCore {
    return this._core;
  }

  get searchEngine(): MemorySearch {
    return this._search;
  }

  // ========== 脱水 & 存储（保留旧接口，内部适配新格式）==========

  /**
   * 脱水：分析对话，提取结构化记忆
   * 
   * 保留原有 LLM 分析逻辑，但输出格式已适配阶段 2 的新字段。
   */
  async dehydrate(messages: ChatMessage[]): Promise<MemoryEntry[]> {
    const dehydrated = await this.analyzer.dehydrate(messages);
    const now = Date.now();

    return dehydrated.map((d: DehydratedMemory) => ({
      id: crypto.randomUUID(),
      characterId: this.characterId,
      content: d.content,
      tier: d.tier,
      emotion: { valence: d.valence, arousal: d.arousal },
      valence: d.valence,
      arousal: d.arousal,
      importance: d.importance,
      domain: d.domain,
      createdAt: now,
      lastAccessed: now,
      lastSurfaced: 0,
      status: 'active' as const,
      sourceMessageIds: messages.map(m => m.id),
      relatedMemoryIds: [],
      isPinned: d.tier === 'core' && d.importance >= 9,
      pinned: d.tier === 'core' && d.importance >= 9,
      resolved: false,
      archived: false,
      source: 'auto' as const,
      tags: [],
      accessCount: 0,
      feel: d.feel,
    }));
  }

  /**
   * 存储记忆（保留旧接口，内部使用 saveMemoryV2 标准化存储）
   */
  async storeMemories(memories: MemoryEntry[]): Promise<void> {
    const existing = await getMemoriesByCharacter(this.characterId);

    for (const memory of memories) {
      // 去重：查找相似记忆
      const similar = existing.find(e => 
        e.tier === memory.tier && this.similarity(e.content, memory.content) > 0.7
      );

      if (similar && memory.importance > similar.importance) {
        // 新记忆更重要，替换旧记忆
        await deleteMemory(similar.id);
      }

      // 保存（标准化后存储）
      await saveMemoryV2(memory);
    }

    // 检查是否需要压缩归档
    await this.checkCompression();
  }

  // ========== 混合检索（使用新 MemorySearch 替代旧算法）==========

  /**
   * 检索记忆（保留旧接口，内部使用 MemorySearch）
   */
  async retrieve(
    query: string, 
    currentEmotion: EmotionCoordinate, 
    limit = 15
  ): Promise<{ memories: MemoryEntry[]; summaries: LifeStageSummary[] }> {
    const summaries = await getLifeStageSummaries(this.characterId);

    // 使用新的混合检索
    const results = await this._search.search(query, {
      limit,
      includeArchived: false,
    });

    // 更新访问记录
    for (const { memory } of results) {
      await updateMemoryAccess(memory.id);
    }

    return { memories: results.map(r => r.memory), summaries };
  }

  // ========== 遗忘衰减（转发到 MemoryCore，使用新算法）==========

  /**
   * 遗忘衰减（保留旧接口，内部使用 MemoryCore.decay）
   */
  async decay(): Promise<void> {
    const result = await this._core.decay();
    console.log('[MemoryEngine] decay result:', result);

    // 保留旧逻辑：压缩归档（当某 tier 记忆过多时）
    await this.checkCompression();
  }

  // ========== 压缩归档（保留旧逻辑）==========

  private async checkCompression(): Promise<void> {
    const thresholds: Record<string, number> = {
      experience: 200,
      feeling: 100,
      plan: 150,
    };

    for (const [tier, threshold] of Object.entries(thresholds)) {
      const count = await getMemoryCountByTier(this.characterId, tier);
      if (count > threshold) {
        await this.compressTier(tier as MemoryEntry['tier']);
      }
    }
  }

  private async compressTier(tier: MemoryEntry['tier']): Promise<void> {
    const memories = await getMemoriesByCharacter(this.characterId, tier);
    const toCompress = memories
      .filter(m => m.status === 'active')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 50);

    if (toCompress.length < 10) return;

    const summaryText = await this.analyzer.summarize(toCompress);

    const summary: LifeStageSummary = {
      id: crypto.randomUUID(),
      characterId: this.characterId,
      stageName: `${this.getTierName(tier)}阶段`,
      startTime: toCompress[0].createdAt,
      endTime: toCompress[toCompress.length - 1].createdAt,
      summary: summaryText,
      keyMemories: toCompress.map(m => m.id),
      emotionSnapshot: this.averageEmotion(toCompress),
    };

    await saveLifeStageSummary(summary);

    for (const m of toCompress) {
      await saveMemoryV2({ ...m, status: 'archived', archived: true, archiveReason: 'merge' });
    }
  }

  // ========== 工具方法 ==========

  private similarity(a: string, b: string): number {
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / (setA.size + setB.size - intersection.size);
  }

  private averageEmotion(memories: MemoryEntry[]): EmotionCoordinate {
    if (memories.length === 0) return { valence: 0, arousal: 0 };
    const v = memories.reduce((s, m) => s + (m.valence ?? m.emotion?.valence ?? 0), 0) / memories.length;
    const a = memories.reduce((s, m) => s + (m.arousal ?? m.emotion?.arousal ?? 0), 0) / memories.length;
    return { valence: v, arousal: a };
  }

  private getTierName(tier: MemoryEntry['tier']): string {
    const map: Record<string, string> = { 
      core: '核心', 
      experience: '经历', 
      feeling: '感受', 
      plan: '计划', 
      archive: '归档' 
    };
    return map[tier] || tier;
  }
}
