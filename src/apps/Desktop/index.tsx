import { useOSStore } from '@/context/OSStore';
import { APP_REGISTRY, DESKTOP_PAGES } from '@/apps/registry';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppID } from '@/types';
import { useState } from 'react';

export default function DesktopApp() {
  const { setCurrentApp } = useOSStore();
  const [currentPage, setCurrentPage] = useState(0);

  const getIcon = (iconName: string): LucideIcon => {
    return (Icons as Record<string, LucideIcon>)[iconName] || Icons.Circle;
  };

  const pages = DESKTOP_PAGES;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* 桌面网格 */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-x-4 gap-y-8">
          {pages[currentPage]?.map((appId) => {
            const app = APP_REGISTRY[appId];
            const Icon = getIcon(app.icon);
            const isImplemented = app.implemented !== false;

            return (
              <button
                key={appId}
                onClick={() => isImplemented && setCurrentApp(appId)}
                className={`flex flex-col items-center gap-2 group ${
                  !isImplemented ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <div
                  className={`
                    w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200
                    ${isImplemented 
                      ? 'bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95' 
                      : 'bg-white/5'
                    }
                  `}
                  style={{
                    boxShadow: isImplemented ? `0 4px 20px ${app.color}22` : undefined,
                  }}
                >
                  <Icon 
                    size={28} 
                    color={isImplemented ? app.color : '#666'} 
                  />
                </div>
                <span className={`text-xs ${isImplemented ? 'text-white/70' : 'text-white/30'}`}>
                  {app.name}
                </span>
                {!isImplemented && (
                  <span className="text-[9px] text-white/20">即将上线</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 页面指示器 */}
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-2 pb-8 pt-2">
          {pages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPage(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentPage ? 'bg-white/60 w-4' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}