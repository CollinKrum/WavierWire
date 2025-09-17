import fetch, { type RequestInit } from 'node-fetch';
import env from '../../env';

export type EspnFetchInit = {
  filter?: unknown;
  headers?: Record<string, string | undefined>;
  method?: 'GET' | 'POST';
  body?: unknown;
};

const SCRAPER_USER_AGENT = 'ffscrapr-node-proxy/1.0';

const buildScraperUrl = (url: string): string => {
  if (!env.USE_ESPN_SCRAPER) {
    return url;
  }

  try {
    const original = new URL(url);
    const scraperBase = new URL(env.ESPN_SCRAPER_HOST);

    if (original.hostname !== 'fantasy.espn.com') {
      return url;
    }

    const basePath = scraperBase.pathname.replace(/\/$/, '');

    original.protocol = scraperBase.protocol;
    original.host = scraperBase.host;
    original.port = scraperBase.port;
    original.pathname = `${basePath}${original.pathname}`;

    return original.toString();
  } catch (error) {
    console.warn('[WARN] Failed to transform ESPN URL for scraper mode:', error);
    return url;
  }
};

const serializeBody = (body: unknown): string | undefined => {
  if (body === undefined) {
    return undefined;
  }

  if (typeof body === 'string') {
    return body;
  }

  return JSON.stringify(body);
};

export async function espnFetch<T = unknown>(url: string, init: EspnFetchInit = {}): Promise<T> {
  const requestUrl = buildScraperUrl(url);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (!env.USE_ESPN_SCRAPER) {
    headers.Cookie = `SWID=${env.SWID ?? ''}; ESPN_S2=${env.ESPN_S2 ?? ''}`;
  } else {
    headers['User-Agent'] = SCRAPER_USER_AGENT;
    headers['x-fantasy-platform'] = 'ffscrapr';

    if (env.SWID && env.ESPN_S2) {
      headers.Cookie = `SWID=${env.SWID}; ESPN_S2=${env.ESPN_S2}`;
    }
  }

  if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }
  }

  if (init.filter !== undefined) {
    headers['x-fantasy-filter'] = JSON.stringify(init.filter);
  }

  const requestInit: RequestInit = {
    headers,
    method: init.method ?? (init.body ? 'POST' : 'GET'),
  };

  const body = serializeBody(init.body);
  if (body !== undefined) {
    requestInit.body = body;
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(requestUrl, requestInit);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ESPN ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
