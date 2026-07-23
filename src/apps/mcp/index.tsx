import { useState, useEffect, useRef } from 'react';
import { useOSStore } from '@/context/OSStore';
import { mcpManager } from '@/core/MCPClientManager';
import type { MCPConnection, MCPConnectionState, MCPTransportType } from '@/types';
import {
  Plug, Plus, Trash2, ChevronRight, Check, X, AlertCircle,
  RefreshCw, Server, Key, Link, Globe, ChevronLeft, Power,
  Wrench, FileText, Copy, CheckCircle2
} from 'lucide-react';

const TRANSPORT_OPTIONS: { value: MCPTransportType; label: string }[] = [
  { value: 'sse', label: 'SSE (Server-Sent Events)' },
  { value: 'http', label: 'HTTP Streamable' },
];

const STATUS_CONFIG = {
  disconnected: { label: '未连接', color: 'text-white/40', bg: 'bg-white/5', icon: Power },
  connecting: { label: '连接中', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: RefreshCw },
  connected: { label: '已连接', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
  error: { label: '连接失败', color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertCircle },
};

function StatusBadge({ status }: { status: MCPConnectionState['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${config.bg} ${config.color}`}>
      <Icon size={12} className={status === 'connecting' ? 'animate-spin' : ''} />
      {config.label}
    </span>
  );
}

// ==================== 连接表单 ====================

interface ConnectionFormProps {
  connection?: MCPConnection;
  onSave: (connection: MCPConnection) => void;
  onCancel: () => void;
}

function ConnectionForm({ connection, onSave, onCancel }: ConnectionFormProps) {
  const [name, setName] = useState(connection?.name || '');
  const [url, setUrl] = useState(connection?.url || '');
  const [transport, setTransport] = useState<MCPTransportType>(connection?.transport || 'sse');
  const [apiKey, setApiKey] = useState(connection?.apiKey || '');
  const [headersText, setHeadersText] = useState(
    connection?.headers ? JSON.stringify(connection.headers, null, 2) : ''
  );
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      setError('请输入连接名称');
      return;
    }
    if (!url.trim()) {
      setError('请输入连接地址');
      return;
    }

    let headers: Record<string, string> | undefined;
    if (headersText.trim()) {
      try {
        headers = JSON.parse(headersText);
      } catch {
        setError('自定义请求头格式错误，必须是有效的 JSON');
        return;
      }
    }

    const newConnection: MCPConnection = {
      id: connection?.id || crypto.randomUUID(),
      name: name.trim(),
      transport,
      url: url.trim(),
      apiKey: apiKey.trim() || undefined,
      headers,
      enabled,
      createdAt: connection?.createdAt || Date.now(),
    };

    onSave(newConnection);
  };

  return (
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white/90 font-medium text-sm">
          {connection ? '编辑连接' : '新增连接'}
        </h3>
        <button onClick={onCancel} className="p-1 rounded-full hover:bg-white/10">
          <X size={16} className="text-white/50" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-white/60 text-xs block mb-1.5">连接名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：文件系统工具"
            className="glass-input w-full text-sm"
          />
        </div>

        <div>
          <label className="text-white/60 text-xs block mb-1.5">传输方式</label>
          <div className="flex gap-2">
            {TRANSPORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTransport(opt.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs transition-all border ${
                  transport === opt.value
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-white/60 text-xs block mb-1.5 flex items-center gap-1">
            <Globe size={12} /> 连接地址
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3001/sse"
            className="glass-input w-full text-sm"
          />
          <p className="text-white/25 text-[11px] mt-1">SSE 地址示例：http://localhost:3001/sse</p>
        </div>

        <div>
          <label className="text-white/60 text-xs block mb-1.5 flex items-center gap-1">
            <Key size={12} /> API Key（可选）
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Bearer Token（如有）"
            className="glass-input w-full text-sm"
          />
        </div>

        <div>
          <label className="text-white/60 text-xs block mb-1.5">自定义请求头（可选，JSON 格式）</label>
          <textarea
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            placeholder='{ "X-Custom-Header": "value" }'
            className="glass-input w-full text-sm font-mono"
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/60 text-xs">启用此连接</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              enabled ? 'bg-blue-500' : 'bg-white/10'
            }`}
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform"
              style={{
                transform: enabled ? 'translateX(20px)' : 'translateX(0)',
                left: '2px',
              }}
            />
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="glass-btn flex-1 text-sm">取消</button>
        <button onClick={handleSave} className="glass-btn-primary flex-1 text-sm">
          <Check size={14} className="inline mr-1" />
          保存
        </button>
      </div>
    </div>
  );
}

// ==================== 工具列表弹窗 ====================

function ToolsModal({ connectionId, connectionName, onClose }: { connectionId: string; connectionName: string; onClose: () => void }) {
  const { mcpConnectionStates } = useOSStore();
  const state = mcpConnectionStates[connectionId];
  const tools = state?.tools || [];
  const resources = state?.resources || [];
  const [activeTab, setActiveTab] = useState<'tools' | 'resources'>('tools');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  const handleCopySchema = (toolName: string, schema: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2)).catch(() => {});
    setCopiedTool(toolName);
    setTimeout(() => setCopiedTool(null), 1500);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-sm mx-4 mb-8 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <h3 className="text-white/90 font-medium text-sm">{connectionName}</h3>
            <p className="text-white/40 text-xs">
              {tools.length} 个工具 · {resources.length} 个资源
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X size={18} className="text-white/50" />
          </button>
        </div>

        <div className="flex border-b border-white/5">
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'tools' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/40'
            }`}
          >
            <Wrench size={12} className="inline mr-1" />
            工具
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'resources' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/40'
            }`}
          >
            <FileText size={12} className="inline mr-1" />
            资源
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === 'tools' && (
            tools.length === 0 ? (
              <p className="text-white/30 text-xs text-center py-8">暂无可用工具</p>
            ) : (
              tools.map((tool) => (
                <div key={tool.name} className="glass-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 text-sm font-medium">{tool.name}</span>
                    <button
                      onClick={() => handleCopySchema(tool.name, tool.inputSchema)}
                      className="p-1 rounded hover:bg-white/10"
                      title="复制参数格式"
                    >
                      {copiedTool === tool.name ? (
                        <Check size={12} className="text-green-400" />
                      ) : (
                        <Copy size={12} className="text-white/30" />
                      )}
                    </button>
                  </div>
                  <p className="text-white/40 text-xs leading-relaxed">{tool.description}</p>
                </div>
              ))
            )
          )}

          {activeTab === 'resources' && (
            resources.length === 0 ? (
              <p className="text-white/30 text-xs text-center py-8">暂无可用资源</p>
            ) : (
              resources.map((res) => (
                <div key={res.uri} className="glass-card p-3 space-y-1">
                  <span className="text-white/80 text-sm font-medium">{res.name}</span>
                  <p className="text-white/30 text-[11px] font-mono">{res.uri}</p>
                  {res.description && (
                    <p className="text-white/40 text-xs">{res.description}</p>
                  )}
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

export default function MCPApp() {
  const {
    mcpConnections,
    mcpConnectionStates,
    addMCPConnection,
    updateMCPConnection,
    removeMCPConnection,
    setMCPConnectionState,
    setCurrentApp,
  } = useOSStore();

  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<MCPConnection | undefined>();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [viewingToolsId, setViewingToolsId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 监听 MCP 管理器的状态变化
  useEffect(() => {
    const unsubscribe = mcpManager.addStateListener((id, state) => {
      setMCPConnectionState(id, state);
    });
    return () => unsubscribe();
  }, [setMCPConnectionState]);

  const handleTestConnection = async (connection: MCPConnection) => {
    setTestingId(connection.id);
    setMCPConnectionState(connection.id, { status: 'connecting' });

    const success = await mcpManager.connect(connection);

    if (success) {
      // 如果连接成功但连接被禁用，自动启用
      if (!connection.enabled) {
        await updateMCPConnection({ ...connection, enabled: true });
      }
    }

    setTestingId(null);
  };

  const handleDisconnect = async (connectionId: string) => {
    await mcpManager.disconnect(connectionId);
  };

  const handleSave = async (connection: MCPConnection) => {
    if (editingConnection) {
      await updateMCPConnection(connection);
    } else {
      await addMCPConnection(connection);
    }
    setShowForm(false);
    setEditingConnection(undefined);
  };

  const handleEdit = (connection: MCPConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await mcpManager.disconnect(id);
    await removeMCPConnection(id);
    setDeleteConfirmId(null);
  };

  const handleToggleEnabled = async (connection: MCPConnection) => {
    const updated = { ...connection, enabled: !connection.enabled };
    await updateMCPConnection(updated);
    if (!updated.enabled) {
      await mcpManager.disconnect(connection.id);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentApp('desktop')}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={20} className="text-white/70" />
          </button>
          <div className="flex items-center gap-2">
            <Plug size={18} className="text-orange-400" />
            <h1 className="text-white/90 text-lg font-semibold">MCP 服务</h1>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingConnection(undefined);
            setShowForm(true);
          }}
          className="p-2 rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors"
        >
          <Plus size={18} className="text-blue-400" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* 说明卡片 */}
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-blue-400" />
            <span className="text-white/80 text-sm font-medium">什么是 MCP？</span>
          </div>
          <p className="text-white/40 text-xs leading-relaxed">
            MCP（Model Context Protocol）让 AI 角色可以调用外部工具，如文件系统、搜索引擎、数据库等。
            添加 MCP 服务器后，AI 在聊天中就能使用这些工具来帮助你。
          </p>
        </div>

        {/* 新增表单 */}
        {showForm && (
          <ConnectionForm
            connection={editingConnection}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingConnection(undefined);
            }}
          />
        )}

        {/* 连接列表 */}
        <div className="space-y-3">
          <h2 className="text-white/50 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
            <Link size={12} />
            已保存的连接 ({mcpConnections.length})
          </h2>

          {mcpConnections.length === 0 && !showForm && (
            <div className="glass-card p-8 text-center">
              <Plug size={32} className="text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">还没有 MCP 连接</p>
              <p className="text-white/25 text-xs mt-1">点击右上角 + 添加一个</p>
            </div>
          )}

          {mcpConnections.map((connection) => {
            const state = mcpConnectionStates[connection.id];
            const isConnected = state?.status === 'connected';
            const isTesting = testingId === connection.id;

            return (
              <div key={connection.id} className="glass-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white/90 font-medium text-sm truncate">{connection.name}</span>
                      <StatusBadge status={state?.status || 'disconnected'} />
                    </div>
                    <p className="text-white/30 text-xs font-mono truncate">{connection.url}</p>
                    <p className="text-white/20 text-[11px] mt-0.5">
                      {connection.transport.toUpperCase()}
                      {connection.apiKey ? ' · 已配置密钥' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => handleToggleEnabled(connection)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        connection.enabled ? 'bg-blue-500' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                        style={{
                          transform: connection.enabled ? 'translateX(16px)' : 'translateX(0)',
                          left: '2px',
                        }}
                      />
                    </button>
                  </div>
                </div>

                {/* 状态详情 */}
                {state?.error && (
                  <div className="text-red-400/80 text-xs bg-red-500/5 px-3 py-2 rounded-lg">
                    {state.error}
                  </div>
                )}

                {isConnected && (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-white/40 flex items-center gap-1">
                      <Wrench size={12} />
                      {state.tools.length} 工具
                    </span>
                    <span className="text-white/40 flex items-center gap-1">
                      <FileText size={12} />
                      {state.resources.length} 资源
                    </span>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 pt-1">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => setViewingToolsId(connection.id)}
                        className="glass-btn flex-1 text-xs py-2"
                      >
                        <Wrench size={12} className="inline mr-1" />
                        查看工具
                      </button>
                      <button
                        onClick={() => handleDisconnect(connection.id)}
                        className="glass-btn flex-1 text-xs py-2 text-red-300 hover:bg-red-500/10"
                      >
                        <Power size={12} className="inline mr-1" />
                        断开
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleTestConnection(connection)}
                      disabled={isTesting || !connection.enabled}
                      className={`glass-btn flex-1 text-xs py-2 ${
                        isTesting ? 'opacity-60 cursor-wait' : ''
                      } ${!connection.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <RefreshCw size={12} className={`inline mr-1 ${isTesting ? 'animate-spin' : ''}`} />
                      {isTesting ? '连接中...' : '测试连接'}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(connection)}
                    className="glass-btn px-3 py-2 text-xs"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(connection.id)}
                    className="glass-btn px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 工具列表弹窗 */}
      {viewingToolsId && (
        <ToolsModal
          connectionId={viewingToolsId}
          connectionName={mcpConnections.find(c => c.id === viewingToolsId)?.name || ''}
          onClose={() => setViewingToolsId(null)}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirmId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel p-6 max-w-xs mx-4">
            <h3 className="text-white/90 font-medium mb-3">删除连接</h3>
            <p className="text-white/50 text-sm mb-6">
              确定要删除「{mcpConnections.find(c => c.id === deleteConfirmId)?.name}」吗？此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="glass-btn flex-1">取消</button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="glass-btn bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 flex-1"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
