/**
 * src/db/migrate.ts
 * 数据迁移工具 —— 阶段 3 存储层升级
 * 
 * 管理数据库 schema 版本，自动检测并执行增量迁移。
 * 阶段 2 已通过 normalizeMemoryEntry 实现读取兼容，
 * 本模块提供显式版本标记和清理迁移能力。
 */

import { getAllCharacters, getMemoriesByCharacter, saveMemoryV2 } from './index';

const MIGRATION_KEY = 'myos_db_schema_version';
const TARGET_VERSION = 3;

/**
 * 获取当前数据库 schema 版本（存储在 localStorage 中）
 */
export async function getDBSchemaVersion(): Promise<number> {
  try {
    const stored = localStorage.getItem(MIGRATION_KEY);
    return stored ? parseInt(stored, 10) : 1;
  } catch {
    return 1;
  }
}

/**
 * 设置数据库 schema 版本
 */
export async function setDBSchemaVersion(version: number): Promise<void> {
  localStorage.setItem(MIGRATION_KEY, version.toString());
}

/**
 * 运行所有待执行的迁移
 * 
 * 迁移策略：
 * - v1 → v2: 记忆系统核心升级（阶段 2 已完成，normalizeMemoryEntry 自动兼容旧数据）
 * - v2 → v3: 存储层升级（阶段 3，补全缺失字段、清理异常数据）
 * 
 * 本函数安全可重入，已完成的迁移不会重复执行。
 */
export async function runMigrations(): Promise<void> {
  const currentVersion = await getDBSchemaVersion();

  if (currentVersion >= TARGET_VERSION) {
    console.log(`[migrate] 当前 schema 版本 v${currentVersion}，无需迁移`);
    return;
  }

  console.log(`[migrate] 开始迁移: v${currentVersion} → v${TARGET_VERSION}`);

  // ========== v1 → v2: 记忆系统核心升级 ==========
  if (currentVersion < 2) {
    console.log('[migrate] 执行 v1→v2 迁移（记忆系统核心）...');
    // 阶段 2 的 normalizeMemoryEntry 已在读取层自动兼容旧格式，
    // 此处仅做版本标记，实际数据在首次读取时自动升级
    await setDBSchemaVersion(2);
    console.log('[migrate] v1→v2 完成');
  }

  // ========== v2 → v3: 存储层升级 ==========
  if (currentVersion < 3) {
    console.log('[migrate] 执行 v2→v3 迁移（存储层升级）...');

    try {
      // 遍历所有角色，加载其记忆，补全阶段 3 新增的缺失字段
      const characters = await getAllCharacters();
      let totalUpdated = 0;
      let totalMemories = 0;

      for (const character of characters) {
        const memories = await getMemoriesByCharacter(character.id);
        if (!memories || memories.length === 0) continue;

        totalMemories += memories.length;

        for (const memory of memories) {
          let needsUpdate = false;

          // 补全 lastAccessed（用于遗忘曲线计算，真实字段）
          if (memory.lastAccessed === undefined || memory.lastAccessed === null) {
            memory.lastAccessed = memory.createdAt || Date.now();
            needsUpdate = true;
          }

          // 补全 lastSurfaced（用于避免重复浮现）
          if (memory.lastSurfaced === undefined || memory.lastSurfaced === null) {
            memory.lastSurfaced = 0;
            needsUpdate = true;
          }

          // 补全 domain（领域分类）
          if (!memory.domain) {
            memory.domain = 'daily';
            needsUpdate = true;
          }

          // 补全 tags（标签数组）
          if (!Array.isArray(memory.tags)) {
            memory.tags = [];
            needsUpdate = true;
          }

          // 补全 importance（重要性）
          if (memory.importance === undefined || memory.importance === null) {
            memory.importance = 5;
            needsUpdate = true;
          }

          // 补全 resolved（是否解决）
          if (memory.resolved === undefined || memory.resolved === null) {
            memory.resolved = false;
            needsUpdate = true;
          }

          // 补全 pinned（是否钉选）
          if (memory.pinned === undefined || memory.pinned === null) {
            memory.pinned = false;
            needsUpdate = true;
          }

          // 补全 archived（是否归档）
          if (memory.archived === undefined || memory.archived === null) {
            memory.archived = false;
            needsUpdate = true;
          }

          // 补全 source（来源）
          if (!memory.source) {
            memory.source = 'auto';
            needsUpdate = true;
          }

          // 补全 valence / arousal（情感坐标）
          if (memory.valence === undefined || memory.valence === null) {
            memory.valence = 0;
            needsUpdate = true;
          }
          if (memory.arousal === undefined || memory.arousal === null) {
            memory.arousal = 0.3;
            needsUpdate = true;
          }

          if (needsUpdate) {
            await saveMemoryV2(memory);
            totalUpdated++;
          }
        }
      }

      console.log(`[migrate] 已补全 ${totalUpdated}/${totalMemories} 条记忆的缺失字段`);
      await setDBSchemaVersion(3);
      console.log('[migrate] v2→v3 完成');
    } catch (err) {
      console.error('[migrate] v2→v3 迁移过程中出错:', err);
      // 迁移失败不阻断应用启动，继续运行
      // 下次启动时会重试
    }
  }

  console.log(`[migrate] 迁移完成，当前 schema 版本: v${TARGET_VERSION}`);
}

/**
 * 强制重新运行所有迁移（用于手动修复数据）
 * 谨慎使用，会重置版本标记并重新执行全部迁移逻辑
 */
export async function forceRemigrate(): Promise<void> {
  console.warn('[migrate] 强制执行全量迁移...');
  await setDBSchemaVersion(1);
  await runMigrations();
}
