// PRISM 2.0 Cloudflare Worker + SQLite Durable Object Ghost Sniper Network.
// Real players' runs asynchronously invade other players' arenas as Pink Spectral Snipers!
//
// Endpoints:
//   GET  /api/ghosts?limit=24  → active ghost sniper roster + network stats
//   POST /api/ghosts           → upload a completed run profile as a new Ghost Sniper
//   POST /api/ghosts/duel      → record a Ghost Duel kill (increments global counter)
//   *                          → static SPA assets via env.ASSETS

const SEEDED_ACES = [
  { id: 'ace-0', callsign: 'VALKYRIE', core: 0, style: 0, peakRank: 34, aimTier: 4, aimCombo: 14, score: 18400, wave: 18, hue: 0.91, topShard: 'LENS 6', isSeeded: 1 },
  { id: 'ace-1', callsign: 'KINETIC',  core: 1, style: 1, peakRank: 41, aimTier: 6, aimCombo: 22, score: 26200, wave: 22, hue: 0.86, topShard: 'PHASE STEP 6', isSeeded: 1 },
  { id: 'ace-2', callsign: 'SPECTRA',  core: 3, style: 2, peakRank: 38, aimTier: 5, aimCombo: 18, score: 22900, wave: 20, hue: 0.95, topShard: 'CASCADE 6', isSeeded: 1 },
  { id: 'ace-3', callsign: 'SOLARIS',  core: 2, style: 0, peakRank: 47, aimTier: 7, aimCombo: 28, score: 34500, wave: 25, hue: 0.89, topShard: 'MIRROR 6', isSeeded: 1 },
  { id: 'ace-4', callsign: 'PRISM-09', core: 0, style: 1, peakRank: 29, aimTier: 3, aimCombo: 11, score: 14100, wave: 15, hue: 0.93, topShard: 'REFRACT 5', isSeeded: 1 },
  { id: 'ace-5', callsign: 'ZENITH',   core: 3, style: 2, peakRank: 52, aimTier: 8, aimCombo: 35, score: 42800, wave: 28, hue: 0.84, topShard: 'ARC 6', isSeeded: 1 },
  { id: 'ace-6', callsign: 'NOVA-X',   core: 1, style: 0, peakRank: 44, aimTier: 6, aimCombo: 24, score: 30100, wave: 24, hue: 0.96, topShard: 'SPLIT 6', isSeeded: 1 },
  { id: 'ace-7', callsign: 'PHANTOM',  core: 2, style: 1, peakRank: 60, aimTier: 9, aimCombo: 44, score: 54900, wave: 30, hue: 0.88, topShard: 'LANCE 6', isSeeded: 1 },
];

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function sanitizeCallsign(raw) {
  const cleaned = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9\-_ ]/g, '')
    .trim()
    .slice(0, 14);
  return cleaned.length >= 2 ? cleaned : 'DRIFTER';
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export class GhostRoster {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.initialized = false;
  }

  ensureSchema() {
    if (this.initialized) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ghosts (
        id TEXT PRIMARY KEY,
        callsign TEXT NOT NULL,
        core INTEGER NOT NULL,
        style INTEGER NOT NULL,
        peak_rank INTEGER NOT NULL,
        aim_tier INTEGER NOT NULL,
        aim_combo INTEGER NOT NULL,
        score INTEGER NOT NULL,
        wave INTEGER NOT NULL,
        hue REAL NOT NULL,
        top_shard TEXT NOT NULL,
        is_seeded INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        val INTEGER NOT NULL
      );
    `);

    const countRow = this.sql.exec('SELECT COUNT(*) AS c FROM ghosts').one();
    if (!countRow || Number(countRow.c) === 0) {
      const now = Date.now();
      for (let i = 0; i < SEEDED_ACES.length; i++) {
        const g = SEEDED_ACES[i];
        this.sql.exec(
          `INSERT OR IGNORE INTO ghosts (id, callsign, core, style, peak_rank, aim_tier, aim_combo, score, wave, hue, top_shard, is_seeded, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          g.id, g.callsign, g.core, g.style, g.peakRank, g.aimTier, g.aimCombo,
          g.score, g.wave, g.hue, g.topShard, g.isSeeded, now - (i + 1) * 60000,
        );
      }
    }
    this.sql.exec(`INSERT OR IGNORE INTO stats (key, val) VALUES ('duels_won', 0)`);
    this.initialized = true;
  }

  async fetch(request) {
    this.ensureSchema();
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/api/ghosts') {
      const limit = clampInt(url.searchParams.get('limit') ?? 24, 4, 48, 24);
      // Prioritize real player ghosts first, then top aces so players fight live human profiles!
      const rows = this.sql.exec(
        `SELECT id, callsign, core, style, peak_rank, aim_tier, aim_combo, score, wave, hue, top_shard, is_seeded, created_at
         FROM ghosts
         ORDER BY is_seeded ASC, created_at DESC
         LIMIT ?`,
        limit,
      ).toArray();

      const totalPlayersRow = this.sql.exec('SELECT COUNT(*) AS c FROM ghosts WHERE is_seeded = 0').toArray()[0];
      const duelsRow = this.sql.exec(`SELECT val FROM stats WHERE key = 'duels_won'`).toArray()[0];

      const ghosts = rows.map((r) => ({
        id: String(r.id),
        callsign: String(r.callsign),
        core: Number(r.core),
        style: Number(r.style),
        peakRank: Number(r.peak_rank),
        aimTier: Number(r.aim_tier),
        aimCombo: Number(r.aim_combo),
        score: Number(r.score),
        wave: Number(r.wave),
        hue: Number(r.hue),
        topShard: String(r.top_shard),
        isHuman: Number(r.is_seeded) === 0,
        createdAt: Number(r.created_at),
      }));

      return new Response(
        JSON.stringify({
          ghosts,
          humanCount: Number(totalPlayersRow?.c ?? 0),
          totalDuels: Number(duelsRow?.val ?? 0),
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    if (request.method === 'POST' && url.pathname === '/api/ghosts') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: JSON_HEADERS });
      }
      const callsign = sanitizeCallsign(body?.callsign);
      const core = clampInt(body?.core, 0, 3, 0);
      const style = clampInt(body?.style, 0, 2, core % 3);
      const peakRank = clampInt(body?.peakRank, 1, 999, 1);
      const aimTier = clampInt(body?.aimTier, 1, 10, 1);
      const aimCombo = clampInt(body?.aimCombo, 0, 999, 0);
      const score = clampInt(body?.score, 0, 99_999_999, 0);
      const wave = clampInt(body?.wave, 0, 999, 0);
      const hueNum = Number(body?.hue);
      const hue = Number.isFinite(hueNum) ? ((hueNum % 1) + 1) % 1 : 0.91;
      const topShard = String(body?.topShard ?? 'PRISM CORE')
        .toUpperCase()
        .replace(/[^A-Z0-9 \-]/g, '')
        .slice(0, 18) || 'PRISM CORE';

      const id = `plr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();
      this.sql.exec(
        `INSERT INTO ghosts (id, callsign, core, style, peak_rank, aim_tier, aim_combo, score, wave, hue, top_shard, is_seeded, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        id, callsign, core, style, peakRank, aimTier, aimCombo, score, wave, hue, topShard, now,
      );

      // Retain the newest 72 human runs (keeping all seeded aces intact as baseline).
      this.sql.exec(`
        DELETE FROM ghosts
        WHERE is_seeded = 0
          AND id NOT IN (
            SELECT id FROM ghosts WHERE is_seeded = 0 ORDER BY created_at DESC LIMIT 72
          )
      `);

      const totalPlayersRow = this.sql.exec('SELECT COUNT(*) AS c FROM ghosts WHERE is_seeded = 0').one();
      return new Response(
        JSON.stringify({
          ok: true,
          id,
          callsign,
          humanCount: Number(totalPlayersRow?.c ?? 0),
        }),
        { status: 201, headers: JSON_HEADERS },
      );
    }

    if (request.method === 'POST' && url.pathname === '/api/ghosts/duel') {
      let body = {};
      try { body = await request.json(); } catch {}
      const delta = clampInt(body?.wins ?? 1, 1, 50, 1);
      this.sql.exec(
        `INSERT INTO stats (key, val) VALUES ('duels_won', ?)
         ON CONFLICT(key) DO UPDATE SET val = val + excluded.val`,
        delta,
      );
      const row = this.sql.exec(`SELECT val FROM stats WHERE key = 'duels_won'`).toArray()[0];
      return new Response(
        JSON.stringify({ ok: true, totalDuels: Number(row?.val ?? 0) }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_HEADERS });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/ghosts')) {
      if (env.GHOST_ROSTER) {
        const id = env.GHOST_ROSTER.idFromName('global-prism-roster-v1');
        const stub = env.GHOST_ROSTER.get(id);
        return stub.fetch(request);
      }
      return new Response(
        JSON.stringify({ ghosts: SEEDED_ACES.map((g) => ({ ...g, isHuman: false })), humanCount: 0, totalDuels: 0 }),
        { status: 200, headers: JSON_HEADERS },
      );
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('PRISM Worker active', { status: 200 });
  },
};
