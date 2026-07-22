import { lazy } from 'react';
import type { AppID, AppDefinition } from '@/types';

// 懒加载所有 App 组件
const MessageApp = lazy(() => import('./Message'));
const SettingsApp = lazy(() => import('./Settings'));
const CharacterManagerApp = lazy(() => import('./CharacterManager'));
const MCPApp = lazy(() => import('./MCP'));
const DesktopApp = lazy(() => import('./Desktop'));        // ← 新增：桌面
const MemoryApp = lazy(() => import('./memory'));            // ← 修复：小写 memory

// 占位组件（未实现的 App）
const PlaceholderApp = lazy(() => import('./Placeholder'));

export const APP_REGISTRY: Record<AppID, AppDefinition> = {
  // === 核心应用（已实现）===
  desktop: {
    id: 'desktop',
    name: '桌面',
    icon: 'LayoutGrid',
    color: '#6366f1',
    component: DesktopApp,
    implemented: true,
  },
  message: {
    id: 'message',
    name: '消息',
    icon: 'MessageCircle',
    color: '#3b82f6',
    component: MessageApp,
    implemented: true,
  },
  character: {
    id: 'character',
    name: '角色',
    icon: 'Users',
    color: '#8b5cf6',
    component: CharacterManagerApp,
    implemented: true,
  },
  settings: {
    id: 'settings',
    name: '设置',
    icon: 'Settings',
    color: '#6b7280',
    component: SettingsApp,
    implemented: true,
  },
  mcp: {
    id: 'mcp',
    name: 'MCP',
    icon: 'Plug',
    color: '#f97316',
    component: MCPApp,
    implemented: true,
  },
  memory: {
    id: 'memory',
    name: '记忆',
    icon: 'Brain',
    color: '#a855f7',
    component: MemoryApp,
    implemented: true,
  },

  // === 占位应用（未实现）===
  phone: {
    id: 'phone',
    name: '电话',
    icon: 'Phone',
    color: '#10b981',
    component: PlaceholderApp,
    implemented: false,
  },
  room: {
    id: 'room',
    name: '小小窝',
    icon: 'Home',
    color: '#f59e0b',
    component: PlaceholderApp,
    implemented: false,
  },
  group: {
    id: 'group',
    name: '群聊',
    icon: 'MessageSquare',
    color: '#ec4899',
    component: PlaceholderApp,
    implemented: false,
  },
  diary: {
    id: 'diary',
    name: '日记',
    icon: 'BookOpen',
    color: '#f97316',
    component: PlaceholderApp,
    implemented: false,
  },
  spark: {
    id: 'spark',
    name: 'Spark',
    icon: 'Zap',
    color: '#eab308',
    component: PlaceholderApp,
    implemented: false,
  },
  worldbook: {
    id: 'worldbook',
    name: '世界书',
    icon: 'Globe',
    color: '#06b6d4',
    component: PlaceholderApp,
    implemented: false,
  },
  gallery: {
    id: 'gallery',
    name: '相册',
    icon: 'Image',
    color: '#14b8a6',
    component: PlaceholderApp,
    implemented: false,
  },
};

// === Dock 栏：精简为 4 个核心应用 ===
export const DOCK_APPS: AppID[] = ['message', 'phone', 'character', 'settings'];

// === 桌面显示的应用（排除 desktop 本身）===
export const DESKTOP_APPS: AppID[] = [
  'message', 'phone', 'room', 'character', 'memory', 'settings',
  'mcp', 'gallery', 'group', 'diary', 'spark', 'worldbook',
];

// === 桌面分页配置：每页 9 个（3x3）===
export const DESKTOP_PAGES: AppID[][] = [
  // 第 1 页
  ['message', 'phone', 'room', 'character', 'memory', 'settings', 'mcp', 'gallery', 'group'],
  // 第 2 页
  ['diary', 'spark', 'worldbook'],
];

// === 所有应用 ID ===
export const ALL_APPS: AppID[] = Object.keys(APP_REGISTRY) as AppID[];