// Direction 3: HDR PURE
// Hyperminimal — type as light, near-zero chrome. Returnal/Tetris Effect.

const HP_BG = '#000';
const HP_INK = '#fff';
const HP_DIM = 'rgba(255,255,255,0.5)';
const HP_FAINT = 'rgba(255,255,255,0.15)';

// ---- TITLE ----
function HP_Title({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.25} hideEnemies showPlayer={false} paletteShift={20} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(127,211,255,0.18), transparent 60%)' }} />

      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 200, fontSize: 320, lineHeight: 1, letterSpacing: -10, color: '#fff', textShadow: '0 0 60px rgba(127,211,255,0.6), 0 0 120px rgba(255,255,255,0.3)' }}>prism</div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 14, color: HP_DIM, marginTop: 20 }}>HOLD ANY KEY</div>
      </div>

      <div style={{ position: 'absolute', top: 30, left: 30, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 2, color: HP_FAINT }}>v0.9.4</div>
      <div style={{ position: 'absolute', bottom: 30, right: 30, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 2, color: HP_FAINT, textAlign: 'right' }}>BEST 5,118 · 15:00</div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

// ---- HUD ----
function HP_HUD({ width = 1280, height = 720 }) {
  const activeShards = [0, 8, 11, 7, 14, 5, 12];
  const shardLevels = { 0: 4, 8: 3, 11: 5, 7: 2, 14: 6, 5: 3, 12: 1 };
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.1} paletteShift={21} />

      {/* Top: just a thin timer */}
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontSize: 32, fontWeight: 200, letterSpacing: 6, color: '#fff', fontFeatureSettings: '"tnum"' }}>09:17</div>
        <div style={{ width: 240, height: 1, marginTop: 8, background: HP_FAINT, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: '62%', height: 1, background: '#fff', boxShadow: '0 0 8px #fff' }} />
        </div>
        <div style={{ fontSize: 9, letterSpacing: 4, color: HP_DIM, marginTop: 6, fontFamily: '"JetBrains Mono",monospace' }}>WAVE 14</div>
      </div>

      {/* Top right: rank only */}
      <div style={{ position: 'absolute', top: 26, right: 30, textAlign: 'right' }}>
        <div style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontSize: 64, fontWeight: 200, color: '#fff', lineHeight: 1, textShadow: '0 0 18px rgba(255,255,255,0.5)' }}>14</div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 3, color: HP_DIM }}>RANK · 312</div>
      </div>

      {/* HP as a thin ring around the player */}
      <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%,-50%)' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke={HP_FAINT} strokeWidth="2" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="#fff" strokeWidth="2"
            strokeDasharray="314" strokeDashoffset="125"
            transform="rotate(-90 60 60)"
            style={{ filter: 'drop-shadow(0 0 6px #fff)' }} />
        </svg>
      </div>

      {/* Synergy chips - top right area below rank */}
      <div style={{ position: 'absolute', top: 130, right: 30, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {['CHAIN REACTION', 'BLIZZARD'].map(s => (
          <div key={s} style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 3, color: '#ffd740', textShadow: '0 0 8px rgba(255,215,64,0.6)' }}>⚡ {s}</div>
        ))}
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 3, color: HP_FAINT }}>○ FROZEN ORBIT — 1</div>
      </div>

      {/* Bottom XP */}
      <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', width: '50%' }}>
        <div style={{ height: 1, background: HP_FAINT, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: '60%', background: '#fff', boxShadow: '0 0 14px #fff, 0 0 28px rgba(255,255,255,0.4)' }} />
        </div>
      </div>

      {/* Shard tray as tiny dots */}
      <div style={{ position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
        {activeShards.map(idx => {
          const s = SHARDS[idx]; const lv = shardLevels[idx];
          return (
            <div key={idx} style={{ width: 8, height: 10, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)', background: s.color, boxShadow: `0 0 ${4+lv*2}px ${s.color}`, opacity: 0.4 + lv*0.1 }} />
          );
        })}
      </div>

      {/* Damage popups */}
      <div style={{ position: 'absolute', left: '46%', top: '38%', fontFamily: '"Bricolage Grotesque",sans-serif', fontSize: 28, fontWeight: 300, color: '#fff', textShadow: '0 0 14px #fff', animation: 'drift-up 1.4s ease-out' }}>137</div>

      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

// ---- RANK-UP ----
function HP_RankUp({ width = 1280, height = 720 }) {
  const offers = [{ kind: 'shard', idx: 8 }, { kind: 'evolution', idx: 2 }, { kind: 'shard', idx: 11 }];
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.4} paletteShift={22} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)' }} />

      <div style={{ position: 'absolute', top: 60, left: 0, right: 0, textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 8, color: HP_DIM }}>RANK 14 → 15</div>
        <div style={{ fontWeight: 200, fontSize: 96, lineHeight: 1, letterSpacing: 2, color: '#fff', textShadow: '0 0 30px rgba(255,255,255,0.4)', marginTop: 8 }}>choose.</div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -50%)', display: 'flex', gap: 30 }}>
        {offers.map((o, i) => <HP_OfferCard key={i} offer={o} hotkey={i+1} />)}
      </div>

      <div style={{ position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 32, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 4, color: HP_DIM }}>
        <span>↻ REROLL [R] ×2</span>
        <span>⊘ SKIP [X] +6 HP</span>
      </div>

      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function HP_OfferCard({ offer, hotkey }) {
  if (offer.kind === 'evolution') {
    const e = EVOLUTIONS[offer.idx];
    return (
      <div style={{ width: 260, height: 360, position: 'relative', textAlign: 'center', borderTop: `1px solid ${e.color}`, borderBottom: `1px solid ${e.color}`, padding: '24px 16px' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 4, color: e.color }}>EVOLUTION</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
          <div style={{ width: 96, height: 110, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)', background: `radial-gradient(${e.color}, ${e.color}33)`, boxShadow: `0 0 40px ${e.color}, inset 0 0 30px rgba(255,255,255,0.3)`, animation: 'pulse-strong 2.4s ease-in-out infinite' }} />
        </div>
        <div style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 300, fontSize: 32, color: '#fff', marginTop: 18, letterSpacing: 1 }}>{e.name}</div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 3, color: e.color, marginTop: 6 }}>{e.recipe}</div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: HP_DIM, marginTop: 14, lineHeight: 1.5 }}>{e.desc}</div>
        <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: '#fff' }}>[ {hotkey} ]</div>
      </div>
    );
  }
  const s = SHARDS[offer.idx];
  const lv = 5;
  const rarityColor = { common: HP_DIM, rare: '#7fd3ff', legendary: '#ffd740' }[s.rarity];
  return (
    <div style={{ width: 240, height: 360, position: 'relative', textAlign: 'center', padding: '24px 16px', borderTop: `1px solid ${rarityColor}`, borderBottom: `1px solid ${rarityColor}` }}>
      <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 4, color: rarityColor, textTransform: 'uppercase' }}>{s.rarity}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
        <div style={{ width: 84, height: 96, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)', background: s.color, boxShadow: `0 0 30px ${s.color}, inset 0 0 20px rgba(255,255,255,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShardGlyph glyph={s.glyph} size={40} color="#0a0a14" stroke={2} />
        </div>
      </div>
      <div style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 300, fontSize: 30, color: '#fff', marginTop: 18, letterSpacing: 2 }}>{s.name}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
        {[1,2,3,4,5,6].map(n => (
          <div key={n} style={{ width: 12, height: 2, background: n <= lv ? s.color : (n === lv+1 ? '#fff' : HP_FAINT), boxShadow: n === lv+1 ? '0 0 6px #fff' : 'none' }} />
        ))}
      </div>
      <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: HP_DIM, marginTop: 14, lineHeight: 1.5 }}>{s.desc}</div>
      <div style={{ marginTop: 12, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, color: '#7dffb0', letterSpacing: 1 }}>+10% FORK · ⚡ CHAIN REACTION SOON</div>
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: '#fff' }}>[ {hotkey} ]</div>
    </div>
  );
}

// ---- BOSS / SYNERGY / WAVE / DEATH / PAUSE (concise versions) ----
function HP_Boss({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.5} paletteShift={23} hideEnemies showPlayer={false} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(255,91,110,0.18), transparent 55%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: 300, height: 300 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, #ff5b6e 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 100, height: 100, borderRadius: '50%', background: '#000', border: '2px solid #ff5b6e', boxShadow: '0 0 60px #ff5b6e' }} />
      </div>
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 8, color: '#ff5b6e', animation: 'blink 1s infinite' }}>HOSTILE FRACTURE</div>
        <div style={{ fontWeight: 200, fontSize: 130, lineHeight: 1, letterSpacing: 8, color: '#fff', marginTop: 8, textShadow: '0 0 40px rgba(255,91,110,0.5)' }}>SENTINEL</div>
      </div>
      <div style={{ position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)', width: '60%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: HP_DIM, marginBottom: 6 }}>
          <span style={{ color: '#ff5b6e' }}>● PRISM SENTINEL · I</span><span>14,800</span>
        </div>
        <div style={{ height: 2, background: HP_FAINT, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: '#ff5b6e', boxShadow: '0 0 16px #ff5b6e' }} />
        </div>
        <div style={{ marginTop: 14, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 2, color: HP_DIM, textAlign: 'center' }}>shields absorb beams · strafe to expose core</div>
      </div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function HP_Synergy({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.4} paletteShift={24} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(255,215,64,0.3), transparent 50%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, letterSpacing: 10, color: '#ffd740', textShadow: '0 0 20px #ffd740' }}>⚡ SYNERGY</div>
        <div style={{ fontWeight: 200, fontSize: 150, lineHeight: 0.9, letterSpacing: 4, color: '#fff', marginTop: 12, textShadow: '0 0 60px rgba(255,215,64,0.7), 0 0 120px rgba(255,255,255,0.4)' }}>chain<br />reaction</div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 22, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 3 }}>
          <span style={{ color: SHARDS[0].color }}>SPLIT</span>
          <span style={{ color: HP_DIM }}>+</span>
          <span style={{ color: SHARDS[8].color }}>CASCADE</span>
        </div>
      </div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function HP_WaveClear({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.3} paletteShift={25} hideEnemies />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 8, color: '#7dffb0' }}>WAVE COMPLETE</div>
        <div style={{ fontWeight: 200, fontSize: 240, lineHeight: 1, color: '#fff', textShadow: '0 0 50px rgba(125,255,176,0.5)' }}>12</div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: HP_DIM, marginTop: 4 }}>+58 KILLS · +12 RADIANCE · +1 SHARD</div>
      </div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function HP_Death({ width = 1280, height = 720, victory = false }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, background: victory ? 'radial-gradient(circle at 50% 30%, rgba(125,255,176,0.18), transparent 65%)' : 'radial-gradient(circle at 50% 30%, rgba(255,91,110,0.18), transparent 65%)' }} />
      <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 8, color: HP_DIM }}>{victory ? 'RUN COMPLETE' : 'RUN ENDED'}</div>
        <div style={{ fontWeight: 200, fontSize: 180, lineHeight: 1, letterSpacing: 8, marginTop: 8, color: victory ? '#7dffb0' : '#ff5b6e', textShadow: victory ? '0 0 50px rgba(125,255,176,0.5)' : '0 0 50px rgba(255,91,110,0.5)' }}>
          {victory ? 'victory' : 'shattered'}
        </div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: 360, transform: 'translateX(-50%)', display: 'flex', gap: 50, fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        {[{l:'SCORE',v:'5,118'},{l:'TIME',v:'15:00'},{l:'PEAK',v:'24'},{l:'KILLS',v:'742'},{l:'BOSSES',v:'3/3'}].map(s=>(
          <div key={s.l} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, letterSpacing:3, color: HP_DIM }}>{s.l}</div>
            <div style={{ fontSize:42, fontWeight:200, color:'#fff', marginTop:4 }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 80, top: 500, right: 80, textAlign: 'center' }}>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: HP_DIM, marginBottom: 12 }}>BUILD</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[{idx:0,lv:6},{idx:2,lv:6},{idx:8,lv:5},{idx:11,lv:4},{idx:7,lv:3},{idx:14,lv:2}].map(({idx,lv}) => {
            const s = SHARDS[idx];
            return (
              <div key={idx} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 2, color: '#fff' }}>
                <div style={{ width:10, height:12, clipPath:'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', background:s.color, boxShadow:`0 0 6px ${s.color}` }} />
                {s.name} <span style={{ color: s.color }}>{lv}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: '#ffd740' }}>★ KALEIDOSCOPE   ⚡ CHAIN REACTION   ⚡ BLIZZARD</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', bottom: 40, transform: 'translateX(-50%)', display: 'flex', gap: 32, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: '#fff' }}>
        <span>▶ AGAIN [SPACE]</span><span style={{ color: HP_DIM }}>↩ MENU</span>
      </div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

function HP_Pause({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={HP_BG}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.6} paletteShift={26} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', textAlign: 'center', fontFamily: '"Bricolage Grotesque",sans-serif' }}>
        <div style={{ fontWeight: 200, fontSize: 140, lineHeight: 1, color: '#fff', textShadow: '0 0 30px rgba(255,255,255,0.3)' }}>paused</div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: '70%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', fontFamily: '"JetBrains Mono",monospace', fontSize: 13, letterSpacing: 6, color: '#fff' }}>
        <div>▶ RESUME [ESC]</div>
        <div style={{ color: HP_DIM }}>SOUND ON</div>
        <div style={{ color: HP_DIM }}>CALIBRATE</div>
        <div style={{ color: '#ff5b6e', opacity: 0.7 }}>ABANDON RUN</div>
      </div>
      <GrainOverlay opacity={0.04} />
    </Frame>
  );
}

Object.assign(window, { HP_Title, HP_HUD, HP_RankUp, HP_Boss, HP_Synergy, HP_WaveClear, HP_Death, HP_Pause });
