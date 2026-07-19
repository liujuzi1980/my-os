# MyOS 项目分析报告

> GitHub: [liujuzi1980/my-os](https://github.com/liujuzi1980/my-os)
> 版本: v0.0.1（开发中）
> 技术栈: Vite + React 18 + TypeScript + Tailwind CSS + Zustand + IndexedDB (idb)

---

## 一、项目概述

**MyOS（虚拟手机系统）** 是一个运行在浏览器中的 AI 伴侣聊天应用，UI 设计为手机界面风格，主打"角色扮演聊天 + 记忆系统"。用户可以在其中创建多个 AI 角色，与它们聊天，系统会自动记忆对话中的重要信息并在后续对话中引用。

项目目前处于**早期开发阶段**，核心聊天功能已完成，约 10 个 App 中有 3 个有实际内容（消息、设置、角色管理），其余为占位符。

---

## 二、项目结构

```
my-os/
├── index.html                    # 入口 HTML（PWA 配置，中文标题）
├── package.json                  # 依赖配置
├── vite.config.ts                # Vite 配置（@ 别名，端口 5173）
├── tsconfig.json                 # TypeScript 配置（ES2020，strict）
├── tsconfig.node.json            # Node 端 TS 配置
├── tailwind.config.js            # Tailwind 自定义主题（glass 色系）
├── postcss.config.js             # PostCSS 配置
│
├── public/
│   ├── manifest.json             # PWA Manifest（手机系统图标）
│   └── sw.js                     # Service Worker（缓存优先策略）
│
├── proxy/                        # 代理目录（当前为空）
│
├── src/
│   ├── main.tsx                  # 应用入口，注册 PWA + 草稿恢复
│   ├── App.tsx                   # 根组件：手机框架布局
│   ├── index.css                 # 全局样式（毛玻璃、消息气泡、Dock）
│   ├── vite-env.d.ts             # Vite 类型声明
│   │
│   ├── types/
│   │   └── index.ts              # 所有 TypeScript 类型定义（核心类型）
│   │
│   ├── context/
│   │   └── OSStore.ts            # Zustand 全局状态管理（核心 Store）
│   │
│   ├── db/
│   │   └── index.ts              # IndexedDB 数据库操作（idb 封装）
│   │
│   ├── core/
│   │   ├── ContextBuilder.ts     # 对话上下文构建器
│   │   ├── MemoryEngine.ts       # 记忆引擎（存储/检索/衰减/压缩）
│   │   └── MemoryAnalyzer.ts     # 记忆分析器（LLM 脱水/总结）
│   │
│   ├── components/
│   │   ├── StatusBar.tsx         # 顶部状态栏（时间、信号、通知）
│   │   ├── Dock.tsx              # 底部 Dock 导航栏
│   │   └── AppContainer.tsx      # App 容器（懒加载 + Suspense）
│   │
│   └── apps/
│       ├── registry.ts           # App 注册表（10 个 App 定义）
│       ├── Placeholder.tsx       # 占位组件（"开发中"）
│       ├── message/
│       │   └── index.tsx         # 消息聊天 App（核心功能）
│       ├── settings/
│       │   └── index.tsx         # 设置 App（API 配置、用户档案等）
│       └── CharacterManager/
│           └── index.tsx         # 角色管理 App（创建/编辑/删除角色）
```

---

## 三、技术架构

### 3.1 技术栈选型

| 层 | 技术 | 用途 |
|---|---|---|
| 构建 | Vite 5 + React 18 | 快速开发 & 构建 |
| 语言 | TypeScript (strict) | 类型安全 |
| 样式 | Tailwind CSS 3 + 自定义 glass 主题 | 毛玻璃 UI |
| 状态管理 | Zustand 4 | 轻量全局状态 |
| 数据库 | IndexedDB (通过 idb 库) | 浏览器端持久化 |
| 图标 | Lucide React | 图标库 |
| PWA | Service Worker + Manifest | 离线缓存 & 手机主屏 |
| AI API | OpenAI 兼容接口 | LLM 聊天 & 记忆分析 |

### 3.2 设计模式

- **App 注册表模式**：所有 App 在 `registry.ts` 中集中注册，支持懒加载
- **Store 驱动**：全局状态全部集中在 Zustand Store (`OSStore.ts`)
- **CRUD 封装**：数据库操作统一在 `db/index.ts` 中管理
- **策略模式**：`MemoryEngine` 支持 `local` / `ombre` 两种记忆引擎

---

## 四、核心模块详解

### 4.1 类型系统 (`src/types/index.ts`)

核心类型定义：

- **角色类**
  - `Character`：角色实体（名称、设定、好感度、关系阶段、记忆等）
  - `CharacterState`：角色状态（心情、情绪余波、当前活动）
  - `RelationshipStage`：关系阶段（陌生人→刚认识→熟人→好朋友→亲密）

- **记忆系统**
  - `MemoryEntry`：单条记忆（内容、层级、情感坐标、重要性等）
  - `MemoryTier`：记忆层级（core/experience/feeling/plan/archive）
  - `LifeStageSummary`：人生阶段总结
  - `DehydratedMemory`：脱水后的记忆结构

- **消息系统**
  - `ChatMessage`：聊天消息（角色、内容、时间戳、重roll标记）
  - `MessageRole`：消息角色（user/assistant/system）

- **系统**
  - `SystemSettings`：系统设置（API 配置、TTS、主题等）
  - `UserProfile`：用户档案
  - `AppID` / `AppDefinition`：App 注册类型
  - `Notification`：通知系统

### 4.2 状态管理 (`src/context/OSStore.ts`)

使用 Zustand 创建的全局 Store，管理：

- 当前 App / 当前角色切换
- 角色列表 CRUD
- 角色状态（心情、活动等）
- 日程（预留）
- 设置 + 用户档案
- 通知系统
- 加载/错误状态

**初始化流程**：App 启动时加载 设置 → 用户档案 → 角色列表。

### 4.3 数据库层 (`src/db/index.ts`)

使用 `idb` 库操作 IndexedDB，数据库名 `MyOS_v2`，包含 8 个 Store：

| Store | 主键 | 索引 | 用途 |
|---|---|---|---|
| characters | id | - | 角色数据 |
| chats | id | by-character, by-time | 聊天记录 |
| settings | key | - | 系统设置 |
| worldbooks | id | - | 世界书 |
| userProfile | key | - | 用户档案 |
| memories | id | by-character, by-tier, by-time | 记忆条目 |
| lifeStageSummaries | id | by-character | 人生阶段总结 |
| characterStates | characterId | - | 角色状态 |
| schedules | id | by-character | 日程（预留） |

额外功能：**数据导出/导入**（JSON 格式，用于备份迁移）。

### 4.4 上下文构建器 (`src/core/ContextBuilder.ts`)

构建发送给 LLM 的对话上下文，包含：

1. **系统提示词**：角色身份 + 当前时间感知 + 心情/活动 + 人物设定 + 关系阶段 + 语言习惯 + 底线规则
2. **离线感知**：30 分钟阈值，根据好感度生成不同的回复方向
3. **历史消息**：加载最近 N 轮对话，带时间戳

时间感知非常细致，分 8 个时段（清晨/上午/中午/下午/傍晚/晚上/深夜/凌晨），每个时段有不同的语气和设定。

### 4.5 记忆引擎 (`src/core/MemoryEngine.ts` & `MemoryAnalyzer.ts`)

**MemoryAnalyzer**：调用 LLM 分析对话，提取结构化记忆（JSON 格式），支持：
- 群聊记忆脱水
- 记忆阶段总结

**MemoryEngine**：管理记忆的全生命周期
- **脱水**：将对话转化为记忆条目
- **存储**：去重（相似度 > 0.7 且重要性更高则覆盖）
- **检索**：基于时间衰减 + 情感匹配 + 关键词匹配 + 重要性 + 层级 + 访问频率 的混合评分
- **衰减**：指数衰减模型（情感强度越强衰减越慢）
- **压缩**：当某个层级记忆超过阈值时自动压缩为阶段总结

### 4.6 消息聊天 App (`src/apps/message/index.tsx`)

核心功能最复杂的模块：

- **聊天界面**：消息气泡（用户/AI/系统三种样式）
- **消息操作**：长按弹出菜单（复制、收藏、编辑、引用、重roll、删除、多选）
- **LLM 调用**：支持任何 OpenAI 兼容 API
- **重roll**：重新生成 AI 回复（提高 temperature）
- **引用回复**：引用消息后发送
- **多选模式**：批量选择/删除
- **清空对话**：确认弹窗
- **数据备份**：一键导出全部数据
- **内存异步脱水**：发送消息后异步分析并存储记忆，每 20 轮执行一次衰减

### 4.7 角色管理 App (`src/apps/CharacterManager/index.tsx`)

- 角色列表（显示头像、好感度图标、关系阶段）
- 创建/编辑角色（三个 Tab）
  - **基础设定**：名称、设定、世界观、性格、好感度滑块、关系阶段
  - **记忆 & 印象**：记忆摘要、印象档案
  - **当前状态**：情绪、正在做的事
- 好感度视觉化（5 级渐变 + 不同图标）
- 点击角色直接进入聊天

### 4.8 设置 App (`src/apps/settings/index.tsx`)

- API 设置（Base URL / Key / 模型选择）
  - 支持从 API 拉取模型列表（带错误分类：CORS/认证/网络）
- 语音通话 TTS 设置（MiniMax 集成，预留）
- 用户档案（姓名、简介、MBTI）
- 数据管理（导出/导入/清空全部）

---

## 五、UI/UX 设计

### 5.1 视觉风格

- **毛玻璃（Glassmorphism）** 贯穿全局：面板、卡片、输入框、Dock
- **暗色主题**：深蓝渐变背景 #1a1a2e → #16213e → #0f3460
- **手机框架**：max-width 430px，桌面端显示为圆角手机框
- **iOS 适配**：safe-area-inset，viewport-fit=cover
- **PWA 支持**：可添加到手机主屏，全屏运行

### 5.2 交互细节

- 触摸优化：`touch-action: manipulation`
- iOS 16px 字体防止自动缩放
- 草稿恢复：页面冻结前保存输入框内容
- 消息气泡弹出菜单（长按触发）
- 时间感知状态提示（深夜犯困、凌晨不耐烦等）

---

## 六、已实现 vs 待实现

### 已实现
- ✅ 角色创建/编辑/删除
- ✅ 聊天对话（LLM 调用）
- ✅ 时间感知上下文
- ✅ 离线感知
- ✅ 记忆系统（脱水/存储/检索/衰减）
- ✅ 消息操作（复制/编辑/引用/重roll/收藏/删除/多选）
- ✅ 好感度 & 关系阶段
- ✅ API 设置 + 模型列表拉取
- ✅ 数据导出/导入
- ✅ PWA 离线缓存
- ✅ 通知系统（基础）
- ✅ 角色状态（心情/活动）
- ✅ 多角色切换

### 待实现（占位符）
- ❌ 电话 App（语音通话 - TTS 配置已就绪）
- ❌ 小小窝（Home / 角色空间）
- ❌ 群聊（多角色对话）
- ❌ 日记
- ❌ Spark（灵感快闪）
- ❌ 世界书（世界设定管理）
- ❌ 相册
- ❌ 日程系统（数据库已就绪）
- ❌ Ombre 远程记忆引擎

---

## 七、关键配置

- **端口**：5173（允许局域网访问 `host: true`）
- **依赖**：react 18, zustand 4, idb 8, lucide-react, tailwind 3
- **开发命令**：`npm run dev` / `npm run build`
- **路径别名**：`@/` → `src/`
- **v0.0.1**（初始开发版本）
