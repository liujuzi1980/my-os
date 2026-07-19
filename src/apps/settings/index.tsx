import { useState, useRef, useEffect } from 'react';
import { useOSStore } from '@/context/OSStore';
import { 
  Key, Globe, Mic, Save, Download, Upload, Trash2, ChevronRight, User, 
  RefreshCw, Check, ChevronDown, AlertCircle, WifiOff, ShieldAlert,
  Plug, MapPin
} from 'lucide-react';
import { exportAllData, importAllData } from '@/db';

interface ModelInfo {
  id: string;
  owned_by?: string;
}

export default function SettingsApp() {
  const { settings, updateSettings, userProfile, updateUserProfile, setCurrentApp } = useOSStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [localProfile, setLocalProfile] = useState(userProfile);
  const [saveStatus, setSaveStatus] = useState('');

  // 模型获取相关状态
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelError, setModelError] = useState('');
  const [modelErrorType, setModelErrorType] = useState<'cors' | 'network' | 'auth' | 'unknown'>('unknown');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    await updateSettings(localSettings);
    await updateUserProfile(localProfile);
    setSaveStatus('已保存');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleFetchModels = async () => {
    if (!localSettings.apiBaseUrl || !localSettings.apiKey) {
      setModelError('请先填写 Base URL 和 API Key');
      setModelErrorType('unknown');
      return;
    }

    setIsFetchingModels(true);
    setModelError('');
    setModelErrorType('unknown');
    setShowModelDropdown(false);

    try {
      const response = await fetch(`${localSettings.apiBaseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localSettings.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('API Key 无效或已过期');
        } else if (response.status === 403) {
          throw new Error('无权限访问，请检查 API Key 权限');
        } else {
          throw new Error(`服务器返回 ${response.status}`);
        }
      }

      const data = await response.json();
      const modelList: ModelInfo[] = data.data || [];

      const chatModels = modelList
        .filter((m: ModelInfo) => {
          const id = m.id.toLowerCase();
          return !id.includes('embedding') && 
                 !id.includes('tts') && 
                 !id.includes('whisper') &&
                 !id.includes('dall') &&
                 !id.includes('moderation');
        })
        .sort((a: ModelInfo, b: ModelInfo) => {
          const priority = ['gpt-4', 'claude', 'deepseek', 'qwen', 'glm'];
          const aP = priority.findIndex(p => a.id.toLowerCase().includes(p));
          const bP = priority.findIndex(p => b.id.toLowerCase().includes(p));
          if (aP !== -1 && bP === -1) return -1;
          if (bP !== -1 && aP === -1) return 1;
          return a.id.localeCompare(b.id);
        });

      setModels(chatModels);
      setShowModelDropdown(true);

      if (chatModels.length === 0) {
        setModelError('未找到可用的聊天模型');
        setModelErrorType('unknown');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        setModelErrorType('cors');
        setModelError('请求被浏览器拦截，可能是 CORS 跨域限制。建议：1) 换用支持 CORS 的 API；2) 或在电脑上配置后同步到手机');
      } else if (msg.includes('Key') || msg.includes('401') || msg.includes('403')) {
        setModelErrorType('auth');
        setModelError(`认证失败: ${msg}`);
      } else {
        setModelErrorType('network');
        setModelError(`网络错误: ${msg}`);
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSelectModel = (modelId: string) => {
    setLocalSettings({ ...localSettings, model: modelId });
    setShowModelDropdown(false);
  };

  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        await importAllData(data);
        window.location.reload();
      } catch {
        alert('导入失败，文件格式不正确');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      const req = indexedDB.deleteDatabase('MyOS');
      req.onsuccess = () => window.location.reload();
    }
  };

  const getErrorIcon = () => {
    switch (modelErrorType) {
      case 'cors': return <ShieldAlert size={14} className="text-orange-400 flex-shrink-0" />;
      case 'network': return <WifiOff size={14} className="text-red-400 flex-shrink-0" />;
      case 'auth': return <Key size={14} className="text-yellow-400 flex-shrink-0" />;
      default: return <AlertCircle size={14} className="text-red-400 flex-shrink-0" />;
    }
  };

  // MCP 连接数量
  const mcpCount = settings.mcpConnections?.length || 0;
  const enabledMcpCount = settings.mcpConnections?.filter(c => c.enabled).length || 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h1 className="text-white/90 text-lg font-semibold">设置</h1>
      </div>

      <div className="p-5 space-y-6">
        {/* API 设置 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Key size={14} /> AI 接口
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-white/60 text-sm block mb-1.5">API Base URL</label>
              <input
                type="text"
                value={localSettings.apiBaseUrl}
                onChange={(e) => {
                  setLocalSettings({ ...localSettings, apiBaseUrl: e.target.value });
                  setModelError('');
                }}
                placeholder="https://api.openai.com/v1"
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1.5">API Key</label>
              <input
                type="password"
                value={localSettings.apiKey}
                onChange={(e) => {
                  setLocalSettings({ ...localSettings, apiKey: e.target.value });
                  setModelError('');
                }}
                placeholder="sk-..."
                className="glass-input w-full text-sm"
              />
            </div>

            {/* Model 输入 + 获取模型按钮 */}
            <div className="relative" ref={dropdownRef}>
              <label className="text-white/60 text-sm block mb-1.5">模型</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
                    placeholder="gpt-4o-mini"
                    className="glass-input w-full text-sm pr-8"
                  />
                  {localSettings.model && (
                    <button
                      onClick={() => setLocalSettings({ ...localSettings, model: '' })}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    >
                      <span className="text-lg">×</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={handleFetchModels}
                  disabled={isFetchingModels}
                  className={`
                    glass-btn flex items-center gap-1.5 px-3 whitespace-nowrap
                    ${isFetchingModels ? 'opacity-60 cursor-wait' : 'hover:bg-white/15'}
                  `}
                  title="获取可用模型列表"
                >
                  <RefreshCw size={14} className={isFetchingModels ? 'animate-spin' : ''} />
                  <span className="text-xs">获取模型</span>
                </button>
              </div>

              {/* 错误提示 */}
              {modelError && (
                <div className="flex items-start gap-1.5 mt-2 text-xs">
                  {getErrorIcon()}
                  <span className={`
                    ${modelErrorType === 'cors' ? 'text-orange-400/90' : 'text-red-400/80'}
                    leading-relaxed
                  `}>
                    {modelError}
                  </span>
                </div>
              )}

              {/* 模型下拉选择框 */}
              {showModelDropdown && models.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 glass-panel overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
                  <div className="px-3 py-2 border-b border-white/5 bg-white/5">
                    <span className="text-white/40 text-xs">找到 {models.length} 个模型</span>
                  </div>
                  {models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className={`
                        w-full px-3 py-2.5 flex items-center justify-between text-left
                        hover:bg-white/10 transition-colors
                        ${localSettings.model === model.id ? 'bg-blue-500/10' : ''}
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 text-sm truncate">{model.id}</p>
                        {model.owned_by && (
                          <p className="text-white/30 text-xs">{model.owned_by}</p>
                        )}
                      </div>
                      {localSettings.model === model.id && (
                        <Check size={16} className="text-blue-400 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* MCP 服务入口 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Plug size={14} /> MCP 服务
          </h2>
          <button
            onClick={() => setCurrentApp('mcp')}
            className="glass-card w-full p-4 flex items-center justify-between text-left hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Plug size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-white/80 text-sm font-medium">MCP 连接管理</p>
                <p className="text-white/30 text-xs">
                  {mcpCount === 0 
                    ? '未配置 MCP 服务' 
                    : `${mcpCount} 个连接 · ${enabledMcpCount} 个已启用`
                  }
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-white/30" />
          </button>
        </section>

        {/* 地图服务 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <MapPin size={14} /> 地图服务
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-white/60 text-sm block mb-1.5">高德地图 API Key</label>
              <input
                type="password"
                value={localSettings.amapKey || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, amapKey: e.target.value })}
                placeholder="填写高德 Web服务 Key"
                className="glass-input w-full text-sm"
              />
              <p className="text-white/30 text-xs mt-1.5">
                用于查询附近美食、奶茶、咖啡店和天气
              </p>
            </div>
          </div>
        </section>

        {/* TTS 设置 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Mic size={14} /> 语音通话
          </h2>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/80 text-sm">启用语音</span>
              <button
                onClick={() => setLocalSettings({ ...localSettings, ttsEnabled: !localSettings.ttsEnabled })}
                className={`
                  w-11 h-6 rounded-full transition-colors relative
                  ${localSettings.ttsEnabled ? 'bg-blue-500' : 'bg-white/10'}
                `}
              >
                <span 
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                  style={{ 
                    transform: localSettings.ttsEnabled ? 'translateX(20px)' : 'translateX(0)',
                    left: '2px'
                  }} 
                />
              </button>
            </div>
            {localSettings.ttsEnabled && (
              <div className="space-y-3 mt-3 pt-3 border-t border-white/5">
                <input
                  type="text"
                  value={localSettings.ttsApiKey || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, ttsApiKey: e.target.value })}
                  placeholder="MiniMax API Key"
                  className="glass-input w-full text-sm"
                />
                <input
                  type="text"
                  value={localSettings.ttsGroupId || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, ttsGroupId: e.target.value })}
                  placeholder="MiniMax Group ID"
                  className="glass-input w-full text-sm"
                />
              </div>
            )}
          </div>
        </section>

        {/* 用户档案 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <User size={14} /> 用户档案
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-white/60 text-sm block mb-1.5">名字</label>
              <input
                type="text"
                value={localProfile.name}
                onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
                placeholder="你的名字"
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1.5">简介</label>
              <input
                type="text"
                value={localProfile.bio || ''}
                onChange={(e) => setLocalProfile({ ...localProfile, bio: e.target.value })}
                placeholder="一句话介绍自己"
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1.5">MBTI</label>
              <input
                type="text"
                value={localProfile.mbti || ''}
                onChange={(e) => setLocalProfile({ ...localProfile, mbti: e.target.value })}
                placeholder="例如：INTP"
                className="glass-input w-full text-sm"
              />
            </div>
          </div>
        </section>

        {/* 数据管理 */}
        <section>
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe size={14} /> 数据管理
          </h2>
          <div className="space-y-2">
            <button onClick={handleExport} className="glass-card w-full p-3 flex items-center justify-between text-left hover:bg-white/10">
              <div className="flex items-center gap-3">
                <Download size={18} className="text-blue-400" />
                <span className="text-white/80 text-sm">导出数据</span>
              </div>
              <ChevronRight size={16} className="text-white/30" />
            </button>

            <label className="glass-card w-full p-3 flex items-center justify-between text-left hover:bg-white/10 cursor-pointer block">
              <div className="flex items-center gap-3">
                <Upload size={18} className="text-green-400" />
                <span className="text-white/80 text-sm">导入数据</span>
              </div>
              <ChevronRight size={16} className="text-white/30" />
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>

            <button onClick={handleClearAll} className="glass-card w-full p-3 flex items-center justify-between text-left hover:bg-red-500/10 border-red-500/20">
              <div className="flex items-center gap-3">
                <Trash2 size={18} className="text-red-400" />
                <span className="text-red-300 text-sm">清空所有数据</span>
              </div>
              <ChevronRight size={16} className="text-red-300/30" />
            </button>
          </div>
        </section>

        {/* 保存按钮 */}
        <div className="pt-2">
          <button 
            onClick={handleSave}
            className="glass-btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {saveStatus || '保存设置'}
          </button>
        </div>

        <div className="text-center pb-4">
          <p className="text-white/20 text-xs">MyOS v0.0.1</p>
        </div>
      </div>
    </div>
  );
}
