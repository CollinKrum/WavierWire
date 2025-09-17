# WavierWire Server

This service proxies ESPN Fantasy Football data and combines it with your Postgres-backed roster. It powers the waiver analysis and roster management views in the client application.

## Environment variables

Configure the following variables before starting the server:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string used for roster and watchlist data. |
| `SWID` | ✅ | ESPN authentication cookie value. Required for all authenticated ESPN API requests. |
| `ESPN_S2` | ✅ | ESPN authentication cookie value paired with `SWID`. |
| `PORT` | ⛔️ | Optional port (defaults to `8081`). |
| `USE_MOCK_WAIVER_DATA` | ⛔️ | When set to `1`, the waiver analysis endpoint uses built-in sample data. Helpful for local development or automated tests without ESPN access. |

> **Tip:** When `DATABASE_URL` points to a database without the optional roster tables, the waiver analysis endpoint will still respond with results—it simply omits roster-derived context.

## ESPN waiver analysis endpoint

`POST /api/espn/waiver-analysis`

Run a waiver-wire comparison between your current roster and ESPN free agents for a specific position.

### Request body

```json
{
  "season": 2025,
  "position": "RB",
  "currentPlayerIds": [4262921, 4430692],
  "limit": 15
}
```

- `season` *(number, optional)* – ESPN season year (defaults to the current year).
- `position` *(string, optional)* – One of `QB`, `RB`, `WR`, `TE`, `D/ST`, or `K` (defaults to `RB`).
- `currentPlayerIds` *(array, optional)* – ESPN player IDs that should be treated as already on your roster.
- `limit` *(number, optional)* – Maximum number of waiver targets to return (capped at 50).

### Response shape

```json
{
  "analysis": [
    {
      "id": 9101,
      "name": "Tyler Allgeier",
      "position": "RB",
      "team": "ATL",
      "ownershipPct": 54.8,
      "seasonProjection": 184.2,
      "avgProjection": 12.7,
      "priority": "HIGH",
      "faabBid": "18%",
      "reasoning": "54.8% rostered • 12.7 projected pts • 184.2 season outlook"
    }
  ],
  "summary": {
    "highPriority": 2,
    "mediumPriority": 1,
    "lowPriority": 0,
    "totalAnalyzed": 3,
    "rosterDepth": 4
  }
}
```

The `analysis` array is sorted by priority (HIGH → MEDIUM → LOW) and then by projected weekly scoring. The `summary` block mirrors the structure the client UI consumes.

### Offline development

If you do not have valid ESPN cookies or network access, launch the server with:

```bash
USE_MOCK_WAIVER_DATA=1 node index.js
```

The mock data replicates ESPN payloads for each fantasy position so the client can still render meaningful waiver recommendations.

## Running locally

```bash
cd server
npm install
USE_MOCK_WAIVER_DATA=1 node index.js
```

Use `curl` or your REST client of choice to hit `http://localhost:8081/api/espn/waiver-analysis` with the JSON body shown above.

