import { amapFetch } from './client';

export interface POI {
  id: string;
  name: string;
  type: string;
  address: string;
  location: string;
  tel?: string;
  distance?: string;
  biz_ext?: {
    rating?: string;
    cost?: string;
  };
}

const CATEGORY_MAP: Record<string, string> = {
  '外卖': '050301|050302',
  '奶茶': '050700',
  '咖啡': '050500',
  '美食': '050000',
  '便利店': '060200',
};

export async function searchNearby(
  apiKey: string,
  location: string,
  keyword: string,
  radius: number = 1000,
  pageSize: number = 10
): Promise<POI[]> {
  const type = CATEGORY_MAP[keyword] || '';

  const data = await amapFetch<any>(apiKey, '/place/around', {
    location,
    keywords: type ? undefined : keyword,
    types: type || undefined,
    radius,
    offset: pageSize,
    page: 1,
    extensions: 'all',
  });

  return data.pois || [];
}
