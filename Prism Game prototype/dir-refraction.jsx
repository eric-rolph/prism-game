// Direction 2: REFRACTION
// Crystalline glass — facets, dispersion, prismatic gradients. Type as light
// passing through a prism. Dense color, soft edges, thick glass surfaces.

const RF_BG = '#070512';
const RF_INK = '#f6f0ff';
const RF_DIM = 'rgba(246,240,255,0.5)';
const RF_FAINT = 'rgba(246,240,255,0.18)';
const RF_GRAD = 'linear-gradient(135deg, #ff6f91 0%, #ffb347 25%, #ffe66d 45%, #66ddff 65%, #c9a3ff 85%, #ff6f91 100%)';
const RF_GRAD_SOFT = 'linear-gradient(135deg, rgba(255,111,145,0.5), rgba(255,179,71,0.5), rgba(102,221,255,0.5), rgba(201,163,255,0.5))';

function RFGlass({ children, style = {}, blur = 18, tint = 'rgba(255,255,255,0.05)' }) {
  return (
    <div style={{
      background: tint,
      backdropFilter: `blur(${blur}px) saturate(160%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(160%)`,
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 40px rgba(0,0,0,0.35)',
      ...style,
    }}>{children}</div>
  );
}

function RFAuroraBg({ paletteShift = 0 }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#070512' }} />
      <div style={{ position: 'absolute', left: '-10%', top: '-20%', width: '70%', height: '80%', background: 'radial-gradient(circle, #ff6f91, transparent 60%)', filter: 'blur(80px)', opacity: 0.7 }} />
      <div style={{ position: 'absolute', right: '-10%', top: '10%', width: '60%', height: '70%', background: 'radial-gradient(circle, #66ddff, transparent 60%)', filter: 'blur(90px)', opacity: 0.6 }} />
      <div style={{ position: 'absolute', left: '20%', bottom: '-20%', width: '70%', height: '70%', background: 'radial-gradient(circle, #c9a3ff, transparent 60%)', filter: 'blur(80px)', opacity: 0.55 }} />
      <div style={{ position: 'absolute', left: '40%', top: '30%', width: '40%', height: '50%', background: 'radial-gradient(circle, #ffe66d, transparent 60%)', filter: 'blur(100px)', opacity: 0.4 }} />
    </div>
  );
}

// Big crystal hexagon with facets
function RFCrystal({ size = 200, color = '#fff', children }) {
  return (
    <div style={{
      width: size, height: size * 1.15, position: 'relative',
      filter: `drop-shadow(0 0 30px ${color}88)`,
    }}>
      <svg width={size} height={size * 1.15} viewBox={`0 0 ${size} ${size * 1.15}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={`rf-c-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="50%" stopColor={color} />
            <stop offset="100%" stopColor="rgba(255,255,255,0.4)" />
          </linearGradient>
        </defs>
        <polygon points={`${size*0.5},0 ${size},${size*0.3} ${size},${size*0.85} ${size*0.5},${size*1.15} 0,${size*0.85} 0,${size*0.3}`}
          fill={`url(#rf-c-${color.replace(/[^a-z0-9]/gi,'')})`} stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        <polygon points={`${size*0.5},0 ${size*0.5},${size*0.575} ${size},${size*0.3}`} fill="rgba(255,255,255,0.18)" />
        <polygon points={`${size*0.5},0 0,${size*0.3} ${size*0.5},${size*0.575}`} fill="rgba(255,255,255,0.32)" />
        <polygon points={`${size*0.5},${size*0.575} ${size},${size*0.3} ${size},${size*0.85} ${size*0.5},${size*1.15}`} fill="rgba(0,0,0,0.18)" />
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}

// ---- TITLE ----
function RF_Title({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <RFAuroraBg />
      <BattleScene width={width} height={height} intensity={0.3} hideEnemies showPlayer={false} paletteShift={10} />

      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
        <RFCrystal size={260} color="#c9a3ff" />
      </div>

      <div style={{ position: 'absolute', left: 40, top: 40, fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: 4, color: RF_DIM }}>
        PRISM · v0.9.4
      </div>
      <div style={{ position: 'absolute', right: 40, top: 40, fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: 4, color: RF_DIM, textAlign: 'right' }}>
        BEST · 5,118<br />15:00 / VICTORY
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: '70%', textAlign: 'center', fontFamily: '"Instrument Serif", serif' }}>
        <div style={{
          fontSize: 220, lineHeight: 0.9, fontWeight: 400, letterSpacing: -8,
          background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontStyle: 'italic',
          textShadow: '0 0 40px rgba(255,255,255,0.2)',
        }}>Prism</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"DM Mono", monospace', fontSize: 12, letterSpacing: 6, color: RF_INK, mixBlendMode: 'difference' }}>
        AUTO-FIRING LIGHT — REFRACTED THROUGH SHARDS
      </div>

      <div style={{ position: 'absolute', left: '50%', bottom: 60, transform: 'translateX(-50%)', display: 'flex', gap: 14 }}>
        <RFGlass tint="rgba(255,255,255,0.18)" style={{ padding: '14px 32px', borderRadius: 999, fontFamily: '"Bricolage Grotesque", sans-serif', fontSize: 14, letterSpacing: 4, color: '#fff' }}>BEGIN ▸</RFGlass>
        <RFGlass style={{ padding: '14px 32px', borderRadius: 999, fontFamily: '"Bricolage Grotesque", sans-serif', fontSize: 14, letterSpacing: 4, color: RF_DIM }}>ARCHIVES</RFGlass>
      </div>

      <GrainOverlay opacity={0.06} />
    </Frame>
  );
}

// ---- HUD ----
function RF_HUD({ width = 1280, height = 720 }) {
  const activeShards = [0, 8, 11, 7, 14, 5, 12];
  const shardLevels = { 0: 4, 8: 3, 11: 5, 7: 2, 14: 6, 5: 3, 12: 1 };
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.1} paletteShift={11} />

      {/* HP arc top-left */}
      <div style={{ position: 'absolute', top: 26, left: 26 }}>
        <svg width="180" height="120" viewBox="0 0 180 120">
          <defs>
            <linearGradient id="rf-hp" x1="0" x2="1">
              <stop offset="0" stopColor="#ff6f91" />
              <stop offset="0.5" stopColor="#ffd96b" />
              <stop offset="1" stopColor="#7dffb0" />
            </linearGradient>
          </defs>
          <path d="M 20 90 A 70 70 0 0 1 160 90" stroke="rgba(255,255,255,0.15)" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 20 90 A 70 70 0 0 1 124 38" stroke="url(#rf-hp)" strokeWidth="6" fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px #7dffb0)' }} />
          <text x="90" y="80" textAnchor="middle" fill="#fff" fontFamily="Bricolage Grotesque" fontSize="34" fontWeight="500">78</text>
          <text x="90" y="100" textAnchor="middle" fill={RF_DIM} fontFamily="DM Mono" fontSize="10" letterSpacing="2">/ 130 HP</text>
        </svg>
        <RFGlass style={{ marginTop: 6, padding: '6px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 2, color: RF_INK, fontFamily: '"DM Mono", monospace' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c9a3ff', boxShadow: '0 0 8px #c9a3ff' }} />
          DASH READY
        </RFGlass>
      </div>

      {/* Top center timer */}
      <RFGlass style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 28px', borderRadius: 999, textAlign: 'center', fontFamily: '"DM Mono", monospace' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 10, letterSpacing: 3, color: RF_DIM }}>
          <span>WAVE 14</span><span style={{ color: '#ffb347' }}>● OVERDRIVE</span><span>BOSS · 0:43</span>
        </div>
        <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: 4, color: '#fff', fontFamily: '"Bricolage Grotesque", sans-serif', marginTop: 2 }}>09:17</div>
      </RFGlass>

      {/* Top right rank */}
      <RFGlass style={{ position: 'absolute', top: 26, right: 26, padding: '12px 18px', borderRadius: 14, textAlign: 'right', minWidth: 180 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: RF_DIM, fontFamily: '"DM Mono",monospace' }}>RANK</div>
        <div style={{ fontSize: 40, fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', color: '#fff', lineHeight: 1, background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>14</div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: RF_DIM, fontFamily: '"DM Mono",monospace' }}>312 KILLS · 2,184</div>
      </RFGlass>

      {/* Synergies bottom-right floating chips */}
      <div style={{ position: 'absolute', right: 26, top: 200, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {['CHAIN REACTION', 'BLIZZARD'].map((s, i) => (
          <RFGlass key={s} tint="rgba(255,217,107,0.14)" style={{ padding: '6px 12px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#ffd96b', borderColor: 'rgba(255,217,107,0.5)' }}>
            ⚡ {s}
          </RFGlass>
        ))}
        <RFGlass style={{ padding: '6px 12px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: RF_DIM }}>
          ○ FROZEN ORBIT — 1 MORE
        </RFGlass>
      </div>

      {/* XP gradient bar */}
      <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', width: '50%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 2, color: RF_DIM, marginBottom: 6, fontFamily: '"DM Mono",monospace' }}>
          <span>RADIANCE</span><span>248 / 410</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: '60%', background: RF_GRAD, borderRadius: 999, boxShadow: '0 0 16px rgba(255,255,255,0.4)' }} />
        </div>
      </div>

      {/* Shard tray bottom-left as gem cluster */}
      <RFGlass style={{ position: 'absolute', bottom: 26, left: 26, padding: '10px 14px', borderRadius: 16, display: 'flex', gap: 8 }}>
        {activeShards.map(idx => {
          const s = SHARDS[idx];
          const lv = shardLevels[idx];
          return (
            <div key={idx} style={{ position: 'relative', width: 36, height: 42 }}>
              <div style={{
                width: 32, height: 38,
                clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                background: `linear-gradient(160deg, #fff, ${s.color}, ${s.color})`,
                boxShadow: `0 0 10px ${s.color}, inset 0 0 10px rgba(255,255,255,0.4)`,
              }} />
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#fff', color: '#070512', fontFamily: '"DM Mono",monospace', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${s.color}` }}>{lv}</div>
            </div>
          );
        })}
      </RFGlass>

      {/* Damage popups */}
      <div style={{ position: 'absolute', left: '46%', top: '38%', fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 30, color: '#fff', animation: 'drift-up 1.4s ease-out' }}>137</div>
      <div style={{ position: 'absolute', left: '58%', top: '50%', fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 38, animation: 'drift-up 1.4s ease-out 0.4s', background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>482!</div>

      <GrainOverlay opacity={0.06} />
    </Frame>
  );
}

// ---- RANK-UP (radial picker) ----
function RF_RankUp({ width = 1280, height = 720 }) {
  const offers = [
    { kind: 'shard', idx: 8 },
    { kind: 'evolution', idx: 2 },
    { kind: 'shard', idx: 11 },
  ];
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <RFAuroraBg />
      <BattleScene width={width} height={height} intensity={0.4} paletteShift={12} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,5,18,0.55)', backdropFilter: 'blur(24px) saturate(160%)' }} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 50, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 6, color: RF_DIM }}>RANK 14 → 15</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 70, lineHeight: 1, marginTop: 8, background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Refract the light.
        </div>
      </div>

      {/* Cards */}
      <div style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -50%)', display: 'flex', gap: 24 }}>
        {offers.map((o, i) => <RF_OfferCard key={i} offer={o} hotkey={i+1} />)}
      </div>

      {/* Actions */}
      <div style={{ position: 'absolute', left: '50%', bottom: 50, transform: 'translateX(-50%)', display: 'flex', gap: 12 }}>
        <RFGlass style={{ padding: '12px 22px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 3, color: RF_INK }}>
          ↻ REROLL <span style={{ marginLeft: 8, color: RF_DIM }}>×2 · [R]</span>
        </RFGlass>
        <RFGlass style={{ padding: '12px 22px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 3, color: RF_INK }}>
          ⊘ SKIP <span style={{ marginLeft: 8, color: RF_DIM }}>+6 HP · [X]</span>
        </RFGlass>
      </div>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

function RF_OfferCard({ offer, hotkey }) {
  if (offer.kind === 'evolution') {
    const e = EVOLUTIONS[offer.idx];
    return (
      <RFGlass tint="rgba(255,181,71,0.12)" style={{
        width: 280, height: 400, padding: 22, borderRadius: 18, position: 'relative',
        borderColor: 'rgba(255,181,71,0.55)',
        boxShadow: `0 0 60px rgba(255,181,71,0.35), inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, letterSpacing: 4, color: e.color }}>EVOLUTION</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <RFCrystal size={140} color={e.color}>
            <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 60, color: '#fff', textShadow: `0 0 18px ${e.color}` }}>✦</div>
          </RFCrystal>
        </div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 32, color: '#fff', textAlign: 'center', marginTop: 6, lineHeight: 1 }}>{e.name}</div>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, letterSpacing: 3, color: e.color, textAlign: 'center', marginTop: 6 }}>{e.recipe}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: RF_DIM, textAlign: 'center', marginTop: 14, fontFamily: '"Bricolage Grotesque",sans-serif' }}>{e.desc}</div>
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 4, color: '#fff' }}>[ {hotkey} ]</div>
      </RFGlass>
    );
  }
  const s = SHARDS[offer.idx];
  const currentLv = 5;
  const rarityColor = { common: '#fff', rare: '#7fd3ff', legendary: '#ffd96b' }[s.rarity];
  return (
    <RFGlass tint={`${s.color}10`} style={{
      width: 250, height: 400, padding: 22, borderRadius: 18, position: 'relative',
      borderColor: `${rarityColor}88`,
      boxShadow: `0 0 32px ${rarityColor}33, inset 0 1px 0 rgba(255,255,255,0.25)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"DM Mono",monospace', fontSize: 9, letterSpacing: 3 }}>
        <span style={{ color: rarityColor, textTransform: 'uppercase' }}>{s.rarity}</span>
        <span style={{ color: RF_DIM }}>L{currentLv} → {currentLv + 1}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <RFCrystal size={120} color={s.color}>
          <ShardGlyph glyph={s.glyph} size={48} color="#fff" stroke={2} />
        </RFCrystal>
      </div>
      <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 30, color: '#fff', textAlign: 'center', marginTop: 8, lineHeight: 1 }}>{s.name}</div>

      {/* Level pips */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
        {[1,2,3,4,5,6].map(n => (
          <div key={n} style={{
            width: 18, height: 5, borderRadius: 999,
            background: n <= currentLv ? s.color : (n === currentLv + 1 ? '#fff' : RF_FAINT),
            boxShadow: n === currentLv + 1 ? `0 0 10px #fff` : `0 0 4px ${s.color}66`,
          }} />
        ))}
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5, color: RF_DIM, textAlign: 'center', marginTop: 12, fontFamily: '"Bricolage Grotesque",sans-serif' }}>{s.desc}</div>

      <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', fontSize: 10, fontFamily: '"DM Mono",monospace', display: 'flex', justifyContent: 'space-between', color: RF_DIM }}>
        <span>FORK</span><span style={{ color: '#7dffb0' }}>40 → 50%</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, fontFamily: '"DM Mono",monospace', color: '#7dffb0', letterSpacing: 1 }}>⚡ → CHAIN REACTION (2 LVL)</div>
      <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 4, color: '#fff' }}>[ {hotkey} ]</div>
    </RFGlass>
  );
}

// ---- BOSS ----
function RF_Boss({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <RFAuroraBg />
      <BattleScene width={width} height={height} intensity={0.6} paletteShift={13} hideEnemies />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(239,83,80,0.12), transparent 65%)' }} />

      {/* Crystal boss */}
      <div style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%, -50%)' }}>
        <RFCrystal size={340} color="#ef5350">
          <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 80, color: '#fff', textShadow: '0 0 30px #ef5350' }}>I</div>
        </RFCrystal>
      </div>

      {/* Title */}
      <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 8, color: '#ef5350', animation: 'blink 1.2s infinite' }}>HOSTILE FRACTURE</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 110, color: '#fff', marginTop: 6, lineHeight: 1, textShadow: '0 0 30px rgba(239,83,80,0.5)' }}>Sentinel</div>
      </div>

      {/* HP bar */}
      <RFGlass style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', width: '60%', padding: 16, borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: 3, color: RF_DIM, fontFamily: '"DM Mono",monospace', marginBottom: 8 }}>
          <span style={{ color: '#ef5350' }}>● PRISM SENTINEL · TIER I</span>
          <span>14,800 / 14,800</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #ef5350, #ffb347, #ffe66d)', borderRadius: 999, boxShadow: '0 0 14px #ef5350' }} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 14, fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: 2, color: RF_DIM }}>
          <span style={{ color: '#ffb347' }}>◆ PHASE 1 · ORBITING SHIELDS</span>
          <span style={{ opacity: 0.4 }}>◇ PHASE 2 · LANCE</span>
          <span style={{ opacity: 0.4 }}>◇ PHASE 3 · ENRAGE</span>
        </div>
      </RFGlass>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- SYNERGY ----
function RF_Synergy({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.4} paletteShift={14} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(255,217,107,0.25), transparent 55%)', mixBlendMode: 'screen' }} />

      {/* Light burst */}
      <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%,-50%)' }}>
        <svg width="600" height="600" viewBox="0 0 600 600">
          {Array.from({ length: 18 }).map((_, i) => {
            const a = (i * 20) * Math.PI / 180;
            const x = 300 + Math.cos(a) * 280;
            const y = 300 + Math.sin(a) * 280;
            return <line key={i} x1="300" y1="300" x2={x} y2={y} stroke="rgba(255,217,107,0.6)" strokeWidth="2" style={{ filter: 'blur(2px)' }} />;
          })}
          <circle cx="300" cy="300" r="60" fill="rgba(255,255,255,0.7)" style={{ filter: 'blur(20px)' }} />
        </svg>
      </div>

      {/* Banner */}
      <div style={{ position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, letterSpacing: 8, color: '#ffd96b', textShadow: '0 0 20px #ffd96b' }}>SYNERGY</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 130, lineHeight: 1, marginTop: 6, background: 'linear-gradient(135deg, #ffd96b, #ffb347, #ff6f91)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: '0 0 60px rgba(255,217,107,0.5)' }}>
          Chain Reaction
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 18, fontFamily: '"DM Mono",monospace', fontSize: 12, letterSpacing: 3 }}>
          <span style={{ color: SHARDS[0].color }}>◆ SPLIT</span>
          <span style={{ color: RF_DIM }}>+</span>
          <span style={{ color: SHARDS[8].color }}>◆ CASCADE</span>
          <span style={{ color: RF_DIM }}>=</span>
          <span style={{ color: '#fff' }}>kills fork into beam chains</span>
        </div>
      </div>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- WAVE CLEAR ----
function RF_WaveClear({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.3} paletteShift={15} hideEnemies />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(125,255,176,0.1), transparent 60%)' }} />

      <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 6, color: '#7dffb0' }}>WAVE COMPLETE</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 200, lineHeight: 1, marginTop: 6, background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>12</div>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, letterSpacing: 4, color: RF_DIM, marginTop: 6 }}>BREATHER · 3 SEC</div>
        <div style={{ marginTop: 28, display: 'flex', gap: 28, justifyContent: 'center', fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 3, color: RF_DIM }}>
          <span><span style={{ color: '#7dffb0' }}>+58</span> KILLS</span>
          <span><span style={{ color: '#7dffb0' }}>+12</span> RADIANCE</span>
          <span><span style={{ color: '#7dffb0' }}>+1</span> SHARD</span>
        </div>
      </div>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- DEATH / VICTORY ----
function RF_Death({ width = 1280, height = 720, victory = false }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <RFAuroraBg />
      <div style={{ position: 'absolute', inset: 0, background: victory
        ? 'radial-gradient(circle at 50% 30%, rgba(125,255,176,0.18), transparent 65%)'
        : 'radial-gradient(circle at 50% 30%, rgba(239,83,80,0.18), transparent 65%)' }} />

      <div style={{ position: 'absolute', top: 60, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 6, color: RF_DIM }}>RUN · {victory ? 'COMPLETE' : 'TERMINATED'}</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 150, lineHeight: 1, marginTop: 6, background: victory ? 'linear-gradient(135deg, #7dffb0, #66ddff, #c9a3ff)' : 'linear-gradient(135deg, #ef5350, #ffb347, #c9a3ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: victory ? '0 0 40px rgba(125,255,176,0.4)' : '0 0 40px rgba(239,83,80,0.4)' }}>
          {victory ? 'Refracted' : 'Shattered'}
        </div>
      </div>

      <RFGlass style={{ position: 'absolute', left: '50%', top: 320, transform: 'translateX(-50%)', padding: '22px 36px', borderRadius: 18, display: 'flex', gap: 36 }}>
        {[
          { l: 'SCORE', v: '5,118' }, { l: 'TIME', v: '15:00' }, { l: 'PEAK', v: '24' },
          { l: 'KILLS', v: '742' }, { l: 'BOSSES', v: '3 / 3' }, { l: 'GEMS', v: '218' },
        ].map(s => (
          <div key={s.l} style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, letterSpacing: 2, color: RF_DIM }}>{s.l}</div>
            <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 28, color: '#fff', marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </RFGlass>

      {/* Build */}
      <div style={{ position: 'absolute', left: 80, top: 470, right: 80 }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 3, color: RF_DIM, marginBottom: 10 }}>BUILD</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[{idx:0,lv:6},{idx:2,lv:6},{idx:8,lv:5},{idx:11,lv:4},{idx:7,lv:3},{idx:12,lv:3},{idx:14,lv:2}].map(({idx,lv}) => {
            const s = SHARDS[idx];
            return (
              <RFGlass key={idx} tint={`${s.color}18`} style={{ padding: '6px 10px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, borderColor: `${s.color}77` }}>
                <div style={{ width: 12, height: 14, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)', background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#fff' }}>{s.name}</span>
                <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, color: s.color, fontWeight: 700 }}>L{lv}</span>
              </RFGlass>
            );
          })}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <RFGlass tint="rgba(255,217,107,0.18)" style={{ padding: '5px 12px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#ffd96b', borderColor: 'rgba(255,217,107,0.6)' }}>★ KALEIDOSCOPE</RFGlass>
          <RFGlass tint="rgba(255,217,107,0.10)" style={{ padding: '5px 12px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#ffd96b' }}>⚡ CHAIN REACTION</RFGlass>
          <RFGlass tint="rgba(255,217,107,0.10)" style={{ padding: '5px 12px', borderRadius: 999, fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#ffd96b' }}>⚡ BLIZZARD</RFGlass>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 40, bottom: 40, display: 'flex', gap: 12 }}>
        <RFGlass tint="rgba(255,255,255,0.18)" style={{ padding: '12px 28px', borderRadius: 999, fontFamily: '"Bricolage Grotesque",sans-serif', fontSize: 14, letterSpacing: 4, color: '#fff' }}>
          AGAIN ▸
        </RFGlass>
        <RFGlass style={{ padding: '12px 28px', borderRadius: 999, fontFamily: '"Bricolage Grotesque",sans-serif', fontSize: 14, letterSpacing: 4, color: RF_DIM }}>
          MENU
        </RFGlass>
      </div>
      <div style={{ position: 'absolute', right: 40, bottom: 40, fontFamily: '"DM Mono",monospace', fontSize: 9, color: RF_DIM, letterSpacing: 2, textAlign: 'right' }}>
        <div style={{ color: victory ? '#ffd96b' : '#ffb347', letterSpacing: 4, marginBottom: 4 }}>{victory ? 'NEW BEST' : 'LOCAL BEST'}</div>
        <div style={{ color: '#fff' }}>1. 5,118 · 15:00 · VICTORY</div>
        <div>2. 3,820 · 13:42</div>
        <div>3. 2,841 · 11:18</div>
      </div>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

// ---- PAUSE ----
function RF_Pause({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={RF_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.8} paletteShift={16} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,5,18,0.5)', backdropFilter: 'blur(20px) saturate(150%)' }} />

      <div style={{ position: 'absolute', left: '50%', top: '32%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, letterSpacing: 8, color: RF_DIM }}>SUSPENDED</div>
        <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 130, lineHeight: 1, marginTop: 6, background: RF_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Paused</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {[
          { label: 'Resume', hint: 'ESC', active: true },
          { label: 'Sound · On', hint: 'M', active: false },
          { label: 'Calibrate', hint: '', active: false },
          { label: 'Abandon Run', hint: '', active: false, danger: true },
        ].map((b, i) => (
          <RFGlass key={i} tint={b.active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'} style={{ width: 320, padding: '14px 22px', borderRadius: 999, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: b.active ? 'rgba(255,255,255,0.6)' : (b.danger ? 'rgba(239,83,80,0.5)' : 'rgba(255,255,255,0.18)') }}>
            <span style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontSize: 16, letterSpacing: 2, color: b.danger ? '#ef5350' : '#fff' }}>{b.label}</span>
            <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, color: RF_DIM }}>{b.hint}</span>
          </RFGlass>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', fontFamily: '"DM Mono",monospace', fontSize: 10, letterSpacing: 3, color: RF_DIM }}>
        09:17 · RANK 14 · 312 KILLS
      </div>

      <GrainOverlay opacity={0.05} />
    </Frame>
  );
}

Object.assign(window, {
  RF_Title, RF_HUD, RF_RankUp, RF_Boss, RF_Synergy, RF_WaveClear, RF_Death, RF_Pause,
});
