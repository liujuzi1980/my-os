import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPConnection, MCPTool, MCPResource, MCPConnectionState, MCPConnectionStatus } from '@/types';

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, SSEClientTransport> = new Map();
  private stateListeners: Set<(id: string, state: MCPConnectionState) => void> = new Set();

  addStateListener(listener: (id: string, state: MCPConnectionState) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyStateChange(connectionId: string, state: MCPConnectionState) {
    this.stateListeners.forEach(l => l(connectionId, state));
  }

  private createState(connectionId: string, status: MCPConnectionStatus, error?: string): MCPConnectionState {
    return {
      connectionId,
      status,
      error,
      tools: [],
      resources: [],
    };
  }

  async connect(connection: MCPConnection): Promise<boolean> {
    try {
      // 断开已有连接
      await this.disconnect(connection.id);

      this.notifyStateChange(connection.id, this.createState(connection.id, 'connecting'));

      const transport = new SSEClientTransport(new URL(connection.url), {
        requestInit: {
          headers: {
            ...(connection.apiKey ? { 'Authorization': `Bearer ${connection.apiKey}` } : {}),
            ...connection.headers,
          },
        },
      });

      const client = new Client(
        { name: 'MyOS-MCP-Client', version: '0.0.1' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      await client.connect(transport);

      this.clients.set(connection.id, client);
      this.transports.set(connection.id, transport);

      // 获取工具和资源列表
      let tools: MCPTool[] = [];
      let resources: MCPResource[] = [];

      try {
        const toolsResponse = await client.listTools();
        tools = toolsResponse.tools.map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema as Record<string, unknown>,
        }));
      } catch (e) {
        console.warn(`[MCP] ${connection.name} 获取工具列表失败:`, e);
      }

      try {
        const resourcesResponse = await client.listResources();
        resources = resourcesResponse.resources.map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
        }));
      } catch (e) {
        console.warn(`[MCP] ${connection.name} 获取资源列表失败:`, e);
      }

      this.notifyStateChange(connection.id, {
        connectionId: connection.id,
        status: 'connected',
        tools,
        resources,
        lastConnectedAt: Date.now(),
      });

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '连接失败';
      console.error(`[MCP] 连接失败 [${connection.name}]:`, error);
      this.notifyStateChange(connection.id, this.createState(connection.id, 'error', errorMsg));
      return false;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    try {
      const client = this.clients.get(connectionId);
      const transport = this.transports.get(connectionId);

      if (client) {
        await client.close();
        this.clients.delete(connectionId);
      }
      if (transport) {
        await transport.close();
        this.transports.delete(connectionId);
      }

      this.notifyStateChange(connectionId, this.createState(connectionId, 'disconnected'));
    } catch (e) {
      console.error(`[MCP] 断开连接失败 [${connectionId}]:`, e);
    }
  }

  async listTools(connectionId: string): Promise<MCPTool[]> {
    const client = this.clients.get(connectionId);
    if (!client) return [];

    try {
      const response = await client.listTools();
      return response.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    } catch (e) {
      console.error(`[MCP] 获取工具列表失败 [${connectionId}]:`, e);
      return [];
    }
  }

  async callTool(connectionId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('MCP 客户端未连接');

    try {
      return await client.callTool({ name: toolName, arguments: args });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '工具调用失败';
      console.error(`[MCP] 工具调用失败 [${connectionId}/${toolName}]:`, e);
      throw new Error(errorMsg);
    }
  }

  async listResources(connectionId: string): Promise<MCPResource[]> {
    const client = this.clients.get(connectionId);
    if (!client) return [];

    try {
      const response = await client.listResources();
      return response.resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
      }));
    } catch (e) {
      console.error(`[MCP] 获取资源列表失败 [${connectionId}]:`, e);
      return [];
    }
  }

  getConnectionStatus(connectionId: string): MCPConnectionStatus {
    if (this.clients.has(connectionId)) return 'connected';
    return 'disconnected';
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys());
    await Promise.all(ids.map(id => this.disconnect(id)));
  }

  // 获取所有已连接的工具
  getAllTools(): { connectionId: string; connectionName: string; tools: MCPTool[] }[] {
    const result: { connectionId: string; connectionName: string; tools: MCPTool[] }[] = [];
    for (const [id, client] of this.clients) {
      // 这里简化处理，实际应该从 state 中获取
      // 但 tools 已经在连接时获取并存储了
    }
    return result;
  }
}

export const mcpManager = new MCPClientManager();
