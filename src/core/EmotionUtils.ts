import { EmotionHistoryPoint } from '../types/emotion';

/** 情感坐标 → 人类可读标签 */
export function deriveMood(valence: number, arousal: number): string {
  if (valence > 0.5 && arousal > 0.5) return '兴奋';
  if (valence > 0.5 && arousal <= 0.5) return '满足';
  if (valence > 0 && arousal > 0.5) return '期待';
  if (valence <= 0 && arousal > 0.5) return '焦虑';
  if (valence < -0.5 && arousal > 0.5) return '愤怒';
  if (valence < -0.5 && arousal <= 0.5) return '沮丧';
  if (valence < 0 && arousal <= 0.5) return '疲惫';
  return '平静';
}

/** 根据情感获取主题色（用于 UI） */
export function getEmotionColor(valence: number, arousal: number): string {
  if (valence > 0.3) return arousal > 0.5 ? '#f59e0b' : '#10b981'; // 兴奋/满足
  if (valence < -0.3) return arousal > 0.5 ? '#ef4444' : '#6366f1'; // 愤怒/沮丧
  return '#6b7280'; // 平静/疲惫
}

/** 滑动平均：防止情感跳跃（新值 = 旧值×0.7 + AI输出×0.3） */
export function smoothEmotion(current: number, target: number, factor = 0.3): number {
  const v = current * (1 - factor) + target * factor;
  return Math.round(v * 100) / 100;
}

/** 边界限制 */
export function clampEmotion(valence: number, arousal: number) {
  return {
    valence: Math.max(-1, Math.min(1, valence)),
    arousal: Math.max(0, Math.min(1, arousal)),
  };
}

/** 格式化情感，用于插入 Prompt */
export function formatEmotionForPrompt(valence: number, arousal: number): string {
  const mood = deriveMood(valence, arousal);
  const vDesc = valence > 0 ? '正面' : valence < 0 ? '负面' : '中性';
  const aDesc = arousal > 0.5 ? '高唤醒' : '低唤醒';
  return `情感坐标：valence=${valence.toFixed(2)}（${vDesc}）, arousal=${arousal.toFixed(2)}（${aDesc}）→ 当前状态：${mood}`;
}
