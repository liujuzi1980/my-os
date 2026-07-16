import { useState, useEffect } from 'react';
import { Signal, Wifi, Battery, Bell } from 'lucide-react';
import { useOSStore } from '@/context/OSStore';

export default function StatusBar() {
  const [time, setTime] = useState(new Date());
  const { notifications } = useOSStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="status-bar flex items-center justify-between px-6 py-2 text-white/80 text-xs z-50">
      <div className="flex items-center gap-1">
        <span className="font-medium">{formatTime(time)}</span>
      </div>
      <div className="flex items-center gap-3">
        {unreadCount > 0 && (
          <div className="relative">
            <Bell size={14} />
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {unreadCount}
            </span>
          </div>
        )}
        <Signal size={14} />
        <Wifi size={14} />
        <div className="flex items-center gap-1">
          <Battery size={14} />
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
