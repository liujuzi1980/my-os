import { amapFetch } from './client';

export interface LiveWeather {
  province: string;
  city: string;
  adcode: string;
  weather: string;
  temperature: string;
  winddirection: string;
  windpower: string;
  humidity: string;
  reporttime: string;
}

export interface Forecast {
  date: string;
  week: string;
  dayweather: string;
  nightweather: string;
  daytemp: string;
  nighttemp: string;
  daywind: string;
  nightwind: string;
}

export async function getWeather(
  apiKey: string,
  adcode: string,
  extensions: 'base' | 'all' = 'base'
) {
  const data = await amapFetch<any>(apiKey, '/weather/weatherInfo', {
    city: adcode,
    extensions,
  });

  return {
    live: data.lives?.[0] as LiveWeather | undefined,
    forecasts: data.forecasts?.[0]?.casts as Forecast[] | undefined,
  };
}
