import type { 
  MemoryEntry, 
  EmotionCoordinate, 
  MemorySearchOptions, 
  MemorySearchResult 
} from '@/types';
import { getAllMemoriesForCharacter, getMemoryVectorsByCharacter } from '@/db';
import { VectorEmbedding } from './VectorEmbedding';
import { Bm25 } from './Bm25';

// ==================== MemorySearch：混合检索引擎 ====================

/**
 * 混合检索 —— 关键词 + 权重排序
 * 
 * 阶段 2 实现（纯前端）：
 * - 通道 A：关键词包含匹配
 * - 通道 B：标签/领域匹配  
 * - 通道 C：模糊字符串匹配（简化版 LCS）
 * - 重排序：遗忘曲线权重融合
 * 
 * 未来可扩展：
 * - BM25 稀疏检索（需预建倒排索引）
 * - 向量语义检索（需 embedding 模型）
 */
export class MemorySearch {
  private characterId: string;
  private embedder?: VectorEmbedding;

  constructor(characterId: string, embedder?: VectorEmbedding) {
    this.characterId = characterId;
    this.embedder = embedder;
    if (embedder) console.log('[MemorySearch] vector embedding enabled');
  }

  /**
   * 执行混合检索
   * 
   * @param query 搜索关键词（空字符串时按权重排序返回）
   * @param options 检索选项
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const {
      limit = 10,
      domains,
      valenceRange,
      arousalRange,
      timeRange,
      includeArchived = false,
      includeResolved = true,
      excludeIds = [],
    } = options;

    const now = Date.now();

    // === 阶段 1：召回（元数据过滤）===
    const allMemories = await getAllMemoriesForCharacter(this.characterId);

    const recalled = allMemories.filter(m => {
      if (!includeArchived && (m.archived || m.status === 'archived')) return false;
      if (!includeResolved && (m.resolved ?? false)) return false;
      if (domains && !domains.includes(m.domain ?? 'daily')) return false;
      if (valenceRange) {
        const v = m.valence ?? m.emotion?.valence ?? 0;
        if (v < valenceRange.min || v > valenceRange.max) return false;
      }
      if (arousalRange) {
        const a = m.arousal ?? m.emotion?.arousal ?? 0.3;
        if (a < arousalRange.min || a > arousalRange.max) return false;
      }
      if (timeRange && (m.createdAt < timeRange.start || m.createdAt > timeRange.end)) return false;
      if (excludeIds.includes(m.id)) return false;
      return true;
    });

        // === 阶段 2：重排序（多通道融合打分，含 BM25）===
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    // --- 预计算 BM25 分数（中文 bigram 分词）---
    let bm25Scores: Map<string, number> = new Map();
    if (queryLower) {
      try {
        const bm25 = new Bm25(recalled.map(m => ({ id: m.id, content: m.content + (m.summary || '') })));
        bm25Scores = bm25.score(queryLower);
      } catch (e) {
        console.warn("[MemorySearch] BM25 failed, falling back:", e);
      }
    }

    // --- 预计算向量检索分数（若 embedder 已配置且有向量）---
    let vectorScores: Map<string, number> = new Map();
    if (this.embedder && queryLower) {
      try {
        const vectors = await getMemoryVectorsByCharacter(this.characterId);
        if (vectors.length > 0) {
          vectorScores = await this.embedder.scoreMemories(queryLower, vectors);
        }
      } catch (e) {
        console.warn("[MemorySearch] vector search failed:", e);
      }
    }

    const scored = recalled.map(m => {
      // --- 通道 A：关键词包含匹配 ---
      let keywordScore = 0;
      const contentLower = m.content.toLowerCase();
      const summaryLower = (m.summary || '').toLowerCase();
      const tagsLower = (m.tags || []).join(' ').toLowerCase();
      const domainLower = (m.domain || '').toLowerCase();

      if (queryLower) {
        if (contentLower.includes(queryLower)) {
          keywordScore = 1.0;
        } else if (summaryLower.includes(queryLower)) {
          keywordScore = 0.95;
        } else if (tagsLower.includes(queryLower) || domainLower.includes(queryLower)) {
          keywordScore = 0.9;
        } else {
          const hits = queryWords.filter(qw =>
            contentLower.includes(qw) ||
            summaryLower.includes(qw) ||
            tagsLower.includes(qw)
          ).length;
          if (queryWords.length > 0) {
            keywordScore = (hits / queryWords.length) * 0.8;
          }
        }
      } else {
        keywordScore = 0.5;
      }

      // --- 通道 B：模糊匹配（简化版 LCS）---
      const fuzzyScore = queryLower ? this.calculateFuzzyScore(queryLower, contentLower) : 0.5;

      // --- 通道 C：BM25（预计算分数 + 查表）---
      const bm25Score = bm25Scores.get(m.id) ?? 0;

      // --- 通道 D：向量语义相似度（预计算 + 查表）---
      const vectorScore = vectorScores.get(m.id) ?? 0;

      // --- 通道 E：遗忘曲线权重 ---
      const weightScore = this.calculateWeightScore(m, now);

      // --- 通道 E：重要性 ---
      const importanceScore = (m.importance ?? 5) / 10;

      // --- 额外信号 ---
      const pinScore = (m.pinned || m.isPinned) ? 0.3 : 0;
      const unresolvedScore = !(m.resolved ?? false) ? 0.1 : 0;
      const recentTouchScore = this.calculateRecentTouchScore(m, now);

      // 融合得分（BM25 最高权 0.25）
      // 融合得分（五通道：关键词+LCS+BM25+向量+遗忘曲线+重要性）
      const finalScore =
        keywordScore * 0.15 +
        fuzzyScore * 0.10 +
        bm25Score * 0.20 +
        vectorScore * 0.15 +
        weightScore * 0.20 +
        importanceScore * 0.10 +
        recentTouchScore * 0.05 +
        pinScore +
        unresolvedScore;

      return { memory: m, score: finalScore };
    });

    // === 阶段 3：排序 + 截断 ===
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * 按情感坐标检索 —— 找到与当前情绪最接近的记忆
   */
  async searchByEmotion(
    currentEmotion: EmotionCoordinate, 
    limit = 10
  ): Promise<MemorySearchResult[]> {
    const allMemories = await getAllMemoriesForCharacter(this.characterId);
    const now = Date.now();

    const activeMemories = allMemories.filter(m => 
      !(m.archived || m.status === 'archived')
    );

    const scored = activeMemories.map(m => {
      const mv = m.valence ?? m.emotion?.valence ?? 0;
      const ma = m.arousal ?? m.emotion?.arousal ?? 0.3;

      // 情感欧氏距离（归一化到 0-1）
      const emotionDistance = Math.sqrt(
        Math.pow(mv - currentEmotion.valence, 2) +
        Math.pow(ma - currentEmotion.arousal, 2)
      );
      const emotionMatch = 1 - emotionDistance / 2.828;

      // 权重
      const weightScore = this.calculateWeightScore(m, now);
      const importanceScore = (m.importance ?? 5) / 10;

      const finalScore = emotionMatch * 0.4 + weightScore * 0.3 + importanceScore * 0.3;

      return { memory: m, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ================================================================
  // 私有工具方法
  // ================================================================

  /**
   * 简化版模糊匹配：基于最长公共子串的相似度
   * 
   * 性能优化：限制比较长度，避免超长文本拖慢
   */
  private calculateFuzzyScore(query: string, text: string): number {
    if (!query || !text) return 0;
    if (text.includes(query)) return 1.0;

    const m = query.length;
    // 限制比较长度，保证性能
    const maxCompare = Math.min(text.length, 500);
    const searchText = text.slice(0, maxCompare);
    const n = searchText.length;

    let maxLen = 0;

    // 动态规划求最长公共子串（简化版，只记录最大值）
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (query[i] === searchText[j]) {
          let len = 1;
          while (
            i + len < m && 
            j + len < n && 
            query[i + len] === searchText[j + len]
          ) {
            len++;
          }
          maxLen = Math.max(maxLen, len);
        }
      }
    }

    // 相似度 = 最长公共子串长度 / 查询长度
    return maxLen / m;
  }

  /**
   * 计算记忆的权重分（基于遗忘曲线，归一化到 0-1）
   */
  private calculateWeightScore(memory: MemoryEntry, now: number): number {
    if (memory.pinned || memory.isPinned) return 1.0;
    if (memory.archived || memory.status === 'archived') return 0.05;

    const daysSinceTouch = (now - (memory.lastAccessed || memory.createdAt)) / (1000 * 60 * 60 * 24);
    const arousal = memory.arousal ?? memory.emotion?.arousal ?? 0.3;
    const importance = memory.importance ?? 5;

    const stability = 1 + arousal * 2 + (importance / 10);
    const retention = Math.exp(-0.05 * daysSinceTouch / stability);

    return retention;
  }

  /**
   * 最近触碰加分（24 小时内触碰过的记忆获得额外加分）
   */
  private calculateRecentTouchScore(memory: MemoryEntry, now: number): number {
    const hoursSinceTouch = (now - (memory.lastAccessed || memory.createdAt)) / (1000 * 60 * 60);
    if (hoursSinceTouch < 1) return 0.2;
    if (hoursSinceTouch < 24) return 0.1;
    return 0;
  }
}
