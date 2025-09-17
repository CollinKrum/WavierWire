import 'dotenv/config';

const env = {
  SWID: process.env.SWID,
  ESPN_S2: process.env.ESPN_S2,
};

if (!env.SWID || !env.ESPN_S2) {
  console.warn('[WARN] Missing SWID or ESPN_S2 env vars. Set them in your host.');
}

export default env;
