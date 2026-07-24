import type { MemoryEntry, SystemSettings } from '@/types';
import { 
  getAllMemoriesForCharacter, 
  saveMemoryV2, 
  updateMemoryPartial,
  getDB,
} from '@/db';

// ==================== 接口定义 ====================

export interface BreathOptions {
  limit?: number;           // 返回几条记忆（默认 5）
  includeResolved?: boolean; // 是否包含已解决的记忆（默认 false）
  domains?: string[];       // 只从指定领域浮现
  excludeIds?: string[];     // 排除指定 ID
}

export interface HoldOptions {
  content: string;          // 记忆内容（一句话）
  feel?: string;            // 角色第一人称感受
  pinned?: boolean;         // 是否钉选
  domain?: string;          // 领域
  tags?: string[];          // 标签
  valence?: number;         // 情感坐标 valence
  arousal?: number;         // 情感坐标 arousal
  importance?: number;      // 重要性 1-10
  source?: 'auto' | 'manual' | 'dream';
  relatedMessageIds?: string[];
}

export interface TraceOptions {
  memoryId: string;
  resolved?: boolean;
  pinned?: boolean;
  valence?: number;
  arousal?: number;
  importance?: number;
  domain?: string;
  tags?: string[];
  content?: string;
  summary?: string;
}

export interface DecayResult {
  archived: number;  // 本次归档的记忆数
  faded: number;     // 本次进入 fading 状态的记忆数
}

// ==================== MemoryCore：记忆生命周期引擎 ====================

export class MemoryCore {
  private characterId: string;
  private settings: SystemSettings;

  constructor(characterId: string, settings: SystemSettings) {
    this.characterId = characterId;
    this.settings = settings;
  }

  // ================================================================
  // 一、遗忘曲线算法（改进版艾宾浩斯）
  // ================================================================

  /**
   * 计算记忆的当前权重
   * 
   * 公式：weight = importance × retention × unresolvedBoost × pinBoost
   * 
   * retention（保留率）= e^(-λ × t / S)
   * λ = 衰减速率（默认 0.05）
   * t = 距离上次触碰的天数
   * S = 稳定性 = 1 + arousal × 2 + importance / 10
   * 
   * 情绪越强烈（arousal 高）、越重要（importance 高）的记忆，稳定性越高，衰减越慢。
   */
  calculateMemoryWeight(memory: MemoryEntry, now: number = Date.now()): number {
    // 钉选记忆永远最高权重
    if (memory.pinned || memory.isPinned) return 9999;

    // 已归档的记忆权重极低（但不为 0，仍可被检索）
    if (memory.archived || memory.status === 'archived') return 0.1;

    const daysSinceTouch = (now - (memory.lastAccessed || memory.createdAt)) / (1000 * 60 * 60 * 24);
    const arousal = memory.arousal ?? memory.emotion?.arousal ?? 0.3;
    const importance = memory.importance ?? 5;

    // 稳定性：基础 1 + 唤醒度加成 + 重要性加成
    const stability = 1 + arousal * 2 + (importance / 10);

    // 衰减速率（可调参数，M3：根据 domain 调整）
    const lambda = 0.05 * this.roomDecayFactor(memory.domain);

    // 保留率（改进版艾宾浩斯）
    const retention = Math.exp(-lambda * daysSinceTouch / stability);

    // 基础权重
    let weight = importance * retention;

    // 未解决加成（未解决的事更容易浮现）
    if (!(memory.resolved ?? false)) weight *= 1.5;

    // 最近被触碰过（24 小时内）额外加成
    if (daysSinceTouch < 1) weight *= 1.2;

    // 最近浮现过（避免同一条记忆反复出现）惩罚
    const daysSinceSurface = (now - (memory.lastSurfaced || 0)) / (1000 * 60 * 60 * 24);
    if (daysSinceSurface < 7 && memory.lastSurfaced) {
      weight *= (daysSinceSurface / 7);  // 7 天内刚浮现过的，权重线性降低
    }

    return weight;
  }

  /** M3：根据 domain（房间）返回衰减速率倍率，promise=0 永不衰减，relationship 慢，daily 快 */
  private roomDecayFactor(domain?: string): number {
    switch (domain) {
      case 'promise': return 0;         // 承诺永不衰减
      case 'relationship': return 0.5;  // 关系慢衰减
      case 'hobby': return 0.8;
      case 'work': return 0.8;
      default: return 1.0;              // daily/unknown 标准衰减
    }
  }

  /**
   * 判断记忆是否应该归档
   */
  shouldArchive(memory: MemoryEntry, now: number = Date.now()): boolean {
    if (memory.pinned || memory.isPinned) return false;
    if (memory.domain === 'promise') return false;   // M3：承诺永远不归档
    if (!(memory.resolved ?? false)) return false;
    if (memory.archived || memory.status === 'archived') return false;

    const daysSinceTouch = (now - (memory.lastAccessed || memory.createdAt)) / (1000 * 60 * 60 * 24);
    const arousal = memory.arousal ?? memory.emotion?.arousal ?? 0.3;
    const importance = memory.importance ?? 5;
    const stability = 1 + arousal * 2 + (importance / 10);
    const lambda = 0.05 * this.roomDecayFactor(memory.domain);
    if (lambda === 0) return false;
    const retention = Math.exp(-lambda * daysSinceTouch / stability);
    return retention < 0.1;
  }

  // ================================================================
  // 二、hold：记下当前的一件事
  // ================================================================

  /**
   * 记录一条记忆（一句话级别，自动打标情感坐标）
   */
  async hold(options: HoldOptions): Promise<MemoryEntry> {
    const now = Date.now();
    const valence = options.valence ?? 0;
    const arousal = options.arousal ?? 0.3;
    const importance = options.importance ?? 5;
    const pinned = options.pinned ?? false;
    const domain = options.domain ?? 'daily';

    // P2-3：hold 去重 —— 同领域 active 记忆里若已有高度相似的，合并而非新建
    // 避免 AI 反复念叨同一件事攒一堆近重复条目、互相分权导致都浮不上来
    const existing = (await getAllMemoriesForCharacter(this.characterId)).filter(m =>
      !m.archived && (m.status || 'active') === 'active' && (m.domain || 'daily') === domain
    );
    const dup = existing.find(e => this.isSimilarContent(e.content, options.content));
    if (dup) {
      // 合并到已有记忆：importance 取较大、tags 并集、lastAccessed 刷成现在、valence/arousal 若新提供了就更新
      const mergedTags = Array.from(new Set([...(dup.tags || []), ...(options.tags || [])]));
      const mergedValence = options.valence !== undefined ? valence : (dup.valence ?? dup.emotion?.valence ?? 0);
      const mergedArousal = options.arousal !== undefined ? arousal : (dup.arousal ?? dup.emotion?.arousal ?? 0.3);
      const mergedImportance = Math.max(dup.importance ?? 5, importance);
      await updateMemoryPartial(dup.id, {
        importance: mergedImportance,
        tags: mergedTags,
        valence: mergedValence,
        arousal: mergedArousal,
        emotion: { valence: mergedValence, arousal: mergedArousal },
        lastAccessed: now,
      });
      console.log('[MemoryCore] hold: merged into existing memory', dup.id, '(dup)');
      // 返回合并后的快照
      return { ...dup, importance: mergedImportance, tags: mergedTags, valence: mergedValence, arousal: mergedArousal, emotion: { valence: mergedValence, arousal: mergedArousal }, lastAccessed: now };
    }

    const memory: MemoryEntry = {
      id: crypto.randomUUID(),
      characterId: this.characterId,
      content: options.content,
      emotion: { valence, arousal },
      valence,
      arousal,
      importance,
      resolved: false,
      pinned,
      createdAt: now,
      lastAccessed: now,
      lastSurfaced: 0,
      tier: 'experience',
      domain,
      tags: options.tags ?? [],
      status: 'active',
      archived: false,
      source: options.source ?? 'manual',
      sourceMessageIds: options.relatedMessageIds ?? [],
      relatedMemoryIds: [],
      isPinned: pinned,
      feel: options.feel,
      accessCount: 0,
    };

    await saveMemoryV2(memory);
    return memory;
  }

  /** P2-3：内容相似度判断（保守版）—— 一条文本含另一条 ≥80% 长度的字符即视为重复 */
  private isSimilarContent(a: string, b: string): boolean {
    const s1 = a.trim();
    const s2 = b.trim();
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    const shorter = s1.length <= s2.length ? s1 : s2;
    const longer = s1.length <= s2.length ? s2 : s1;
    // 长度若不足 8 个字符，要求完全相等（已在上面命中），避免误判短词
    if (shorter.length < 8) return false;
    // 较长的串包含较短的，且较短长度 ≥ 较长的 80%
    return longer.includes(shorter) && shorter.length >= longer.length * 0.8;
  }

  // ================================================================
  // 三、grow：整理长内容，拆成多条记忆
  // ================================================================

  /**
   * 将长文本拆分为多条记忆
   * 优先调用 LLM 智能拆分，失败时回退到按段落拆分
   */
  async grow(content: string): Promise<MemoryEntry[]> {
    // 内容很短，直接 hold 一条
    if (content.length < 50) {
      const memory = await this.hold({ content });
      return [memory];
    }

    // 尝试 LLM 智能拆分
    const llmResult = await this.splitWithLLM(content);
    if (llmResult.length > 0) {
      return llmResult;
    }

    // 回退：按段落/句子拆分
    return this.splitByParagraph(content);
  }

  /**
   * 调用 LLM 智能拆分长文本为记忆条目
   */
  private async splitWithLLM(content: string): Promise<MemoryEntry[]> {
    if (!this.settings.apiKey || this.settings.apiKey.trim() === '') {
      return [];
    }

    const prompt = `请将以下长文本拆分为 2-8 条独立的记忆条目。每条记忆用一句话概括，并标注情感坐标和重要性。

要求：
1. 每条记忆独立成句，信息完整，不要遗漏关键信息
2. 标注 valence（-1到1）、arousal（0到1）、importance（1-10）
3. 标注 domain（relationship/work/hobby/daily/promise）
4. 只输出 JSON 数组，不要有任何其他文字

文本内容：
${content.slice(0, 3000)}

输出格式：
[
  {
    "content": "记忆内容",
    "valence": 0.5,
    "arousal": 0.3,
    "importance": 7,
    "domain": "daily"
  }
]`;

    try {
      const response = await fetch(`${this.settings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [
            { role: 'system', content: '你是一个记忆整理助手，只输出JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        console.warn('[MemoryCore] grow LLM API error:', response.status);
        return [];
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '';

      const jsonMatch = raw.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        console.warn('[MemoryCore] grow: no JSON array found in response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        console.warn('[MemoryCore] grow: parsed result is not an array');
        return [];
      }

      const memories: MemoryEntry[] = [];
      for (const item of parsed) {
        if (!item.content || typeof item.content !== 'string') continue;
        const memory = await this.hold({
          content: item.content,
          valence: typeof item.valence === 'number' ? item.valence : undefined,
          arousal: typeof item.arousal === 'number' ? item.arousal : undefined,
          importance: typeof item.importance === 'number' ? item.importance : undefined,
          domain: typeof item.domain === 'string' ? item.domain : undefined,
          source: 'auto',
        });
        memories.push(memory);
      }

      console.log('[MemoryCore] grow: created', memories.length, 'memories via LLM');
      return memories;
    } catch (e) {
      console.error('[MemoryCore] grow LLM failed:', e);
      return [];
    }
  }

  /**
   * 按段落/句子拆分（LLM 失败时的回退方案）
   */
  private async splitByParagraph(content: string): Promise<MemoryEntry[]> {
    // 按句号、感叹号、问号、换行拆分
    const sentences = content
      .split(/[。！？\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 200);

    // 合并短句为 chunk（每 chunk 约 150 字）
    const chunks: string[] = [];
    let current = '';
    for (const s of sentences) {
      if (current.length + s.length > 150) {
        if (current) chunks.push(current);
        current = s;
      } else {
        current = current ? current + '。' + s : s;
      }
    }
    if (current) chunks.push(current);

    const memories: MemoryEntry[] = [];
    for (const chunk of chunks.slice(0, 8)) {
      const memory = await this.hold({ content: chunk });
      memories.push(memory);
    }

    console.log('[MemoryCore] grow: created', memories.length, 'memories via paragraph split');
    return memories;
  }

  // ================================================================
  // 四、breath：让最重要的记忆自然浮现
  // ================================================================

  /**
   * 呼吸 —— 让最重要的记忆自然浮现
   * 
   * 对话开头调用，自动拉取权重最高的几条记忆注入上下文。
   */
  async breath(options: BreathOptions = {}): Promise<MemoryEntry[]> {
    const { 
      limit = 5, 
      includeResolved = false, 
      domains,
      excludeIds = [] 
    } = options;

    const now = Date.now();

    // 1. 读取该角色的所有记忆
    const allMemories = await getAllMemoriesForCharacter(this.characterId);

    // 2. 过滤
    const candidates = allMemories.filter(m => {
      if (m.archived || m.status === 'archived') return false;
      if (!includeResolved && (m.resolved ?? false)) return false;
      if (domains && !domains.includes(m.domain ?? 'daily')) return false;
      if (excludeIds.includes(m.id)) return false;
      return true;
    });

    // 3. 计算权重并排序
    const weighted = candidates.map(m => ({
      memory: m,
      weight: this.calculateMemoryWeight(m, now),
    }));

    weighted.sort((a, b) => b.weight - a.weight);

    // 4. 取前 N 条
    const surfaced = weighted.slice(0, limit).map(w => w.memory);

    // 5. 更新 lastSurfaced（批量一次 transaction，替代 N 次逐条 updateMemoryPartial）
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    for (const m of surfaced) {
      const existing = await tx.store.get(m.id);
      if (existing) {
        existing.lastSurfaced = now;
        await tx.store.put(existing);
      }
    }
    await tx.done;

    console.log('[MemoryCore] breath: surfaced', surfaced.length, 'memories');
    return surfaced;
  }

  // ================================================================
  // 五、decay：自然遗忘衰减
  // ================================================================

  /**
   * 遗忘衰减 —— 按改进版艾宾浩斯曲线自动归档低权重记忆
   * 
   * 建议每 20 轮对话调用一次。
   */
  async decay(): Promise<DecayResult> {
    const allMemories = await getAllMemoriesForCharacter(this.characterId);
    const now = Date.now();
    let archivedCount = 0;
    let fadedCount = 0;

    for (const m of allMemories) {
      // 跳过已归档和钉选
      if (m.pinned || m.isPinned) continue;
      if (m.archived || m.status === 'archived') continue;

      // 判断是否归档
      if (this.shouldArchive(m, now)) {
        await updateMemoryPartial(m.id, {
          archived: true,
          status: 'archived',
          archiveReason: 'decay',
        });
        archivedCount++;
        continue;
      }

      // 判断是否进入 fading 状态
      const daysSinceTouch = (now - (m.lastAccessed || m.createdAt)) / (1000 * 60 * 60 * 24);
      const arousal = m.arousal ?? m.emotion?.arousal ?? 0.3;
      const importance = m.importance ?? 5;
      const stability = 1 + arousal * 2 + (importance / 10);
      const lambda = 0.05 * this.roomDecayFactor(m.domain);
      const retention = Math.exp(-lambda * daysSinceTouch / stability);
      if (lambda === 0) continue;

      if (retention < 0.3 && m.status !== 'fading') {
        await updateMemoryPartial(m.id, { status: 'fading' });
        fadedCount++;
      }
    }

    console.log('[MemoryCore] decay:', { archived: archivedCount, faded: fadedCount });
    return { archived: archivedCount, faded: fadedCount };
  }

  // ================================================================
  // 六、trace：修正已有记忆的元数据
  // ================================================================

  /**
   * 修正已有记忆的元数据。只传要改的字段，不传表示不动。
   */
  async trace(options: TraceOptions): Promise<MemoryEntry | null> {
    const allMemories = await getAllMemoriesForCharacter(this.characterId);
    const memory = allMemories.find(m => m.id === options.memoryId);
    if (!memory) {
      console.warn('[MemoryCore] trace: memory not found', options.memoryId);
      return null;
    }

    const updates: Partial<MemoryEntry> = {};

    if (options.resolved !== undefined) updates.resolved = options.resolved;
    if (options.pinned !== undefined) {
      updates.pinned = options.pinned;
      updates.isPinned = options.pinned;
    }
    if (options.valence !== undefined || options.arousal !== undefined) {
      const v = options.valence ?? memory.valence ?? 0;
      const a = options.arousal ?? memory.arousal ?? 0.3;
      updates.valence = v;
      updates.arousal = a;
      updates.emotion = { valence: v, arousal: a };
    }
    if (options.importance !== undefined) updates.importance = options.importance;
    if (options.domain !== undefined) updates.domain = options.domain;
    if (options.tags !== undefined) updates.tags = options.tags;
    if (options.content !== undefined) updates.content = options.content;
    if (options.summary !== undefined) updates.summary = options.summary;

    await updateMemoryPartial(options.memoryId, updates);

    // 返回更新后的记忆
    const updated = await getAllMemoriesForCharacter(this.characterId);
    return updated.find(m => m.id === options.memoryId) || null;
  }
}
