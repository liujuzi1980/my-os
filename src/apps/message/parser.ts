import { ParsedAIResponse } from '../../types/emotion';

export function parseAIResponse(content: string): ParsedAIResponse {
  const result: ParsedAIResponse = { reply: content.trim() };
  if (!content) return result;

  try {
    // 策略1：匹配 ```json 代码块
    const codeBlock = content.match(/```(?:json)?\s*\n?([\s\S]*?\{[\s\S]*?"thought"[\s\S]*?\}[\s\S]*?)\n?```/);
    // 策略2：匹配行内 JSON
    const inline = content.match(/\{[\s\S]*?"thought"[\s\S]*?\}/);

    const jsonStr = codeBlock ? codeBlock[1] : inline ? inline[0] : null;
    if (!jsonStr) return result;

    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.thought === 'string') result.thought = parsed.thought;
    if (typeof parsed.valence === 'number') result.valence = parsed.valence;
    if (typeof parsed.arousal === 'number') result.arousal = parsed.arousal;

    // 从回复中移除 JSON 部分，清理残留标点
    result.reply = content
      .replace(/```(?:json)?\s*\n?[\s\S]*?\n?```/, '')
      .replace(/\{[\s\S]*?"thought"[\s\S]*?\}/, '')
      .trim()
      .replace(/[,\n]+$/, '');

  } catch (e) {
    console.warn('[parseAIResponse] 解析失败，fallback 到原文:', e);
  }

  return result;
}
