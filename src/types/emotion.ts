export interface EmotionHistoryPoint {
  valence: number;   // -1.0 ~ 1.0
  arousal: number;   // 0.0 ~ 1.0
  timestamp: number;
  trigger: string;   // 触发这次变化的事件摘要
}

export interface CharacterState {
  characterId: string;
  valence: number;
  arousal: number;
  mood: string;
  currentActivity: string;
  stateUpdatedAt: number;
  emotionHistory: EmotionHistoryPoint[];
  innerMonologue?: string;  // 当前心声（内心戏）
}

export interface ParsedAIResponse {
  reply: string;
  thought?: string;
  valence?: number;
  arousal?: number;
}
