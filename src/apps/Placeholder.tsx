import { useOSStore } from '@/context/OSStore';
import { ArrowLeft } from 'lucide-react';

export default function PlaceholderApp() {
  const { currentApp, setCurrentApp } = useOSStore();
  const appInfo = currentApp; // 实际应该从 registry 获取

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <button 
          onClick={() => setCurrentApp('message')}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <span className="text-white/90 font-medium">开发中</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚧</div>
          <p className="text-white/50 text-lg">这个功能还在开发中</p>
          <p className="text-white/30 text-sm mt-2">敬请期待...</p>
        </div>
      </div>
    </div>
  );
}
