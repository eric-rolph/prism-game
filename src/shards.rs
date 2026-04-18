//! Shard system: the 10 light-operator upgrades the player collects.
//!
//! Shards fall into four trigger categories:
//!  - Fire-time modifiers (Split, Refract, Mirror, Chromatic, Lens) — the
//!    `compose_salvo` pipeline below threads through these in order.
//!  - Hit-time effect (Diffract) — applied in game.rs when a beam damages
//!    an enemy, producing secondary radial sub-beams.
//!  - Timing modifier (Echo) — queues delayed re-fires; handled in game.rs.
//!  - Passive / triggered effects (Halo, Cascade, Interference) — their own
//!    update code in game.rs.

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
}

pub const SHARD_COUNT: usize = 10;
pub const MAX_SHARD_LEVEL: u8 = 5;

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

    /// Three random shard kinds to offer at the next level-up. Each returned
    /// slot is `None` if fewer than three upgradable shards remain.
    pub fn roll_choices(&self, rng: &mut Rng) -> [Option<ShardKind>; 3] {
        let mut candidates: Vec<ShardKind> = (0..SHARD_COUNT as u8)
            .filter_map(ShardKind::from_index)
            .filter(|s| !self.is_maxed(*s))
            .collect();

        let mut result = [None, None, None];
        for slot in &mut result {
            if candidates.is_empty() {
                break;
            }
            let pick = (rng.next_u32() as usize) % candidates.len();
            *slot = Some(candidates.swap_remove(pick));
        }
        result
    }
}

/// A ready-to-fire beam with concrete world-space endpoints.
#[derive(Clone, Debug)]
pub struct BeamRequest {
    pub start: Vec2,
    pub end: Vec2,
    pub thickness: f32,
    pub damage: f32,
    pub color: [f32; 3],
}

const BEAM_REACH: f32 = 650.0;
const BEAM_THICKNESS: f32 = 2.8;
const BEAM_DAMAGE: f32 = 100.0;
const BEAM_COLOR: [f32; 3] = [0.55, 1.0, 1.0];

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

    // Stage 4: curve-fit each straight beam into a homing polyline.
    beams = apply_refract(&beams, enemies, inventory.level(ShardKind::Refract));

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
    let dmg_mult = 1.0 + 0.3 * level as f32;
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

fn apply_refract(beams: &[BeamRequest], enemies: &[Enemy], level: u8) -> Vec<BeamRequest> {
    if level == 0 {
        return beams.to_vec();
    }
    let segments = level as usize * 2; // 2, 4, 6, 8, 10
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
                    let blend = 0.35;
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
