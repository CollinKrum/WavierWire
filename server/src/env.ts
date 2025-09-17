import 'dotenv/config';

type EnvConfig = {
  SWID?: string;
  ESPN_S2?: string;
  USE_ESPN_SCRAPER: boolean;
  ESPN_SCRAPER_HOST: string;
};

const resolveUseEspnScraper = (): boolean => {
  const raw = process.env.USE_ESPN_SCRAPER;

  if (!raw) {
    return true;
  }

  const normalized = raw.toLowerCase();
  if (normalized === '0' || normalized === 'false') {
    return false;
  }

  return normalized === '1' || normalized === 'true';
};

const env: EnvConfig = {
  USE_ESPN_SCRAPER: resolveUseEspnScraper(),
  SWID: process.env.SWID,
  ESPN_S2: process.env.ESPN_S2,
  ESPN_SCRAPER_HOST: process.env.ESPN_SCRAPER_HOST ?? 'https://lm-api-reads.fantasy.espn.com',
};

if (!env.USE_ESPN_SCRAPER && (!env.SWID || !env.ESPN_S2)) {
  console.warn('[WARN] Missing SWID or ESPN_S2 env vars. Set them in your host.');
}

export default env;
