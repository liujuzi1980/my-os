import React from 'react';
import { getEmotionColor, deriveMood } from '../core/EmotionUtils';

interface Props {
  valence: number;
  arousal: number;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const EmotionBadge: React.FC<Props> = ({ valence, arousal, showDetails, size = 'md' }) => {
  const mood = deriveMood(valence, arousal);
  const color = getEmotionColor(valence, arousal);

  const cls = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`rounded-full font-medium text-white ${cls[size]}`}
        style={{ backgroundColor: color }}
        title={`valence=${valence.toFixed(2)}, arousal=${arousal.toFixed(2)}`}
      >
        {mood}
      </span>
      {showDetails && (
        <span className="text-xs text-gray-500 font-mono">
          v:{valence.toFixed(2)} a:{arousal.toFixed(2)}
        </span>
      )}
    </div>
  );
};
