// Client-side Ghost Sniper Network sync (Cloudflare Worker SQLite DO + localStorage + Ace Fallback).
// Real players' runs upload asynchronously and invade future arenas as hostile Pink Spectral Snipers!

export interface GhostSniperProfile {
  rosterIndex: number;
  id: string;
  callsign: string;
  core: number;
  style: number;
  peakRank: number;
  aimTier: number;
  aimCombo: number;
  score: number;
  wave: number;
  hue: number;
  topShard: string;
  isHuman: boolean;
}

const CALLSIGN_KEY = 'prism.callsign.v1';
const LOCAL_GHOSTS_KEY = 'prism.localGhosts.v1';

const FALLBACK_ACES: Omit<GhostSniperProfile, 'rosterIndex'>[] = [
  { id: 'ace-0', callsign: 'VALKYRIE', core: 0, style: 0, peakRank: 34, aimTier: 4, aimCombo: 14, score: 18400, wave: 18, hue: 0.91, topShard: 'LENS 6', isHuman: false },
  { id: 'ace-1', callsign: 'KINETIC',  core: 1, style: 1, peakRank: 41, aimTier: 6, aimCombo: 22, score: 26200, wave: 22, hue: 0.86, topShard: 'PHASE STEP 6', isHuman: false },
  { id: 'ace-2', callsign: 'SPECTRA',  core: 3, style: 2, peakRank: 38, aimTier: 5, aimCombo: 18, score: 22900, wave: 20, hue: 0.95, topShard: 'CASCADE 6', isHuman: false },
  { id: 'ace-3', callsign: 'SOLARIS',  core: 2, style: 0, peakRank: 47, aimTier: 7, aimCombo: 28, score: 34500, wave: 25, hue: 0.89, topShard: 'MIRROR 6', isHuman: false },
  { id: 'ace-4', callsign: 'PRISM-09', core: 0, style: 1, peakRank: 29, aimTier: 3, aimCombo: 11, score: 14100, wave: 15, hue: 0.93, topShard: 'REFRACT 5', isHuman: false },
  { id: 'ace-5', callsign: 'ZENITH',   core: 3, style: 2, peakRank: 52, aimTier: 8, aimCombo: 35, score: 42800, wave: 28, hue: 0.84, topShard: 'ARC 6', isHuman: false },
  { id: 'ace-6', callsign: 'NOVA-X',   core: 1, style: 0, peakRank: 44, aimTier: 6, aimCombo: 24, score: 30100, wave: 24, hue: 0.96, topShard: 'SPLIT 6', isHuman: false },
  { id: 'ace-7', callsign: 'PHANTOM',  core: 2, style: 1, peakRank: 60, aimTier: 9, aimCombo: 44, score: 54900, wave: 30, hue: 0.88, topShard: 'LANCE 6', isHuman: false },
];

export function sanitizeCallsign(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9\-_ ]/g, '').trim().slice(0, 14);
  return c.length >= 2 ? c : 'SPECTER';
}

export function getSavedCallsign(): string {
  try {
    const saved = window.localStorage.getItem(CALLSIGN_KEY);
    if (saved) return sanitizeCallsign(saved);
  } catch {}
  return `PRISM-${Math.floor(100 + Math.random() * 899)}`;
}

export function saveCallsign(name: string): string {
  const clean = sanitizeCallsign(name);
  try {
    window.localStorage.setItem(CALLSIGN_KEY, clean);
  } catch {}
  return clean;
}

function readLocalGhosts(): Omit<GhostSniperProfile, 'rosterIndex'>[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_GHOSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12);
  } catch {
    return [];
  }
}

function saveLocalGhost(g: Omit<GhostSniperProfile, 'rosterIndex'>): void {
  try {
    const prev = readLocalGhosts().filter((x) => x.id !== g.id);
    prev.unshift(g);
    window.localStorage.setItem(LOCAL_GHOSTS_KEY, JSON.stringify(prev.slice(0, 12)));
  } catch {}
}

export class GhostNetwork {
  private roster: GhostSniperProfile[] = [];
  public online = false;
  public humanCount = 0;
  public totalDuels = 0;

  constructor() {
    this.rebuildRoster([...readLocalGhosts(), ...FALLBACK_ACES]);
  }

  private rebuildRoster(items: Omit<GhostSniperProfile, 'rosterIndex'>[]): void {
    const seen = new Set<string>();
    const out: GhostSniperProfile[] = [];
    for (const item of items) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ ...item, rosterIndex: out.length });
      if (out.length >= 32) break;
    }
    if (out.length === 0) {
      for (const ace of FALLBACK_ACES) {
        out.push({ ...ace, rosterIndex: out.length });
      }
    }
    this.roster = out;
  }

  public getRoster(): GhostSniperProfile[] {
    return this.roster;
  }

  public getByIndex(idx: number): GhostSniperProfile | null {
    if (idx < 0 || idx >= this.roster.length) return null;
    return this.roster[idx] ?? null;
  }

  public async fetchLiveRoster(): Promise<GhostSniperProfile[]> {
    try {
      const res = await fetch('/api/ghosts?limit=24', { cache: 'no-store' });
      if (!res.ok) return this.roster;
      const data = await res.json();
      if (Array.isArray(data?.ghosts) && data.ghosts.length > 0) {
        this.online = true;
        this.humanCount = Number(data.humanCount ?? 0);
        this.totalDuels = Number(data.totalDuels ?? 0);
        this.rebuildRoster([...data.ghosts, ...readLocalGhosts(), ...FALLBACK_ACES]);
      }
    } catch {
      // Offline / local Vite dev fallback works seamlessly with local + Ace ghosts!
    }
    return this.roster;
  }

  public async submitRunGhost(payload: {
    callsign: string;
    core: number;
    style: number;
    peakRank: number;
    aimTier: number;
    aimCombo: number;
    score: number;
    wave: number;
    topShard: string;
  }): Promise<boolean> {
    const entry: Omit<GhostSniperProfile, 'rosterIndex'> = {
      id: `local-${Date.now().toString(36)}`,
      callsign: sanitizeCallsign(payload.callsign),
      core: payload.core,
      style: payload.style,
      peakRank: payload.peakRank,
      aimTier: payload.aimTier,
      aimCombo: payload.aimCombo,
      score: payload.score,
      wave: payload.wave,
      hue: 0.88 + ((payload.score % 13) / 100),
      topShard: payload.topShard,
      isHuman: true,
    };
    saveLocalGhost(entry);
    this.rebuildRoster([entry, ...this.roster]);

    try {
      const res = await fetch('/api/ghosts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (res.ok) {
        const data = await res.json();
        this.online = true;
        if (typeof data?.humanCount === 'number') this.humanCount = data.humanCount;
        return true;
      }
    } catch {}
    return false;
  }

  public reportDuelWins(wins: number): void {
    if (wins <= 0) return;
    this.totalDuels += wins;
    fetch('/api/ghosts/duel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wins }),
    }).catch(() => {});
  }
}
