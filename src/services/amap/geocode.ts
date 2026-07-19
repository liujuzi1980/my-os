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

export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodeResult | null> {
  const data = await amapFetch<any>(apiKey, '/geocode/geo', { address });
  if (!data.geocodes?.length) return null;
  return data.geocodes[0];
}
