//! Shard system: the 14 light-operator upgrades the player collects.
//!
//! Shards fall into five trigger categories:
//!  - Fire-time modifiers (Split, Refract, Mirror, Chromatic, Lens) — the
//!    `compose_salvo` pipeline below threads through these in order.
//!  - Hit-time effects (Diffract, Siphon, Frost) — applied in game.rs when
//!    a beam damages an enemy.
//!  - Timing modifier (Echo) — queues delayed re-fires; handled in game.rs.
//!  - Passive / triggered effects (Halo, Cascade, Interference) — their own
//!    update code in game.rs.
//!  - Defensive effects (Barrier, Thorns) — handled in game.rs.

use crate::entities::Enemy;
use crate::math::Rng;
use glam::Vec2;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ShardKind {
    Split = 0,
    Refract = 1,
    Mirror = 2,
    Chromatic = 3,
    Lens = 4,
    Diffract = 5,
    Echo = 6,
    Halo = 7,
    Cascade = 8,
    Interference = 9,
    Siphon = 10,
    Frost = 11,
    Barrier = 12,
    Thorns = 13,
    Magnet = 14,
    Momentum = 15,
}

pub const SHARD_COUNT: usize = 16;
pub const MAX_SHARD_LEVEL: u8 = 6;

impl ShardKind {
    pub fn from_index(i: u8) -> Option<Self> {
        match i {
            0 => Some(Self::Split),
            1 => Some(Self::Refract),
            2 => Some(Self::Mirror),
            3 => Some(Self::Chromatic),
            4 => Some(Self::Lens),
            5 => Some(Self::Diffract),
            6 => Some(Self::Echo),
            7 => Some(Self::Halo),
            8 => Some(Self::Cascade),
            9 => Some(Self::Interference),
            10 => Some(Self::Siphon),
            11 => Some(Self::Frost),
            12 => Some(Self::Barrier),
            13 => Some(Self::Thorns),
            14 => Some(Self::Magnet),
            15 => Some(Self::Momentum),
            _ => None,
        }
    }

    pub fn as_index(self) -> usize {
        self as usize
    }
}

#[derive(Default, Clone)]
pub struct Inventory {
    pub levels: [u8; SHARD_COUNT],
}

impl Inventory {
    pub fn level(&self, kind: ShardKind) -> u8 {
        self.levels[kind.as_index()]
    }

    pub fn upgrade(&mut self, kind: ShardKind) -> bool {
        let i = kind.as_index();
        if self.levels[i] < MAX_SHARD_LEVEL {
            self.levels[i] += 1;
            true
        } else {
            false
        }
    }

    pub fn is_maxed(&self, kind: ShardKind) -> bool {
        self.levels[kind.as_index()] >= MAX_SHARD_LEVEL
    }

    /// Three random shard kinds to offer at the next level-up. Defensive
    /// shards (Siphon, Barrier) are offered less frequently after level 2.
    /// At least one offensive shard is always included if possible.
    pub fn roll_choices(&self, rng: &mut Rng) -> [Option<ShardKind>; 3] {
        let defensive = [
            ShardKind::Siphon,
            ShardKind::Barrier,
            ShardKind::Frost,
            ShardKind::Thorns,
        ];

        let mut candidates: Vec<(ShardKind, f32)> = (0..SHARD_COUNT as u8)
            .filter_map(ShardKind::from_index)
            .filter(|s| !self.is_maxed(*s))
            .map(|s| {
                let weight = match s {
                    ShardKind::Siphon | ShardKind::Barrier => {
                        if self.levels[s.as_index()] >= 2 {
                            0.4
                        } else {
                            1.0
                        }
                    }
                    _ => 1.0,
                };
                (s, weight)
            })
            .collect();

        let mut result = [None, None, None];
        for slot in &mut result {
            if candidates.is_empty() {
                break;
            }
            let total: f32 = candidates.iter().map(|(_, w)| w).sum();
            if total <= 0.0 {
                break;
            }
            let mut roll = (rng.next_u32() as f64 / u32::MAX as f64) as f32 * total;
            let mut pick = 0;
            for (i, (_, w)) in candidates.iter().enumerate() {
                roll -= w;
                if roll <= 0.0 {
                    pick = i;
                    break;
                }
            }
            *slot = Some(candidates.swap_remove(pick).0);
        }

        // Guarantee at least one offensive option if all 3 are defensive.
        if result
            .iter()
            .filter_map(|r| *r)
            .all(|s| defensive.contains(&s))
        {
            let offensive: Vec<ShardKind> = (0..SHARD_COUNT as u8)
                .filter_map(ShardKind::from_index)
                .filter(|s| !self.is_maxed(*s) && !defensive.contains(s))
                .collect();
            if !offensive.is_empty() {
                let pick = (rng.next_u32() as usize) % offensive.len();
                result[0] = Some(offensive[pick]);
            }
        }

        result
    }

    /// Check if a synergy pair is active (both shards at level 3+).
    pub fn has_synergy(&self, a: ShardKind, b: ShardKind) -> bool {
        self.levels[a.as_index()] >= 3 && self.levels[b.as_index()] >= 3
    }

    /// Bitmask of fully active synergies (both shards at level 3+). Bit i
    /// corresponds to SYNERGIES[i].
    pub fn active_synergy_bits(&self) -> u32 {
        let mut bits = 0u32;
        for (i, &(a, b, _)) in SYNERGIES.iter().enumerate() {
            if self.has_synergy(a, b) {
                bits |= 1 << i;
            }
        }
        bits
    }

    /// Bitmask of near-active synergies: one shard is at 3+ and the other is
    /// owned (1+) but not yet enough to activate. Excludes already-active ones.
    pub fn near_synergy_bits(&self) -> u32 {
        let mut bits = 0u32;
        for (i, &(a, b, _)) in SYNERGIES.iter().enumerate() {
            if self.has_synergy(a, b) {
                continue;
            }
            let la = self.levels[a.as_index()];
            let lb = self.levels[b.as_index()];
            if (la >= 3 && lb >= 1) || (lb >= 3 && la >= 1) {
                bits |= 1 << i;
            }
        }
        bits
    }
}

/// Canonical synergy table: (shard_a, shard_b, name). Bit i in
/// `active_synergy_bits` / `near_synergy_bits` corresponds to entry i here.
/// Must stay in index-lock with SYNERGY_NAMES in web/src/main.ts.
pub const SYNERGIES: &[(ShardKind, ShardKind, &'static str)] = &[
    (ShardKind::Split, ShardKind::Cascade, "CHAIN REACTION"),
    (ShardKind::Split, ShardKind::Frost, "BLIZZARD"),
    (ShardKind::Mirror, ShardKind::Diffract, "SUPERNOVA"),
    (ShardKind::Lens, ShardKind::Chromatic, "PRISM CANNON"),
    (ShardKind::Refract, ShardKind::Echo, "TRACKING ECHO"),
    (ShardKind::Halo, ShardKind::Frost, "FROZEN ORBIT"),
    (ShardKind::Halo, ShardKind::Momentum, "EVENT HORIZON"),
    (ShardKind::Siphon, ShardKind::Thorns, "BLOOD PACT"),
    (ShardKind::Thorns, ShardKind::Cascade, "MARTYRDOM"),
    (ShardKind::Barrier, ShardKind::Interference, "RESONANCE"),
    (ShardKind::Magnet, ShardKind::Interference, "GRAVITY WELL"),
];

/// A ready-to-fire beam with concrete world-space endpoints.
#[derive(Clone, Debug)]
pub struct BeamRequest {
    pub start: Vec2,
    pub end: Vec2,
    pub thickness: f32,
    pub damage: f32,
    pub color: [f32; 3],
}

const BEAM_REACH: f32 = 450.0;
const BEAM_THICKNESS: f32 = 2.8;
const BEAM_DAMAGE: f32 = 40.0;
const BEAM_COLOR: [f32; 3] = [0.55, 1.0, 1.0];

/// Hard cap on beams per salvo to prevent combinatorial explosion.
const MAX_SALVO_BEAMS: usize = 48;

/// Build the full set of beams to fire this tick, given the player's position,
/// a target direction, the world (for refraction homing), and the inventory.
pub fn compose_salvo(
    player_pos: Vec2,
    target: Vec2,
    enemies: &[Enemy],
    inventory: &Inventory,
) -> Vec<BeamRequest> {
    let base_dir = (target - player_pos).normalize_or_zero();
    if base_dir.length_squared() < 1e-4 {
        return Vec::new();
    }

    // Stage 1: expand the direction set.
    let mut directions = vec![base_dir];
    directions = apply_mirror(&directions, inventory.level(ShardKind::Mirror));
    directions = apply_split(&directions, inventory.level(ShardKind::Split));

    // Cap directions before generating full beams.
    directions.truncate(MAX_SALVO_BEAMS);

    // Stage 2: concrete base beams.
    let mut beams: Vec<BeamRequest> = directions
        .iter()
        .map(|&d| BeamRequest {
            start: player_pos,
            end: player_pos + d * BEAM_REACH,
            thickness: BEAM_THICKNESS,
            damage: BEAM_DAMAGE,
            color: BEAM_COLOR,
        })
        .collect();

    // Stage 3: linear modifiers.
    apply_lens(&mut beams, inventory.level(ShardKind::Lens));
    apply_chromatic(&mut beams, inventory.level(ShardKind::Chromatic));

    // Synergy: PRISM CANNON (Lens+Chromatic 3+) — RGB beams deal +50% damage.
    if inventory.has_synergy(ShardKind::Lens, ShardKind::Chromatic) {
        for b in beams.iter_mut() {
            b.damage *= 1.5;
        }
    }

    // Stage 4: curve-fit each straight beam into a homing polyline.
    // Synergy: TRACKING ECHO (Refract+Echo 3+) — double homing blend.
    let homing_boost = inventory.has_synergy(ShardKind::Refract, ShardKind::Echo);
    beams = apply_refract(
        &beams,
        enemies,
        inventory.level(ShardKind::Refract),
        homing_boost,
    );

    // Final hard cap.
    beams.truncate(MAX_SALVO_BEAMS);

    beams
}

fn apply_mirror(dirs: &[Vec2], level: u8) -> Vec<Vec2> {
    if level == 0 {
        return dirs.to_vec();
    }
    // Doubling per level: 2, 4, 8, 16, 32 evenly spaced copies.
    let copies = 1usize << level as usize;
    let step = std::f32::consts::TAU / copies as f32;
    let mut out = Vec::with_capacity(dirs.len() * copies);
    for &d in dirs {
        let base = d.y.atan2(d.x);
        for i in 0..copies {
            let a = base + step * i as f32;
            out.push(Vec2::new(a.cos(), a.sin()));
        }
    }
    out
}

fn apply_split(dirs: &[Vec2], level: u8) -> Vec<Vec2> {
    if level == 0 {
        return dirs.to_vec();
    }
    // (2L+1) beams spread over 20°·L total.
    let n = 2 * level as i32 + 1;
    let spread = (std::f32::consts::PI / 9.0) * level as f32;
    let step = spread / (n - 1) as f32;
    let start = -spread * 0.5;
    let mut out = Vec::with_capacity(dirs.len() * n as usize);
    for &d in dirs {
        let base = d.y.atan2(d.x);
        for i in 0..n {
            let a = base + start + step * i as f32;
            out.push(Vec2::new(a.cos(), a.sin()));
        }
    }
    out
}

fn apply_lens(beams: &mut [BeamRequest], level: u8) {
    if level == 0 {
        return;
    }
    let thick_mult = 1.0 + 0.4 * level as f32;
    let dmg_mult = 1.0 + 0.2 * level as f32;
    for b in beams.iter_mut() {
        b.thickness *= thick_mult;
        b.damage *= dmg_mult;
    }
}

fn apply_chromatic(beams: &mut Vec<BeamRequest>, level: u8) {
    if level == 0 {
        return;
    }
    // Each beam refracts into R, G, B with angular separation and a slight
    // damage bonus from the "focusing" metaphor.
    let offset_rad = (1.6 * level as f32).to_radians();
    let dmg_mult = 1.0 + 0.15 * level as f32;

    let original = std::mem::take(beams);
    beams.reserve(original.len() * 3);
    for b in original {
        let delta = b.end - b.start;
        let base_a = delta.y.atan2(delta.x);
        let reach = delta.length();
        for &(angle_off, color) in &[
            (offset_rad, [1.0, 0.35, 0.4]),
            (0.0, [0.35, 1.0, 0.55]),
            (-offset_rad, [0.4, 0.6, 1.0]),
        ] {
            let a = base_a + angle_off;
            let dir = Vec2::new(a.cos(), a.sin());
            beams.push(BeamRequest {
                start: b.start,
                end: b.start + dir * reach,
                thickness: b.thickness,
                damage: b.damage * dmg_mult,
                color,
            });
        }
    }
}

fn apply_refract(
    beams: &[BeamRequest],
    enemies: &[Enemy],
    level: u8,
    homing_boost: bool,
) -> Vec<BeamRequest> {
    if level == 0 {
        return beams.to_vec();
    }
    let segments = level as usize * 2; // 2, 4, 6, 8, 10
    let blend = if homing_boost { 0.65 } else { 0.35 };
    let mut out = Vec::with_capacity(beams.len() * segments);
    for b in beams {
        let delta = b.end - b.start;
        let full_len = delta.length();
        if full_len < 1.0 {
            out.push(b.clone());
            continue;
        }
        let seg_len = full_len / segments as f32;
        let mut pos = b.start;
        let mut dir = delta / full_len;
        for _ in 0..segments {
            // Bias direction toward nearest enemy from the current head.
            if let Some(nearest) = nearest_enemy_pos(pos, enemies) {
                let to_enemy = (nearest - pos).normalize_or_zero();
                if to_enemy.length_squared() > 0.0 {
                    let mixed = dir * (1.0 - blend) + to_enemy * blend;
                    if mixed.length_squared() > 1e-6 {
                        dir = mixed.normalize();
                    }
                }
            }
            let end = pos + dir * seg_len;
            out.push(BeamRequest {
                start: pos,
                end,
                thickness: b.thickness,
                damage: b.damage,
                color: b.color,
            });
            pos = end;
        }
    }
    out
}

fn nearest_enemy_pos(from: Vec2, enemies: &[Enemy]) -> Option<Vec2> {
    enemies
        .iter()
        .map(|e| (e.pos, (e.pos - from).length_squared()))
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(p, _)| p)
}
