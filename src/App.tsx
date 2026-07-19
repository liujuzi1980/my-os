import { useEffect, useState } from 'react';
import { useOSStore } from '@/context/OSStore';
import StatusBar from '@/components/StatusBar';
import AppContainer from '@/components/AppContainer';
import Dock from '@/components/Dock';

function App() {
  const { loadCharacters, loadSettings, loadUserProfile } = useOSStore();
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
      await Promise.all([
        loadSettings(),
        loadUserProfile(),
        loadCharacters(),
      ]);
    };
    init();
  }, [ready, loadSettings, loadUserProfile, loadCharacters]);

  if (!ready) {
    return (
      <div className="phone-frame flex items-center justify-center">
        <div className="text-white/60 text-sm">系统恢复中...</div>
      </div>
    );
  }

  return (
    <div className="phone-frame">
      <StatusBar />
      <AppContainer />
      <Dock />
    </div>
  );
}

export default App;
