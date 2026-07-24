/**
 * src/core/VectorEmbedding.ts
 * Embedding API 客户端 + 向量检索（简化版）
 * 
 * OpenAI 兼容格式：POST /v1/embeddings
 * 模型默认 text-embedding-3-small（1024 维）
 */

import type { EmbeddingConfig, MemoryVector } from '@/types';

export class VectorEmbedding {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  static fromSettings(settings: { embeddingConfig?: EmbeddingConfig }): VectorEmbedding | null {
    const cfg = settings.embeddingConfig;
    if (!cfg || !cfg.enabled || !cfg.apiBaseUrl || !cfg.apiKey) return null;
    return new VectorEmbedding(cfg);
  }

  /** 单条文本向量化 */
  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0] || new Array(1024).fill(0);
  }

  /** 批量向量化（自动按 10 条切小批，每条截断 4000 字符） */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = 10;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 4000));
      const { data } = await this.callAPI(batch);
      const sorted = data.sort((a, b) => a.index - b.index);
      results.push(...sorted.map(d => d.embedding));
    }

    return results;
  }

  /** 计算余弦相似度（-1～1） */
  static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const mag = Math.sqrt(na) * Math.sqrt(nb);
    return mag === 0 ? 0 : dot / mag;
  }

  /** 对查询编码后，与候选向量逐条算相似度，返回归一化分数 */
  async scoreMemories(query: string, vectors: MemoryVector[]): Promise<Map<string, number>> {
    if (vectors.length === 0) return new Map();
    const queryVec = await this.embed(query);
    const scores = new Map<string, number>();
    for (const v of vectors) {
      scores.set(v.id, VectorEmbedding.cosineSimilarity(queryVec, v.vector));
    }
    // 归一化到 0～1（余弦相似度回-1～1，映射到0～1）
    let min = 1, max = -1;
    for (const s of scores.values()) { if (s < min) min = s; if (s > max) max = s; }
    const range = max - min || 1;
    for (const [id, s] of scores) scores.set(id, (s - min) / range);
    return scores;
  }

  // ==================== 私有 ====================

  private async callAPI(inputs: string[]): Promise<{
    data: Array<{ embedding: number[]; index: number }>;
    model: string;
  }> {
    const url = this.config.apiBaseUrl.replace(/\/+$/, '') + '/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.config.apiKey,
      },
      body: JSON.stringify({
        model: this.config.model || 'text-embedding-3-small',
        input: inputs,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('Embedding API error ' + res.status + ': ' + text.slice(0, 200));
    }
    return res.json();
  }
}