/**
 * src/core/AnticipationEngine.ts
 * M2 期盼生命周期 —— 追踪用户承诺/约定
 *
 * 生命周期：active(新建) → anchor(7天+) → fulfilled(实现) / disappointed(落空)
 *
 * 注入：每轮对话拉取 active+anchor 的期盼注入 ContextBuilder
 */

import type { Anticipation } from '@/types';
import { getAnticipationsByCharacter, saveAnticipation } from '@/db';

/** 中文承诺句式检测规则（关键词驱动） */
const PROMISE_PATTERNS = [
  /下次一起(吃|喝|玩|去|看|做|听|逛|约)/,
  /答应(你|我|了)/,
  /承诺/,
  /说好了/,
  /等(周末|周三|明天|下周|下个月|年底|放假|有空|改天)/,
  /到时候.*(一起|请|带)/,
  /一定.*(啊|哦|啦|哟|~|！)/,
  /(欠|请)(你|我).*(饭|奶茶|咖啡|东西|礼物)/,
  /下次(一定|吧|嘛|啊)/,
  /约好.*(了|的)/,
];

export class AnticipationEngine {
  private characterId: string;

  constructor(characterId: string) {
    this.characterId = characterId;
  }

  /** 检测用户消息是否包含承诺句式，有则返回承诺文案 */
  detectAnticipation(text: string): string | null {
    for (const pattern of PROMISE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // 取匹配上下文：整句或匹配前后20字
        const full = match[0];
        const idx = text.indexOf(full);
        const start = Math.max(0, idx - 15);
        const end = Math.min(text.length, idx + full.length + 20);
        return text.slice(start, end).trim();
      }
    }
    return null;
  }

  /** 创建一条期盼 */
  async create(content: string, triggerMessage?: string): Promise<Anticipation> {
    const a: Anticipation = {
      id: crypto.randomUUID(),
      characterId: this.characterId,
      content: content.slice(0, 200),
      status: 'active',
      createdAt: Date.now(),
      triggerMessage: triggerMessage ? triggerMessage.slice(0, 100) : undefined,
    };
    await saveAnticipation(a);
    return a;
  }

  /** 获取 active + anchor 状态的期盼（按创建时间倒序） */
  async getActive(): Promise<Anticipation[]> {
    const all = await getAnticipationsByCharacter(this.characterId);
    return all
      .filter(a => a.status === 'active' || a.status === 'anchor')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /** 检查用户消息是否暗示某个期盼已实现或落空 */
  async checkFulfillment(userMessage: string): Promise<void> {
    const active = await this.getActive();
    for (const a of active) {
      const kw = this.extractKeywords(a.content);
      const hits = kw.filter(k => userMessage.includes(k)).length;
      if (hits >= Math.ceil(kw.length * 0.4)) {
        // 命中关键词 → 自动转为 fulfilled
        a.status = 'fulfilled';
        a.resolvedAt = Date.now();
        await saveAnticipation(a);
      }
    }
  }

  /** 老化检查：active → anchor（7天）, active → disappointed（超30天未提） */
  async advanceAging(): Promise<void> {
    const all = await getAnticipationsByCharacter(this.characterId);
    const now = Date.now();
    for (const a of all) {
      if (a.status === 'active' && now - a.createdAt > 7 * 24 * 3600 * 1000) {
        a.status = 'anchor';
        a.anchoredAt = now;
        await saveAnticipation(a);
      }
    }
  }

  /** 提取关键词（>1 字的中文词组 + 英文词，去掉常见虚词） */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      '的', '了', '是', '在', '我', '你', '他', '她', '它',
      '有', '不', '就', '也', '和', '这', '那', '都', '要',
      '会', '能', '可', '去', '来', '上', '下', '大', '小',
    ]);
    const chars = text.replace(/[\u4e00-\u9fff]/g, '').match(/[a-zA-Z]+/g) || [];
    const cjk = text.replace(/[^\u4e00-\u9fff]/g, '').match(/.{2,4}/g) || [];
    const combined = [...chars, ...cjk];
    return combined.filter(w => w.length >= 2 && !stopWords.has(w));
  }
}