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
  console.log('[amap] 调用工具:', toolName, '参数:', args);
  switch (toolName) {
    case 'amap_geocode': {
      const { address } = args as { address: string };
      console.log('[amap] 开始地理编码:', address);
      const result = await geocodeAddress(apiKey, address);
      console.log('[amap] 地理编码结果:', result);
      return result;
    }
    case 'amap_search_nearby': {
      const { location, keyword, radius } = args as {
        location: string;
        keyword: string;
        radius?: number;
      };
      console.log('[amap] 开始周边搜索:', keyword, '坐标:', location, '半径:', radius || 1000);
      const pois = await searchNearby(apiKey, location, keyword, radius);
      console.log('[amap] 周边搜索返回:', pois.length, '条结果');
      return {
        results: pois.slice(0, 5).map(p => ({
          name: p.name || '',
          address: p.address || '',
          distance: p.distance || '',
          rating: p.biz_ext?.rating || '',
          tel: p.tel || '',
          type: p.type || '',
        })),
      };
    }
    case 'amap_weather': {
      const { adcode, type = 'base' } = args as {
        adcode: string;
        type?: 'base' | 'all';
      };
      const { live, forecasts } = await getWeather(apiKey, adcode, type);
      return {
        live: live ? {
          city: live.city,
          weather: live.weather,
          temperature: live.temperature,
          winddirection: live.winddirection,
          windpower: live.windpower,
          humidity: live.humidity,
          reporttime: live.reporttime,
        } : null,
        forecasts: forecasts || null,
      };
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
- 【极其重要】工具名必须严格使用上面列出的名称（amap_geocode / amap_search_nearby / amap_weather），绝对禁止自创工具名如 amap_search、amap_map、amap_static_map 等
- 【极其重要】amap_search_nearby 的参数名是 keyword（不是 keywords）、location（经纬度坐标，不是地址名称）、radius（可选）
- 【精度检查】调用 amap_geocode 后，检查返回的 formatted_address 是否包含用户提到的地点名称。如果不匹配（比如用户说"西三旗万象汇"但返回的是"悦茂购物中心"），说明 geocode 解析可能有偏差，应该如实告诉用户"我查到的坐标可能不太准，搜到的结果可能不在你说的那个地方"
- 【精度检查】amap_search_nearby 的搜索半径默认 1000 米。如果返回的店铺距离超过 1000 米，说明坐标可能不对，应该提醒用户"这些结果好像离你那儿有点远，可能定位不太准"

【极其重要 — 禁止编造】
- 你只能使用 API 返回的数据，绝对禁止编造、虚构任何店铺信息
- 如果 API 返回的字段为空（如 rating 为空、tel 为空），不要自己补充或猜测，直接忽略该字段
- 不要给店铺起别名、不要给店铺编评分、不要编距离、不要编地址
- 如果 API 返回了 3 家店，你就只说这 3 家，不要说"还有很多"
- 如果 API 返回为空，如实告诉用户"那边好像没搜到什么结果"
- 回复格式：先说一句自然的开场白，然后列出每家店的基本信息（名称、地址、距离、评分），最后可以问用户想不想去
- 距离超过1000米时，可以说成"大概X公里"
- 不要告诉用户你"调用了工具"或"查了地图"，要像自己知道这些信息一样自然表达`;
}
