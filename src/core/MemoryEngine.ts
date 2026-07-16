import type { 
  MemoryEntry, LifeStageSummary, EmotionCoordinate, ChatMessage, 
  SystemSettings, DehydratedMemory 
} from '@/types';
import { 
  getMemoriesByCharacter, saveMemory, deleteMemory, 
  getLifeStageSummaries, saveLifeStageSummary,
  updateMemoryAccess, getMemoryCountByTier,
} from '@/db';
import { MemoryAnalyzer } from './MemoryAnalyzer';

export interface RetrievalResult {
  memory: MemoryEntry;
  score: number;
}

export class MemoryEngine {
  private characterId: string;
  private analyzer: MemoryAnalyzer;
  private settings: SystemSettings;

  constructor(characterId: string, settings: SystemSettings) {
    this.characterId = characterId;
    this.settings = settings;
    this.analyzer = new MemoryAnalyzer(settings);

    if (settings.memoryEngine?.type === 'ombre') {
      console.warn('[MemoryEngine] Ombre-Brain backend not yet implemented. Falling back to local.');
    }
  }

  // ========== 脱水 & 存储 ==========

  async dehydrate(messages: ChatMessage[]): Promise<MemoryEntry[]> {
    const dehydrated = await this.analyzer.dehydrate(messages);
    const now = Date.now();

    return dehydrated.map((d: DehydratedMemory) => ({
      id: crypto.randomUUID(),
      characterId: this.characterId,
      content: d.content,
      tier: d.tier,
      emotion: { valence: d.valence, arousal: d.arousal },
      importance: d.importance,
      domain: d.domain,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      status: 'active' as const,
      sourceMessageIds: messages.map(m => m.id),
      relatedMemoryIds: [],
      isPinned: d.tier === 'core' && d.importance >= 9,
      feel: d.feel,
    }));
  }

  async storeMemories(memories: MemoryEntry[]): Promise<void> {
    const existing = await getMemoriesByCharacter(this.characterId);

    for (const memory of memories) {
      const similar = existing.find(e => 
        e.tier === memory.tier && this.similarity(e.content, memory.content) > 0.7
      );

      if (similar && memory.importance > similar.importance) {
        await deleteMemory(similar.id);
        await saveMemory(memory);
      } else if (!similar) {
        await saveMemory(memory);
      }
    }

    await this.checkCompression();
  }

  // ========== 混合检索 ==========

  async retrieve(
    query: string, 
    currentEmotion: EmotionCoordinate, 
    limit = 15
  ): Promise<{ memories: MemoryEntry[]; summaries: LifeStageSummary[] }> {
    const allMemories = await getMemoriesByCharacter(this.characterId);
    const summaries = await getLifeStageSummaries(this.characterId);

    const scored = allMemories.map(m => ({
      memory: m,
      score: this.calculateScore(m, query, currentEmotion),
    }));

    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);
    for (const { memory } of top) {
      await updateMemoryAccess(memory.id);
    }

    return { memories: top.map(r => r.memory), summaries };
  }

  // ========== 遗忘衰减 ==========

  async decay(): Promise<void> {
    const memories = await getMemoriesByCharacter(this.characterId);
    const now = Date.now();

    for (const m of memories) {
      if (m.status === 'archived' || m.isPinned) continue;

      const daysSinceAccess = (now - m.lastAccessed) / 86400000;
      const emotionalIntensity = Math.sqrt(m.emotion.valence ** 2 + m.emotion.arousal ** 2);
      const lambda = 0.05 / (1 + emotionalIntensity);
      const survivalProb = Math.exp(-lambda * daysSinceAccess);

      let newStatus: 'active' | 'fading' | 'archived' = m.status;
      if (survivalProb < 0.1) newStatus = 'archived';
      else if (survivalProb < 0.3) newStatus = 'fading';

      if (newStatus !== m.status) {
        await saveMemory({ ...m, status: newStatus });
      }
    }
  }

  // ========== 压缩归档 ==========

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
      await saveMemory({ ...m, status: 'archived' });
    }
  }

  // ========== 工具方法 ==========

  private similarity(a: string, b: string): number {
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / (setA.size + setB.size - intersection.size);
  }

  private calculateScore(
    memory: MemoryEntry, 
    query: string, 
    currentEmotion: EmotionCoordinate
  ): number {
    const hoursSinceAccess = (Date.now() - memory.lastAccessed) / 3600000;
    const timeDecay = Math.exp(-0.05 * hoursSinceAccess);

    const emotionDistance = Math.sqrt(
      Math.pow(memory.emotion.valence - currentEmotion.valence, 2) +
      Math.pow(memory.emotion.arousal - currentEmotion.arousal, 2)
    );
    const emotionMatch = 1 - emotionDistance / 2.828;

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const memoryText = memory.content.toLowerCase();
    let keywordMatch = 0;
    if (queryWords.length > 0) {
      const hits = queryWords.filter(qw => memoryText.includes(qw)).length;
      keywordMatch = hits / queryWords.length;
    }

    const baseWeight = memory.importance / 10;
    const freqBoost = Math.log1p(memory.accessCount) * 0.1;
    const tierBoost = memory.tier === 'core' ? 2.0 : 
                      memory.tier === 'plan' ? 1.5 : 
                      memory.tier === 'experience' ? 1.0 : 0.6;
    const statusFactor = memory.status === 'active' ? 1.0 : 
                         memory.status === 'fading' ? 0.5 : 0.1;
    const pinBoost = memory.isPinned ? 1.5 : 1.0;

    return (
      baseWeight * 0.25 +
      timeDecay * 0.2 +
      emotionMatch * 0.15 +
      keywordMatch * 0.15 +
      freqBoost * 0.05 +
      tierBoost * 0.1 +
      statusFactor * 0.05 +
      pinBoost * 0.05
    );
  }

  private averageEmotion(memories: MemoryEntry[]): EmotionCoordinate {
    if (memories.length === 0) return { valence: 0, arousal: 0 };
    const v = memories.reduce((s, m) => s + m.emotion.valence, 0) / memories.length;
    const a = memories.reduce((s, m) => s + m.emotion.arousal, 0) / memories.length;
    return { valence: v, arousal: a };
  }

  private getTierName(tier: MemoryEntry['tier']): string {
    const map = { core: '核心', experience: '经历', feeling: '感受', plan: '计划', archive: '归档' };
    return map[tier] || tier;
  }
}
