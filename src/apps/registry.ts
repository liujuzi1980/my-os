import { lazy } from 'react';
import type { AppID, AppDefinition } from '@/types';

// 懒加载所有 App 组件
const MessageApp = lazy(() => import('./Message'));
const SettingsApp = lazy(() => import('./Settings'));
const CharacterManagerApp = lazy(() => import('./CharacterManager'));
const MCPApp = lazy(() => import('./MCP'));

// 占位组件（未实现的 App）
const PlaceholderApp = lazy(() => import('./Placeholder'));

export const APP_REGISTRY: Record<AppID, AppDefinition> = {
  message: {
    id: 'message',
    name: '消息',
    icon: 'MessageCircle',
    color: '#3b82f6',
    component: MessageApp,
  },
  phone: {
    id: 'phone',
    name: '电话',
    icon: 'Phone',
    color: '#10b981',
    component: PlaceholderApp,
  },
  room: {
    id: 'room',
    name: '小小窝',
    icon: 'Home',
    color: '#f59e0b',
    component: PlaceholderApp,
  },
  character: {
    id: 'character',
    name: '角色',
    icon: 'Users',
    color: '#8b5cf6',
    component: CharacterManagerApp,
  },
  settings: {
    id: 'settings',
    name: '设置',
    icon: 'Settings',
    color: '#6b7280',
    component: SettingsApp,
  },
  group: {
    id: 'group',
    name: '群聊',
    icon: 'MessageSquare',
    color: '#ec4899',
    component: PlaceholderApp,
  },
  diary: {
    id: 'diary',
    name: '日记',
    icon: 'BookOpen',
    color: '#f97316',
    component: PlaceholderApp,
  },
  spark: {
    id: 'spark',
    name: 'Spark',
    icon: 'Zap',
    color: '#eab308',
    component: PlaceholderApp,
  },
  worldbook: {
    id: 'worldbook',
    name: '世界书',
    icon: 'Globe',
    color: '#06b6d4',
    component: PlaceholderApp,
  },
  gallery: {
    id: 'gallery',
    name: '相册',
    icon: 'Image',
    color: '#14b8a6',
    component: PlaceholderApp,
  },
  mcp: {
    id: 'mcp',
    name: 'MCP',
    icon: 'Plug',
    color: '#f97316',
    component: MCPApp,
  },
};

export const DOCK_APPS: AppID[] = ['message', 'phone', 'room', 'character', 'settings'];

export const ALL_APPS: AppID[] = Object.keys(APP_REGISTRY) as AppID[];
