import { Router, type Response } from 'express';
import { espnFetch } from './client';

const router = Router();

const handleError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({ error: message });
};

router.get('/league', async (req, res) => {
  try {
    const { season, leagueId, view } = req.query as Record<string, string | undefined>;
    const v = view ?? 'mTeam,mRoster,mSettings,mNav';
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${encodeURIComponent(v)}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/leagueHistory', async (req, res) => {
  try {
    const { season, leagueId, view } = req.query as Record<string, string | undefined>;
    const v = view ?? 'mTeam,mRoster,mSettings';
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=${encodeURIComponent(v)}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/players', async (req, res) => {
  try {
    const { season, filter } = req.body as { season: string; filter?: unknown };
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?view=players_wl`;
    const data = await espnFetch(url, { filter });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/playerInfo', async (req, res) => {
  try {
    const { season, pprId = 0, filter } = req.body as { season: string; pprId?: number; filter?: unknown };
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/${pprId}?view=kona_player_info`;
    const data = await espnFetch(url, { filter });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/byeWeeks', async (req, res) => {
  try {
    const { season } = req.query as Record<string, string | undefined>;
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}?view=proTeamSchedules_wl`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/news', async (req, res) => {
  try {
    const { playerId, limit = '10' } = req.query as Record<string, string | undefined>;
    const url = `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${playerId}&limit=${limit}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/test', async (_req, res) => {
  try {
    const url = 'https://fantasy.espn.com/apis/v3/games/ffl/seasons/2024?view=proTeamSchedules_wl';
    const data = await espnFetch(url);
    res.json({ status: 'ok', dataSize: JSON.stringify(data).length });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
