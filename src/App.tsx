import { useEffect } from 'react';
import { useOSStore } from '@/context/OSStore';
import StatusBar from '@/components/StatusBar';
import AppContainer from '@/components/AppContainer';
import Dock from '@/components/Dock';

function App() {
  const { loadCharacters, loadSettings, loadUserProfile } = useOSStore();

  // 初始化：加载所有数据
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadSettings(),
        loadUserProfile(),
        loadCharacters(),
      ]);
    };
    init();
  }, []);

  return (
    <div className="phone-frame">
      <StatusBar />
      <AppContainer />
      <Dock />
    </div>
  );
}

export default App;
