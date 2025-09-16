import { useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "";

export default function App() {
  const [season, setSeason] = useState(new Date().getFullYear());
  const [leagueId, setLeagueId] = useState("");
  const [pprId, setPprId] = useState(0);
  const [slot, setSlot] = useState(2);
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState(null);
  const [league, setLeague] = useState(null);
  const [freeAgents, setFreeAgents] = useState([]);
  const [byeWeeks, setByeWeeks] = useState(null);

  const positionLabel = useMemo(() => {
    const map = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K" };
    return map[slot] || `Slot ${slot}`;
  }, [slot]);

  function startRequest() {
    setError(null);
    setLoadingCount((count) => count + 1);
  }

  function finishRequest() {
    setLoadingCount((count) => Math.max(0, count - 1));
  }

  async function withRequest(fetcher, onSuccess) {
    startRequest();
    try {
      const data = await fetcher();
      onSuccess?.(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unexpected error");
      onSuccess?.(null);
    } finally {
      finishRequest();
    }
  }

  function fetchJson(url, init) {
    return fetch(url, init).then((res) => {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      return res.json();
    });
  }

  function fetchLeague() {
    withRequest(
      () => fetchJson(`${API}/api/espn/league?season=${season}&leagueId=${leagueId}`),
      (data) => setLeague(data)
    );
  }

  function fetchByeWeeks() {
    withRequest(
      () => fetchJson(`${API}/api/espn/byeWeeks?season=${season}`),
      (data) => setByeWeeks(data)
    );
  }

  function fetchFreeAgents() {
    const filter = {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
        filterSlotIds: { value: [Number(slot)] },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        limit: 100,
        offset: 0
      }
    };

    withRequest(
      () =>
        fetchJson(`${API}/api/espn/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, filter })
        }),
      (json) => setFreeAgents(json?.players || json || [])
    );
  }

  const loading = loadingCount > 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>ESPN Fantasy Helper</h1>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <label>
          Season
          <input type="number" value={season} onChange={(e) => setSeason(Number(e.target.value))} />
        </label>
        <label>
          League ID
          <input type="text" value={leagueId} onChange={(e) => setLeagueId(e.target.value)} />
        </label>
        <label>
          PPR ID (optional)
          <input type="number" value={pprId} onChange={(e) => setPprId(Number(e.target.value))} />
        </label>
        <label>
          Position Slot
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
            <option value={0}>QB</option>
            <option value={2}>RB</option>
            <option value={4}>WR</option>
            <option value={6}>TE</option>
            <option value={17}>K</option>
            <option value={16}>D/ST</option>
          </select>
        </label>
      </section>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button onClick={fetchLeague} disabled={!leagueId || loading}>Load League</button>
        <button onClick={fetchByeWeeks} disabled={loading}>Load Bye Weeks</button>
        <button onClick={fetchFreeAgents} disabled={loading}>Find {positionLabel} FAs</button>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <p style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {league && (
        <section>
          <h2>League Snapshot</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "#111", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(
              {
                name: league.settings?.name,
                scoringPeriodId: league.scoringPeriodId,
                teams: (league.teams || []).length
              },
              null,
              2
            )}
          </pre>
        </section>
      )}

      {byeWeeks && (
        <section>
          <h2>Bye Weeks (NFL)</h2>
          <small>From proTeamSchedules_wl</small>
          <pre style={{ whiteSpace: "pre-wrap", background: "#111", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(byeWeeks?.settings?.proTeams?.slice(0, 10), null, 2)}
          </pre>
        </section>
      )}

      {!!freeAgents?.length && (
        <section>
          <h2>Top {positionLabel} Free Agents by % Owned</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Player</th>
                <th style={{ textAlign: "left" }}>Team</th>
                <th>% Owned</th>
                <th>Pos</th>
              </tr>
            </thead>
            <tbody>
              {freeAgents.slice(0, 25).map((p, i) => (
                <tr key={p.id || i} style={{ borderTop: "1px solid #333" }}>
                  <td>{p?.fullName || p?.player?.fullName}</td>
                  <td>{p?.proTeamAbbreviation || p?.player?.proTeamAbbreviation}</td>
                  <td>{(p?.ownership?.percentOwned ?? p?.percentOwned ?? 0).toFixed?.(1) ?? ""}</td>
                  <td>
                    {Array.isArray(p?.defaultPositionId)
                      ? p.defaultPositionId?.join(",")
                      : p?.defaultPositionId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}>
            Tip: then call <code>/api/espn/playerInfo</code> with a filter of those IDs to pull projections.
          </p>
        </section>
      )}
    </div>
  );
}
