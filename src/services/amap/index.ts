import { geocodeAddress } from './geocode';
import { searchNearby } from './place';
import { getWeather } from './weather';

export * from './client';
export * from './geocode';
export * from './place';
export * from './weather';

/**
 * 调用高德地图工具
 * 根据工具名分发到对应的 API 函数
 */
export async function callAmapTool(
  apiKey: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'amap_geocode': {
      const { address } = args as { address: string };
      return await geocodeAddress(apiKey, address);
    }
    case 'amap_search_nearby': {
      const { location, keyword, radius } = args as {
        location: string;
        keyword: string;
        radius?: number;
      };
      return await searchNearby(apiKey, location, keyword, radius);
    }
    case 'amap_weather': {
      const { adcode, type = 'base' } = args as {
        adcode: string;
        type?: 'base' | 'all';
      };
      return await getWeather(apiKey, adcode, type);
    }
    default:
      throw new Error(`未知的高德地图工具: ${toolName}`);
  }
}

/**
 * 生成高德地图工具描述，注入到 LLM 系统提示中
 * 让角色知道何时可以调用这些工具
 */
export function getAmapToolDescriptions(): string {
  return `【高德地图工具 — 现实感知能力】
你具备查询现实世界信息的能力。当用户聊到地点、天气、附近美食等话题时，你可以调用以下工具获取实时数据。

调用方式：在回复中插入如下格式的代码块（必须严格按此格式）：
\`\`\`tool
{"tool": "工具名", "arguments": {"参数名": "参数值"}}
\`\`\`

可用工具列表：

1. amap_geocode — 地理编码（地址转坐标）
   用途：将用户提到的地点名称转换为精确的经纬度坐标和城市编码
   参数：
     - address: 地点名称，如"北京三里屯太古里"、"上海静安寺"、"杭州西湖"
   返回：formatted_address（完整地址）、location（经纬度，格式"lng,lat"）、adcode（城市编码）、city（城市名）

2. amap_search_nearby — 周边搜索（查附近店铺）
   用途：搜索指定地点附近的外卖、奶茶、咖啡、美食等
   参数：
     - location: 经纬度坐标，格式"lng,lat"（必须先调用 amap_geocode 获取）
     - keyword: 搜索类别，可选值："外卖"、"奶茶"、"咖啡"、"美食"、"便利店"
     - radius: 搜索半径（米），默认3000，范围500~50000
   返回：POI列表，包含 name（店名）、address（地址）、distance（距离，单位米）、tel（电话）、biz_ext.rating（评分）、biz_ext.cost（人均消费）

3. amap_weather — 天气查询
   用途：查询指定城市的实时天气或未来天气预报
   参数：
     - adcode: 城市编码（必须先调用 amap_geocode 获取）
     - type: "base"（实时天气，默认）或 "all"（未来3天预报）
   返回：
     - base模式：city（城市）、weather（天气状况，如"晴""小雨"）、temperature（气温℃）、winddirection（风向）、windpower（风力）、humidity（湿度%）
     - all模式：未来3天预报，包含 date（日期）、dayweather（白天天气）、nightweather（夜间天气）、daytemp（最高温）、nighttemp（最低温）

【使用规则】
- 当用户提到"附近""周边""周围"等词 + 地点 + 美食/奶茶/咖啡/外卖时，流程是：先 amap_geocode 获取坐标 → 再 amap_search_nearby 搜索
- 当用户提到天气、气温、下雨、晴天等词 + 地点时，流程是：先 amap_geocode 获取 adcode → 再 amap_weather 查天气
- 如果用户只说了"附近有什么好吃的"但没有说具体地点，先委婉询问用户所在位置
- 查询结果要自然地融入对话，像朋友聊天一样，不要生硬罗列数据
- 可以加入个人偏好和情感，如"这家评分4.8看起来不错""下雨天适合去这家咖啡馆躲躲"
- 如果搜索不到结果，委婉告知用户"那边好像没什么搜索结果，要不换个地方试试？"
- 不要告诉用户你"调用了工具"或"查了地图"，要像自己知道这些信息一样自然表达
- 距离超过1000米时，可以说成"大概X公里"，显得更自然`;
}
