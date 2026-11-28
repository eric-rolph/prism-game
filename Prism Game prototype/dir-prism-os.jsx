// Direction 1: PRISM-OS
// Holographic terminal — diegetic sci-fi UI as if the player is jacked into
// a prism navigator. Vector schematics, scanlines, monospace, hex coords.

const PO_BG = '#020308';
const PO_INK = '#a8f4ff';
const PO_DIM = 'rgba(168,244,255,0.45)';
const PO_FAINT = 'rgba(168,244,255,0.16)';
const PO_AMBER = '#ffae6c';
const PO_DANGER = '#ff5b6e';
const PO_GREEN = '#7dffb0';
const PO_LEGEND = '#ffd96b';

const poStyles = {
  root: {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    color: PO_INK,
    background: PO_BG,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  bracket: {
    fontFamily: '"JetBrains Mono", monospace',
    color: PO_DIM,
    fontSize: 11,
    letterSpacing: 1,
  },
  pill: (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '3px 8px',
    border: `1px solid ${color}`,
    color,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
  }),
};

// Animated scope with rotating sweep, used as backdrop for the OS
function POScope({ size = 600 }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, margin: 'auto' }}>
      <defs>
        <radialGradient id="po-scope-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(168,244,255,0.05)" />
          <stop offset="100%" stopColor="rgba(168,244,255,0)" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r * 0.96} fill="url(#po-scope-bg)" />
      {[0.25, 0.5, 0.75, 1].map((s, i) => (
        <circle key={i} cx={r} cy={r} r={r * 0.96 * s} fill="none" stroke={PO_FAINT} strokeWidth="1" strokeDasharray={i % 2 ? '2 4' : '1 0'} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x = r + Math.cos(a) * r * 0.96;
        const y = r + Math.sin(a) * r * 0.96;
        return <line key={i} x1={r} y1={r} x2={x} y2={y} stroke={PO_FAINT} strokeWidth="0.6" />;
      })}
      {/* sweep */}
      <g style={{ transformOrigin: `${r}px ${r}px`, animation: 'orbit-spin 8s linear infinite' }}>
        <defs>
          <linearGradient id="po-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(168,244,255,0)" />
            <stop offset="100%" stopColor="rgba(168,244,255,0.55)" />
          </linearGradient>
        </defs>
        <path d={`M ${r} ${r} L ${r + r*0.96} ${r} A ${r*0.96} ${r*0.96} 0 0 0 ${r + Math.cos(-Math.PI/3)*r*0.96} ${r + Math.sin(-Math.PI/3)*r*0.96} Z`} fill="url(#po-sweep)" />
      </g>
    </svg>
  );
}

function POCorners({ inset = 16, size = 14, color = PO_INK }) {
  const c = (transform) => (
    <svg width={size} height={size} style={{ position: 'absolute', transform }} viewBox={`0 0 ${size} ${size}`}>
      <path d={`M 0 0 L ${size} 0 M 0 0 L 0 ${size}`} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
  return (
    <>
      <div style={{ position: 'absolute', top: inset, left: inset }}>{c('rotate(0deg)')}</div>
      <div style={{ position: 'absolute', top: inset, right: inset }}>{c('rotate(90deg)')}</div>
      <div style={{ position: 'absolute', bottom: inset, right: inset }}>{c('rotate(180deg)')}</div>
      <div style={{ position: 'absolute', bottom: inset, left: inset }}>{c('rotate(270deg)')}</div>
    </>
  );
}

function POBlock({ children, style = {} }) {
  return (
    <div style={{
      border: `1px solid ${PO_FAINT}`,
      background: 'rgba(8,18,28,0.72)',
      backdropFilter: 'blur(6px)',
      padding: 12,
      ...style,
    }}>{children}</div>
  );
}

// ---- TITLE ----
function PO_Title({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.4} hideEnemies={true} showPlayer={false} paletteShift={1} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(168,244,255,0.08), transparent 60%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 560, height: 560 }}>
        <POScope size={560} />
      </div>

      <POCorners inset={20} size={18} color={PO_DIM} />

      {/* Top status bar */}
      <div style={{ position: 'absolute', top: 28, left: 40, right: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: 2, color: PO_DIM }}>
        <span>PRISM-OS v0.9.4 · NODE-7F2</span>
        <span style={{ color: PO_GREEN, animation: 'blink 1.6s infinite' }}>● UPLINK STABLE</span>
        <span>SECTOR 04 / GLOBE 11</span>
      </div>

      {/* Center title */}
      <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 12, letterSpacing: 8, color: PO_DIM, marginBottom: 18 }}>// SIGNAL ACQUIRED</div>
        <div style={{ fontSize: 132, fontWeight: 300, letterSpacing: 14, lineHeight: 1, color: '#fff', textShadow: `0 0 32px ${PO_INK}, 0 0 80px rgba(168,244,255,0.4)` }}>PRISM</div>
        <div style={{ fontSize: 11, letterSpacing: 6, color: PO_INK, marginTop: 14, opacity: 0.8, fontFamily: '"JetBrains Mono", monospace' }}>AUTO-FIRING LIGHT · REFRACTED THROUGH SHARDS</div>
      </div>

      {/* Bottom CTAs */}
      <div style={{ position: 'absolute', left: '50%', bottom: 90, transform: 'translateX(-50%)', display: 'flex', gap: 14, fontFamily: '"JetBrains Mono", monospace' }}>
        <div style={{ padding: '14px 28px', border: `1px solid ${PO_INK}`, color: PO_INK, fontSize: 12, letterSpacing: 4, background: 'rgba(168,244,255,0.05)', boxShadow: `0 0 24px rgba(168,244,255,0.25), inset 0 0 24px rgba(168,244,255,0.08)` }}>
          ▶ JACK IN <span style={{ color: PO_DIM, marginLeft: 14 }}>[ENTER]</span>
        </div>
        <div style={{ padding: '14px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM, fontSize: 12, letterSpacing: 4 }}>ARCHIVES <span style={{ marginLeft: 14, opacity: 0.6 }}>[A]</span></div>
        <div style={{ padding: '14px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM, fontSize: 12, letterSpacing: 4 }}>CALIBRATE <span style={{ marginLeft: 14, opacity: 0.6 }}>[C]</span></div>
      </div>

      {/* Best run readout */}
      <div style={{ position: 'absolute', right: 40, bottom: 40, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: PO_DIM, letterSpacing: 2, textAlign: 'right' }}>
        <div style={{ color: PO_AMBER, letterSpacing: 4, marginBottom: 6 }}>// LAST RUN</div>
        <div>14:32 · RANK 19 · 2,841 PTS</div>
        <div style={{ opacity: 0.55, marginTop: 2 }}>SHATTERED BY VOID PRISM</div>
      </div>
      <div style={{ position: 'absolute', left: 40, bottom: 40, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: PO_DIM, letterSpacing: 2 }}>
        <div style={{ color: PO_GREEN, letterSpacing: 4, marginBottom: 6 }}>// LOCAL BEST</div>
        <div>15:00 · RANK 24 · 5,118 PTS</div>
        <div style={{ opacity: 0.55, marginTop: 2 }}>VOID PRISM SLAIN · KALEIDOSCOPE</div>
      </div>

      <Scanlines opacity={0.12} gap={3} />
      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- HUD (live gameplay) ----
function PO_HUD({ width = 1280, height = 720 }) {
  const activeShards = [0, 8, 11, 7, 14, 5, 12]; // SPLIT, CASCADE, FROST, HALO, MAGNET, DIFFRACT, BARRIER
  const shardLevels = { 0: 4, 8: 3, 11: 5, 7: 2, 14: 6, 5: 3, 12: 1 };
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.1} paletteShift={2} />

      {/* HUD overlay */}
      <div style={{ position: 'absolute', inset: 0, fontFamily: '"JetBrains Mono", monospace', color: PO_INK }}>
        {/* Top center: timer + wave */}
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: PO_DIM, fontSize: 10, letterSpacing: 3, marginBottom: 6 }}>
            <span>WAVE 14</span><span style={{ color: PO_FAINT }}>·</span><span style={{ color: PO_AMBER }}>OVERDRIVE</span><span style={{ color: PO_FAINT }}>·</span><span>NEXT BOSS 0:43</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: 6, color: '#fff', fontFeatureSettings: '"tnum"' }}>09:17</div>
          <div style={{ width: 280, height: 2, marginTop: 8, background: PO_FAINT, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '62%', background: `linear-gradient(90deg, ${PO_INK}, #fff)`, boxShadow: `0 0 12px ${PO_INK}` }} />
            {/* tick marks for boss spawns */}
            {[0.33, 0.66, 0.86].map((p, i) => (
              <div key={i} style={{ position: 'absolute', top: -3, left: `${p*100}%`, width: 1, height: 8, background: PO_AMBER }} />
            ))}
          </div>
        </div>

        {/* Top left: HP + dash */}
        <div style={{ position: 'absolute', top: 24, left: 28, width: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 2, color: PO_DIM, marginBottom: 4 }}>
            <span>HULL</span><span>78 / 130</span>
          </div>
          <div style={{ height: 6, background: PO_FAINT, position: 'relative', marginBottom: 14 }}>
            <div style={{ position: 'absolute', inset: 0, width: '60%', background: `linear-gradient(90deg, ${PO_DANGER}, ${PO_AMBER}, ${PO_GREEN})` }} />
            <div style={{ position: 'absolute', inset: 0, width: '60%', boxShadow: `0 0 14px ${PO_GREEN}` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 2, color: PO_DIM, marginBottom: 4 }}>
            <span>DASH</span><span>READY</span>
          </div>
          <div style={{ height: 3, background: PO_FAINT, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: '100%', background: 'linear-gradient(90deg, #9a9dff, #c9a3ff)', boxShadow: '0 0 10px #c9a3ff' }} />
          </div>
          <div style={{ fontSize: 8, letterSpacing: 2, color: PO_FAINT, marginTop: 4 }}>[SPACE / 2× TAP]</div>
        </div>

        {/* Top right: rank + kills + active synergies */}
        <div style={{ position: 'absolute', top: 22, right: 28, textAlign: 'right', minWidth: 200 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: PO_DIM }}>RANK</div>
          <div style={{ fontSize: 32, fontWeight: 300, color: '#fff', letterSpacing: 3, fontFamily: '"Bricolage Grotesque", sans-serif', lineHeight: 1 }}>14</div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: PO_DIM, marginTop: 4 }}>312 KILLS · 2,184 PTS</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={poStyles.pill(PO_LEGEND)}>⚡ CHAIN REACTION</span>
            <span style={poStyles.pill(PO_LEGEND)}>⚡ BLIZZARD</span>
            <span style={{ ...poStyles.pill(PO_FAINT), color: PO_FAINT }}>○ FROZEN ORBIT — 1 MORE</span>
          </div>
        </div>

        {/* Bottom center: XP bar with rank pip */}
        <div style={{ position: 'absolute', left: '50%', bottom: 36, transform: 'translateX(-50%)', width: '52%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 2, color: PO_DIM, marginBottom: 4 }}>
            <span>RADIANCE TO RANK 15</span><span>248 / 410</span>
          </div>
          <div style={{ height: 4, background: PO_FAINT, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: '60%', background: `linear-gradient(90deg, #7fd3ff, #fff)`, boxShadow: `0 0 16px #7fd3ff` }} />
          </div>
        </div>

        {/* Bottom left: shard tray (horizontal hex strip) */}
        <div style={{ position: 'absolute', left: 28, bottom: 28, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {activeShards.map(idx => {
            const s = SHARDS[idx];
            const lv = shardLevels[idx];
            return (
              <div key={idx} style={{ width: 36, height: 42, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: 28, height: 32,
                  clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                  background: `linear-gradient(180deg, ${s.color}, ${s.color}88)`,
                  boxShadow: `0 0 12px ${s.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ShardGlyph glyph={s.glyph} size={18} color="#0a0a14" stroke={1.6} />
                </div>
                <div style={{ fontSize: 8, letterSpacing: 1, color: s.color, fontWeight: 600 }}>L{lv}</div>
              </div>
            );
          })}
          <div style={{ marginLeft: 8, color: PO_DIM, fontSize: 9, letterSpacing: 2, paddingBottom: 16 }}>+ 16 SLOTS</div>
        </div>

        {/* Bottom right: minimap */}
        <div style={{ position: 'absolute', right: 28, bottom: 28, width: 160, height: 160, border: `1px solid ${PO_FAINT}`, position: 'absolute', overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="68" fill="none" stroke={PO_FAINT} />
            <circle cx="80" cy="80" r="40" fill="none" stroke={PO_FAINT} strokeDasharray="2 4" />
            {Array.from({ length: 28 }).map((_, i) => {
              const a = (i * 17) * Math.PI / 180;
              const r = 18 + (i % 4) * 14;
              return <circle key={i} cx={80 + Math.cos(a) * r} cy={80 + Math.sin(a) * r} r="1.5" fill={i % 4 === 0 ? PO_DANGER : PO_INK} opacity="0.7" />;
            })}
            <circle cx="80" cy="80" r="3" fill="#fff" />
            <circle cx="80" cy="80" r="6" fill="none" stroke="#fff" strokeWidth="0.6" />
          </svg>
          <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 8, letterSpacing: 2, color: PO_DIM }}>SECTOR</div>
          <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 8, letterSpacing: 2, color: PO_AMBER }}>52 ENT</div>
        </div>

        {/* Damage popups */}
        <div style={{ position: 'absolute', left: '46%', top: '38%', color: '#fff', fontSize: 14, fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 700, animation: 'drift-up 1.4s ease-out' }}>137</div>
        <div style={{ position: 'absolute', left: '58%', top: '50%', color: PO_AMBER, fontSize: 18, fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 700, animation: 'drift-up 1.4s ease-out 0.4s' }}>CRIT 482</div>

        {/* Reticle / crosshair around player */}
        <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%,-50%)', width: 80, height: 80, pointerEvents: 'none' }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <g stroke={PO_INK} strokeWidth="1" fill="none" opacity="0.5">
              <path d="M 40 6 L 40 16 M 40 64 L 40 74 M 6 40 L 16 40 M 64 40 L 74 40" />
              <circle cx="40" cy="40" r="34" strokeDasharray="2 6" />
            </g>
          </svg>
        </div>
      </div>

      <Scanlines opacity={0.1} gap={3} />
      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- RANK-UP SHARD PICKER (radial layout) ----
function PO_RankUp({ width = 1280, height = 720 }) {
  const offers = [
    { kind: 'shard', idx: 8 }, // CASCADE legendary
    { kind: 'evolution', idx: 2 }, // KALEIDOSCOPE
    { kind: 'shard', idx: 11 }, // FROST
  ];
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.7} paletteShift={3} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.66)', backdropFilter: 'blur(10px) saturate(140%)' }} />

      <POCorners inset={24} color={PO_DIM} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"JetBrains Mono", monospace' }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: PO_DIM }}>// CALIBRATION REQUIRED</div>
        <div style={{ fontSize: 11, letterSpacing: 6, color: PO_AMBER, marginTop: 6, animation: 'blink 1.6s infinite' }}>RANK 14 → 15 · CHOOSE A SHARD</div>
      </div>

      {/* Three offer cards in a row */}
      <div style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%, -50%)', display: 'flex', gap: 22 }}>
        {offers.map((o, i) => <PO_OfferCard key={i} offer={o} hotkey={i + 1} />)}
      </div>

      {/* Bottom action bar */}
      <div style={{ position: 'absolute', left: '50%', bottom: 56, transform: 'translateX(-50%)', display: 'flex', gap: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: 3 }}>
        <div style={{ padding: '10px 22px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>↻ REROLL  ×2  <span style={{ color: PO_AMBER, marginLeft: 8 }}>[R]</span></div>
        <div style={{ padding: '10px 22px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>⊘ SKIP  +6 HP  <span style={{ color: PO_AMBER, marginLeft: 8 }}>[X]</span></div>
        <div style={{ padding: '10px 22px', border: `1px solid ${PO_FAINT}`, color: PO_DIM, opacity: 0.5 }}>⊗ BANISH  ×0  <span style={{ marginLeft: 8 }}>[B]</span></div>
      </div>

      <Scanlines opacity={0.08} />
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function PO_OfferCard({ offer, hotkey }) {
  if (offer.kind === 'evolution') {
    const e = EVOLUTIONS[offer.idx];
    return (
      <div style={{
        width: 280, height: 380,
        border: `1.5px solid ${e.color}`, position: 'relative',
        background: `linear-gradient(160deg, rgba(255,181,71,0.12), rgba(0,0,0,0.55))`,
        boxShadow: `0 0 50px rgba(255,181,71,0.25), inset 0 0 40px rgba(255,181,71,0.08)`,
        padding: 20,
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        <div style={{ position: 'absolute', top: -10, left: 14, padding: '2px 10px', background: PO_BG, color: e.color, fontSize: 9, letterSpacing: 4, border: `1px solid ${e.color}` }}>EVOLUTION</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10, marginBottom: 12 }}>
          <div style={{
            width: 96, height: 96, position: 'relative',
            clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)',
            background: `radial-gradient(circle, ${e.color}, ${e.color}33)`,
            boxShadow: `0 0 32px ${e.color}, inset 0 0 32px rgba(255,255,255,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse-strong 2.4s ease-in-out infinite',
          }}>
            <div style={{ fontSize: 40, color: '#fff' }}>✦</div>
          </div>
        </div>
        <div style={{ fontFamily: '"Bricolage Grotesque", sans-serif', color: '#fff', fontSize: 22, fontWeight: 600, letterSpacing: 2, textAlign: 'center' }}>{e.name}</div>
        <div style={{ color: e.color, fontSize: 9, letterSpacing: 2, textAlign: 'center', marginTop: 4 }}>{e.recipe}</div>
        <div style={{ fontSize: 11, lineHeight: 1.6, color: PO_DIM, marginTop: 14, textAlign: 'center' }}>{e.desc}</div>
        <div style={{ marginTop: 16, padding: '8px 10px', border: `1px dashed ${e.color}66`, fontSize: 9, color: e.color, letterSpacing: 1 }}>
          ⚠ PERMANENT FUSION · CONSUMES BOTH SHARDS
        </div>
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 10, letterSpacing: 4, color: PO_DIM }}>
          [ {hotkey} ]
        </div>
      </div>
    );
  }
  const s = SHARDS[offer.idx];
  const currentLv = 5;
  const rarityColor = { common: PO_DIM, rare: '#7fd3ff', legendary: PO_LEGEND }[s.rarity];
  return (
    <div style={{
      width: 250, height: 380, position: 'relative',
      border: `1px solid ${rarityColor}`,
      background: `linear-gradient(180deg, rgba(168,244,255,0.04), rgba(0,0,0,0.6))`,
      boxShadow: s.rarity === 'legendary' ? `0 0 32px ${rarityColor}55` : `0 0 14px ${rarityColor}22`,
      padding: 18, fontFamily: '"JetBrains Mono", monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, letterSpacing: 3 }}>
        <span style={{ color: rarityColor, textTransform: 'uppercase' }}>{s.rarity}</span>
        <span style={{ color: PO_DIM }}>SHARD · {String(offer.idx).padStart(2,'0')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, marginBottom: 10 }}>
        <div style={{
          width: 84, height: 96,
          clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)',
          background: `linear-gradient(160deg, ${s.color}, ${s.color}55)`,
          boxShadow: `0 0 26px ${s.color}, inset 0 0 24px rgba(255,255,255,0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShardGlyph glyph={s.glyph} size={42} color="#0a0a14" stroke={1.8} />
        </div>
      </div>
      <div style={{ fontFamily: '"Bricolage Grotesque", sans-serif', color: '#fff', fontSize: 20, fontWeight: 600, letterSpacing: 2, textAlign: 'center' }}>{s.name}</div>

      {/* Level pip ladder */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
        {[1,2,3,4,5,6].map(n => (
          <div key={n} style={{
            width: 16, height: 5,
            background: n <= currentLv ? s.color : (n === currentLv + 1 ? '#fff' : PO_FAINT),
            boxShadow: n === currentLv + 1 ? `0 0 8px #fff` : 'none',
            opacity: n <= currentLv + 1 ? 1 : 0.3,
            border: n === currentLv + 1 ? `1px solid #fff` : 'none',
          }}/>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: PO_DIM, letterSpacing: 2, marginTop: 4 }}>LV {currentLv} → <span style={{ color: '#fff' }}>{currentLv + 1}</span></div>

      {/* Desc */}
      <div style={{ fontSize: 11, lineHeight: 1.55, color: PO_DIM, marginTop: 12, textAlign: 'center' }}>{s.desc}</div>

      {/* Stat delta */}
      <div style={{ marginTop: 10, padding: '6px 8px', background: 'rgba(0,0,0,0.4)', border: `1px solid ${PO_FAINT}`, fontSize: 9, color: PO_DIM, letterSpacing: 1, display: 'flex', justifyContent: 'space-between' }}>
        <span>FORK CHANCE</span><span style={{ color: PO_GREEN }}>40% → 50%</span>
      </div>

      {/* Synergy hint */}
      <div style={{ marginTop: 8, fontSize: 9, letterSpacing: 1, color: PO_GREEN, lineHeight: 1.5 }}>
        ⚡ SPLIT 6 → CHAIN REACTION <span style={{ color: PO_AMBER }}>(2 SHARDS AWAY)</span>
      </div>

      <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 10, letterSpacing: 4, color: PO_DIM }}>
        [ {hotkey} ]
      </div>
    </div>
  );
}

// ---- BOSS INTRO ----
function PO_Boss({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.5} paletteShift={4} hideEnemies={true} showPlayer={false} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 60%, rgba(255,91,110,0.15), transparent 55%)' }} />

      {/* Boss silhouette - giant centered shape */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 460, height: 460 }}>
        <svg width="460" height="460" viewBox="0 0 460 460">
          <defs>
            <radialGradient id="boss-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,91,110,0.5)" />
              <stop offset="100%" stopColor="rgba(255,91,110,0)" />
            </radialGradient>
          </defs>
          <circle cx="230" cy="230" r="220" fill="url(#boss-glow)" />
          {/* outer rotating shields */}
          <g style={{ transformOrigin: '230px 230px', animation: 'orbit-spin 14s linear infinite' }}>
            {[0, 60, 120, 180, 240, 300].map(d => (
              <g key={d} transform={`rotate(${d} 230 230)`}>
                <path d="M 230 60 L 254 86 L 254 130 L 206 130 L 206 86 Z" fill="rgba(255,91,110,0.08)" stroke="#ff5b6e" strokeWidth="1.5" />
              </g>
            ))}
          </g>
          {/* core */}
          <circle cx="230" cy="230" r="68" fill="rgba(20,8,12,0.95)" stroke="#ff5b6e" strokeWidth="2" />
          <circle cx="230" cy="230" r="40" fill="none" stroke="#ff5b6e" strokeWidth="1" strokeDasharray="3 5" />
          <polygon points="230,200 252,230 230,260 208,230" fill="#ff5b6e" />
        </svg>
      </div>

      {/* Boss banner */}
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', fontFamily: '"JetBrains Mono", monospace' }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: PO_DANGER, animation: 'blink 0.8s infinite' }}>// HOSTILE SIGNATURE DETECTED</div>
        <div style={{ fontSize: 80, fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 300, letterSpacing: 18, color: '#fff', marginTop: 6, textShadow: '0 0 32px rgba(255,91,110,0.5)' }}>SENTINEL</div>
        <div style={{ fontSize: 10, letterSpacing: 4, color: PO_DIM, marginTop: 2 }}>BOSS · TIER I · 14,800 HP</div>
      </div>

      {/* Bottom: HP bar + intent */}
      <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', width: '60%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 3, color: PO_DIM, marginBottom: 6 }}>
          <span style={{ color: PO_DANGER }}>● PRISM SENTINEL</span>
          <span>14,800 / 14,800</span>
        </div>
        <div style={{ height: 6, background: PO_FAINT, position: 'relative', clipPath: 'polygon(0 0, 100% 0, calc(100% - 6px) 100%, 6px 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${PO_DANGER}, ${PO_AMBER}, #fff4c7)`, boxShadow: `0 0 18px ${PO_DANGER}` }} />
        </div>
        {/* Phase pips */}
        <div style={{ display: 'flex', gap: 12, marginTop: 14, fontSize: 9, letterSpacing: 2, color: PO_DIM }}>
          <span style={{ color: PO_AMBER }}>▮ PHASE 1 · ORBITING SHIELDS</span>
          <span style={{ opacity: 0.4 }}>▯ PHASE 2 · LANCE BURST</span>
          <span style={{ opacity: 0.4 }}>▯ PHASE 3 · ENRAGE</span>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', border: `1px solid ${PO_FAINT}`, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: PO_DIM, letterSpacing: 1 }}>
          <span style={{ color: PO_AMBER }}>// ADVISORY:</span> shields absorb beams from a single angle. <span style={{ color: PO_INK }}>Strafe orbit</span> to expose the core.
        </div>
      </div>

      <Scanlines opacity={0.1} gap={3} />
      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- SYNERGY PROC moment ----
function PO_Synergy({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.4} paletteShift={5} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(255,217,107,0.18), transparent 50%)', mixBlendMode: 'screen' }} />

      {/* Concentric rings emanating from player */}
      <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%, -50%)', width: 200, height: 200 }}>
        {[0, 0.4, 0.8].map(delay => (
          <div key={delay} style={{
            position: 'absolute', inset: 0,
            border: `2px solid ${PO_LEGEND}`,
            borderRadius: '50%',
            animation: `flare 2s ease-out ${delay}s infinite`,
          }} />
        ))}
      </div>

      {/* Big banner */}
      <div style={{ position: 'absolute', left: '50%', top: '24%', transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 11, letterSpacing: 8, color: PO_LEGEND, fontFamily: '"JetBrains Mono", monospace' }}>// SYNERGY UNLOCKED</div>
        <div style={{ fontSize: 96, fontWeight: 300, letterSpacing: 12, color: '#fff', textShadow: `0 0 40px ${PO_LEGEND}, 0 0 80px ${PO_LEGEND}88`, marginTop: 4 }}>CHAIN REACTION</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: 3, color: PO_DIM }}>
          <span style={{ color: SHARDS[0].color }}>SPLIT</span>
          <span>+</span>
          <span style={{ color: SHARDS[8].color }}>CASCADE</span>
          <span>=</span>
          <span style={{ color: PO_LEGEND }}>KILLS FORK INTO BEAM CHAINS</span>
        </div>
      </div>

      {/* Active synergies HUD bottom */}
      <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ ...poStyles.pill(PO_LEGEND), fontSize: 11, padding: '5px 12px', boxShadow: `0 0 18px ${PO_LEGEND}66` }}>⚡ CHAIN REACTION · NEW</div>
        <div style={poStyles.pill(PO_LEGEND)}>⚡ BLIZZARD</div>
        <div style={poStyles.pill(PO_LEGEND)}>⚡ FROZEN ORBIT</div>
      </div>

      <Scanlines opacity={0.08} />
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

// ---- WAVE CLEAR ----
function PO_WaveClear({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.3} paletteShift={6} hideEnemies={true} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(125,255,176,0.12), transparent 60%)' }} />

      <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 10, letterSpacing: 8, color: PO_GREEN, fontFamily: '"JetBrains Mono", monospace' }}>// SECTOR CLEARED</div>
        <div style={{ fontSize: 110, fontWeight: 200, letterSpacing: 14, color: '#fff', marginTop: 6, textShadow: `0 0 30px ${PO_GREEN}66` }}>WAVE 12</div>
        <div style={{ fontSize: 12, letterSpacing: 4, color: PO_DIM, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>BREATHER · 03 SEC</div>
        <div style={{ marginTop: 26, display: 'flex', gap: 30, justifyContent: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: 3, color: PO_DIM }}>
          <span><span style={{ color: PO_GREEN }}>+58</span> KILLS</span>
          <span><span style={{ color: PO_GREEN }}>+12</span> RADIANCE</span>
          <span><span style={{ color: PO_GREEN }}>+1</span> SHARD</span>
        </div>
      </div>

      <Scanlines opacity={0.08} />
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

// ---- DEATH / VICTORY ----
function PO_Death({ width = 1280, height = 720, victory = false }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, background: victory
        ? 'radial-gradient(circle at 50% 50%, rgba(125,255,176,0.18), transparent 65%)'
        : 'radial-gradient(circle at 50% 50%, rgba(255,91,110,0.15), transparent 65%)' }} />

      <POCorners inset={24} color={victory ? PO_GREEN : PO_DANGER} />

      <div style={{ position: 'absolute', top: 36, left: 36, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: 3, color: PO_DIM }}>
        // RUN.LOG · {victory ? 'VICTORY' : 'TERMINATED'} · 04:51:22
      </div>

      <div style={{ position: 'absolute', left: '50%', top: 110, transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque", sans-serif' }}>
        <div style={{ fontSize: 110, fontWeight: 300, letterSpacing: 14, color: victory ? PO_GREEN : PO_DANGER, textShadow: `0 0 36px ${victory ? PO_GREEN : PO_DANGER}88` }}>{victory ? 'VICTORY' : 'SHATTERED'}</div>
        <div style={{ fontSize: 10, letterSpacing: 6, color: PO_DIM, fontFamily: '"JetBrains Mono", monospace' }}>{victory ? 'VOID PRISM SLAIN · 15:00 SURVIVED' : 'KILLED BY VOID SHOCKWAVE @ 13:42'}</div>
      </div>

      {/* Stat readout in 3 columns */}
      <div style={{ position: 'absolute', left: '50%', top: 280, transform: 'translateX(-50%)', display: 'flex', gap: 32, fontFamily: '"JetBrains Mono", monospace' }}>
        {[
          { label: 'SCORE', value: '5,118', accent: '#fff' },
          { label: 'PEAK RANK', value: '24', accent: PO_INK },
          { label: 'KILLS', value: '742', accent: PO_INK },
          { label: 'BOSSES', value: '3 / 3', accent: victory ? PO_GREEN : PO_INK },
          { label: 'GEMS', value: '218', accent: PO_INK },
          { label: 'DMG TAKEN', value: '482', accent: PO_DANGER },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: PO_DIM }}>{s.label}</div>
            <div style={{ fontSize: 26, color: s.accent, fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 400, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Build summary - shard ladder */}
      <div style={{ position: 'absolute', left: 80, top: 410, right: 80 }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: PO_DIM, fontFamily: '"JetBrains Mono", monospace', marginBottom: 10 }}>// BUILD COMPOSITION</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { idx: 0, lv: 6 }, { idx: 2, lv: 6 }, { idx: 8, lv: 5 }, { idx: 11, lv: 4 },
            { idx: 7, lv: 3 }, { idx: 12, lv: 3 }, { idx: 14, lv: 2 }, { idx: 18, lv: 2 },
          ].map(({ idx, lv }) => {
            const s = SHARDS[idx];
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${s.color}55`, background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ width: 14, height: 16, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)', background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#fff', fontFamily: '"JetBrains Mono", monospace' }}>{s.name}</span>
                <span style={{ fontSize: 9, color: s.color, fontWeight: 600 }}>L{lv}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, letterSpacing: 2, fontFamily: '"JetBrains Mono", monospace' }}>
          <span style={{ ...poStyles.pill(PO_LEGEND) }}>★ KALEIDOSCOPE</span>
          <span style={poStyles.pill(PO_LEGEND)}>⚡ CHAIN REACTION</span>
          <span style={poStyles.pill(PO_LEGEND)}>⚡ BLIZZARD</span>
          <span style={poStyles.pill(PO_LEGEND)}>⚡ FROZEN ORBIT</span>
        </div>
      </div>

      {/* Best run sidebar */}
      <div style={{ position: 'absolute', right: 40, bottom: 100, width: 240, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: 2, color: PO_DIM }}>
        <div style={{ color: victory ? PO_LEGEND : PO_AMBER, letterSpacing: 4, marginBottom: 6 }}>// {victory ? 'NEW BEST' : 'LOCAL BEST'}</div>
        <div style={{ color: '#fff' }}>1. 5,118 · 15:00 · VICTORY</div>
        <div>2. 3,820 · 13:42 · DEATH</div>
        <div>3. 2,841 · 11:18 · DEATH</div>
        <div>4. 2,104 · 09:55 · DEATH</div>
      </div>

      {/* CTAs */}
      <div style={{ position: 'absolute', left: 40, bottom: 40, display: 'flex', gap: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: 4 }}>
        <div style={{ padding: '12px 28px', border: `1px solid ${PO_INK}`, background: 'rgba(168,244,255,0.05)', color: PO_INK, boxShadow: `0 0 18px rgba(168,244,255,0.2)` }}>▶ AGAIN <span style={{ color: PO_DIM, marginLeft: 12 }}>[SPACE]</span></div>
        <div style={{ padding: '12px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>↩ MENU <span style={{ marginLeft: 12, opacity: 0.6 }}>[ESC]</span></div>
        <div style={{ padding: '12px 28px', border: `1px solid ${PO_FAINT}`, color: PO_DIM }}>📋 SHARE LOG <span style={{ marginLeft: 12, opacity: 0.6 }}>[S]</span></div>
      </div>

      <Scanlines opacity={0.1} />
      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- PAUSE ----
function PO_Pause({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={PO_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.8} paletteShift={7} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,3,8,0.7)', backdropFilter: 'blur(8px)' }} />

      <POCorners inset={24} color={PO_DIM} />

      <div style={{ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 8, color: PO_DIM, fontFamily: '"JetBrains Mono", monospace' }}>// SIMULATION SUSPENDED</div>
        <div style={{ fontSize: 90, letterSpacing: 14, color: '#fff', fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 200, marginTop: 6 }}>PAUSED</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '58%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: 4 }}>
        {[
          { label: '▶ RESUME', accent: PO_INK, hint: '[ESC]', active: true },
          { label: '🔊 SOUND', accent: PO_DIM, hint: 'ON', active: false },
          { label: '⚙ CALIBRATE', accent: PO_DIM, hint: '', active: false },
          { label: '↩ ABANDON RUN', accent: PO_DANGER, hint: '', active: false },
        ].map((b, i) => (
          <div key={i} style={{
            width: 320,
            padding: '14px 18px',
            border: `1px solid ${b.active ? b.accent : PO_FAINT}`,
            background: b.active ? 'rgba(168,244,255,0.06)' : 'transparent',
            color: b.accent,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: b.active ? `0 0 18px rgba(168,244,255,0.2)` : 'none',
          }}>
            <span>{b.label}</span>
            <span style={{ fontSize: 10, color: PO_DIM }}>{b.hint}</span>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: 3, color: PO_DIM }}>
        09:17 · RANK 14 · 312 KILLS · WAVE 14
      </div>

      <Scanlines opacity={0.1} />
      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

Object.assign(window, {
  PO_Title, PO_HUD, PO_RankUp, PO_Boss, PO_Synergy, PO_WaveClear, PO_Death, PO_Pause,
});
