// Prism Prototype — interactive HUD wired to the canvas engine.
const { useState, useEffect, useRef, useCallback } = React;
const { makeGame, step, render, recompute, TUNE, PO } = window.PrismGame;

const PO_INK = '#a8f4ff', PO_DIM = 'rgba(168,244,255,0.45)', PO_FAINT = 'rgba(168,244,255,0.16)';
const PO_BG = '#020308', PO_AMBER = '#ffae6c', PO_DANGER = '#ff5b6e';
const PO_GREEN = '#7dffb0', PO_LEGEND = '#ffd96b', PO_PURPLE = '#c9a3ff';

const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  const m = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${m}:${ss}`;
};

// Catalog of shard offers. Color + tier per shard.
const SHARD_CATALOG = {
  SPLIT:        { color: '#ffae6c', rarity: 'common',    desc: 'Adds +1 beam to every salvo. Spread widens.' },
  REFRACT:      { color: '#a8f4ff', rarity: 'common',    desc: 'Beams curve toward the nearest target.' },
  MIRROR:       { color: '#c9a3ff', rarity: 'rare',      desc: 'Adds a radial beam in every direction.' },
  CHROMATIC:    { color: '#ff8ad9', rarity: 'rare',      desc: 'Splits each beam into red/green/blue echoes.' },
  LENS:         { color: '#fff3c0', rarity: 'common',    desc: 'Beams hit harder and pierce wider.' },
  DIFFRACT:     { color: '#8efff4', rarity: 'common',    desc: 'Hits chance to fragment into shards.' },
  ECHO:         { color: '#a0a8ff', rarity: 'rare',      desc: 'Every salvo fires a delayed half-strength echo.' },
  HALO:         { color: '#ffe898', rarity: 'common',    desc: 'Orbital orbs grind enemies that touch you.' },
  CASCADE:      { color: '#ff7a7a', rarity: 'rare',      desc: 'Kills detonate into homing fragments.' },
  INTERFERENCE: { color: '#9a9dff', rarity: 'rare',      desc: 'Periodic shockwave ring. Slows + damages.' },
  SIPHON:       { color: '#7dffb0', rarity: 'common',    desc: 'Heal a fraction of damage you deal.' },
  FROST:        { color: '#7fd3ff', rarity: 'common',    desc: 'Hits slow enemies. Stacks deepen.' },
  BARRIER:      { color: '#a8f4ff', rarity: 'common',    desc: 'Recharging shield absorbs one hit.' },
  THORNS:       { color: '#ffb38a', rarity: 'common',    desc: 'Reflect on contact damage.' },
  MAGNET:       { color: '#ffd96b', rarity: 'common',    desc: 'Increases gem pickup radius.' },
  MOMENTUM:     { color: '#7dffb0', rarity: 'common',    desc: 'Faster move speed, faster dash recharge.' },
  ARMOR:        { color: '#c9c9d6', rarity: 'common',    desc: 'Reduces incoming damage multiplicatively.' },
  LUCK:         { color: '#ffd96b', rarity: 'rare',      desc: 'Shifts shard offer toward higher tiers.' },
  'PRISM HEART':{ color: '#ff8ad9', rarity: 'rare',      desc: '+15 max HP per level. Slowly regenerate.' },
  'PHASE STEP': { color: '#c9a3ff', rarity: 'rare',      desc: 'Longer i-frames after every hit.' },
  ARC:          { color: '#7fd3ff', rarity: 'rare',      desc: 'Beams chain to nearby enemies on hit.' },
  MINEFIELD:    { color: '#ffae6c', rarity: 'rare',      desc: 'Drops mines behind you while moving.' },
  LANCE:        { color: '#ffd96b', rarity: 'legendary', desc: 'Charges a piercing solar lance every 3.5s.' },
};

const SYNERGY_DEFS = {
  'CHAIN REACTION': { color: PO_LEGEND, recipe: 'SPLIT 4 + CASCADE 1', desc: '+15% beam damage. Kills chain into homing fragments.' },
  'BLIZZARD':       { color: '#7fd3ff', recipe: 'FROST 4 + DIFFRACT 3', desc: 'Slow becomes a freeze; frozen enemies shatter for AoE.' },
  'SOLAR LANCE':    { color: PO_LEGEND, recipe: 'HALO 4 + LANCE 3', desc: 'Halo orbs feed Lance — recharge halved.' },
  'SINGULARITY':    { color: PO_PURPLE, recipe: 'MAGNET 4 + INTERFERENCE 3', desc: 'Pulse rings pull enemies inward before exploding.' },
  'AFTERIMAGE':     { color: PO_PURPLE, recipe: 'ECHO 3 + MOMENTUM 3', desc: 'Dashing leaves a clone that fires for 1.2s.' },
  'KALEIDOSCOPE':   { color: PO_LEGEND, recipe: 'MIRROR 4 + SPLIT 4', desc: 'Radial beams split into a 6-fold mirror pattern.' },
};

// Pick 3 shards for a level-up offer. Includes already-owned (to level up).
function pickOffer(G) {
  const luck = G.stats.luck || 0;
  const owned = Object.keys(G.shards);
  const all = Object.keys(SHARD_CATALOG);
  const candidates = [];
  // Bias: 2/3 chance of leveling existing if owned exists
  for (let i = 0; i < 3; i++) {
    let pool;
    if (owned.length > 0 && Math.random() < 0.55) {
      pool = owned.filter(o => (G.shards[o] || 0) < 8);
      if (!pool.length) pool = all.filter(s => !candidates.includes(s));
    } else {
      pool = all.filter(s => !candidates.includes(s));
    }
    // Luck: prefer rare/legendary
    if (luck > 0) {
      pool.sort((a,b) => {
        const ra = SHARD_CATALOG[a].rarity, rb = SHARD_CATALOG[b].rarity;
        const w = { legendary: 3, rare: 2, common: 1 };
        return (w[rb] - w[ra]) * (Math.random() < 0.3 + luck * 0.1 ? 1 : Math.random() - 0.5);
      });
    }
    const pick = pool[Math.floor(Math.random() * Math.min(8, pool.length))];
    if (pick) candidates.push(pick);
  }
  return candidates;
}

// ───── Subcomponents ─────
function POCorners({ inset = 24, color = PO_INK, len = 18 }) {
  const t = { position: 'absolute', width: len, height: len, borderColor: color };
  return (
    <>
      <div style={{ ...t, top: inset, left: inset, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <div style={{ ...t, top: inset, right: inset, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
      <div style={{ ...t, bottom: inset, left: inset, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <div style={{ ...t, bottom: inset, right: inset, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
    </>
  );
}

function ShardChip({ name, level, hovered, onHover, onLeave }) {
  const def = SHARD_CATALOG[name];
  if (!def) return null;
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        border: `1px solid ${def.color}55`,
        background: 'rgba(0,0,0,0.4)',
        fontSize: 10, letterSpacing: 1.5,
        position: 'relative',
      }}
    >
      <div style={{
        width: 11, height: 13,
        clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
        background: def.color, boxShadow: `0 0 6px ${def.color}`,
      }} />
      <span style={{ color: '#fff' }}>{name}</span>
      <span style={{ color: def.color, fontWeight: 700 }}>L{level}</span>
    </div>
  );
}

// ───── Level-up modal ─────
function LevelUpModal({ G, onPick, onSkip, onReroll, rerolls }) {
  const [offer, setOffer] = useState(() => pickOffer(G));
  const [hov, setHov] = useState(null);
  const reroll = () => setOffer(pickOffer(G));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '1') onPick(offer[0]);
      if (e.key === '2') onPick(offer[1]);
      if (e.key === '3') onPick(offer[2]);
      if (e.key.toLowerCase() === 'r' && rerolls > 0) { reroll(); onReroll(); }
      if (e.key.toLowerCase() === 'x') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offer, rerolls]);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(2,3,8,0.78)',
      backdropFilter: 'blur(2px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'flash-in .25s ease-out',
      zIndex: 50,
    }}>
      <POCorners inset={28} color={PO_AMBER} />
      <div style={{ position: 'absolute', top: 60, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: PO_DIM }}>// CALIBRATION REQUIRED</div>
        <div style={{ fontSize: 11, letterSpacing: 6, color: PO_AMBER, marginTop: 6, animation: 'blink 1.6s infinite' }}>
          RANK {G.rank-1} → {G.rank} · CHOOSE A SHARD
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, marginTop: 30 }}>
        {offer.map((name, idx) => {
          const def = SHARD_CATALOG[name];
          const cur = G.shards[name] || 0;
          const next = cur + 1;
          const isNew = cur === 0;
          return (
            <div
              key={idx}
              className="shard-card"
              onClick={() => onPick(name)}
              onMouseEnter={() => setHov(idx)}
              onMouseLeave={() => setHov(null)}
              style={{
                width: 246, height: 320, position: 'relative',
                border: `1px solid ${def.color}`,
                background: `linear-gradient(180deg, rgba(168,244,255,0.04), rgba(0,0,0,0.6))`,
                boxShadow: hov === idx
                  ? `0 0 32px ${def.color}88, inset 0 0 24px ${def.color}22`
                  : def.rarity === 'legendary' ? `0 0 22px ${def.color}55` : `0 0 12px ${def.color}22`,
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, letterSpacing: 3 }}>
                <span style={{ color: def.color }}>[{String(idx+1)}]</span>
                <span style={{ color: PO_DIM }}>{def.rarity.toUpperCase()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 110 }}>
                <div style={{
                  width: 60, height: 72,
                  clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                  background: `linear-gradient(180deg, ${def.color}, ${def.color}55)`,
                  boxShadow: `0 0 24px ${def.color}, 0 0 50px ${def.color}66`,
                }} />
              </div>

              <div style={{ fontFamily: '"Bricolage Grotesque", sans-serif', color: '#fff', fontSize: 20, fontWeight: 600, letterSpacing: 2, textAlign: 'center' }}>{name}</div>
              <div style={{ color: def.color, fontSize: 9, letterSpacing: 2, textAlign: 'center', marginTop: 4 }}>
                {isNew ? 'NEW · LV 1' : `LV ${cur} → LV ${next}`}
              </div>

              {/* Pip ladder */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12 }}>
                {[1,2,3,4,5,6,7,8].map(n => (
                  <div key={n} style={{
                    width: 8, height: 8,
                    background: n <= next ? def.color : 'transparent',
                    border: `1px solid ${def.color}88`,
                    boxShadow: n === next ? `0 0 6px ${def.color}` : 'none',
                  }} />
                ))}
              </div>

              <div style={{ fontSize: 11, lineHeight: 1.5, color: PO_DIM, marginTop: 14, textAlign: 'center' }}>{def.desc}</div>

              <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 9, letterSpacing: 4, color: def.color }}>
                ▸ EQUIP
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', left: '50%', bottom: 56, transform: 'translateX(-50%)', display: 'flex', gap: 12, fontSize: 10, letterSpacing: 3 }}>
        <div className="po-btn" onClick={() => { if (rerolls > 0) { reroll(); onReroll(); } }} style={{ padding: '10px 22px', border: `1px solid ${rerolls > 0 ? PO_INK : PO_FAINT}`, color: rerolls > 0 ? PO_INK : PO_DIM }}>
          ↻ REROLL ×{rerolls} <span style={{ color: PO_AMBER, marginLeft: 8 }}>[R]</span>
        </div>
        <div className="po-btn" onClick={onSkip} style={{ padding: '10px 22px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>
          ⊘ SKIP +6 HP <span style={{ color: PO_AMBER, marginLeft: 8 }}>[X]</span>
        </div>
      </div>
    </div>
  );
}

// ───── Title screen ─────
function TitleScreen({ onStart, best }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: PO_BG, color: PO_INK }}>
      <POCorners inset={28} />
      <div style={{ position: 'absolute', top: 28, left: 40, right: 40, display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: 2, color: PO_DIM }}>
        <span>PRISM-OS v0.9.4 · NODE-7F2</span>
        <span style={{ color: PO_GREEN, animation: 'blink 1.6s infinite' }}>● UPLINK STABLE</span>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 12, letterSpacing: 8, color: PO_DIM, marginBottom: 18, fontFamily: '"JetBrains Mono", monospace' }}>// SIGNAL ACQUIRED</div>
        <div style={{ fontSize: 152, fontWeight: 300, letterSpacing: 14, lineHeight: 1, color: '#fff', textShadow: `0 0 32px ${PO_INK}, 0 0 80px rgba(168,244,255,0.4)` }}>PRISM</div>
        <div style={{ fontSize: 11, letterSpacing: 6, color: PO_INK, marginTop: 14, opacity: 0.8, fontFamily: '"JetBrains Mono", monospace' }}>AUTO-FIRING LIGHT · REFRACTED THROUGH SHARDS</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', bottom: 110, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div className="po-btn" onClick={onStart} style={{
          padding: '16px 40px', border: `1px solid ${PO_INK}`, color: PO_INK,
          fontSize: 13, letterSpacing: 5,
          background: 'rgba(168,244,255,0.08)',
          boxShadow: `0 0 28px rgba(168,244,255,0.3)`,
        }}>
          ▶ JACK IN <span style={{ color: PO_DIM, marginLeft: 14 }}>[ENTER]</span>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 3, color: PO_DIM, marginTop: 4 }}>WASD · MOVE   ·   SHIFT · DASH   ·   AUTO-FIRE</div>
      </div>

      <div style={{ position: 'absolute', left: 40, bottom: 40, fontSize: 10, color: PO_DIM, letterSpacing: 2 }}>
        <div style={{ color: PO_GREEN, letterSpacing: 4, marginBottom: 6 }}>// LOCAL BEST</div>
        <div>{fmtTime(900)} · RANK 24 · {best.toLocaleString()} PTS</div>
        <div style={{ opacity: 0.55, marginTop: 2 }}>DIRECTIVE COMPLETE</div>
      </div>
      <div style={{ position: 'absolute', right: 40, bottom: 40, fontSize: 10, color: PO_DIM, letterSpacing: 2, textAlign: 'right' }}>
        <div style={{ color: PO_AMBER, letterSpacing: 4, marginBottom: 6 }}>// PILOT</div>
        <div>NODE-7F2 · LIGHT-WALKER</div>
        <div style={{ opacity: 0.55, marginTop: 2 }}>{Math.floor(Math.random()*40)+10} RUNS LOGGED</div>
      </div>
    </div>
  );
}

// ───── End screen ─────
function EndScreen({ G, victory, onAgain, onMenu }) {
  const accent = victory ? PO_GREEN : PO_DANGER;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.94)', zIndex: 60 }}>
      <POCorners inset={28} color={accent} />
      <div style={{ position: 'absolute', top: 36, left: 36, fontSize: 10, letterSpacing: 3, color: PO_DIM }}>
        // RUN.LOG · {victory ? 'VICTORY' : 'TERMINATED'} · {fmtTime(G.elapsed)}
      </div>

      <div style={{ position: 'absolute', left: '50%', top: 100, transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 110, fontWeight: 300, letterSpacing: 14, color: accent, textShadow: `0 0 36px ${accent}88` }}>
          {victory ? 'VICTORY' : 'SHATTERED'}
        </div>
        <div style={{ fontSize: 10, letterSpacing: 6, color: PO_DIM, fontFamily: '"JetBrains Mono", monospace' }}>
          {victory ? `VOID PRISM SLAIN · ${fmtTime(G.elapsed)}` : `KILLED @ ${fmtTime(G.elapsed)} · ${G.kills} KILLS LOGGED`}
        </div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: 270, transform: 'translateX(-50%)', display: 'flex', gap: 32 }}>
        {[
          { label: 'SCORE', value: G.score.toLocaleString(), accent: '#fff' },
          { label: 'RANK', value: String(G.rank), accent: PO_INK },
          { label: 'KILLS', value: String(G.kills), accent: PO_AMBER },
          { label: 'TIME', value: fmtTime(G.elapsed), accent: PO_GREEN },
          { label: 'DPS', value: String(Math.round(G.score / Math.max(1, G.elapsed) * 0.7)), accent: PO_PURPLE },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: PO_DIM }}>{s.label}</div>
            <div style={{ fontSize: 26, color: s.accent, fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 400, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', left: 80, top: 400, right: 80 }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: PO_DIM, marginBottom: 10 }}>// BUILD COMPOSITION</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(G.shards).sort((a,b) => b[1]-a[1]).map(([name, lv]) => {
            const def = SHARD_CATALOG[name];
            if (!def) return null;
            return (
              <ShardChip key={name} name={name} level={lv} />
            );
          })}
        </div>
        {G.synergies.size > 0 && (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, letterSpacing: 2 }}>
            {[...G.synergies].map(s => (
              <span key={s} style={{
                padding: '4px 10px',
                border: `1px solid ${SYNERGY_DEFS[s]?.color || PO_LEGEND}`,
                color: SYNERGY_DEFS[s]?.color || PO_LEGEND,
                background: 'rgba(0,0,0,0.4)',
              }}>★ {s}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', left: 40, bottom: 40, display: 'flex', gap: 12, fontSize: 11, letterSpacing: 4 }}>
        <div className="po-btn" onClick={onAgain} style={{
          padding: '12px 28px', border: `1px solid ${PO_INK}`, background: 'rgba(168,244,255,0.05)', color: PO_INK,
          boxShadow: `0 0 18px rgba(168,244,255,0.2)`,
        }}>▶ AGAIN <span style={{ color: PO_DIM, marginLeft: 8 }}>[ENTER]</span></div>
        <div className="po-btn" onClick={onMenu} style={{
          padding: '12px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM,
        }}>↩ MENU <span style={{ color: PO_AMBER, marginLeft: 8 }}>[ESC]</span></div>
      </div>
    </div>
  );
}

// ───── Pause screen ─────
function PauseScreen({ onResume, onQuit, G }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.84)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <POCorners inset={28} />
      <div style={{ fontSize: 9, letterSpacing: 6, color: PO_DIM }}>// SYSTEM PAUSED</div>
      <div style={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontSize: 96, letterSpacing: 12, color: '#fff', fontWeight: 300, marginTop: 6 }}>PAUSE</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 26, fontSize: 11, letterSpacing: 4 }}>
        <div className="po-btn" onClick={onResume} style={{ padding: '12px 28px', border: `1px solid ${PO_INK}`, color: PO_INK, background: 'rgba(168,244,255,0.05)' }}>▶ RESUME <span style={{ color: PO_DIM, marginLeft: 8 }}>[ESC]</span></div>
        <div className="po-btn" onClick={onQuit} style={{ padding: '12px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>↩ ABANDON</div>
      </div>
      <div style={{ marginTop: 36, fontSize: 10, letterSpacing: 3, color: PO_DIM }}>
        RANK {G.rank} · {G.kills} KILLS · {fmtTime(G.elapsed)} ELAPSED
      </div>
    </div>
  );
}

// ───── Boss intro banner ─────
function BossBanner({ phase = 'warn', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, phase === 'warn' ? 2400 : 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, rgba(255,91,110,0.15), transparent 60%)', animation: 'flash-in .3s' }} />
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', animation: 'flash-in .3s' }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: PO_DANGER, animation: 'blink 0.7s infinite' }}>
          {phase === 'warn' ? '// HOSTILE SIGNATURE INBOUND · 03' : '// HOSTILE SIGNATURE DETECTED'}
        </div>
        <div style={{ fontSize: 82, fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 300, letterSpacing: 16, color: '#fff', marginTop: 10, textShadow: '0 0 32px rgba(255,91,110,0.6)' }}>
          SENTINEL
        </div>
        <div style={{ fontSize: 10, letterSpacing: 4, color: PO_DIM, marginTop: 4 }}>BOSS · TIER I · 14,800 HP</div>
      </div>
    </div>
  );
}

// ───── Synergy banner ─────
function SynergyBanner({ name, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  const def = SYNERGY_DEFS[name];
  if (!def) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 35%, ${def.color}22, transparent 60%)`, animation: 'flash-in .3s' }} />
      <div style={{ position: 'absolute', top: '22%', left: 0, right: 0, textAlign: 'center', animation: 'flash-in .3s' }}>
        <div style={{ fontSize: 11, letterSpacing: 8, color: def.color }}>// SYNERGY UNLOCKED</div>
        <div style={{ fontSize: 92, fontWeight: 300, letterSpacing: 12, color: '#fff', textShadow: `0 0 40px ${def.color}, 0 0 80px ${def.color}88`, marginTop: 4, fontFamily: '"Bricolage Grotesque", sans-serif' }}>
          {name}
        </div>
        <div style={{ fontSize: 11, letterSpacing: 3, color: PO_DIM, marginTop: 8 }}>{def.recipe}</div>
        <div style={{ fontSize: 11, color: '#fff', marginTop: 6, opacity: 0.9 }}>{def.desc}</div>
      </div>
    </div>
  );
}

// ───── Boss HP bar ─────
function BossHpBar({ G }) {
  const pct = Math.max(0, G.boss.hp / G.boss.maxHp);
  return (
    <div style={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', width: 540, textAlign: 'center' }}>
      <div style={{ fontSize: 10, letterSpacing: 6, color: PO_DANGER }}>// SENTINEL · PHASE {G.boss.phase}</div>
      <div style={{ position: 'relative', height: 14, marginTop: 6, border: `1px solid ${PO_DANGER}`, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: `linear-gradient(90deg, ${PO_DANGER}, #ff8a9a)`, boxShadow: `0 0 12px ${PO_DANGER}` }} />
        {/* Phase ticks */}
        <div style={{ position: 'absolute', left: '33%', top: -2, bottom: -2, width: 1, background: '#fff' }} />
        <div style={{ position: 'absolute', left: '66%', top: -2, bottom: -2, width: 1, background: '#fff' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 2, color: PO_DIM, marginTop: 4 }}>
        <span style={{ color: G.boss.phase >= 1 ? PO_DANGER : PO_DIM }}>▮ SHIELDS</span>
        <span style={{ color: G.boss.phase >= 2 ? PO_AMBER : PO_DIM }}>▮ FRENZY</span>
        <span style={{ color: G.boss.phase >= 3 ? PO_LEGEND : PO_DIM }}>▮ ENRAGE</span>
      </div>
    </div>
  );
}

// ───── In-game HUD ─────
function HUD({ G, onPause }) {
  const xpNeed = TUNE.xpToLevel(G.rank);
  const xpPct = G.xp / xpNeed;
  const hpPct = G.p.hp / G.p.maxHP;
  const dashPct = 1 - (G.p.dashCD / TUNE.dashCD);

  return (
    <div style={{ position: 'absolute', inset: 0, color: PO_INK, pointerEvents: 'none' }}>
      <POCorners inset={20} color={PO_FAINT} />

      {/* Top-left status */}
      <div style={{ position: 'absolute', top: 22, left: 28, fontSize: 10, letterSpacing: 2, color: PO_DIM }}>
        <span>PRISM-OS · NODE-7F2</span>
        <span style={{ color: PO_GREEN, marginLeft: 14, animation: 'blink 1.6s infinite' }}>● UPLINK</span>
      </div>

      {/* Top-center timer + wave */}
      <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: PO_DIM }}>// SECTOR 04 · DIRECTIVE 15:00</div>
        <div style={{ fontSize: 38, fontWeight: 400, color: '#fff', fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: 4, lineHeight: 1, marginTop: 4 }}>
          {fmtTime(G.elapsed)}
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6 }}>
          {[1,2,3,4,5,6,7].map(i => {
            const wave = Math.floor(G.elapsed / 60) + 1;
            return (
              <div key={i} style={{
                width: 14, height: 4,
                background: i < wave ? PO_INK : i === wave ? PO_AMBER : PO_FAINT,
                boxShadow: i === wave ? `0 0 8px ${PO_AMBER}` : 'none',
              }} />
            );
          })}
        </div>
      </div>

      {/* Pause btn (top-right) */}
      <div className="po-btn" onClick={onPause} style={{
        position: 'absolute', top: 20, right: 28,
        padding: '6px 14px', border: `1px solid ${PO_FAINT}`,
        fontSize: 9, letterSpacing: 3, color: PO_DIM,
        pointerEvents: 'auto',
      }}>‖ PAUSE [ESC]</div>

      {/* Top-right: rank + score (below pause) */}
      <div style={{ position: 'absolute', top: 64, right: 28, textAlign: 'right', minWidth: 200 }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: PO_DIM }}>RANK</div>
        <div style={{ fontSize: 32, fontWeight: 300, color: '#fff', letterSpacing: 3, fontFamily: '"Bricolage Grotesque", sans-serif', lineHeight: 1 }}>{G.rank}</div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: PO_DIM, marginTop: 4 }}>{G.kills} KILLS · {G.score.toLocaleString()} PTS</div>
        {/* XP bar */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: PO_AMBER }}>XP {Math.floor(G.xp)} / {xpNeed}</div>
          <div style={{ width: 200, height: 4, background: 'rgba(168,244,255,0.1)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${xpPct * 100}%`, background: PO_AMBER, boxShadow: `0 0 8px ${PO_AMBER}` }} />
          </div>
        </div>
      </div>

      {/* Bottom-left: HP + dash */}
      <div style={{ position: 'absolute', bottom: 26, left: 28, minWidth: 240 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 3, color: PO_DIM }}>
          <span>INTEGRITY</span>
          <span style={{ color: hpPct < 0.3 ? PO_DANGER : '#fff' }}>{Math.ceil(G.p.hp)} / {G.p.maxHP}</span>
        </div>
        <div style={{ height: 8, marginTop: 4, background: 'rgba(255,91,110,0.1)', border: `1px solid ${PO_FAINT}`, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${hpPct * 100}%`, background: hpPct < 0.3 ? PO_DANGER : '#fff', boxShadow: hpPct < 0.3 ? `0 0 12px ${PO_DANGER}` : `0 0 8px rgba(255,255,255,0.5)`, transition: 'width .15s' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 3, color: PO_DIM, marginTop: 14 }}>
          <span>DASH [SHIFT]</span>
          <span style={{ color: G.p.dashCD <= 0 ? PO_GREEN : PO_DIM }}>{G.p.dashCD <= 0 ? 'READY' : `${G.p.dashCD.toFixed(1)}s`}</span>
        </div>
        <div style={{ height: 4, marginTop: 4, background: 'rgba(168,244,255,0.08)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${dashPct * 100}%`, background: G.p.dashCD <= 0 ? PO_GREEN : PO_INK }} />
        </div>
      </div>

      {/* Bottom-center: shard chips */}
      <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
        {Object.entries(G.shards).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([name, lv]) => (
          <ShardChip key={name} name={name} level={lv} />
        ))}
      </div>

      {/* Bottom-right: synergies */}
      <div style={{ position: 'absolute', bottom: 26, right: 28, textAlign: 'right' }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: PO_DIM }}>// SYNERGIES</div>
        {G.synergies.size === 0 ? (
          <div style={{ fontSize: 10, color: PO_DIM, opacity: 0.5, marginTop: 6 }}>none active</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, alignItems: 'flex-end' }}>
            {[...G.synergies].map(s => {
              const c = SYNERGY_DEFS[s]?.color || PO_LEGEND;
              return (
                <div key={s} style={{
                  fontSize: 10, letterSpacing: 2, color: c,
                  padding: '3px 8px', border: `1px solid ${c}`, background: 'rgba(0,0,0,0.5)',
                  boxShadow: `0 0 8px ${c}55`,
                }}>★ {s}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───── Main App ─────
function App() {
  const [scene, setScene] = useState('title'); // title | playing | paused | levelup | end
  const [game, setGame] = useState(null);
  const [, force] = useState(0);
  const [boss, setBoss] = useState(null); // {phase: 'warn' | 'spawn'}
  const [synergyToast, setSynergyToast] = useState(null);
  const [bestScore, setBestScore] = useState(5118);
  const [rerolls, setRerolls] = useState(2);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const lastSynergiesRef = useRef(new Set());
  const lastBossWarnRef = useRef(false);
  const lastBossSpawnRef = useRef(false);

  // Init / restart
  const startGame = useCallback(() => {
    const g = makeGame({ bestScore });
    gameRef.current = g;
    setGame(g);
    setScene('playing');
    setRerolls(2);
    lastSynergiesRef.current = new Set();
    lastBossWarnRef.current = false;
    lastBossSpawnRef.current = false;
  }, [bestScore]);

  // Game loop
  useEffect(() => {
    if (scene !== 'playing' || !gameRef.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    let frameCount = 0;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      try {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const G = gameRef.current;
      if (G) {
        step(G, dt);
        render(ctx, G, window.innerWidth, window.innerHeight);

        // Pause on level-up
        if (G.pendingLevels > 0) {
          G.paused = true;
          setScene('levelup');
          frameCount = 9999;
        }

        // Boss warn → banner
        if (G.bossAnnounced && !lastBossWarnRef.current) {
          lastBossWarnRef.current = true;
          setBoss({ phase: 'warn' });
        }
        if (G.bossSpawned && !lastBossSpawnRef.current) {
          lastBossSpawnRef.current = true;
          setBoss({ phase: 'spawn' });
        }

        // New synergy banner
        for (const s of G.synergies) {
          if (!lastSynergiesRef.current.has(s)) {
            setSynergyToast(s);
          }
        }
        lastSynergiesRef.current = new Set(G.synergies);

        // Game over
        if (G.over) {
          setScene('end');
          if (G.score > bestScore) setBestScore(G.score);
          return;
        }

        // Re-render HUD ~12fps for perf
        frameCount++;
        if (frameCount % 5 === 0) force(x => x + 1);
      }
      } catch (e) { console.error('LOOP ERROR', e); }
    };
    // Use setInterval (preview iframe sometimes reports hidden, throttling rAF to 0fps)
    const intervalId = setInterval(loop, 1000 / 60);
    return () => { stopped = true; clearInterval(intervalId); window.removeEventListener('resize', resize); };
  }, [scene, bestScore]);

  // Pause render-only
  useEffect(() => {
    if (scene !== 'paused' && scene !== 'levelup') return;
    const cv = canvasRef.current;
    if (!cv || !gameRef.current) return;
    const ctx = cv.getContext('2d');
    render(ctx, gameRef.current, window.innerWidth, window.innerHeight);
  }, [scene]);

  // Input
  useEffect(() => {
    const onDown = (e) => {
      const k = e.key.toLowerCase();
      const G = gameRef.current;

      if (scene === 'title' && (k === 'enter' || k === ' ')) { e.preventDefault(); startGame(); return; }
      if (scene === 'end') {
        if (k === 'enter' || k === ' ') { e.preventDefault(); startGame(); return; }
        if (k === 'escape') { setScene('title'); return; }
      }
      if (scene === 'playing') {
        if (k === 'escape' || k === 'p') {
          if (G) G.paused = true;
          setScene('paused');
          return;
        }
        if (G && !G.keys.has(k)) G.keys.add(k);
        // Dash
        if (k === 'shift' && G && G.p.dashCD <= 0) {
          let dx = 0, dy = 0;
          if (G.keys.has('w') || G.keys.has('arrowup')) dy -= 1;
          if (G.keys.has('s') || G.keys.has('arrowdown')) dy += 1;
          if (G.keys.has('a') || G.keys.has('arrowleft')) dx -= 1;
          if (G.keys.has('d') || G.keys.has('arrowright')) dx += 1;
          const len = Math.hypot(dx, dy) || 1;
          if (dx || dy) {
            G.p.vx = (dx / len) * TUNE.dashSpeed;
            G.p.vy = (dy / len) * TUNE.dashSpeed;
            G.p.dash = TUNE.dashDur;
            G.p.dashCD = TUNE.dashCD * G.stats.dashCDMul;
            G.p.iframe = TUNE.dashDur + 0.05;
          }
        }
      }
      if (scene === 'paused' && k === 'escape') {
        if (G) G.paused = false;
        setScene('playing');
      }
    };
    const onUp = (e) => {
      const k = e.key.toLowerCase();
      const G = gameRef.current;
      if (G) G.keys.delete(k);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [scene, startGame]);

  const onPickShard = (name) => {
    const G = gameRef.current;
    if (!G) return;
    G.shards[name] = (G.shards[name] || 0) + 1;
    recompute(G);
    G.pendingLevels -= 1;
    if (G.pendingLevels <= 0) {
      G.paused = false;
      setScene('playing');
    }
  };
  const onSkipShard = () => {
    const G = gameRef.current;
    if (!G) return;
    G.p.hp = Math.min(G.p.maxHP, G.p.hp + 6);
    G.pendingLevels -= 1;
    if (G.pendingLevels <= 0) {
      G.paused = false;
      setScene('playing');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: PO_BG, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.18) 3px)',
        mixBlendMode: 'multiply',
      }} />

      {/* HUD */}
      {(scene === 'playing' || scene === 'paused' || scene === 'levelup') && game && (
        <HUD G={gameRef.current} onPause={() => { gameRef.current.paused = true; setScene('paused'); }} />
      )}

      {/* Boss bar when boss alive */}
      {(scene === 'playing' || scene === 'paused' || scene === 'levelup') && gameRef.current?.boss && !gameRef.current.over && (
        <BossHpBar G={gameRef.current} />
      )}

      {/* Boss banner */}
      {boss && (
        <BossBanner phase={boss.phase} onDone={() => setBoss(null)} />
      )}

      {/* Synergy banner */}
      {synergyToast && (
        <SynergyBanner name={synergyToast} onDone={() => setSynergyToast(null)} />
      )}

      {/* Title */}
      {scene === 'title' && <TitleScreen onStart={startGame} best={bestScore} />}

      {/* Pause */}
      {scene === 'paused' && (
        <PauseScreen
          G={gameRef.current}
          onResume={() => { gameRef.current.paused = false; setScene('playing'); }}
          onQuit={() => setScene('title')}
        />
      )}

      {/* Level-up */}
      {scene === 'levelup' && (
        <LevelUpModal
          G={gameRef.current}
          onPick={onPickShard}
          onSkip={onSkipShard}
          onReroll={() => setRerolls(r => Math.max(0, r - 1))}
          rerolls={rerolls}
        />
      )}

      {/* End */}
      {scene === 'end' && gameRef.current && (
        <EndScreen
          G={gameRef.current}
          victory={gameRef.current.victory}
          onAgain={startGame}
          onMenu={() => setScene('title')}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
