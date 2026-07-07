/**
 * Fetches today's Berlin weather from Open-Meteo (https://open-meteo.com/) -
 * a free forecast API that needs no API key and no account, which keeps this
 * in line with the rest of the project ("komplett kostenlos über GitHub
 * Actions", see README). Used by generate-briefing.ts to attach a `weather`
 * block to the daily NewsBrief before it's written to latest.json and mailed
 * out by send-email.ts.
 */
import type { WeatherInfo } from '../src/types';

// Berlin (Mitte), fixed since this briefing is for one person in one city.
const BERLIN_LAT = 52.52;
const BERLIN_LON = 13.405;

// Where the weather card links out to when a reader clicks it.
const WEATHER_SOURCE_URL = 'https://www.wetter.com/wetter/berlin/DE0001582.html';

/** WMO weather codes -> {icon, German description}.
 * See https://open-meteo.com/en/docs#weathervariables for the full table. */
const WMO_CODE_MAP: Record<number, { icon: string; description: string }> = {
  0: { icon: '☀️', description: 'Klarer Himmel' },
  1: { icon: '🌤️', description: 'Überwiegend klar' },
  2: { icon: '⛅', description: 'Teilweise bewölkt' },
  3: { icon: '☁️', description: 'Bedeckt' },
  45: { icon: '🌫️', description: 'Nebel' },
  48: { icon: '🌫️', description: 'Gefrierender Nebel' },
  51: { icon: '🌦️', description: 'Leichter Nieselregen' },
  53: { icon: '🌦️', description: 'Nieselregen' },
  55: { icon: '🌧️', description: 'Starker Nieselregen' },
  56: { icon: '🌧️', description: 'Gefrierender Nieselregen' },
  57: { icon: '🌧️', description: 'Starker gefrierender Nieselregen' },
  61: { icon: '🌦️', description: 'Leichter Regen' },
  63: { icon: '🌧️', description: 'Regen' },
  65: { icon: '🌧️', description: 'Starker Regen' },
  66: { icon: '🌧️', description: 'Gefrierender Regen' },
  67: { icon: '🌧️', description: 'Starker gefrierender Regen' },
  71: { icon: '🌨️', description: 'Leichter Schneefall' },
  73: { icon: '🌨️', description: 'Schneefall' },
  75: { icon: '❄️', description: 'Starker Schneefall' },
  77: { icon: '❄️', description: 'Schneegriesel' },
  80: { icon: '🌦️', description: 'Leichte Regenschauer' },
  81: { icon: '🌧️', description: 'Regenschauer' },
  82: { icon: '⛈️', description: 'Heftige Regenschauer' },
  85: { icon: '🌨️', description: 'Leichte Schneeschauer' },
  86: { icon: '❄️', description: 'Starke Schneeschauer' },
  95: { icon: '⛈️', description: 'Gewitter' },
  96: { icon: '⛈️', description: 'Gewitter mit Hagel' },
  99: { icon: '⛈️', description: 'Gewitter mit starkem Hagel' },
};

function describeWeatherCode(code: number): { icon: string; description: string } {
  return WMO_CODE_MAP[code] ?? { icon: '🌡️', description: 'Wetterlage unbekannt' };
}

/** Returns null (rather than throwing) on any failure so a flaky weather
 * fetch never breaks the whole briefing - send-email.ts simply omits the
 * weather card when `weather` is undefined. */
export async function fetchBerlinWeather(): Promise<WeatherInfo | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${BERLIN_LAT}&longitude=${BERLIN_LON}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&timezone=Europe%2FBerlin&forecast_days=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json();

    const tempMaxC = data?.daily?.temperature_2m_max?.[0];
    const tempMinC = data?.daily?.temperature_2m_min?.[0];
    const precipitationProbability = data?.daily?.precipitation_probability_max?.[0];
    const weatherCode = data?.daily?.weathercode?.[0];

    if (
      typeof tempMaxC !== 'number' ||
      typeof tempMinC !== 'number' ||
      typeof precipitationProbability !== 'number' ||
      typeof weatherCode !== 'number'
    ) {
      throw new Error('Unerwartetes Antwortformat von Open-Meteo.');
    }

    const { icon, description } = describeWeatherCode(weatherCode);

    return {
      tempMinC: Math.round(tempMinC),
      tempMaxC: Math.round(tempMaxC),
      precipitationProbability: Math.round(precipitationProbability),
      weatherCode,
      description,
      icon,
      sourceUrl: WEATHER_SOURCE_URL,
    };
  } catch (err) {
    console.warn('Wetterabruf fehlgeschlagen, überspringe Wetter-Karte:', err);
    return null;
  }
}
