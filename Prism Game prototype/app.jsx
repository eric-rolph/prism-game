// app.jsx — wires all four directions into the design canvas.
// Each direction is a row (DCSection); each row contains the same 8 screens
// as DCArtboards so the user can compare horizontally.

const W = 1280;
const H = 720;

const SCREENS = [
  { id: 'title',   label: '01 · Title' },
  { id: 'hud',     label: '02 · HUD (live)' },
  { id: 'rankup',  label: '03 · Rank-Up' },
  { id: 'boss',    label: '04 · Boss Intro' },
  { id: 'synergy', label: '05 · Synergy Proc' },
  { id: 'wave',    label: '06 · Wave Clear' },
  { id: 'death',   label: '07 · Game Over' },
  { id: 'victory', label: '08 · Victory' },
  { id: 'pause',   label: '09 · Pause' },
];

const DIRECTIONS = [
  {
    id: 'prism-os',
    title: '01 · Prism-OS',
    subtitle: 'Holographic terminal · scanlines, hex coords, jacked-in diegetic sci-fi.',
    components: {
      title: window.PO_Title, hud: window.PO_HUD, rankup: window.PO_RankUp, boss: window.PO_Boss,
      synergy: window.PO_Synergy, wave: window.PO_WaveClear, death: window.PO_Death,
      victory: (props) => window.PO_Death({ ...props, victory: true }), pause: window.PO_Pause,
    },
  },
  {
    id: 'refraction',
    title: '02 · Refraction',
    subtitle: 'Crystalline glass · prismatic gradients, frosted facets, type as light.',
    components: {
      title: window.RF_Title, hud: window.RF_HUD, rankup: window.RF_RankUp, boss: window.RF_Boss,
      synergy: window.RF_Synergy, wave: window.RF_WaveClear, death: window.RF_Death,
      victory: (props) => window.RF_Death({ ...props, victory: true }), pause: window.RF_Pause,
    },
  },
  {
    id: 'hdr-pure',
    title: '03 · HDR Pure',
    subtitle: 'Hyperminimal · near-zero chrome, type as light, Returnal energy.',
    components: {
      title: window.HP_Title, hud: window.HP_HUD, rankup: window.HP_RankUp, boss: window.HP_Boss,
      synergy: window.HP_Synergy, wave: window.HP_WaveClear, death: window.HP_Death,
      victory: (props) => window.HP_Death({ ...props, victory: true }), pause: window.HP_Pause,
    },
  },
  {
    id: 'brutalist',
    title: '04 · Brutalist Arcade',
    subtitle: 'Loud, tactile · screen-print color, slab type, Splatoon × Killer7 attitude.',
    components: {
      title: window.BR_Title, hud: window.BR_HUD, rankup: window.BR_RankUp, boss: window.BR_Boss,
      synergy: window.BR_Synergy, wave: window.BR_WaveClear, death: window.BR_Death,
      victory: (props) => window.BR_Death({ ...props, victory: true }), pause: window.BR_Pause,
    },
  },
];

function App() {
  return (
    <window.DesignCanvas minScale={0.05}>
      <window.DCSection id="readme" title="Prism — Visual Direction Exploration" subtitle="Same 9 screens × 4 directions. Open any artboard fullscreen to compare.">
        <window.DCArtboard id="readme-card" label="Brief" width={520} height={720}>
          <ReadmeCard />
        </window.DCArtboard>
        <window.DCArtboard id="shards-card" label="Shard set (shared)" width={760} height={720}>
          <ShardSheet />
        </window.DCArtboard>
      </window.DCSection>

      {DIRECTIONS.map(dir => (
        <window.DCSection key={dir.id} id={dir.id} title={dir.title} subtitle={dir.subtitle}>
          {SCREENS.map(s => {
            const Comp = dir.components[s.id];
            if (!Comp) return null;
            return (
              <window.DCArtboard key={`${dir.id}-${s.id}`} id={`${dir.id}-${s.id}`} label={s.label} width={W} height={H}>
                <Comp width={W} height={H} />
              </window.DCArtboard>
            );
          })}
        </window.DCSection>
      ))}
    </window.DesignCanvas>
  );
}

function ReadmeCard() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a0f', color: '#eaeaf5', padding: 36, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, letterSpacing: 4, color: 'rgba(234,234,245,0.5)' }}>PRISM · DESIGN BRIEF</div>
      <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 64, lineHeight: 1, marginTop: 12, background: 'linear-gradient(135deg, #ff6f91, #ffe66d, #66ddff, #c9a3ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Refract the light.</div>
      <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, color: 'rgba(234,234,245,0.78)' }}>
        Modern bullet-heaven survivor. Fifteen-minute runs. Auto-firing beams that <em>refract</em> through shards you collect on level-up. The whole game is a ramping light-show; the design language has to keep up.
      </div>

      <div style={{ marginTop: 24, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(234,234,245,0.5)' }}>FOUR DIRECTIONS — pick & mix</div>
      <ol style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: '#eaeaf5', paddingLeft: 0, listStyle: 'none' }}>
        <li><b style={{ color: '#a8f4ff' }}>01 Prism-OS</b> — diegetic terminal. Hex coords, scanlines, jacked-in sci-fi.</li>
        <li style={{ marginTop: 6 }}><b style={{ color: '#c9a3ff' }}>02 Refraction</b> — crystalline glass. Prismatic gradients, frosted facets, type as light.</li>
        <li style={{ marginTop: 6 }}><b style={{ color: '#fff' }}>03 HDR Pure</b> — hyperminimal. Near-zero chrome, Returnal/Tetris-Effect feel.</li>
        <li style={{ marginTop: 6 }}><b style={{ color: '#ffd400' }}>04 Brutalist Arcade</b> — loud screen-print, slab type, Splatoon × Killer7.</li>
      </ol>

      <div style={{ marginTop: 24, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(234,234,245,0.5)' }}>NINE SCREENS × FOUR DIRECTIONS</div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'rgba(234,234,245,0.7)', fontFamily: '"JetBrains Mono",monospace' }}>
        title · hud · rank-up · boss · synergy · wave clear · game over · victory · pause
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ marginTop: 18, fontSize: 11, lineHeight: 1.55, color: 'rgba(234,234,245,0.55)', borderTop: '1px solid rgba(234,234,245,0.15)', paddingTop: 12 }}>
        Each row is one direction. Click ⤢ on any artboard to fullscreen and compare — Prism-OS HUD vs Brutalist HUD, etc. All 23 shards + 5 evolutions are shared across directions; only the visual system changes.
      </div>
    </div>
  );
}

function ShardSheet() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a0f', padding: 28, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 4, color: 'rgba(234,234,245,0.5)' }}>SHARED CONTENT</div>
          <div style={{ fontFamily: '"Instrument Serif",serif', fontStyle: 'italic', fontSize: 38, color: '#fff', lineHeight: 1, marginTop: 4 }}>23 shards · 5 evolutions</div>
        </div>
        <div style={{ display: 'flex', gap: 8, fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 2, color: 'rgba(234,234,245,0.5)' }}>
          <span>● COMMON</span>
          <span style={{ color: '#7fd3ff' }}>● RARE</span>
          <span style={{ color: '#ffd96b' }}>● LEGENDARY</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
        {window.SHARDS.map((s, i) => {
          const ringColor = { common: 'rgba(255,255,255,0.2)', rare: '#7fd3ff', legendary: '#ffd96b' }[s.rarity];
          return (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ringColor}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 44, height: 50, clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', background: s.color, boxShadow: `0 0 12px ${s.color}99`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <window.ShardGlyph glyph={s.glyph} size={22} color="#0a0a14" stroke={1.6} />
              </div>
              <div style={{ marginTop: 6, fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 1, color: '#fff' }}>{s.name}</div>
              <div style={{ marginTop: 2, fontSize: 9, color: 'rgba(234,234,245,0.55)', lineHeight: 1.2, fontFamily: '"JetBrains Mono",monospace' }}>{s.desc}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, fontFamily: '"JetBrains Mono",monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(234,234,245,0.5)' }}>EVOLUTIONS · pair two L6 shards</div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {window.EVOLUTIONS.map((e, i) => (
          <div key={i} style={{ background: `${e.color}11`, border: `1px solid ${e.color}66`, borderRadius: 8, padding: 10 }}>
            <div style={{ fontFamily: '"Bricolage Grotesque",sans-serif', fontWeight: 600, fontSize: 13, color: '#fff', letterSpacing: 1 }}>{e.name}</div>
            <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, letterSpacing: 1, color: e.color, marginTop: 2 }}>{e.recipe}</div>
            <div style={{ fontSize: 11, color: 'rgba(234,234,245,0.65)', marginTop: 4, lineHeight: 1.3 }}>{e.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
