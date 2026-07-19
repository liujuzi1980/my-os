const BASE_URL = 'https://restapi.amap.com/v3';

export async function amapFetch<T>(
  apiKey: string,
  endpoint: string,
  params: Record<string, any>
): Promise<T> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('高德地图 API Key 未配置，请在「设置」中填写');
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.append('key', apiKey.trim());
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, String(v));
    }
  });

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== '1') {
    throw new Error(data.info || '高德API请求失败');
  }
  return data;
}
