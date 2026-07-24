import type { CharacterState, EmotionHistoryPoint, ParsedAIResponse } from '@/types';
import { deriveMood, smoothEmotion, clampEmotion } from './EmotionUtils';

const MAX_HISTORY = 50;

export class CharacterStateManager {
  private state: CharacterState;

  constructor(initialState: CharacterState) {
    this.state = { ...initialState };
  }

  getState(): CharacterState {
    return { ...this.state };
  }

  /** 根据 AI 返回更新状态（含滑动平均） */
  updateFromAIResponse(parsed: ParsedAIResponse, trigger: string): CharacterState {
    let newValence = this.state.valence ?? 0;
    let newArousal = this.state.arousal ?? 0.3;
    let newThought = this.state.innerMonologue;

    if (parsed.valence !== undefined && parsed.arousal !== undefined) {
      const c = clampEmotion(parsed.valence, parsed.arousal);
      newValence = smoothEmotion(this.state.valence ?? 0, c.valence, 0.3);
      newArousal = smoothEmotion(this.state.arousal ?? 0.3, c.arousal, 0.3);
    }

    if (parsed.thought) {
      newThought = parsed.thought;
    }

    const now = Date.now();
    const point: EmotionHistoryPoint = {
      valence: newValence,
      arousal: newArousal,
      timestamp: now,
      trigger: trigger.slice(0, 50),
    };

    this.state = {
      ...this.state,
      valence: newValence,
      arousal: newArousal,
      mood: deriveMood(newValence, newArousal),
      innerMonologue: newThought,
      stateUpdatedAt: now,
      emotionHistory: [...(this.state.emotionHistory || []), point].slice(-MAX_HISTORY),
    };

    return this.getState();
  }

  setActivity(activity: string): void {
    this.state = { ...this.state, currentActivity: activity, stateUpdatedAt: Date.now() };
  }
}
