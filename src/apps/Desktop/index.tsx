import { useState, useEffect } from 'react';
import { useOSStore } from '@/context/OSStore';
import { APP_REGISTRY, DOCK_APPS, DESKTOP_PAGES } from '@/apps/registry';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function DesktopApp() {
  const { currentApp, setCurrentApp } = useOSStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const getIcon = (iconName: string): LucideIcon => {
    return (Icons as unknown as Record<string, LucideIcon>)[iconName] || Icons.Circle;
  };

  const hour = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateStr = weekdays[now.getDay()] + ' ' + (now.getMonth() + 1) + '/' + now.getDate();

  return (
    <div className="flex flex-col h-full"
      style={{ background: 'linear-gradient(180deg, #f0f4ff 0%, #dce6ff 50%, #c8d5ff 100%)' }}>
      {/* 主内容 */}
      <div className="flex-1 flex flex-col px-6 pt-14 pb-2">
        {/* 时间区域 — 大号居中 */}
        <div className="flex flex-col items-center mb-7 mt-4">
          <div className="tracking-wider text-8xl font-extralight text-[#2c3e50] leading-none">
            {hour}<span className="text-[#2c3e50]/30 mx-0.5">:</span>{mm}
          </div>
          <div className="text-sm text-[#5d6d7e] mt-2 tracking-wide">{dateStr}</div>
        </div>

        {/* 桌面网格 */}
        <div className="grid grid-cols-4 gap-x-4 gap-y-8">
          {DESKTOP_PAGES[currentPage]?.map((appId) => {
            const app = APP_REGISTRY[appId];
            const Icon = getIcon(app.icon);
            const isImplemented = app.implemented !== false;

            return (
              <button key={appId}
                onClick={() => isImplemented && setCurrentApp(appId)}
                className={'flex flex-col items-center gap-1 group ' +
                  (!isImplemented ? 'opacity-30 cursor-not-allowed' : '')}>
                <div className="w-[58px] h-[58px] rounded-[22%] flex items-center justify-center shadow-sm
                  transition-all duration-200 group-hover:scale-105 active:scale-95"
                  style={{ background: app.color }}>
                  <Icon size={26} color="white" strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-medium text-gray-600 leading-tight text-center px-0.5">
                  {app.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* 撑满，让页标紧贴 dock */}
        <div className="flex-1" />

        {/* 页面指示器 */}
        {DESKTOP_PAGES.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-3 mt-2">
            {DESKTOP_PAGES.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentPage(idx)}
                className={'rounded-full transition-all duration-300 ' +
                  (idx === currentPage
                    ? 'bg-gray-500 w-6 h-[6px]'
                    : 'bg-gray-400/40 w-[6px] h-[6px]')} />
            ))}
          </div>
        )}


      </div>

      {/* 底部 Dock */}
      <div className="flex items-center justify-around px-8 py-3 mx-4 mb-5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(30px)' }}>
        {DOCK_APPS.map((appId) => {
          const app = APP_REGISTRY[appId];
          const Icon = getIcon(app.icon);
          const isActive = currentApp === appId;

          return (
            <button key={appId} onClick={() => setCurrentApp(appId)}
              className="flex flex-col items-center gap-1 group">
              <div className={'w-[52px] h-[52px] rounded-[22%] flex items-center justify-center transition-all duration-200 ' +
                (isActive ? 'scale-110' : 'group-hover:scale-105 active:scale-95')}
                style={{ background: app.color }}>
                <Icon size={22} color="white" strokeWidth={1.8} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}