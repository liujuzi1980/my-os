import type { DehydratedMemory, ChatMessage, SystemSettings } from '@/types';

export class MemoryAnalyzer {
  private settings: SystemSettings;

  constructor(settings: SystemSettings) {
    this.settings = settings;
  }

  // 脱水：分析对话，提取结构化记忆
  async dehydrate(messages: ChatMessage[]): Promise<DehydratedMemory[]> {
    if (!this.settings.apiKey || messages.length === 0) return [];

    const conversation = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`)
      .join('\n');

    const prompt = `请分析以下对话，提取 2-5 条值得长期记住的记忆。
要求：
1. 每条记忆用一句话概括
2. 标记情感坐标（valence/arousal，范围-1到1）
3. 标记重要性（1-10）
4. 标记领域（relationship/work/hobby/general）
5. 如果是角色对用户的感受，标记为 feeling 类型
6. 如果是事实/事件，标记为 experience 类型
7. 如果是约定/承诺，标记为 plan 类型
8. 核心人设相关的标记为 core 类型

对话内容：
${conversation}

请严格输出 JSON 数组格式，不要有任何其他文字：
[
  {
    "content": "记忆内容",
    "tier": "experience",
    "valence": 0.8,
    "arousal": 0.3,
    "importance": 8,
    "domain": "relationship",
    "feel": "角色第一人称感受（可选）"
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
            { role: 'system', content: '你是一个记忆分析助手，只输出JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '';

      const jsonMatch = raw.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed) ? parsed.filter((m: unknown) => m && typeof m === 'object') : [];
    } catch (e) {
      console.error('[MemoryAnalyzer] dehydrate failed:', e);
      return [];
    }
  }

  // 阶段总结：把一批记忆压缩为人生阶段描述
  async summarize(memories: { content: string; emotion: { valence: number; arousal: number } }[]): Promise<string> {
    if (!this.settings.apiKey || memories.length === 0) return '';

    const text = memories.map(m => `- ${m.content}`).join('\n');
    const prompt = `请总结以下记忆，提炼为一段200字以内的"人生阶段总结"，保留关键情感和信息：
${text}`;

    try {
      const response = await fetch(`${this.settings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 500,
        }),
      });

      if (!response.ok) return '';
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      console.error('[MemoryAnalyzer] summarize failed:', e);
      return '';
    }
  }
}
