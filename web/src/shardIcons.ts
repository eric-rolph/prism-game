// Bespoke inline-SVG optical geometry icons for all 23 Shards + 5 Evolutions.
// Strict CSP compliant (inline SVG markup, zero external assets).

const wrap = (color: string, inner: string): string =>
  `<svg class="shard-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:${color}">${inner}</svg>`;

export function getShardSvg(index: number, color: string): string {
  switch (index) {
    case 0: // SPLIT — diverging fan of 3 light rays
      return wrap(color, `<circle cx="10" cy="24" r="3.5" fill="currentColor"/><path d="M13 24L40 10M13 24L42 24M13 24L40 38" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="40" cy="10" r="2" fill="#fff"/><circle cx="42" cy="24" r="2" fill="#fff"/><circle cx="40" cy="38" r="2" fill="#fff"/>`);
    case 1: // REFRACT — beam curving through lens onto target
      return wrap(color, `<path d="M7 35Q22 33 28 21T41 11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="9" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="41" cy="11" r="3.5" stroke="#fff" stroke-width="1.8"/>`);
    case 2: // MIRROR — 8-way radial reflection star
      return wrap(color, `<path d="M24 6V42M6 24H42M11 11L37 37M37 11L11 37" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><polygon points="24,17 31,24 24,31 17,24" fill="currentColor" fill-opacity="0.35" stroke="#fff" stroke-width="1.5"/>`);
    case 3: // CHROMATIC — classic prism splitting white ray into R/G/B
      return wrap(color, `<line x1="4" y1="26" x2="18" y2="24" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><polygon points="24,10 35,34 13,34" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2"/><line x1="29" y1="22" x2="44" y2="14" stroke="#ff5c77" stroke-width="2.2"/><line x1="30" y1="25" x2="44" y2="25" stroke="#66ff9e" stroke-width="2.2"/><line x1="29" y1="28" x2="44" y2="36" stroke="#62b5ff" stroke-width="2.2"/>`);
    case 4: // LENS — double-convex heavy aperture
      return wrap(color, `<path d="M24 7C33 14 33 34 24 41C15 34 15 14 24 7Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.2"/><line x1="6" y1="24" x2="42" y2="24" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`);
    case 5: // DIFFRACT — starburst scatter from central impact
      return wrap(color, `<circle cx="24" cy="24" r="5" fill="#fff"/><path d="M24 6V15M24 33V42M6 24H15M33 24H42M11 11L18 18M30 30L37 37M37 11L30 18M18 30L11 37" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`);
    case 6: // ECHO — twin offset reverberating waves
      return wrap(color, `<path d="M9 32L25 14L23 26L39 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 37L30 19L28 31L43 20" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
    case 7: // HALO — orbital ring with 3 glowing moons
      return wrap(color, `<circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4 3"/><circle cx="24" cy="24" r="4" fill="currentColor" fill-opacity="0.4"/><circle cx="24" cy="10" r="3.5" fill="#fff"/><circle cx="36" cy="31" r="3.5" fill="currentColor"/><circle cx="12" cy="31" r="3.5" fill="currentColor"/>`);
    case 8: // CASCADE — branching fractal chain reaction
      return wrap(color, `<path d="M8 24H20L30 12H40M20 24L30 36H40M30 12L36 22" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="24" r="3.5" fill="#fff"/><circle cx="30" cy="12" r="2.8" fill="currentColor"/><circle cx="30" cy="36" r="2.8" fill="currentColor"/>`);
    case 9: // INTERFERENCE — concentric standing-wave rings
      return wrap(color, `<circle cx="24" cy="24" r="17" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.8"/><circle cx="24" cy="24" r="11" stroke="currentColor" stroke-width="2.2"/><circle cx="24" cy="24" r="4.5" fill="#fff"/>`);
    case 10: // SIPHON — healing crystal drop + absorption wave
      return wrap(color, `<path d="M24 8C24 8 35 20 35 29A11 11 0 1 1 13 29C13 20 24 8 24 8Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.2"/><path d="M24 22V32M19 27H29" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`);
    case 11: // FROST — geometric 6-point crystal snowflake
      return wrap(color, `<path d="M24 6V42M8 15L40 33M40 15L8 33" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><polygon points="24,16 31,20 31,28 24,32 17,28 17,20" fill="currentColor" fill-opacity="0.28" stroke="#fff" stroke-width="1.5"/>`);
    case 12: // BARRIER — beveled hexagonal energy aegis
      return wrap(color, `<polygon points="24,6 40,15 40,33 24,42 8,33 8,15" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.4"/><polygon points="24,13 34,19 34,29 24,35 14,29 14,19" stroke="#fff" stroke-opacity="0.7" stroke-width="1.4"/>`);
    case 13: // THORNS — razor retaliatory spikes
      return wrap(color, `<polygon points="24,4 28,17 42,12 31,24 42,36 28,31 24,44 20,31 6,36 17,24 6,12 20,17" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>`);
    case 14: // MAGNET — harmonic attraction field
      return wrap(color, `<path d="M13 10V26A11 11 0 0 0 35 26V10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="13" y1="10" x2="13" y2="15" stroke="#fff" stroke-width="4"/><line x1="35" y1="10" x2="35" y2="15" stroke="#fff" stroke-width="4"/><path d="M19 11Q24 18 29 11" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.6"/>`);
    case 15: // MOMENTUM — triple kinetic speed chevrons
      return wrap(color, `<path d="M10 14L20 24L10 34M20 14L30 24L20 34M30 14L40 24L30 34" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    case 16: // ARMOR — layered geometric shield crest
      return wrap(color, `<path d="M24 7L39 13V24C39 33 32 39 24 42C16 39 9 33 9 24V13L24 7Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.3"/><path d="M24 14L33 18V24C33 29 29 33 24 35" stroke="#fff" stroke-opacity="0.75" stroke-width="1.6"/>`);
    case 17: // LUCK — 4-point prismatic star diamond
      return wrap(color, `<path d="M24 5L29 19L43 24L29 29L24 43L19 29L5 24L19 19Z" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="3" fill="#fff"/>`);
    case 18: // PRISM HEART — faceted crystalline heart
      return wrap(color, `<polygon points="24,41 8,24 14,11 24,17 34,11 40,24" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><polyline points="14,11 24,26 34,11" stroke="#fff" stroke-opacity="0.6" stroke-width="1.3"/>`);
    case 19: // PHASE STEP — ghosted blink dash silhouette
      return wrap(color, `<polygon points="12,18 18,24 12,30 6,24" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.8"/><polygon points="23,16 31,24 23,32 15,24" stroke="currentColor" stroke-opacity="0.65" stroke-width="2"/><polygon points="35,14 44,24 35,34 26,24" fill="currentColor" fill-opacity="0.32" stroke="#fff" stroke-width="2"/>`);
    case 20: // ARC — jagged chain lightning bolt
      return wrap(color, `<polyline points="28,6 15,24 25,24 19,42 35,21 25,21 28,6" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>`);
    case 21: // MINEFIELD — tri-prong faceted charge
      return wrap(color, `<polygon points="24,14 33,24 24,34 15,24" fill="currentColor" fill-opacity="0.35" stroke="#fff" stroke-width="1.8"/><path d="M24 6V14M38 32L31 28M10 32L17 28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="6" r="2.5" fill="currentColor"/><circle cx="38" cy="32" r="2.5" fill="currentColor"/><circle cx="10" cy="32" r="2.5" fill="currentColor"/>`);
    case 22: // LANCE — piercing heavy rail spear
      return wrap(color, `<line x1="6" y1="42" x2="38" y2="10" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><line x1="6" y1="42" x2="38" y2="10" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><polygon points="42,6 38,20 28,10" fill="#fff"/>`);
    default:
      return wrap(color, `<polygon points="24,6 40,15 40,33 24,42 8,33 8,15" stroke="currentColor" stroke-width="2.2"/>`);
  }
}

export function getEvolutionSvg(index: number, color: string): string {
  switch (index) {
    case 0: // AFTERIMAGE ENGINE
      return wrap(color, `<circle cx="14" cy="24" r="6" stroke="currentColor" stroke-opacity="0.4" stroke-width="2"/><circle cx="24" cy="24" r="8" stroke="currentColor" stroke-opacity="0.7" stroke-width="2"/><polygon points="36,12 44,24 36,36 28,24" fill="currentColor" fill-opacity="0.35" stroke="#fff" stroke-width="2"/>`);
    case 1: // WHITEOUT
      return wrap(color, `<path d="M24 4V44M4 24H44M10 10L38 38M38 10L10 38" stroke="currentColor" stroke-width="2.4"/><polygon points="24,13 35,24 24,35 13,24" fill="#fff" fill-opacity="0.35" stroke="#fff" stroke-width="2"/>`);
    case 2: // KALEIDOSCOPE
      return wrap(color, `<polygon points="24,5 40,14 40,34 24,43 8,34 8,14" stroke="currentColor" stroke-width="2.2"/><polygon points="24,11 36,33 12,33" stroke="#fff" stroke-width="1.8"/><polygon points="24,37 36,15 12,15" stroke="currentColor" stroke-width="1.8"/>`);
    case 3: // SINGULARITY
      return wrap(color, `<circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/><circle cx="24" cy="24" r="11" stroke="#fff" stroke-width="2"/><circle cx="24" cy="24" r="6" fill="#09041c" stroke="currentColor" stroke-width="2"/>`);
    default: // SOLAR CROWN
      return wrap(color, `<circle cx="24" cy="24" r="12" fill="currentColor" fill-opacity="0.3" stroke="#fff" stroke-width="2"/><path d="M24 4L27 12H21ZM44 24L36 27V21ZM24 44L21 36H27ZM4 24L12 21V27ZM38 10L34 17L30 13ZM10 10L18 13L14 17ZM38 38L30 35L34 31ZM10 38L14 31L18 35Z" fill="currentColor"/>`);
  }
}
