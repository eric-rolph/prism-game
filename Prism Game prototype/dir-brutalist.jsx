// Direction 4: BRUTALIST ARCADE
// Loud, tactile, screen-print energy. Big slab type, hard borders, paper grain,
// arcade marquee colors. Maximalism with attitude — Splatoon × Killer7 × Returnal.

const BR_PAPER = '#f0e6d2';
const BR_INK = '#0a0a0a';
const BR_RED = '#ff2e3d';
const BR_BLUE = '#1d4eff';
const BR_YELLOW = '#ffd400';
const BR_GREEN = '#0fc878';
const BR_PURPLE = '#9d3eff';
const BR_DIM = 'rgba(10,10,10,0.55)';

// Halftone dots overlay
function BR_Halftone({ opacity = 0.18, size = 4 }) {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', opacity,
      backgroundImage: `radial-gradient(${BR_INK} 25%, transparent 26%)`,
      backgroundSize: `${size}px ${size}px`,
      mixBlendMode: 'multiply',
    }} />
  );
}

// Misregistration — duplicates of a node offset in CMY for screen-print feel
function BR_Misreg({ children, dx = 2, dy = 2 }) {
  const ghost = (color, ox, oy) => (
    <div style={{ position: 'absolute', inset: 0, color, transform: `translate(${ox}px, ${oy}px)`, mixBlendMode: 'multiply', opacity: 0.7 }}>{children}</div>
  );
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {ghost('#ff2e3d', -dx, -dy)}
      {ghost('#1d4eff', dx, dy)}
      <div style={{ position: 'relative', color: BR_INK }}>{children}</div>
    </div>
  );
}

// Stamp / sticker — angled slab
function BR_Stamp({ children, color = BR_RED, rotate = -3, style = {} }) {
  return (
    <div style={{
      display: 'inline-block', background: color, color: '#fff', padding: '6px 14px',
      fontFamily: '"Archivo Black", "Bricolage Grotesque", sans-serif',
      fontSize: 14, letterSpacing: 2, textTransform: 'uppercase',
      transform: `rotate(${rotate}deg)`, border: `2px solid ${BR_INK}`,
      boxShadow: `4px 4px 0 ${BR_INK}`,
      ...style,
    }}>{children}</div>
  );
}

// Hard-bordered card with offset block-shadow
function BR_Card({ children, color = '#fff', shadow = BR_INK, offset = 6, style = {} }) {
  return (
    <div style={{
      background: color, border: `3px solid ${BR_INK}`,
      boxShadow: `${offset}px ${offset}px 0 ${shadow}`,
      ...style,
    }}>{children}</div>
  );
}

const BR_PAPER_BG = {
  background: `${BR_PAPER}`,
  backgroundImage: `
    radial-gradient(circle at 20% 30%, rgba(0,0,0,0.04), transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(0,0,0,0.04), transparent 40%),
    repeating-linear-gradient(45deg, rgba(0,0,0,0.015) 0 2px, transparent 2px 4px)
  `,
};

// ---- TITLE ----
function BR_Title({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={BR_PAPER}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, ...BR_PAPER_BG }} />

      {/* Diagonal stripe banner */}
      <div style={{ position: 'absolute', top: -60, left: -60, right: -60, height: 200, background: BR_RED, transform: 'rotate(-4deg)', borderTop: `3px solid ${BR_INK}`, borderBottom: `3px solid ${BR_INK}` }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.18) 14px 18px)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: '#fff', fontFamily: '"Archivo Black",sans-serif', fontSize: 22, letterSpacing: 8 }}>★ AUTO-FIRE BULLET HEAVEN ★ AUTO-FIRE BULLET HEAVEN ★</div>
      </div>

      {/* Big title */}
      <div style={{ position: 'absolute', left: 60, top: 220, fontFamily: '"Archivo Black", "Bricolage Grotesque", sans-serif', fontSize: 340, lineHeight: 0.85, fontWeight: 900, color: BR_INK, letterSpacing: -10 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', top: 8, left: 8, color: BR_YELLOW }}>PRISM</span>
          <span style={{ position: 'relative' }}>PRISM</span>
        </div>
      </div>

      {/* Tagline */}
      <div style={{ position: 'absolute', left: 70, top: 540, fontFamily: '"Archivo Black",sans-serif', fontSize: 28, letterSpacing: 2, color: BR_INK, lineHeight: 1.1, maxWidth: 600 }}>
        15 MINUTES.<br />
        <span style={{ background: BR_YELLOW, padding: '0 6px' }}>23 SHARDS.</span><br />
        ONE LIGHT.
      </div>

      {/* Right panel — big play button */}
      <div style={{ position: 'absolute', right: 60, top: 320, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end' }}>
        <BR_Card color={BR_GREEN} offset={8} style={{ padding: '24px 38px', cursor: 'pointer' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 56, color: BR_INK, letterSpacing: 4, lineHeight: 1 }}>► PLAY</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: BR_INK, marginTop: 6 }}>SPACE / ENTER</div>
        </BR_Card>
        <BR_Card color="#fff" offset={4} style={{ padding: '10px 22px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, letterSpacing: 3, color: BR_INK }}>ARCHIVE</div>
        </BR_Card>
        <BR_Card color="#fff" offset={4} style={{ padding: '10px 22px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, letterSpacing: 3, color: BR_INK }}>SETTINGS</div>
        </BR_Card>
      </div>

      {/* Stamps */}
      <div style={{ position: 'absolute', right: 80, top: 80 }}>
        <BR_Stamp color={BR_BLUE} rotate={6}>v0.9.4 · BUILD 118</BR_Stamp>
      </div>
      <div style={{ position: 'absolute', left: 80, bottom: 60 }}>
        <BR_Stamp color={BR_PURPLE} rotate={-2}>BEST · 5,118 · 15:00</BR_Stamp>
      </div>

      {/* Sticker */}
      <div style={{ position: 'absolute', right: 90, bottom: 70, width: 130, height: 130, borderRadius: '50%', background: BR_YELLOW, border: `3px solid ${BR_INK}`, boxShadow: `5px 5px 0 ${BR_INK}`, transform: 'rotate(8deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: '"Archivo Black",sans-serif', fontSize: 13, lineHeight: 1.1, letterSpacing: 1, color: BR_INK }}>
        NEW!<br/>RUN+<br/>MODE
      </div>

      <BR_Halftone opacity={0.12} />
    </Frame>
  );
}

// ---- HUD ----
function BR_HUD({ width = 1280, height = 720 }) {
  const activeShards = [0, 8, 11, 7, 14, 5, 12];
  const shardLevels = { 0: 4, 8: 3, 11: 5, 7: 2, 14: 6, 5: 3, 12: 1 };
  return (
    <Frame width={width} height={height} bg={BR_INK}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.1} paletteShift={30} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)' }} />

      {/* Top-left: HP card */}
      <div style={{ position: 'absolute', top: 18, left: 18 }}>
        <BR_Card color="#fff" offset={5} style={{ padding: '8px 14px', minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 3, color: BR_INK }}>HP</div>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 22, color: BR_INK, fontFeatureSettings: '"tnum"' }}>78/130</div>
          </div>
          <div style={{ marginTop: 4, height: 14, border: `2px solid ${BR_INK}`, background: '#fff', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: '60%', background: BR_GREEN, borderRight: `2px solid ${BR_INK}` }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.12) 4px 6px)` }} />
          </div>
        </BR_Card>
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <BR_Card color={BR_PURPLE} offset={3} style={{ padding: '4px 10px' }}>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 2, color: '#fff' }}>↳ DASH RDY</div>
          </BR_Card>
          <BR_Card color="#fff" offset={3} style={{ padding: '4px 10px' }}>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 2, color: BR_INK }}>ARMOR 24%</div>
          </BR_Card>
        </div>
      </div>

      {/* Top center: timer marquee */}
      <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)' }}>
        <BR_Card color={BR_YELLOW} offset={5} style={{ padding: '10px 20px', textAlign: 'center', minWidth: 220 }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 4, color: BR_INK }}>WAVE 14 ✦ OVERDRIVE</div>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 38, color: BR_INK, lineHeight: 1, marginTop: 2, fontFeatureSettings: '"tnum"' }}>09:17</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 2, color: BR_INK }}>BOSS IN 0:43</div>
        </BR_Card>
      </div>

      {/* Top right: rank stamp */}
      <div style={{ position: 'absolute', top: 18, right: 18 }}>
        <BR_Card color={BR_RED} offset={5} style={{ padding: '8px 14px', textAlign: 'right', minWidth: 180 }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 3, color: '#fff' }}>RANK</div>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 44, color: '#fff', lineHeight: 1, marginTop: -2 }}>14</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 2, color: '#fff' }}>312 KILLS · 2,184</div>
        </BR_Card>
      </div>

      {/* Synergy stickers floating bottom-right */}
      <div style={{ position: 'absolute', right: 24, top: 150, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
        <BR_Stamp color={BR_YELLOW} rotate={-3} style={{ color: BR_INK }}>⚡ CHAIN REACTION</BR_Stamp>
        <BR_Stamp color={BR_BLUE} rotate={2}>❄ BLIZZARD</BR_Stamp>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 2, color: '#fff', background: BR_INK, padding: '4px 8px', border: `2px solid ${BR_INK}` }}>+1 SHARD → FROZEN ORBIT</div>
      </div>

      {/* XP bar bottom */}
      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: '60%' }}>
        <BR_Card color="#fff" offset={4} style={{ padding: '6px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"Archivo Black",sans-serif', fontSize: 10, letterSpacing: 2, color: BR_INK, marginBottom: 4 }}>
            <span>RADIANCE → RANK 15</span><span>248 / 410</span>
          </div>
          <div style={{ height: 12, border: `2px solid ${BR_INK}`, background: '#fff', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: '60%', background: BR_PURPLE, borderRight: `2px solid ${BR_INK}` }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,0.18) 4px 6px)` }} />
          </div>
        </BR_Card>
      </div>

      {/* Shard tray bottom-left */}
      <div style={{ position: 'absolute', bottom: 24, left: 24 }}>
        <BR_Card color={BR_INK} offset={4} style={{ padding: 8, display: 'flex', gap: 6 }}>
          {activeShards.map(idx => {
            const s = SHARDS[idx]; const lv = shardLevels[idx];
            return (
              <div key={idx} style={{ width: 44, height: 44, background: s.color, border: `2px solid ${BR_INK}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShardGlyph glyph={s.glyph} size={26} color={BR_INK} stroke={2} />
                <div style={{ position: 'absolute', bottom: -3, right: -3, background: BR_INK, color: BR_YELLOW, fontFamily: '"Archivo Black",sans-serif', fontSize: 11, padding: '0 4px', border: `2px solid ${BR_INK}` }}>{lv}</div>
              </div>
            );
          })}
          <div style={{ width: 44, height: 44, border: `2px dashed ${BR_PAPER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BR_PAPER, fontFamily: '"Archivo Black",sans-serif', fontSize: 22 }}>+</div>
        </BR_Card>
      </div>

      {/* Damage popups in display type */}
      <div style={{ position: 'absolute', left: '46%', top: '38%', fontFamily: '"Archivo Black",sans-serif', fontSize: 36, color: '#fff', textShadow: `3px 3px 0 ${BR_INK}`, animation: 'drift-up 1.4s ease-out' }}>137</div>
      <div style={{ position: 'absolute', left: '58%', top: '50%', fontFamily: '"Archivo Black",sans-serif', fontSize: 56, color: BR_YELLOW, textShadow: `4px 4px 0 ${BR_INK}, 8px 8px 0 ${BR_RED}`, animation: 'drift-up 1.4s ease-out 0.4s' }}>482!</div>

      <BR_Halftone opacity={0.08} />
    </Frame>
  );
}

// ---- RANK-UP ----
function BR_RankUp({ width = 1280, height = 720 }) {
  const offers = [{ kind: 'shard', idx: 8 }, { kind: 'evolution', idx: 2 }, { kind: 'shard', idx: 11 }];
  return (
    <Frame width={width} height={height} bg={BR_PAPER}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, ...BR_PAPER_BG }} />

      {/* Diagonal banner */}
      <div style={{ position: 'absolute', top: 60, left: -40, right: -40, padding: '14px 0', background: BR_INK, transform: 'rotate(-2deg)', textAlign: 'center', borderTop: `3px solid ${BR_INK}`, borderBottom: `3px solid ${BR_INK}` }}>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 16, letterSpacing: 8, color: BR_YELLOW }}>★ RANK UP ★ RANK UP ★ 14 → 15 ★ RANK UP ★ RANK UP ★</div>
      </div>

      {/* Big choose */}
      <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif' }}>
        <div style={{ fontSize: 110, lineHeight: 1, color: BR_INK, letterSpacing: -2 }}>
          PICK <span style={{ background: BR_YELLOW, padding: '0 16px', display: 'inline-block', transform: 'rotate(-2deg)', border: `3px solid ${BR_INK}` }}>ONE.</span>
        </div>
      </div>

      {/* Cards */}
      <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%, -50%)', display: 'flex', gap: 28 }}>
        {offers.map((o, i) => <BR_OfferCard key={i} offer={o} hotkey={i+1} index={i} />)}
      </div>

      {/* Actions */}
      <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 16 }}>
        <BR_Card color="#fff" offset={4} style={{ padding: '8px 18px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 13, letterSpacing: 3, color: BR_INK }}>↻ REROLL <span style={{ color: BR_DIM }}>×2 [R]</span></div>
        </BR_Card>
        <BR_Card color="#fff" offset={4} style={{ padding: '8px 18px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 13, letterSpacing: 3, color: BR_INK }}>⊘ SKIP <span style={{ color: BR_DIM }}>+6HP [X]</span></div>
        </BR_Card>
      </div>

      <BR_Halftone opacity={0.1} />
    </Frame>
  );
}

function BR_OfferCard({ offer, hotkey, index }) {
  const tilt = [-2, 1, -1][index] || 0;
  if (offer.kind === 'evolution') {
    const e = EVOLUTIONS[offer.idx];
    return (
      <div style={{ transform: `rotate(${tilt}deg)` }}>
        <BR_Card color={BR_YELLOW} offset={8} style={{ width: 280, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ background: BR_INK, color: BR_YELLOW, fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 3, padding: '3px 8px' }}>EVOLUTION</div>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, color: BR_INK }}>[{hotkey}]</div>
          </div>
          <div style={{ width: 200, height: 200, margin: '20px auto 0', background: `radial-gradient(${e.color}, ${e.color}88)`, border: `3px solid ${BR_INK}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 0 0 4px rgba(255,255,255,0.4)` }}>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 80, color: BR_INK }}>✦</div>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${BR_INK}25 28%, transparent 30%)`, backgroundSize: '6px 6px' }} />
          </div>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 32, color: BR_INK, marginTop: 14, lineHeight: 1, letterSpacing: -1 }}>{e.name}</div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: BR_INK, marginTop: 4, letterSpacing: 1 }}>{e.recipe}</div>
          <div style={{ fontSize: 13, color: BR_INK, marginTop: 10, fontFamily: '"Archivo Black",sans-serif', fontWeight: 500, lineHeight: 1.3 }}>{e.desc}</div>
        </BR_Card>
      </div>
    );
  }
  const s = SHARDS[offer.idx];
  const lv = 5;
  const rarityColor = { common: '#fff', rare: BR_BLUE, legendary: BR_RED }[s.rarity];
  const rarityFg = s.rarity === 'common' ? BR_INK : '#fff';
  return (
    <div style={{ transform: `rotate(${tilt}deg)` }}>
      <BR_Card color="#fff" offset={8} style={{ width: 250, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ background: rarityColor, color: rarityFg, fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 3, padding: '3px 8px', border: `2px solid ${BR_INK}`, textTransform: 'uppercase' }}>{s.rarity}</div>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, color: BR_INK }}>[{hotkey}]</div>
        </div>
        <div style={{ width: 180, height: 180, margin: '20px auto 0', background: s.color, border: `3px solid ${BR_INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <ShardGlyph glyph={s.glyph} size={86} color={BR_INK} stroke={3} />
          <div style={{ position: 'absolute', top: -8, right: -8, background: BR_INK, color: '#fff', fontFamily: '"Archivo Black",sans-serif', fontSize: 14, padding: '4px 8px', border: `2px solid ${BR_INK}` }}>L{lv}→{lv+1}</div>
        </div>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 30, color: BR_INK, marginTop: 14, lineHeight: 1, letterSpacing: -1 }}>{s.name}</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {[1,2,3,4,5,6].map(n => (
            <div key={n} style={{ flex: 1, height: 8, background: n <= lv ? s.color : (n === lv+1 ? BR_YELLOW : '#fff'), border: `2px solid ${BR_INK}` }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: BR_INK, marginTop: 8, fontFamily: '"Archivo Black",sans-serif', fontWeight: 500, lineHeight: 1.3 }}>{s.desc}</div>
        <div style={{ marginTop: 8, padding: '4px 6px', background: BR_GREEN, border: `2px solid ${BR_INK}`, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, color: BR_INK, letterSpacing: 1 }}>FORK 40 → 50%</div>
        <div style={{ marginTop: 4, fontFamily: '"Archivo Black",sans-serif', fontSize: 10, color: BR_RED, letterSpacing: 1 }}>⚡ CHAIN REACTION (2 LVL)</div>
      </BR_Card>
    </div>
  );
}

// ---- BOSS ----
function BR_Boss({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={BR_INK}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.5} paletteShift={31} hideEnemies />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,46,61,0.18)', mixBlendMode: 'multiply' }} />

      {/* Diagonal red stripes */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 60px, ${BR_RED}33 60px 70px)` }} />

      {/* Caution tape banners */}
      <div style={{ position: 'absolute', top: 60, left: -40, right: -40, padding: 10, background: BR_YELLOW, transform: 'rotate(-3deg)', borderTop: `3px solid ${BR_INK}`, borderBottom: `3px solid ${BR_INK}`, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif', fontSize: 16, letterSpacing: 8, color: BR_INK, backgroundImage: `repeating-linear-gradient(45deg, ${BR_YELLOW} 0 30px, ${BR_INK} 30px 50px, ${BR_YELLOW} 50px 80px)` }}>
        <span style={{ background: BR_YELLOW, padding: '6px 16px', border: `3px solid ${BR_INK}` }}>HOSTILE FRACTURE INCOMING ✦ HOSTILE FRACTURE INCOMING</span>
      </div>

      {/* Boss silhouette */}
      <div style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -50%)', width: 320, height: 320 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, #ff2e3d 0%, transparent 70%)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 200, height: 200, background: BR_RED, border: `4px solid ${BR_INK}`, boxShadow: `12px 12px 0 ${BR_INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 100, color: BR_INK }}>I</div>
        </div>
      </div>

      {/* Title */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 480, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif', fontSize: 110, lineHeight: 1, color: '#fff', letterSpacing: -2, textShadow: `6px 6px 0 ${BR_RED}, 12px 12px 0 ${BR_INK}` }}>
        SENTINEL
      </div>

      {/* HP card */}
      <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', width: '60%' }}>
        <BR_Card color={BR_RED} offset={5} style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"Archivo Black",sans-serif', fontSize: 12, letterSpacing: 3, color: '#fff', marginBottom: 6 }}>
            <span>● PRISM SENTINEL · TIER I</span><span>14,800 / 14,800</span>
          </div>
          <div style={{ height: 16, border: `2px solid ${BR_INK}`, background: '#fff', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.15) 4px 6px)` }} />
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 10, fontFamily: '"Archivo Black",sans-serif', fontSize: 10, letterSpacing: 2 }}>
            <span style={{ background: BR_YELLOW, padding: '2px 6px', color: BR_INK, border: `2px solid ${BR_INK}` }}>◆ PHASE 1 — SHIELDS</span>
            <span style={{ color: '#fff', opacity: 0.6 }}>◇ PHASE 2 — LANCE</span>
            <span style={{ color: '#fff', opacity: 0.6 }}>◇ PHASE 3 — ENRAGE</span>
          </div>
        </BR_Card>
      </div>

      <BR_Halftone opacity={0.18} />
    </Frame>
  );
}

// ---- SYNERGY ----
function BR_Synergy({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={BR_INK}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={1.4} paletteShift={32} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(255,212,0,0.4), transparent 60%)' }} />

      {/* Lightning rays */}
      <svg style={{ position: 'absolute', inset: 0 }} viewBox={`0 0 ${width} ${height}`}>
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i * 15) * Math.PI / 180;
          const x = width/2 + Math.cos(a) * 600;
          const y = height/2 + Math.sin(a) * 600;
          return <line key={i} x1={width/2} y1={height/2} x2={x} y2={y} stroke={BR_YELLOW} strokeWidth={i%3===0?6:2} opacity={i%3===0?0.6:0.3} />;
        })}
      </svg>

      {/* Banner */}
      <div style={{ position: 'absolute', left: -40, right: -40, top: 90, padding: '14px 0', background: BR_YELLOW, transform: 'rotate(-3deg)', borderTop: `4px solid ${BR_INK}`, borderBottom: `4px solid ${BR_INK}` }}>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 22, letterSpacing: 12, color: BR_INK, textAlign: 'center' }}>★★★ SYNERGY UNLOCKED ★★★ SYNERGY UNLOCKED ★★★</div>
      </div>

      {/* Big title */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif' }}>
        <div style={{ fontSize: 200, lineHeight: 0.85, color: '#fff', letterSpacing: -8, textShadow: `8px 8px 0 ${BR_RED}, 16px 16px 0 ${BR_INK}` }}>CHAIN</div>
        <div style={{ fontSize: 200, lineHeight: 0.85, color: BR_YELLOW, letterSpacing: -8, textShadow: `8px 8px 0 ${BR_BLUE}, 16px 16px 0 ${BR_INK}`, marginTop: -10 }}>REACTION</div>
      </div>

      {/* Recipe row */}
      <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center' }}>
        <BR_Card color={SHARDS[0].color} offset={4} style={{ padding: '8px 14px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 14, color: BR_INK, letterSpacing: 2 }}>◆ SPLIT</div>
        </BR_Card>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 32, color: '#fff' }}>+</div>
        <BR_Card color={SHARDS[8].color} offset={4} style={{ padding: '8px 14px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 14, color: BR_INK, letterSpacing: 2 }}>◆ CASCADE</div>
        </BR_Card>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 32, color: '#fff' }}>=</div>
        <BR_Card color="#fff" offset={4} style={{ padding: '8px 14px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 14, color: BR_INK, letterSpacing: 1 }}>KILLS FORK INTO BEAM CHAINS</div>
        </BR_Card>
      </div>

      <BR_Halftone opacity={0.15} />
    </Frame>
  );
}

// ---- WAVE CLEAR ----
function BR_WaveClear({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={BR_PAPER}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, ...BR_PAPER_BG }} />

      {/* Confetti dots */}
      {Array.from({ length: 36 }).map((_, i) => {
        const colors = [BR_RED, BR_BLUE, BR_YELLOW, BR_GREEN, BR_PURPLE];
        const rng = mulberry32(900 + i);
        return (
          <div key={i} style={{
            position: 'absolute', width: 14, height: 14, background: colors[i % 5],
            border: `2px solid ${BR_INK}`,
            left: `${rng() * 100}%`, top: `${rng() * 100}%`,
            transform: `rotate(${rng() * 360}deg)`,
          }} />
        );
      })}

      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: '"Archivo Black",sans-serif' }}>
        <div style={{ background: BR_GREEN, color: BR_INK, padding: '6px 18px', display: 'inline-block', border: `3px solid ${BR_INK}`, transform: 'rotate(-3deg)', fontSize: 16, letterSpacing: 5 }}>WAVE CLEAR!</div>
        <div style={{ fontSize: 320, lineHeight: 0.9, color: BR_INK, letterSpacing: -10, marginTop: 20, textShadow: `10px 10px 0 ${BR_RED}` }}>12</div>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <BR_Card color={BR_YELLOW} offset={3} style={{ padding: '6px 14px' }}>
            <div style={{ fontSize: 13, letterSpacing: 2, color: BR_INK }}>+58 KILLS</div>
          </BR_Card>
          <BR_Card color={BR_PURPLE} offset={3} style={{ padding: '6px 14px' }}>
            <div style={{ fontSize: 13, letterSpacing: 2, color: '#fff' }}>+12 RADIANCE</div>
          </BR_Card>
          <BR_Card color={BR_BLUE} offset={3} style={{ padding: '6px 14px' }}>
            <div style={{ fontSize: 13, letterSpacing: 2, color: '#fff' }}>+1 SHARD</div>
          </BR_Card>
        </div>
        <div style={{ marginTop: 18, fontFamily: '"JetBrains Mono",monospace', fontSize: 12, letterSpacing: 4, color: BR_INK }}>BREATHER · 3 SEC</div>
      </div>

      <BR_Halftone opacity={0.1} />
    </Frame>
  );
}

// ---- DEATH / VICTORY ----
function BR_Death({ width = 1280, height = 720, victory = false }) {
  const accent = victory ? BR_GREEN : BR_RED;
  return (
    <Frame width={width} height={height} bg={BR_PAPER}>
      <style>{SHARED_KEYFRAMES}</style>
      <div style={{ position: 'absolute', inset: 0, ...BR_PAPER_BG }} />

      {/* Top banner */}
      <div style={{ position: 'absolute', top: 50, left: -40, right: -40, padding: '10px 0', background: accent, transform: 'rotate(-2deg)', borderTop: `3px solid ${BR_INK}`, borderBottom: `3px solid ${BR_INK}`, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif', fontSize: 14, letterSpacing: 8, color: BR_INK }}>
        ✦ {victory ? 'VICTORY ROYALE — RUN COMPLETE' : 'GAME OVER — RUN TERMINATED'} ✦
      </div>

      {/* Big headline */}
      <div style={{ position: 'absolute', top: 110, left: 0, right: 0, textAlign: 'center', fontFamily: '"Archivo Black",sans-serif' }}>
        <div style={{ fontSize: 240, lineHeight: 0.85, color: BR_INK, letterSpacing: -10, textShadow: `10px 10px 0 ${accent}` }}>
          {victory ? 'WIN!' : 'DEAD'}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ position: 'absolute', left: '50%', top: 380, transform: 'translateX(-50%)', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { l: 'SCORE', v: '5,118', c: BR_YELLOW },
          { l: 'TIME', v: '15:00', c: '#fff' },
          { l: 'PEAK', v: '24', c: '#fff' },
          { l: 'KILLS', v: '742', c: BR_BLUE, fg: '#fff' },
          { l: 'BOSSES', v: '3/3', c: BR_RED, fg: '#fff' },
          { l: 'GEMS', v: '218', c: BR_PURPLE, fg: '#fff' },
        ].map(s => (
          <BR_Card key={s.l} color={s.c} offset={4} style={{ padding: '8px 12px', minWidth: 110, textAlign: 'center' }}>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 10, letterSpacing: 2, color: s.fg || BR_INK }}>{s.l}</div>
            <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 28, color: s.fg || BR_INK, lineHeight: 1, marginTop: 2 }}>{s.v}</div>
          </BR_Card>
        ))}
      </div>

      {/* Build */}
      <div style={{ position: 'absolute', left: 60, top: 500, right: 60 }}>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 12, letterSpacing: 3, color: BR_INK, marginBottom: 6 }}>FINAL BUILD</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{idx:0,lv:6},{idx:2,lv:6},{idx:8,lv:5},{idx:11,lv:4},{idx:7,lv:3},{idx:12,lv:3},{idx:14,lv:2}].map(({idx,lv}) => {
            const s = SHARDS[idx];
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `2px solid ${BR_INK}`, padding: '4px 8px' }}>
                <div style={{ width: 16, height: 16, background: s.color, border: `1px solid ${BR_INK}` }} />
                <span style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, letterSpacing: 1, color: BR_INK }}>{s.name}</span>
                <span style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 11, color: '#fff', background: BR_INK, padding: '0 4px' }}>L{lv}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <BR_Stamp color={BR_YELLOW} rotate={-2} style={{ color: BR_INK, fontSize: 10 }}>★ KALEIDOSCOPE</BR_Stamp>
          <BR_Stamp color={BR_PURPLE} rotate={1} style={{ fontSize: 10 }}>⚡ CHAIN REACTION</BR_Stamp>
          <BR_Stamp color={BR_BLUE} rotate={-1} style={{ fontSize: 10 }}>⚡ BLIZZARD</BR_Stamp>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ position: 'absolute', left: 60, bottom: 30, display: 'flex', gap: 14 }}>
        <BR_Card color={BR_GREEN} offset={5} style={{ padding: '10px 20px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, letterSpacing: 3, color: BR_INK }}>► AGAIN</div>
        </BR_Card>
        <BR_Card color="#fff" offset={5} style={{ padding: '10px 20px' }}>
          <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 18, letterSpacing: 3, color: BR_INK }}>↩ MENU</div>
        </BR_Card>
      </div>
      <div style={{ position: 'absolute', right: 60, bottom: 30, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 2, color: BR_INK, textAlign: 'right' }}>
        <div style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 13, letterSpacing: 4, color: victory ? BR_GREEN : BR_RED, marginBottom: 4 }}>{victory ? 'NEW BEST!' : 'LOCAL BEST'}</div>
        <div>1. 5,118 · 15:00 · WIN</div>
        <div>2. 3,820 · 13:42</div>
        <div>3. 2,841 · 11:18</div>
      </div>

      <BR_Halftone opacity={0.1} />
    </Frame>
  );
}

// ---- PAUSE ----
function BR_Pause({ width = 1280, height = 720 }) {
  return (
    <Frame width={width} height={height} bg={BR_PAPER}>
      <style>{SHARED_KEYFRAMES}</style>
      <BattleScene width={width} height={height} intensity={0.6} paletteShift={33} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(240,230,210,0.85)' }} />

      <div style={{ position: 'absolute', left: '50%', top: '32%', transform: 'translate(-50%,-50%)', textAlign: 'center', fontFamily: '"Archivo Black",sans-serif' }}>
        <div style={{ fontSize: 220, lineHeight: 0.85, color: BR_INK, letterSpacing: -10, textShadow: `10px 10px 0 ${BR_YELLOW}, 20px 20px 0 ${BR_RED}` }}>
          PAUSED
        </div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '64%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {[
          { label: '► RESUME', color: BR_GREEN, hint: 'ESC', active: true },
          { label: '♪ SOUND · ON', color: '#fff', hint: 'M' },
          { label: '◎ CALIBRATE', color: '#fff', hint: '' },
          { label: '✕ ABANDON RUN', color: BR_RED, fg: '#fff', hint: '' },
        ].map((b, i) => (
          <BR_Card key={i} color={b.color} offset={5} style={{ padding: '10px 22px', minWidth: 320, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Archivo Black",sans-serif', fontSize: 16, letterSpacing: 3, color: b.fg || BR_INK }}>{b.label}</span>
            <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: b.fg || BR_INK, opacity: 0.6 }}>{b.hint}</span>
          </BR_Card>
        ))}
      </div>

      <div style={{ position: 'absolute', left: '50%', bottom: 30, transform: 'translateX(-50%)', fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 3, color: BR_INK }}>
        09:17 · RANK 14 · 312 KILLS
      </div>

      <BR_Halftone opacity={0.1} />
    </Frame>
  );
}

Object.assign(window, { BR_Title, BR_HUD, BR_RankUp, BR_Boss, BR_Synergy, BR_WaveClear, BR_Death, BR_Pause });
