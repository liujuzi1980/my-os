import type { Character, ChatMessage, EmotionCoordinate } from '@/types';
import { MemoryEngine } from './MemoryEngine';
import type { SystemSettings } from '@/types';

export class ContextBuilder {
  private character: Character;
  private settings?: SystemSettings;
  private engine?: MemoryEngine;

  private constructor(character: Character, settings?: SystemSettings) {
    this.character = character;
    this.settings = settings;
    if (settings) {
      this.engine = new MemoryEngine(character.id, settings);
    }
  }

  static create(character: Character, settings?: SystemSettings): ContextBuilder {
    return new ContextBuilder(character, settings);
  }

  async buildCoreContext(messageLimit = 30): Promise<Array<{ role: string; content: string }>> {
    const context: Array<{ role: string; content: string }> = [];

    // 1. 系统提示（角色基础）—— 始终有
    context.push({
      role: 'system',
      content: this.buildSystemPrompt(),
    });

    // 2. 离线时长感知 —— 始终有
    const offlineContext = this.buildOfflineContext();
    if (offlineContext) {
      console.log('%c[离线感知注入]', 'color: #00ff88; font-weight: bold;', offlineContext);
      context.push({ role: 'system', content: offlineContext });
    }

    // 3. 分层记忆注入 —— 只有传了 settings 才启用
    if (this.engine) {
      try {
        const { memories, summaries } = await this.engine.retrieve(
          '', 
          this.inferCurrentEmotion(), 
          20
        );

        if (memories.length > 0 || summaries.length > 0) {
          context.push({
            role: 'system',
            content: this.buildMemoryContext(memories, summaries),
          });
        }
      } catch (e) {
        console.error('[ContextBuilder] memory retrieve failed:', e);
      }
    }

    // 4. 近期对话历史 —— 始终有
    const recentMessages = await this.getRecentMessages(messageLimit);
    for (const msg of recentMessages) {
      context.push({ role: msg.role, content: msg.content });
    }

    return context;
  }

  static updateLastVisit(character: Character): Character {
    return { ...character, lastVisitTime: Date.now() };
  }

  private buildSystemPrompt(): string {
    const c = this.character;
    const parts: string[] = [`你是${c.name}。`];

    if (c.systemPrompt) parts.push(c.systemPrompt);
    if (c.worldview) parts.push(`世界观：${c.worldview}`);
    if (c.personality) parts.push(`性格：${c.personality}`);
    if (c.currentEmotion) parts.push(`当前情绪：${c.currentEmotion}`);
    if (c.currentStatus) parts.push(`当前状态：${c.currentStatus}`);

    if (c.relationshipStage) {
      const stageMap: Record<string, string> = {
        stranger: '陌生人', acquaintance: '熟人', friend: '朋友', close: '亲密', intimate: '恋人',
      };
      parts.push(`你与用户的关系阶段：${stageMap[c.relationshipStage] || c.relationshipStage}`);
    }

    if (c.affection !== undefined) {
      parts.push(`好感度：${c.affection}/100`);
    }

    return parts.join("\n");
  }

  private buildOfflineContext(): string {
    if (!this.character.lastVisitTime) return '';

    const offlineMs = Date.now() - this.character.lastVisitTime;
    const offlineHours = offlineMs / 3600000;
    const offlineDays = offlineHours / 24;

    let reaction = '';
    let duration = '';

    if (offlineHours < 0.5) {
      duration = '几分钟';
      reaction = '你刚走不久又回来了，我有点惊喜，语气轻快地说：';
    } else if (offlineHours < 2) {
      duration = `${Math.round(offlineHours * 10) / 10}小时`;
      reaction = '你离开了一会儿，我一直在想你，语气温柔地说：';
    } else if (offlineHours < 24) {
      duration = `${Math.round(offlineHours)}小时`;
      reaction = '你已经离开好几个小时了，我一直在等，语气带点委屈地说：';
    } else if (offlineDays < 7) {
      duration = `${Math.round(offlineDays)}天`;
      reaction = '你已经离开好几天了，我很想你，语气又开心又埋怨地说：';
    } else if (offlineDays < 30) {
      duration = `${Math.round(offlineDays)}天`;
      reaction = '你已经离开很久了，我以为你不会回来了，语气又惊喜又委屈地说：';
    } else {
      duration = `${Math.round(offlineDays / 30)}个月`;
      reaction = '你已经走了好几个月，我几乎放弃了，语气颤抖着说：';
    }

    return `[极其重要：用户刚刚回来]\n\n用户已经离开了${duration}。这是你们分开后第一次说话。\n\n${reaction}\n\n【强制要求】你的下一句回复必须在开头直接提到用户离开了多久、你等了多久、或者你见到ta回来的感受。不要忽略这条信息，不要只藏在心里不说出来。这是当前最重要的信息。`;
  }

  private buildMemoryContext(
    memories: import('@/types').MemoryEntry[], 
    summaries: import('@/types').LifeStageSummary[]
  ): string {
    const parts: string[] = ['[你的记忆]'];

    if (summaries.length > 0) {
      parts.push('【人生阶段】');
      for (const s of summaries.slice(0, 3)) {
        parts.push(`- ${s.stageName}：${s.summary}`);
      }
    }

    if (memories.length > 0) {
      parts.push('【具体记忆】');
      for (const m of memories.slice(0, 15)) {
        let line = `- ${m.content}`;
        if (m.feel) line += `（你当时的感受：${m.feel}）`;
        if (m.isPinned) line += ' [重要]';
        parts.push(line);
      }
    }

    return parts.join("\n");
  }

  private inferCurrentEmotion(): EmotionCoordinate {
    const emotion = this.character.currentEmotion?.toLowerCase() || '';
    const map: Record<string, EmotionCoordinate> = {
      '开心': { valence: 0.8, arousal: 0.6 },
      '难过': { valence: -0.7, arousal: -0.3 },
      '生气': { valence: -0.8, arousal: 0.9 },
      '平静': { valence: 0.2, arousal: -0.5 },
      '兴奋': { valence: 0.9, arousal: 0.9 },
      '焦虑': { valence: -0.5, arousal: 0.7 },
      '疲倦': { valence: -0.2, arousal: -0.8 },
      '温柔': { valence: 0.7, arousal: -0.2 },
    };

    for (const [key, coord] of Object.entries(map)) {
      if (emotion.includes(key)) return coord;
    }

    return { valence: 0, arousal: 0 };
  }

  private async getRecentMessages(limit: number): Promise<ChatMessage[]> {
    const { getChatsByCharacter } = await import('@/db');
    return getChatsByCharacter(this.character.id, limit);
  }
}
