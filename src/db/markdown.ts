/**
 * src/db/markdown.ts
 * Markdown 导出/导入工具 —— 阶段 3 存储层升级
 * 
 * 功能：
 * 1. 将记忆导出为 Markdown + YAML frontmatter（Obsidian 兼容格式）
 * 2. 从 Markdown 文件恢复记忆
 * 3. 内联 ZIP 生成器（零依赖，浏览器原生可用）
 * 
 * 设计原则：
 * - 每条记忆独立为一个 .md 文件，便于 Obsidian 浏览
 * - YAML frontmatter 包含完整元数据（valence/arousal/importance 等）
 * - ZIP 仅使用存储模式（不压缩），保证生成速度
 */

import type { MemoryEntry } from '@/types';
import { getAllCharacters, getMemoriesByCharacter, saveMemoryV2 } from './index';
import { generateManifestJson } from './backup';

// ============================================================
// 第一部分：YAML Frontmatter 序列化
// ============================================================

/** 将值序列化为 YAML 标量或数组 */
function toYamlValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map((v) => `  - ${toYamlValue(v)}`).join('\n');
  }
  const str = String(value);
  // 需要引号的情况
  if (
    str.includes('\n') ||
    str.includes(':') ||
    str.includes('#') ||
    str.startsWith('-') ||
    str.startsWith('[') ||
    str.startsWith('{') ||
    str === '' ||
    str === 'true' ||
    str === 'false' ||
    /^\d+(\.\d+)?$/.test(str)
  ) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/** 生成单条记忆的 YAML frontmatter */
function memoryToFrontmatter(memory: MemoryEntry): string {
  const fields: Array<[string, unknown]> = [
    ['id', memory.id],
    ['characterId', memory.characterId],
    ['valence', memory.valence],
    ['arousal', memory.arousal],
    ['importance', memory.importance],
    ['resolved', memory.resolved],
    ['pinned', memory.pinned],
    ['domain', memory.domain],
    ['tags', memory.tags],
    ['createdAt', memory.createdAt],
    ['lastTouched', memory.lastTouched],
    ['lastSurfaced', memory.lastSurfaced],
    ['archived', memory.archived],
    ['source', memory.source],
  ];

  if (memory.summary) fields.push(['summary', memory.summary]);
  if (memory.archiveReason) fields.push(['archiveReason', memory.archiveReason]);
  if (memory.relatedMessageIds && memory.relatedMessageIds.length > 0) {
    fields.push(['relatedMessageIds', memory.relatedMessageIds]);
  }

  const lines = fields.map(([key, value]) => `${key}: ${toYamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

// ============================================================
// 第二部分：记忆 ↔ Markdown 转换
// ============================================================

/** 领域中文标签映射 */
function getDomainLabel(domain: string): string {
  const map: Record<string, string> = {
    relationship: '关系',
    work: '工作',
    hobby: '爱好',
    daily: '日常',
    promise: '约定',
    core: '核心',
    experience: '经历',
    feeling: '感受',
    plan: '计划',
    archive: '归档',
  };
  return map[domain] || domain;
}

/** 根据情感坐标推导人类可读标签 */
function deriveMoodLabel(valence: number, arousal: number): string {
  if (valence > 0.5 && arousal > 0.5) return '\ud83d\ude06 兴奋';
  if (valence > 0.5 && arousal <= 0.5) return '\ud83d\ude0a 满足';
  if (valence > 0 && arousal > 0.5) return '\ud83e\udd29 期待';
  if (valence <= 0 && arousal > 0.5) return '\ud83d\ude30 焦虑';
  if (valence < -0.5 && arousal > 0.5) return '\ud83d\ude20 愤怒';
  if (valence < -0.5 && arousal <= 0.5) return '\ud83d\ude14 沮丧';
  if (valence < 0 && arousal <= 0.5) return '\ud83d\ude2b 疲惫';
  return '\ud83d\ude0c 平静';
}

/**
 * 将单条记忆转换为 Markdown 字符串
 * @param memory 记忆对象
 * @param characterName 角色名称（可选，用于标题）
 */
export function memoryToMarkdown(memory: MemoryEntry, characterName?: string): string {
  const frontmatter = memoryToFrontmatter(memory);
  const title = characterName ? `# ${characterName} 的记忆` : '# 记忆';
  const date = new Date(memory.createdAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const domainLabel = getDomainLabel(memory.domain);
  const moodLabel = deriveMoodLabel(memory.valence, memory.arousal);

  const badges = [
    `\ud83d\udcc5 ${date}`,
    `\ud83c\udff7\ufe0f ${domainLabel}`,
    moodLabel,
    memory.pinned ? '\ud83d\udccc 已钉选' : null,
    memory.resolved ? '\u2705 已解决' : null,
    memory.archived ? '\ud83d\udce6 已归档' : null,
  ].filter(Boolean);

  return `${frontmatter}${title}\n\n> ${badges.join(' \u00b7 ')}\n\n${memory.content}\n`;
}

// ============================================================
// 第三部分：Markdown → 记忆 解析
// ============================================================

/**
 * 从 Markdown 字符串解析记忆对象
 * @param markdown Markdown 文本（必须包含 YAML frontmatter）
 * @param fallbackCharacterId 如果 frontmatter 中无 characterId，使用此默认值
 */
export function markdownToMemory(
  markdown: string,
  fallbackCharacterId?: string
): MemoryEntry | null {
  // 匹配 YAML frontmatter: ---\n...\n---
  const frontmatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n\n?/);
  if (!frontmatterMatch) {
    // 尝试无 frontmatter 的纯文本（降级处理）
    return parsePlainMarkdown(markdown, fallbackCharacterId);
  }

  const yamlText = frontmatterMatch[1];
  // 去掉 frontmatter 后的正文
  let content = markdown.slice(frontmatterMatch[0].length);
  // 去掉可能的标题行和引用行
  content = content.replace(/^# .*\n\n/, '').replace(/^> .*\n\n/, '').trim();

  const parsed = parseYamlBlock(yamlText);

  const memory: MemoryEntry = {
    id: parsed.id || crypto.randomUUID(),
    characterId: parsed.characterId || fallbackCharacterId || 'unknown',
    content: parsed.content || content || '',
    valence: parseFloat(parsed.valence) || 0,
    arousal: parseFloat(parsed.arousal) || 0.3,
    importance: parseInt(parsed.importance, 10) || 5,
    resolved: parsed.resolved === true || parsed.resolved === 'true',
    pinned: parsed.pinned === true || parsed.pinned === 'true',
    domain: parsed.domain || 'daily',
    tags: parseYamlArray(parsed.tags),
    createdAt: parseInt(parsed.createdAt, 10) || Date.now(),
    lastTouched: parseInt(parsed.lastTouched, 10) || Date.now(),
    lastSurfaced: parseInt(parsed.lastSurfaced, 10) || 0,
    archived: parsed.archived === true || parsed.archived === 'true',
    source: (parsed.source as 'auto' | 'manual' | 'dream') || 'manual',
    summary: parsed.summary || undefined,
    archiveReason: parsed.archiveReason || undefined,
    relatedMessageIds: parseYamlArray(parsed.relatedMessageIds),
  };

  return memory;
}

/** 降级解析：无 frontmatter 的纯文本 → 记忆 */
function parsePlainMarkdown(text: string, characterId?: string): MemoryEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return {
    id: crypto.randomUUID(),
    characterId: characterId || 'unknown',
    content: trimmed,
    valence: 0,
    arousal: 0.3,
    importance: 5,
    resolved: false,
    pinned: false,
    domain: 'daily',
    tags: [],
    createdAt: Date.now(),
    lastTouched: Date.now(),
    lastSurfaced: 0,
    archived: false,
    source: 'manual',
  };
}

/** 解析 YAML 块为键值对象（简化版，支持标量和数组） */
function parseYamlBlock(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim() || trimmed.trimStart().startsWith('#')) continue;

    const indent = trimmed.length - trimmed.trimStart().length;

    if (trimmed.trimStart().startsWith('- ')) {
      // 数组元素
      if (currentKey && currentArray !== null) {
        currentArray.push(trimmed.trimStart().slice(2).trim().replace(/^["']|["']$/g, ''));
      }
    } else {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0 && indent === 0) {
        currentKey = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value === '' || value === '[]') {
          currentArray = [];
          result[currentKey] = currentArray;
        } else if (value === 'true') {
          result[currentKey] = true;
          currentArray = null;
        } else if (value === 'false') {
          result[currentKey] = false;
          currentArray = null;
        } else if (/^\d+$/.test(value)) {
          result[currentKey] = parseInt(value, 10);
          currentArray = null;
        } else if (/^\d+\.\d+$/.test(value)) {
          result[currentKey] = parseFloat(value);
          currentArray = null;
        } else if (value.startsWith('[') && value.endsWith(']')) {
          try {
            result[currentKey] = JSON.parse(value.replace(/'/g, '"'));
          } catch {
            result[currentKey] = value.replace(/^["']|["']$/g, '');
          }
          currentArray = null;
        } else {
          result[currentKey] = value.replace(/^["']|["']$/g, '');
          currentArray = null;
        }
      }
    }
  }

  return result;
}

/** 安全解析 YAML 数组值 */
function parseYamlArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // ignore
    }
  }
  if (typeof value === 'string' && value) {
    return [value];
  }
  return [];
}

// ============================================================
// 第四部分：内联 ZIP 生成器（零依赖，仅存储模式）
// 修复：支持 UTF-8 文件名，设置通用标志位 bit 11
// ============================================================

/** CRC-32 查找表（惰性初始化） */
let crcTableCache: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTableCache) return crcTableCache;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  crcTableCache = table;
  return table;
}

/** 计算 Uint8Array 的 CRC-32 */
function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** 创建 ZIP Blob（仅存储模式，不压缩，支持 UTF-8 文件名） */
function createZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();

  // 预计算所有文件的数据
  const fileEntries = files.map((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const fileCrc = crc32(dataBytes);
    return { nameBytes, dataBytes, fileCrc };
  });

  // 计算各部分偏移
  let offset = 0;
  const localHeaders: Uint8Array[] = [];
  const dataBlocks: Uint8Array[] = [];
  const centralDirEntries: Array<{
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    fileCrc: number;
    offset: number;
  }> = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const { nameBytes, dataBytes, fileCrc } = fileEntries[i];

    // 本地文件头 = 30 bytes 固定 + 文件名长度 + 额外字段长度(0)
    const localHeaderSize = 30 + nameBytes.length;
    const localHeader = new Uint8Array(localHeaderSize);
    const v = new DataView(localHeader.buffer);

    v.setUint32(0, 0x04034b50, true);   // 本地文件头签名
    v.setUint16(4, 20, true);             // 版本需要 2.0
    v.setUint16(6, 0x0800, true);         // 通用标志位：bit 11 = UTF-8 编码
    v.setUint16(8, 0, true);              // 压缩方法 = 存储(不压缩)
    v.setUint16(10, 0, true);           // 修改时间
    v.setUint16(12, 0, true);           // 修改日期
    v.setUint32(14, fileCrc, true);     // CRC-32
    v.setUint32(18, dataBytes.length, true);  // 压缩后大小
    v.setUint32(22, dataBytes.length, true);  // 未压缩大小
    v.setUint16(26, nameBytes.length, true);  // 文件名长度
    v.setUint16(28, 0, true);           // 额外字段长度 = 0

    // 写入文件名
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader);
    dataBlocks.push(dataBytes);
    centralDirEntries.push({ nameBytes, dataBytes, fileCrc, offset });

    offset += localHeaderSize + dataBytes.length;
  }

  // 中央目录
  const centralDirOffset = offset;
  const centralDirHeaders: Uint8Array[] = [];

  for (const entry of centralDirEntries) {
    const { nameBytes, dataBytes, fileCrc, offset: localOffset } = entry;
    const cdSize = 46 + nameBytes.length;
    const cd = new Uint8Array(cdSize);
    const v = new DataView(cd.buffer);

    v.setUint32(0, 0x02014b50, true);   // 中央目录头签名
    v.setUint16(4, 0x031E, true);       // 创建者版本 3.30 (支持 UTF-8)
    v.setUint16(6, 20, true);           // 所需版本 2.0
    v.setUint16(8, 0x0800, true);       // 通用标志位：bit 11 = UTF-8 编码
    v.setUint16(10, 0, true);           // 压缩方法 = 存储
    v.setUint16(12, 0, true);           // 修改时间
    v.setUint16(14, 0, true);           // 修改日期
    v.setUint32(16, fileCrc, true);     // CRC-32
    v.setUint32(20, dataBytes.length, true);  // 压缩后大小
    v.setUint32(24, dataBytes.length, true);  // 未压缩大小
    v.setUint16(28, nameBytes.length, true);  // 文件名长度
    v.setUint16(30, 0, true);           // 额外字段长度
    v.setUint16(32, 0, true);           // 注释长度
    v.setUint16(34, 0, true);           // 磁盘号起始
    v.setUint16(36, 0, true);           // 内部文件属性
    v.setUint32(38, 0, true);           // 外部文件属性
    v.setUint32(42, localOffset, true);  // 本地文件头相对偏移

    cd.set(nameBytes, 46);
    centralDirHeaders.push(cd);
  }

  const centralDirSize = centralDirHeaders.reduce((s, h) => s + h.length, 0);

  // 中央目录结束记录 (EOCD) = 22 bytes
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);    // EOCD 签名
  ev.setUint16(4, 0, true);             // 当前磁盘号
  ev.setUint16(6, 0, true);             // 中央目录起始磁盘号
  ev.setUint16(8, files.length, true);  // 当前磁盘记录数
  ev.setUint16(10, files.length, true); // 总记录数
  ev.setUint32(12, centralDirSize, true);   // 中央目录大小
  ev.setUint32(16, centralDirOffset, true); // 中央目录偏移
  ev.setUint16(20, 0, true);            // 注释长度

  // 合并所有部分
  const totalSize = 
    localHeaders.reduce((s, h) => s + h.length, 0) +
    dataBlocks.reduce((s, b) => s + b.length, 0) +
    centralDirSize +
    22;

  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (let i = 0; i < localHeaders.length; i++) {
    result.set(localHeaders[i], pos);
    pos += localHeaders[i].length;
    result.set(dataBlocks[i], pos);
    pos += dataBlocks[i].length;
  }

  for (const cd of centralDirHeaders) {
    result.set(cd, pos);
    pos += cd.length;
  }

  result.set(eocd, pos);

  return new Blob([result], { type: 'application/zip' });
}
// ============================================================
// 第五部分：导出/导入 API
// ============================================================

export interface ExportResult {
  blob: Blob;
  filename: string;
  count: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * 辅助函数：获取全部记忆（遍历所有角色）
 */
async function getAllMemoriesFallback(): Promise<MemoryEntry[]> {
  const characters = await getAllCharacters();
  const all: MemoryEntry[] = [];
  for (const c of characters) {
    const memories = await getMemoriesByCharacter(c.id);
    if (memories && memories.length > 0) {
      all.push(...memories);
    }
  }
  return all;
}

/**
 * 将记忆导出为 Markdown ZIP 包
 * 
 * @param characterId 指定角色 ID 则只导出该角色记忆；不传则导出全部
 * @param characterName 角色名称（用于文件名和标题）
 * @returns ZIP Blob + 建议文件名 + 记忆数量
 */
export async function exportMemoriesToMarkdownZip(
  characterId?: string,
  characterName?: string
): Promise<ExportResult> {
  const memories = characterId
    ? await getMemoriesByCharacter(characterId)
    : await getAllMemoriesFallback();

  if (!memories || memories.length === 0) {
    throw new Error('没有可导出的记忆');
  }

  const files: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const date = new Date(memory.createdAt);
    const dateStr = date.toISOString().slice(0, 10);
    // 清理文件名非法字符，限制长度
    const contentPreview = memory.content
      .slice(0, 20)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_');
    const filename = `${String(i + 1).padStart(3, '0')}_${dateStr}_${contentPreview}.md`;
    const markdown = memoryToMarkdown(memory, characterName);
    files.push({ name: filename, content: markdown });
  }

  // 添加 README 说明文件
  const readme = `# MyOS 记忆导出

> 导出时间: ${new Date().toLocaleString('zh-CN')}
> 记忆数量: ${memories.length} 条
> 角色: ${characterName || '全部'}

## 文件说明

每条记忆对应一个 \`.md\` 文件，包含 YAML frontmatter 元数据和正文。

## 在 Obsidian 中使用

1. 解压此 ZIP 文件到 Obsidian vault 的任意文件夹
2. 每条记忆会显示为独立笔记，frontmatter 可在 Dataview 中查询
3. 标签、领域、情感坐标等元数据均保留

## 重新导入

在 MyOS 设置中选择「从 Markdown 导入记忆」，选择解压后的 \`.md\` 文件即可。
`;
  files.push({ name: 'README.md', content: readme });

  // 添加校验清单
  const manifest = await generateManifestJson(
    memories,
    characterId ? [{ id: characterId, name: characterName || 'unknown' }] : []
  );
  files.push({ name: '_manifest.json', content: manifest });

  const blob = createZipBlob(files);
  const safeName = (characterName || 'all').replace(/\s+/g, '_');
  const filename = `myos-memories-${safeName}-${new Date().toISOString().slice(0, 10)}.zip`;

  return { blob, filename, count: memories.length };
}

/**
 * 从 Markdown 文件批量导入记忆
 * 
 * @param files 用户选择的 FileList（支持多选 .md 文件）
 * @param defaultCharacterId 默认归属角色 ID（如果 Markdown 中未指定）
 * @returns 导入统计结果
 */
export async function importMemoriesFromMarkdown(
  files: FileList,
  defaultCharacterId?: string
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // 处理 ZIP 文件：自动解压并导入其中的 .md 文件
    if (file.name.endsWith('.zip')) {
      try {
        const buffer = await file.arrayBuffer();
        const entries = await parseZipEntries(buffer);
        for (const entry of entries) {
          if (!entry.name.endsWith('.md') || entry.name.startsWith('_')) continue;
          try {
            const memory = markdownToMemory(entry.content, defaultCharacterId);
            if (!memory) {
              result.errors.push(`无法解析: ${entry.name}`);
              continue;
            }
            memory.lastTouched = Date.now();
            await saveMemoryV2(memory);
            result.imported++;
          } catch (err) {
            result.errors.push(
              `${entry.name}: ${err instanceof Error ? err.message : '未知错误'}`
            );
          }
        }
      } catch (err) {
        result.errors.push(
          `${file.name}: ${err instanceof Error ? err.message : 'ZIP 解析失败'}`
        );
      }
      continue;
    }

    // 跳过非 .md 文件
    if (!file.name.endsWith('.md') || file.name.startsWith('_')) {
      result.skipped++;
      continue;
    }

    try {
      const text = await file.text();
      const memory = markdownToMemory(text, defaultCharacterId);

      if (!memory) {
        result.errors.push(`无法解析: ${file.name}`);
        continue;
      }

      // 导入时更新 lastTouched 为当前时间
      memory.lastTouched = Date.now();
      await saveMemoryV2(memory);
      result.imported++;
    } catch (err) {
      result.errors.push(
        `${file.name}: ${err instanceof Error ? err.message : '未知错误'}`
      );
    }
  }

  return result;
}
// ============================================================
// 第六部分：ZIP 文件解析器（纯前端，零依赖）
// 仅支持存储模式（不压缩），用于导入我们自己导出的 ZIP
// ============================================================

interface ZipEntry {
  name: string;
  content: string;
}

/**
 * 从 ZIP ArrayBuffer 中提取所有文件条目
 * 仅支持存储模式（compression method = 0）
 */
async function parseZipEntries(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];

  // 找 EOCD 签名 0x06054b50，从末尾往前搜索
  let eocdOffset = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('无法找到 ZIP 结束标记，文件可能损坏');
  }

  // 解析 EOCD
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);

  // 遍历中央目录
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error(`中央目录条目 ${i} 签名不匹配`);
    }

    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    // 读取文件名
    const nameBytes = uint8.slice(pos + 46, pos + 46 + nameLen);
    const name = decoder.decode(nameBytes);

    // 跳到本地文件头
    const dataPos = localHeaderOffset + 30 + nameLen + extraLen;

    // 只提取 .md 文件，跳过 README.md 和 _manifest.json
    if (name.endsWith('.md') && !name.startsWith('_') && name !== 'README.md') {
      if (compressionMethod !== 0) {
        throw new Error(`文件 ${name} 使用了压缩，当前仅支持存储模式`);
      }

      const dataBytes = uint8.slice(dataPos, dataPos + uncompressedSize);
      const content = decoder.decode(dataBytes);
      entries.push({ name, content });
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * 从 ZIP 文件批量导入记忆
 * 
 * @param file 用户选择的 ZIP 文件
 * @param defaultCharacterId 默认归属角色 ID（如果 Markdown 中未指定）
 * @returns 导入统计结果
 */
export async function importMemoriesFromZip(
  file: File,
  defaultCharacterId?: string
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  try {
    const buffer = await file.arrayBuffer();
    const entries = await parseZipEntries(buffer);

    if (entries.length === 0) {
      result.errors.push('ZIP 中未找到有效的 .md 记忆文件');
      return result;
    }

    for (const entry of entries) {
      try {
        const memory = markdownToMemory(entry.content, defaultCharacterId);

        if (!memory) {
          result.errors.push(`无法解析: ${entry.name}`);
          continue;
        }

        // 导入时更新 lastTouched 为当前时间
        memory.lastTouched = Date.now();
        await saveMemoryV2(memory);
        result.imported++;
      } catch (err) {
        result.errors.push(
          `${entry.name}: ${err instanceof Error ? err.message : '未知错误'}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `ZIP 解析失败: ${err instanceof Error ? err.message : '未知错误'}`
    );
  }

  return result;
}
