import type { ParsedAIResponse } from '@/types';

/**
 * 解析 AI 回复，提取正文 + 情感坐标 JSON
 * 
 * 支持多种 AI 输出格式：
 * 1. 纯文本末尾带 JSON: "reply text {"thought":"...","valence":0.5,"arousal":0.3}"
 * 2. JSON 在代码块里: "reply text \`\`\`json{...}\`\`\`"
 * 3. JSON 前后都有文字: "reply text {json} extra text"
 * 4. 只有 reply 没有 JSON（兜底）
 */
export function parseAIResponse(content: string): ParsedAIResponse {
  if (!content || typeof content !== 'string') {
    return { reply: content || '' };
  }

  const trimmed = content.trim();

  // === 策略 1：从后往前找最后一个独立的 JSON 对象 ===
  // 这是最常见的格式：reply 在前，JSON 在后
  let lastBrace = trimmed.lastIndexOf('{');
  while (lastBrace !== -1) {
    const candidate = trimmed.slice(lastBrace);
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null) {
        const reply = trimmed.slice(0, lastBrace).trim();
        return buildResult(reply, parsed);
      }
    } catch {
      // 不是有效的 JSON，继续往前找下一个 {
      lastBrace = trimmed.lastIndexOf('{', lastBrace - 1);
    }
  }

  // === 策略 2：匹配包含 thought/valence/arousal 字段的 JSON ===
  // 处理 JSON 不在末尾的情况（前后都有文字）
  const jsonPattern = /\{[\s\S]*?"(?:thought|valence|arousal)"[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  let lastValidMatch: RegExpExecArray | null = null;

  while ((match = jsonPattern.exec(trimmed)) !== null) {
    try {
      JSON.parse(match[0]); // 验证是否合法 JSON
      lastValidMatch = match;
    } catch {
      // 忽略不合法的匹配
    }
  }

  if (lastValidMatch) {
    try {
      const parsed = JSON.parse(lastValidMatch[0]);
      const reply = trimmed
        .replace(lastValidMatch[0], '')
        .replace(/\n{2,}/g, '\n')
        .trim();
      return buildResult(reply, parsed);
    } catch {
      // 忽略，继续下一个策略
    }
  }

  // === 策略 3：处理代码块中的 JSON ===
  // AI 有时不听话，把 JSON 放在代码块里
  const codeBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const codeMatch = trimmed.match(codeBlockPattern);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1].trim());
      const reply = trimmed.replace(codeMatch[0], '').trim();
      return buildResult(reply, parsed);
    } catch {
      // 忽略
    }
  }

  // === 策略 4：尝试提取任何看起来像 JSON 的片段 ===
  // 用更宽松的模式匹配
  const loosePattern = /\{[\s\S]*?"[\w]+"[\s\S]*?\}/g;
  let looseMatch: RegExpExecArray | null;
  while ((looseMatch = loosePattern.exec(trimmed)) !== null) {
    try {
      const parsed = JSON.parse(looseMatch[0]);
      if (parsed && (typeof parsed.thought !== 'undefined' || typeof parsed.valence !== 'undefined')) {
        const reply = trimmed.replace(looseMatch[0], '').trim();
        return buildResult(reply, parsed);
      }
    } catch {
      // 继续尝试下一个匹配
    }
  }

  // === 兜底：返回原文 ===
  console.warn('[parseAIResponse] 无法从回复中提取 JSON，返回原文');
  return { reply: trimmed };
}

/**
 * 从解析后的 JSON 构建 ParsedAIResponse
 */
function buildResult(reply: string, parsed: Record<string, unknown>): ParsedAIResponse {
  return {
    reply: reply || '',
    thought: typeof parsed.thought === 'string' ? parsed.thought : undefined,
    valence: typeof parsed.valence === 'number' ? parsed.valence : undefined,
    arousal: typeof parsed.arousal === 'number' ? parsed.arousal : undefined,
  };
}
