import React, { useState } from 'react';

interface Props {
  thought?: string;
}

export const InnerMonologue: React.FC<Props> = ({ thought }) => {
  const [open, setOpen] = useState(false);
  if (!thought) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 cursor-pointer"
      >
        <span>{open ? '🔽' : '💭'}</span>
        <span className="italic">{open ? '收起心声' : '查看心声'}</span>
      </button>
      {open && (
        <div className="mt-1 text-xs text-white/30 italic border-l-2 border-white/10 pl-2">
          {thought}
        </div>
      )}
    </div>
  );
};
