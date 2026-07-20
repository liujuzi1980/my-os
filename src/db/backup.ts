/**
 * src/db/backup.ts
 * 备份校验工具 —— 阶段 3 存储层升级
 * 
 * 提供 SHA-256 校验和生成/验证，确保记忆数据导出/导入的完整性。
 * 完全基于浏览器原生 crypto API，零外部依赖。
 */

import type { MemoryEntry } from '@/types';

/** 备份清单结构 */
export interface BackupManifest {
  /** 清单版本号 */
  version: number;
  /** 导出时间 ISO 字符串 */
  exportedAt: string;
  /** 各条记忆的 SHA-256 校验和 { memoryId: checksum } */
  checksums: Record<string, string>;
  /** 记忆总数 */
  totalMemories: number;
  /** 涉及角色数 */
  totalCharacters: number;
  /** 导出来源 */
  source: 'markdown_export' | 'json_export';
}

/**
 * 计算字符串的 SHA-256 哈希值（十六进制）
 * 基于浏览器原生 crypto.subtle，无需额外依赖
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 为记忆数组生成备份校验清单
 * 
 * @param memories 要校验的记忆列表
 * @param characters 涉及的角色列表（用于统计）
 * @param source 导出来源标识
 */
export async function generateBackupManifest(
  memories: MemoryEntry[],
  characters: { id: string; name: string }[],
  source: BackupManifest['source'] = 'markdown_export'
): Promise<BackupManifest> {
  const checksums: Record<string, string> = {};

  // 按 key 排序后序列化，确保校验稳定
  for (const memory of memories) {
    const stableJson = JSON.stringify(memory, Object.keys(memory).sort());
    checksums[memory.id] = await sha256(stableJson);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    checksums,
    totalMemories: memories.length,
    totalCharacters: characters.length,
    source,
  };
}

/**
 * 验证备份清单与当前记忆数据的一致性
 * 
 * @param manifest 备份时生成的清单
 * @param memories 当前记忆列表
 * @returns valid 是否全部通过，invalidIds 校验失败的记忆 ID 列表
 */
export async function verifyBackupManifest(
  manifest: BackupManifest,
  memories: MemoryEntry[]
): Promise<{ valid: boolean; invalidIds: string[] }> {
  const invalidIds: string[] = [];

  for (const memory of memories) {
    const expectedChecksum = manifest.checksums[memory.id];

    // 清单中无此记录
    if (!expectedChecksum) {
      invalidIds.push(memory.id);
      continue;
    }

    const stableJson = JSON.stringify(memory, Object.keys(memory).sort());
    const actualChecksum = await sha256(stableJson);

    if (actualChecksum !== expectedChecksum) {
      invalidIds.push(memory.id);
    }
  }

  // 检查清单中有但当前缺失的记录
  const currentIds = new Set(memories.map((m) => m.id));
  for (const id of Object.keys(manifest.checksums)) {
    if (!currentIds.has(id)) {
      invalidIds.push(id);
    }
  }

  return {
    valid: invalidIds.length === 0,
    invalidIds,
  };
}

/**
 * 生成包含校验清单的 Markdown 注释块
 * 可附加在 ZIP 中的 README.md 或 _manifest.json 中使用
 */
export async function generateManifestJson(
  memories: MemoryEntry[],
  characters: { id: string; name: string }[]
): Promise<string> {
  const manifest = await generateBackupManifest(memories, characters, 'markdown_export');
  return JSON.stringify(manifest, null, 2);
}
