// Shared data, helpers, and the synthetic "battle scene" used as a backdrop
// for HUD screens across all four directions.

const SHARDS = [
  { name: 'SPLIT',        color: '#8effa3', rarity: 'common',    desc: 'Fan out more beams per volley',           glyph: 'fan' },
  { name: 'REFRACT',      color: '#7fd3ff', rarity: 'rare',      desc: 'Beams curve toward nearest enemy',        glyph: 'curve' },
  { name: 'MIRROR',       color: '#c9a3ff', rarity: 'common',    desc: 'Fire in every direction',                 glyph: 'radial' },
  { name: 'CHROMATIC',    color: '#ffa3c9', rarity: 'common',    desc: 'Split into red / green / blue',           glyph: 'rgb' },
  { name: 'LENS',         color: '#ffe58e', rarity: 'common',    desc: 'Thicker, heavier beams',                  glyph: 'lens' },
  { name: 'DIFFRACT',     color: '#8efff4', rarity: 'rare',      desc: 'Hits scatter into radial bursts',         glyph: 'burst' },
  { name: 'ECHO',         color: '#ff9d6c', rarity: 'rare',      desc: 'Second salvo after a short delay',        glyph: 'echo' },
  { name: 'HALO',         color: '#f5f5bc', rarity: 'rare',      desc: 'Orbital beads strike on contact',         glyph: 'orbit' },
  { name: 'CASCADE',      color: '#ff6f91', rarity: 'legendary', desc: 'Kills fork into secondary beams',         glyph: 'fork' },
  { name: 'INTERFERENCE', color: '#9a9dff', rarity: 'legendary', desc: 'Standing-wave pulses ripple outward',     glyph: 'wave' },
  { name: 'SIPHON',       color: '#a3ffdb', rarity: 'common',    desc: 'Beams heal you on every hit',             glyph: 'leech' },
  { name: 'FROST',        color: '#b3e5fc', rarity: 'common',    desc: 'Beams slow enemies on hit',               glyph: 'frost' },
  { name: 'BARRIER',      color: '#64b5f6', rarity: 'common',    desc: 'Energy shield absorbs and deals damage',  glyph: 'shield' },
  { name: 'THORNS',       color: '#ef5350', rarity: 'rare',      desc: 'Damage taken fires retaliatory beams',    glyph: 'thorn' },
  { name: 'MAGNET',       color: '#7cffd4', rarity: 'common',    desc: 'Pull radiance gems from farther away',    glyph: 'magnet' },
  { name: 'MOMENTUM',     color: '#d7ff6f', rarity: 'common',    desc: 'Move faster, shorter dash cooldown',      glyph: 'speed' },
  { name: 'ARMOR',        color: '#9ab8d0', rarity: 'common',    desc: 'Reduce all incoming damage by 8% per LV', glyph: 'armor' },
  { name: 'LUCK',         color: '#ffd740', rarity: 'rare',      desc: 'Rare and legendary shards appear more',   glyph: 'luck' },
  { name: 'PRISM HEART',  color: '#ff7eb3', rarity: 'common',    desc: '+15 max HP per LV, level-ups heal more',  glyph: 'heart' },
  { name: 'PHASE STEP',   color: '#5fffff', rarity: 'rare',      desc: 'Dash grants longer i-frames; afterimage', glyph: 'phase' },
  { name: 'ARC',          color: '#b58cff', rarity: 'rare',      desc: 'Chain lightning leaps between enemies',   glyph: 'arc' },
  { name: 'MINEFIELD',    color: '#7dff98', rarity: 'legendary', desc: 'Seed faceted charges that burst and pull',glyph: 'mine' },
  { name: 'LANCE',        color: '#fff06a', rarity: 'rare',      desc: 'Periodic heavy piercing rail shot',       glyph: 'lance' },
];

const EVOLUTIONS = [
  { name: 'AFTERIMAGE ENGINE', color: '#ffb547', recipe: 'ECHO 6 + MOMENTUM 6',     desc: 'Dash leaves firing echoes at your old position' },
  { name: 'WHITEOUT',          color: '#b9f4ff', recipe: 'FROST 6 + DIFFRACT 6',    desc: 'Frozen kills burst into freezing rays' },
  { name: 'KALEIDOSCOPE',      color: '#cc88ff', recipe: 'SPLIT 6 + MIRROR 6',      desc: 'Every salvo also fires a 12-ray prismatic ring' },
  { name: 'SINGULARITY',       color: '#5544ff', recipe: 'MAGNET 6 + INTERFERENCE 6', desc: 'Interference rings become gravity wells' },
  { name: 'SOLAR CROWN',       color: '#ffec66', recipe: 'HALO 6 + BARRIER 6',      desc: 'Halo contacts recharge your barrier' },
];

const SYNERGIES = [
  'CHAIN REACTION', 'BLIZZARD', 'SUPERNOVA', 'PRISM CANNON', 'TRACKING ECHO',
  'FROZEN ORBIT', 'EVENT HORIZON', 'BLOOD PACT', 'MARTYRDOM', 'RESONANCE', 'GRAVITY WELL',
];

// ---------- Shard glyphs (small SVGs that hint at each shard's behavior) ----------

function ShardGlyph({ glyph, color = '#fff', size = 40, stroke = 1.5 }) {
  const c = color;
  const s = size;
  const half = s / 2;
  const props = { width: s, height: s, viewBox: `0 0 ${s} ${s}`, fill: 'none', stroke: c, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (glyph) {
    case 'fan':
      return <svg {...props}>{[-30,-15,0,15,30].map(a => <line key={a} x1={half} y1={s-6} x2={half + Math.sin(a*Math.PI/180)*(s-10)} y2={s-6 - Math.cos(a*Math.PI/180)*(s-10)} />)}</svg>;
    case 'curve':
      return <svg {...props}><path d={`M 6 ${s-6} Q ${half} 6 ${s-6} ${half}`} /><circle cx={s-6} cy={half} r="2" fill={c} /></svg>;
    case 'radial':
      return <svg {...props}>{Array.from({length:8}).map((_,i)=>{const a=i*Math.PI/4;return <line key={i} x1={half+Math.cos(a)*4} y1={half+Math.sin(a)*4} x2={half+Math.cos(a)*(half-3)} y2={half+Math.sin(a)*(half-3)} />})}</svg>;
    case 'rgb':
      return <svg {...props} stroke="none"><circle cx={half-5} cy={half-2} r="7" fill="#ff5566" opacity="0.85"/><circle cx={half+5} cy={half-2} r="7" fill="#55ff77" opacity="0.85"/><circle cx={half} cy={half+5} r="7" fill="#5577ff" opacity="0.85"/></svg>;
    case 'lens':
      return <svg {...props}><ellipse cx={half} cy={half} rx={half-6} ry={half-3}/><line x1="6" y1={half} x2={s-6} y2={half} opacity="0.5"/></svg>;
    case 'burst':
      return <svg {...props}><circle cx={half} cy={half} r="3" fill={c}/>{Array.from({length:12}).map((_,i)=>{const a=i*Math.PI/6;return <line key={i} x1={half+Math.cos(a)*6} y1={half+Math.sin(a)*6} x2={half+Math.cos(a)*(half-2)} y2={half+Math.sin(a)*(half-2)} />})}</svg>;
    case 'echo':
      return <svg {...props}><circle cx={half-5} cy={half} r={half-7} opacity="1"/><circle cx={half+5} cy={half} r={half-7} opacity="0.45"/></svg>;
    case 'orbit':
      return <svg {...props}><circle cx={half} cy={half} r="4" fill={c}/><circle cx={half} cy={half} r={half-5} opacity="0.5"/>{[0,90,180,270].map(d=><circle key={d} cx={half+Math.cos(d*Math.PI/180)*(half-5)} cy={half+Math.sin(d*Math.PI/180)*(half-5)} r="2" fill={c}/>)}</svg>;
    case 'fork':
      return <svg {...props}><path d={`M ${half} ${s-6} L ${half} ${half}`} /><path d={`M ${half} ${half} L 8 8`}/><path d={`M ${half} ${half} L ${s-8} 8`}/><path d={`M ${half} ${half} L ${half} 8`} opacity="0.5"/></svg>;
    case 'wave':
      return <svg {...props}><circle cx={half} cy={half} r="4"/><circle cx={half} cy={half} r="9" opacity="0.7"/><circle cx={half} cy={half} r="14" opacity="0.4"/><circle cx={half} cy={half} r="18" opacity="0.2"/></svg>;
    case 'leech':
      return <svg {...props}><path d={`M ${half} 8 C 4 ${half}, ${half-4} ${s-4}, ${half} ${s-4} C ${half+4} ${s-4}, ${s-4} ${half}, ${half} 8 Z`}/><line x1={half-3} y1={half} x2={half+3} y2={half}/><line x1={half} y1={half-3} x2={half} y2={half+3}/></svg>;
    case 'frost':
      return <svg {...props}>{[0,60,120].map(d=><line key={d} x1={half-Math.cos(d*Math.PI/180)*(half-4)} y1={half-Math.sin(d*Math.PI/180)*(half-4)} x2={half+Math.cos(d*Math.PI/180)*(half-4)} y2={half+Math.sin(d*Math.PI/180)*(half-4)} />)}{[0,60,120].map(d=><g key={'a'+d}><line x1={half+Math.cos(d*Math.PI/180)*8} y1={half+Math.sin(d*Math.PI/180)*8} x2={half+Math.cos(d*Math.PI/180)*8+Math.cos((d+45)*Math.PI/180)*4} y2={half+Math.sin(d*Math.PI/180)*8+Math.sin((d+45)*Math.PI/180)*4}/></g>)}</svg>;
    case 'shield':
      return <svg {...props}><path d={`M ${half} 6 L ${s-6} 12 L ${s-8} ${half+4} Q ${half} ${s-4} 8 ${half+4} L 6 12 Z`}/></svg>;
    case 'thorn':
      return <svg {...props}><circle cx={half} cy={half} r="6"/>{[0,60,120,180,240,300].map(d=><line key={d} x1={half+Math.cos(d*Math.PI/180)*7} y1={half+Math.sin(d*Math.PI/180)*7} x2={half+Math.cos(d*Math.PI/180)*(half-2)} y2={half+Math.sin(d*Math.PI/180)*(half-2)} />)}</svg>;
    case 'magnet':
      return <svg {...props}><path d={`M 8 8 L 8 ${half} Q 8 ${s-6} ${half} ${s-6} Q ${s-8} ${s-6} ${s-8} ${half} L ${s-8} 8`}/><line x1="8" y1="8" x2="14" y2="8"/><line x1={s-8} y1="8" x2={s-14} y2="8"/></svg>;
    case 'speed':
      return <svg {...props}><path d={`M 6 ${half-4} L ${s-6} ${half-4}`}/><path d={`M 4 ${half} L ${s-4} ${half}`}/><path d={`M 6 ${half+4} L ${s-6} ${half+4}`}/><path d={`M ${s-12} ${half-8} L ${s-4} ${half} L ${s-12} ${half+8}`}/></svg>;
    case 'armor':
      return <svg {...props}><path d={`M ${half} 6 L ${s-6} ${half-4} L ${half} ${s-6} L 6 ${half-4} Z`}/><path d={`M ${half} 12 L ${s-12} ${half-2} L ${half} ${s-10} L 12 ${half-2} Z`} opacity="0.5"/></svg>;
    case 'luck':
      return <svg {...props}><path d={`M ${half} 6 L ${half+3} ${half-3} L ${s-6} ${half} L ${half+3} ${half+3} L ${half} ${s-6} L ${half-3} ${half+3} L 6 ${half} L ${half-3} ${half-3} Z`}/></svg>;
    case 'heart':
      return <svg {...props}><path d={`M ${half} ${s-7} C 6 ${half-2} 6 8 ${half-3} 8 C ${half-1} 8 ${half} 11 ${half} 13 C ${half} 11 ${half+1} 8 ${half+3} 8 C ${s-6} 8 ${s-6} ${half-2} ${half} ${s-7} Z`} fill={c} fillOpacity="0.15"/></svg>;
    case 'phase':
      return <svg {...props}><path d={`M 6 ${s-6} L ${half-2} 8`}/><path d={`M ${half+2} 8 L ${s-6} ${s-6}`} opacity="0.45"/><circle cx={half} cy={half} r="2" fill={c}/></svg>;
    case 'arc':
      return <svg {...props}><path d={`M 6 ${half-4} L ${half-4} ${half+2} L ${half+2} ${half-4} L ${s-6} ${half+4}`}/></svg>;
    case 'mine':
      return <svg {...props}><polygon points={`${half},6 ${s-6},${half} ${half},${s-6} 6,${half}`}/><circle cx={half} cy={half} r="2" fill={c}/></svg>;
    case 'lance':
      return <svg {...props}><line x1="6" y1={s-6} x2={s-6} y2="6"/><polygon points={`${s-6},6 ${s-12},6 ${s-6},12`} fill={c}/></svg>;
    default:
      return <svg {...props}><polygon points={`${half},6 ${s-6},${half-3} ${s-9},${s-6} 9,${s-6} 6,${half-3}`}/></svg>;
  }
}

// ---------- Synthetic battle scene used as backdrop ----------
// Renders a stylized snapshot of "game in progress" — not interactive.
// Each direction can wrap this in its own treatment.

function BattleScene({ width = 1280, height = 720, intensity = 1, paletteShift = 0, frozen = true, showPlayer = true, bossPhase = 'normal', noShake = false, hideEnemies = false }) {
  // Deterministic PRNG so layouts are stable.
  const seed = 42 + paletteShift * 10;
  const rng = mulberry32(seed);

  // Globe grid
  const cx = width * 0.5;
  const cy = height * 0.55;
  const R = Math.min(width, height) * 0.42;

  // Enemies
  const enemyCount = hideEnemies ? 0 : Math.floor(60 * intensity);
  const enemies = Array.from({ length: enemyCount }, (_, i) => {
    const a = rng() * Math.PI * 2;
    const r = (rng() * 0.95 + 0.05) * R;
    const kind = i % 8;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.96, r: 4 + (kind % 3) * 2.2 + rng() * 1.5, kind, hue: 0 };
  });

  // Beams from player
  const beamCount = Math.floor(14 * intensity);
  const beams = Array.from({ length: beamCount }, () => {
    const a = rng() * Math.PI * 2;
    const len = R * (0.5 + rng() * 0.5);
    return { a, len, w: 1.5 + rng() * 1.5, hue: rng() };
  });

  // XP gems
  const gems = Array.from({ length: 8 }, () => {
    const a = rng() * Math.PI * 2;
    const r = R * (0.2 + rng() * 0.65);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.96 };
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`bg-vignette-${paletteShift}`} cx="50%" cy="55%" r="65%">
          <stop offset="0%" stopColor="#0f0f1f" />
          <stop offset="60%" stopColor="#06060b" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <radialGradient id={`globe-glow-${paletteShift}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(127,211,255,0.18)" />
          <stop offset="70%" stopColor="rgba(127,211,255,0.04)" />
          <stop offset="100%" stopColor="rgba(127,211,255,0)" />
        </radialGradient>
        <radialGradient id={`player-glow-${paletteShift}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="100%" stopColor="rgba(127,211,255,0)" />
        </radialGradient>
        <filter id={`bloom-${paletteShift}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width={width} height={height} fill={`url(#bg-vignette-${paletteShift})`} />

      {/* Globe halo */}
      <circle cx={cx} cy={cy} r={R * 1.2} fill={`url(#globe-glow-${paletteShift})`} />

      {/* Lat / long grid */}
      <g stroke="rgba(127,211,255,0.12)" strokeWidth="1" fill="none">
        {Array.from({ length: 6 }).map((_, i) => {
          const lat = (i + 1) / 7;
          return <ellipse key={i} cx={cx} cy={cy} rx={R * Math.sin(lat * Math.PI)} ry={R * Math.sin(lat * Math.PI) * 0.36} />;
        })}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI;
          return <ellipse key={i} cx={cx} cy={cy} rx={R * Math.abs(Math.cos(a))} ry={R} transform={`rotate(${(i/8)*180} ${cx} ${cy})`} />;
        })}
        <circle cx={cx} cy={cy} r={R} stroke="rgba(127,211,255,0.4)" strokeWidth="1.4" />
      </g>

      {/* Beams */}
      <g style={{ mixBlendMode: 'screen' }}>
        {beams.map((b, i) => {
          const x2 = cx + Math.cos(b.a) * b.len;
          const y2 = cy + Math.sin(b.a) * b.len;
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.85)" strokeWidth={b.w + 2} opacity="0.5" filter={`url(#bloom-${paletteShift})`} />
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#fff" strokeWidth={b.w} />
            </g>
          );
        })}
      </g>

      {/* Enemies */}
      <g style={{ mixBlendMode: 'screen' }}>
        {enemies.map((e, i) => {
          const colors = ['#ff5e7a','#ffaa55','#aa66ff','#ff66cc','#66ddff','#ff6f91','#c9a3ff','#ef5350'];
          const color = colors[e.kind];
          return (
            <g key={i}>
              <circle cx={e.x} cy={e.y} r={e.r * 2.4} fill={color} opacity="0.18" filter={`url(#bloom-${paletteShift})`} />
              <circle cx={e.x} cy={e.y} r={e.r} fill={color} />
            </g>
          );
        })}
      </g>

      {/* Gems */}
      {gems.map((g, i) => (
        <g key={i} transform={`translate(${g.x} ${g.y}) rotate(45)`}>
          <rect x="-4" y="-4" width="8" height="8" fill="#7fd3ff" opacity="0.85" />
          <rect x="-7" y="-7" width="14" height="14" fill="rgba(127,211,255,0.25)" filter={`url(#bloom-${paletteShift})`} />
        </g>
      ))}

      {/* Player */}
      {showPlayer && (
        <g>
          <circle cx={cx} cy={cy} r="60" fill={`url(#player-glow-${paletteShift})`} />
          <circle cx={cx} cy={cy} r="9" fill="#fff" />
          <circle cx={cx} cy={cy} r="14" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

// Tiny PRNG
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Noise overlay (subtle film grain)
function GrainOverlay({ opacity = 0.06 }) {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay', opacity,
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    }} />
  );
}

// Scanline overlay
function Scanlines({ opacity = 0.18, gap = 3 }) {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay', opacity,
      background: `repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${gap-1}px, rgba(0,0,0,0.6) ${gap-1}px, rgba(0,0,0,0.6) ${gap}px)`,
    }} />
  );
}

// Frame helper - every artboard's children get a fixed-size letterbox.
function Frame({ width, height, bg = '#000', children, style = {} }) {
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: bg, ...style }}>
      {children}
    </div>
  );
}

// Common keyframes used across directions
const SHARED_KEYFRAMES = `
@keyframes pulse-soft { 0%,100% { opacity: 0.6 } 50% { opacity: 1 } }
@keyframes pulse-strong { 0%,100% { opacity: 0.7; transform: scale(1) } 50% { opacity: 1; transform: scale(1.04) } }
@keyframes drift-up { 0% { transform: translateY(8px); opacity: 0 } 30%,70% { opacity: 1 } 100% { transform: translateY(-8px); opacity: 0 } }
@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes hue-rotate { 0% { filter: hue-rotate(0deg) } 100% { filter: hue-rotate(360deg) } }
@keyframes ring-out { 0% { transform: scale(0.6); opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }
@keyframes glitch-x { 0%,100% { transform: translate(0,0) } 20% { transform: translate(-2px,1px) } 40% { transform: translate(2px,-1px) } 60% { transform: translate(-1px,2px) } 80% { transform: translate(1px,-2px) } }
@keyframes scanmove { 0% { transform: translateY(-100%) } 100% { transform: translateY(100%) } }
@keyframes orbit-spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
@keyframes blink { 0%,40%,100% { opacity: 1 } 50%,90% { opacity: 0.3 } }
@keyframes flare { 0% { opacity: 0; transform: scale(0.4) } 30% { opacity: 1 } 100% { opacity: 0; transform: scale(2.4) } }
`;

Object.assign(window, {
  SHARDS, EVOLUTIONS, SYNERGIES,
  ShardGlyph, BattleScene, GrainOverlay, Scanlines, Frame,
  mulberry32, SHARED_KEYFRAMES,
});
