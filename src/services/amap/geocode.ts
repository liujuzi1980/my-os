import { amapFetch } from './client';

export interface GeocodeResult {
  formatted_address: string;
  province: string;
  city: string;
  district: string;
  adcode: string;
  location: string;
  street?: string;
  number?: string;
}

function extractPlaceName(address: string): string {
  return address
    .replace(/附近|周边|周围|旁边|里面|内|的/g, '')
    .replace(/有什么|有没有|吗|在哪里|发定位|地图/g, '')
    .trim();
}

export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodeResult | null> {
  // 第一步：用 geocode/geo 获取城市信息（用于精确搜索时限定城市）
  const geoData = await amapFetch<any>(apiKey, '/geocode/geo', { address });
  if (!geoData.geocodes?.length) return null;

  const geoResult = geoData.geocodes[0];
  const city = geoResult.city || '';
  const adcode = geoResult.adcode || '';

  console.log('[geocode] 步骤1 - geocode城市信息:', city, adcode);

  // 第二步：用 place/text 精确搜索用户说的地点，获取精确坐标
  // 这是关键：geocode 的坐标精度不够，必须用 place/text 搜索 POI
  const placeName = extractPlaceName(address);
  console.log('[geocode] 步骤2 - 精确搜索地点:', placeName, '城市:', city);

  try {
    const searchData = await amapFetch<any>(apiKey, '/place/text', {
      keywords: placeName,
      city: city,
      offset: 3,
      page: 1,
      extensions: 'all',
    });

    if (searchData.pois?.length > 0) {
      // 找到最匹配的POI
      const poi = searchData.pois[0];
      console.log('[geocode] ✅ 精确搜索命中:', poi.name, '|', poi.address, '|', poi.location);
      return {
        formatted_address: `${poi.name} ${poi.address || ''}`.trim(),
        province: poi.pname || geoResult.province,
        city: poi.cityname || city,
        district: poi.adname || geoResult.district,
        adcode: poi.adcode || adcode,
        location: poi.location,  // POI 的精确坐标
      };
    } else {
      console.warn('[geocode] ❌ 精确搜索无结果，回退到 geocode 坐标');
    }
  } catch (e) {
    console.warn('[geocode] ❌ 精确搜索失败，回退到 geocode 坐标:', e);
  }

  // 回退到 geocode 结果
  return {
    formatted_address: geoResult.formatted_address,
    province: geoResult.province,
    city: geoResult.city,
    district: geoResult.district,
    adcode: geoResult.adcode,
    location: geoResult.location,
  };
}
