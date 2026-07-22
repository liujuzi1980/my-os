import { useEffect, useState } from 'react';
import { useOSStore } from '@/context/OSStore';
import { runMigrations } from '@/db/migrate';
import StatusBar from '@/components/StatusBar';
import AppContainer from '@/components/AppContainer';
import Dock from '@/components/Dock';

function App() {
  const { loadCharacters, loadSettings, loadUserProfile, currentApp, setCurrentApp } = useOSStore();
  const [ready, setReady] = useState(false);

  // 【关键修复】等待 persist 从 localStorage 恢复完成，再去读数据库
  useEffect(() => {
    if (useOSStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    const unsub = useOSStore.persist.onFinishHydration(() => {
      setReady(true);
    });
    return unsub;
  }, []);

  // 恢复完成后，再加载 IndexedDB 数据作为补充
  useEffect(() => {
    if (!ready) return;
    const init = async () => {
      // === 阶段 3：应用启动时自动执行数据迁移 ===
      await runMigrations().catch(console.error);

      await Promise.all([
        loadSettings(),
        loadUserProfile(),
        loadCharacters(),
      ]);

      // === 桌面模式：启动后显示桌面 ===
      // 如果有 lastApp 且不是 desktop，恢复上次应用
      // 否则默认打开桌面
      const { settings } = useOSStore.getState();
      if (!settings.lastApp || settings.lastApp === 'message') {
        setCurrentApp('desktop');
      }
    };
    init();
  }, [ready, loadSettings, loadUserProfile, loadCharacters, setCurrentApp]);

  if (!ready) {
    return (
      <div className="phone-frame flex items-center justify-center">
        <div className="text-white/60 text-sm">系统恢复中...</div>
      </div>
    );
  }

  // === 桌面模式下不显示 Dock ===
  const showDock = currentApp !== 'desktop';

  return (
    <div className="phone-frame">
      <StatusBar />
      <AppContainer />
      {showDock && <Dock />}
    </div>
  );
}

export default App;