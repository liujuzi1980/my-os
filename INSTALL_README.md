# 🗺️ 高德地图 API 集成 — 安装指南（网页输入框版）

## 第一步：获取高德地图 API Key

1. 打开 [高德开放平台](https://console.amap.com/)
2. 注册/登录账号
3. 点击「应用管理」→「我的应用」→「创建新应用」
4. 应用名称随便填（如 my-os）
5. 在应用下点击「添加 Key」
6. **⚠️ 关键：Key 类型选择「Web服务」**（不是 JS API，不是 Android/iOS）
7. 提交后复制 Key 字符串（一长串字母数字）

## 第二步：新建文件夹

在项目根目录执行（或在 VS Code 文件树中右键新建）：

```bash
mkdir -p src/services/amap
```

## 第三步：下载并覆盖所有文件

### 新建文件（放到 src/services/amap/）

| 下载文件 | 目标路径 |
|---------|---------|
| [amap_client.ts](sandbox:///mnt/agents/output/amap_client.ts) | src/services/amap/client.ts |
| [amap_geocode.ts](sandbox:///mnt/agents/output/amap_geocode.ts) | src/services/amap/geocode.ts |
| [amap_place.ts](sandbox:///mnt/agents/output/amap_place.ts) | src/services/amap/place.ts |
| [amap_weather.ts](sandbox:///mnt/agents/output/amap_weather.ts) | src/services/amap/weather.ts |
| [amap_index.ts](sandbox:///mnt/agents/output/amap_index.ts) | src/services/amap/index.ts |

### 覆盖原文件

| 下载文件 | 覆盖路径 |
|---------|---------|
| [types_index.ts](sandbox:///mnt/agents/output/types_index.ts) | src/types/index.ts |
| [OSStore.ts](sandbox:///mnt/agents/output/OSStore.ts) | src/context/OSStore.ts |
| [Message_index.tsx](sandbox:///mnt/agents/output/Message_index.tsx) | src/apps/Message/index.tsx |
| [Settings_index.tsx](sandbox:///mnt/agents/output/Settings_index.tsx) | src/apps/Settings/index.tsx |

> ⚠️ 不需要改 `.env` 文件！Key 在网页设置里填写。

## 第四步：重启开发服务器

```bash
npm run dev
```

## 第五步：在网页上填写 Key

1. 打开「设置」应用
2. 找到「地图服务」→「高德地图 API Key」
3. 粘贴你申请的高德 Key
4. 点击「保存设置」

## 🎯 使用方式

配置完成后，和角色聊天时：

| 用户说的话 | 角色自动做的事 |
|-----------|-------------|
| 「三里屯附近有什么好吃的？」 | 自动查坐标 → 搜附近美食 → 自然回复推荐 |
| 「我想喝奶茶，公司附近有没有？」 | 询问位置 → 搜附近奶茶店 → 告诉距离和评分 |
| 「今天北京天气怎么样？」 | 查北京天气 → 自然地聊温度和穿衣建议 |
| 「附近有没有咖啡店？」 | 搜附近咖啡 → 推荐几家带距离和评分 |

## 🔧 支持的搜索类别

外卖、奶茶、咖啡、美食、便利店

## ⚠️ 常见问题

**Q: 角色说"高德地图 API Key 未配置"？**
A: 去「设置」→「地图服务」里填写 Key，填完保存后刷新页面。

**Q: 角色没有调用工具？**
A: 不同模型的"听话程度"不同。如果某次没有触发，可以换个说法，比如明确说"帮我查一下""搜一下附近"。

**Q: 高德 API 收费吗？**
A: 高德 Web 服务 API 有免费额度（个人开发者每天 5000~10000 次），日常使用完全够用。

**Q: 可以支持更多搜索吗？**
A: 可以！目前配置了外卖、奶茶、咖啡、美食、便利店。如果需要加更多，告诉我。
