import fetch from 'node-fetch';
import env from '../../env';

export type EspnFetchInit = {
  filter?: unknown;
  headers?: Record<string, string | undefined>;
};

export async function espnFetch<T = unknown>(url: string, init: EspnFetchInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Cookie: `SWID=${env.SWID ?? ''}; ESPN_S2=${env.ESPN_S2 ?? ''}`,
  };

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

  const response = await fetch(url, { headers, method: 'GET' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ESPN ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
