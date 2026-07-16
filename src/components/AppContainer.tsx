import { Suspense } from 'react';
import { useOSStore } from '@/context/OSStore';
import { APP_REGISTRY } from '@/apps/registry';
import { Loader2 } from 'lucide-react';

export default function AppContainer() {
  const { currentApp } = useOSStore();
  const appDef = APP_REGISTRY[currentApp];
  const AppComponent = appDef.component;

  return (
    <div className="flex-1 overflow-hidden relative">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-white/50 animate-spin" />
            <span className="text-white/40 text-sm">加载中...</span>
          </div>
        </div>
      }>
        <AppComponent />
      </Suspense>
    </div>
  );
}
