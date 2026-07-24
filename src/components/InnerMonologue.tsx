import React, { useState } from 'react';

interface Props {
  thought?: string;
}

export const InnerMonologue: React.FC<Props> = ({ thought }) => {
  const [open, setOpen] = useState(false);
  if (!thought) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs group"
      >
        {open ? (
          <span className="text-purple-300/60 hover:text-purple-300/90">收起心声</span>
        ) : (
          <>
            <span className="w-5 h-5 rounded flex items-center justify-center bg-purple-500/10 text-purple-300 text-[11px]"
              style={{ fontFamily: 'serif', fontStyle: 'italic' }}>心</span>
            <span className="text-purple-300/50 group-hover:text-purple-300/80">心声</span>
          </>
        )}
      </button>
      {open && (
        <div className="narrative-card mt-2 text-xs leading-relaxed">
          {thought}
        </div>
      )}
    </div>
  );
};