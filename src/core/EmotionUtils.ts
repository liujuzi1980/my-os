
/** 情感坐标 → 人类可读标签
 *
 * 阈值与 getEmotionColor 严格对齐（同一份分支逻辑）。
 * 高唤醒层先判，避免负面 dead branch（原版"愤怒"被"焦虑"提前吃掉）。
 * 新增"愉悦"覆盖 v∈(0.3,0.5] & 低唤醒，就是轻度开心那个区间。
 */
export function deriveMood(valence: number, arousal: number): string {
  if (valence > 0.5 && arousal > 0.5) return '兴奋';
  if (valence > 0.5 && arousal <= 0.5) return '满足';
  if (valence > 0.3 && arousal > 0.5) return '期待';
  if (valence > 0.3 && arousal <= 0.5) return '愉悦';
  if (valence < -0.5 && arousal > 0.5) return '愤怒';
  if (valence < -0.5 && arousal <= 0.5) return '沮丧';
  if (valence < 0 && arousal > 0.5) return '焦虑';
  if (valence < 0 && arousal <= 0.5) return '疲惫';
  return '平静';
}

/** mood 标签 → 主题色，统一映射表，保证 UI 颜色与字面一一对应 */
const MOOD_COLOR: Record<string, string> = {
  '兴奋': '#f59e0b',
  '满足': '#10b981',
  '期待': '#8b5cf6',
  '愉悦': '#10b981',
  '愤怒': '#dc2626',
  '沮丧': '#6366f1',
  '焦虑': '#ef4444',
  '疲惫': '#64748b',
  '平静': '#3b82f6',
};

/** 根据情感获取主题色（用于 UI）—— 始终与 deriveMood 一致 */
export function getEmotionColor(valence: number, arousal: number): string {
  return MOOD_COLOR[deriveMood(valence, arousal)] ?? '#3b82f6';
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
