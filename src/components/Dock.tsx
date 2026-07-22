import { useOSStore } from '@/context/OSStore';
import { APP_REGISTRY, DOCK_APPS } from '@/apps/registry';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function Dock() {
  const { currentApp, setCurrentApp } = useOSStore();

  const getIcon = (iconName: string): LucideIcon => {
    return (Icons as Record<string, LucideIcon>)[iconName] || Icons.Circle;
  };

  // 如果当前在桌面，不显示任何 Dock 高亮
  const isDesktop = currentApp === 'desktop';

  return (
    <div className="dock-blur px-6 pb-5 pt-2 z-50">
      <div className="flex items-center justify-around">
        {DOCK_APPS.map((appId) => {
          const app = APP_REGISTRY[appId];
          const Icon = getIcon(app.icon);
          const isActive = !isDesktop && currentApp === appId;

          return (
            <button
              key={appId}
              onClick={() => setCurrentApp(appId)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={`
                  w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
                  ${isActive 
                    ? 'scale-110 shadow-lg' 
                    : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }
                `}
                style={{
                  background: isActive 
                    ? `linear-gradient(135deg, ${app.color}88, ${app.color}44)` 
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: isActive ? `0 0 20px ${app.color}44` : undefined,
                }}
              >
                <Icon 
                  size={22} 
                  color={isActive ? app.color : 'rgba(255,255,255,0.7)'} 
                />
              </div>
              <span className={`
                text-[10px] transition-colors
                ${isActive ? 'text-white/90 font-medium' : 'text-white/40'}
              `}>
                {app.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}