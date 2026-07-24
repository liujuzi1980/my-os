/**
 * src/core/PlateEngine.ts
 * M5 房间门牌 —— 情景记忆固化成语义知识。
 *
 * 四块门牌：TA的事、我是谁、我们之间、我的领域
 * 每轮常驻注入 System Prompt，不走检索、不衰减。
 */

import type { RoomPlate, PlateRoom, PlateEntry } from '@/types';
import { getRoomPlate, saveRoomPlate } from '@/db';

export class PlateEngine {
  private characterId: string;

  constructor(characterId: string) {
    this.characterId = characterId;
  }

  /** 确保四块门牌都存在（首次使用自动建空牌） */
  async ensurePlates(): Promise<RoomPlate[]> {
    const plates: RoomPlate[] = [];
    const rooms: PlateRoom[] = ['user_room', 'self_room', 'bedroom', 'study'];
    for (const room of rooms) {
      const id = this.characterId + ':' + room;
      let plate = await getRoomPlate(id);
      if (!plate) {
        plate = { id, characterId: this.characterId, room, entries: [], updatedAt: Date.now(), version: 0 };
        await saveRoomPlate(plate);
      }
      plates.push(plate);
    }
    return plates;
  }

  /** 获取格式化后的门牌文本（供 ContextBuilder 注入） */
  async getPlatesPrompt(): Promise<string> {
    const lines: string[] = [];
    lines.push('【你早已知道的背景】（这些是你经历沉淀出的稳定认知，每轮都带着，不要主动提起，只在相关时自然影响你）');
    lines.push('');

    const rooms: PlateRoom[] = ['user_room', 'self_room', 'bedroom', 'study'];
    for (const room of rooms) {
      const id = this.characterId + ':' + room;
      const plate = await getRoomPlate(id);
      if (!plate || plate.entries.length === 0) continue;

      const titles: Record<PlateRoom, string> = { user_room: 'TA的事', self_room: '我是谁', bedroom: '我们之间', study: '我的领域' };
      lines.push('【' + titles[room] + '】');
      for (const entry of plate.entries) {
        const tag = entry.tag ? '[' + entry.tag + '] ' : '';
        lines.push('- ' + tag + entry.text);
      }
      lines.push('');
    }

    if (lines.length <= 2) return ''; // 没有门牌内容就不注入
    return lines.join(String.fromCharCode(10));
  }

  /** 简单添加一条门牌条目（轻量操作，不走 LLM） */
  async addEntry(room: PlateRoom, text: string, tag?: string): Promise<void> {
    const id = this.characterId + ':' + room;
    let plate = await getRoomPlate(id);
    if (!plate) {
      plate = { id, characterId: this.characterId, room, entries: [], updatedAt: Date.now(), version: 0 };
    }
    const caps: Record<string, number> = { user_room: 12, self_room: 10, bedroom: 10, study: 8 };
    const maxEntry = caps[room] || 10;
    const entry: PlateEntry = {
      id: crypto.randomUUID(),
      text: text.slice(0, 50),
      firstLearnedAt: Date.now(),
      updatedAt: Date.now(),
      sourceCount: 1,
      tag: tag?.slice(0, 4),
    };
    plate.entries = [entry, ...plate.entries.filter(e => e.text !== text)].slice(0, maxEntry);
    plate.updatedAt = Date.now();
    plate.version++;
    await saveRoomPlate(plate);
  }
}