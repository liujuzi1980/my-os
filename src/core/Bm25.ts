/**
 * src/core/Bm25.ts
 * BM25 稀疏检索 —— 纯前端实现，零外部依赖。
 *
 * 对中文按字符 bigram（2-gram）分词，英文按空格分词、数字保留。
 * 专为 my-os 的 MemorySearch 混合检索设计。
 */

export class Bm25 {
  private docCount = 0;
  private avgDocLen = 0;
  private termFreqs = new Map<string, Map<string, number>>();
  private docFreqs = new Map<string, number>();
  private docLengths = new Map<string, number>();

  private k1 = 1.2;
  private b = 0.75;

  constructor(docs: Array<{ id: string; content: string }>) {
    if (docs.length === 0) return;
    this.docCount = docs.length;
    let totalLen = 0;

    for (const doc of docs) {
      const tokens = this.tokenize(doc.content);
      this.docLengths.set(doc.id, doc.content.length);
      totalLen += doc.content.length;

      const localTf = new Map<string, number>();
      for (const t of tokens) {
        localTf.set(t, (localTf.get(t) || 0) + 1);
      }
      for (const [term, count] of localTf) {
        if (!this.termFreqs.has(term)) this.termFreqs.set(term, new Map());
        this.termFreqs.get(term)!.set(doc.id, count);
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
      }
    }
    this.avgDocLen = totalLen / this.docCount;
  }

  score(query: string): Map<string, number> {
    const queryTokens = [...new Set(this.tokenize(query))];
    if (queryTokens.length === 0) return new Map();

    const raw = new Map<string, number>();
    for (const [id, docLen] of this.docLengths) {
      let score = 0;
      for (const term of queryTokens) {
        const tf = this.termFreqs.get(term)?.get(id) ?? 0;
        const df = this.docFreqs.get(term) ?? 0;
        if (df === 0) continue;

        const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLen));
        score += idf * (numerator / Math.max(denominator, 0.001));
      }
      if (score > 0) raw.set(id, score);
    }

    const maxScore = Math.max(...raw.values(), 1e-6);
    const normalized = new Map<string, number>();
    for (const [id, s] of raw) normalized.set(id, s / maxScore);
    return normalized;
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    const lower = text.toLowerCase();

    const cjkSegments = lower.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g);
    if (cjkSegments) {
      for (const seg of cjkSegments) {
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.push(seg.substring(i, i + 2));
        }
        if (seg.length <= 4) {
          for (const ch of seg) tokens.push(ch);
        }
      }
    }

    const nonCjk = lower.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g, ' ');
    const words = nonCjk.split(/[\s,，。！？、；：""''''【】《》（）!?;:\/\\]+/).filter(w => w.length > 0);
    tokens.push(...words);

    return tokens;
  }
}