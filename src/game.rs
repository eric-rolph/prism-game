//! Game state and update logic.
//!
//! This step introduces the shard system. The update loop short-circuits
//! when the player is in the middle of a level-up choice (pause), so the
//! JS side can show a picker UI in response to `is_leveling_up()`.

use crate::entities::{
    Beam, Boss, BossKind, BossState, Crystal, Enemy, EnemyKind, EnemyState, FrostField,
    GhostProfile, Halo, InterferencePulse, MiniBossKind, Particle, Player, PrismCore,
    PrismObelisk, Projectile, PulseKind, VoidShell, VoidShockwave, XpGem, ENEMY_KIND_COUNT,
};

#[cfg(test)]
#[path = "game_tests.rs"]
mod game_tests;
use crate::math::Rng;
use crate::shards::{
    compose_salvo, BeamRequest, EvolutionKind, Inventory, OverclockKind, ShardKind, UpgradeOffer,
    SYNERGY_COUNT,
};
use crate::spatial::SpatialGrid;
use crate::{AimTargetInstance, BeamInstance, CircleInstance, DamagePopup};
use glam::{Vec2, Vec3};

const DAMAGE_SOURCE_COUNT: usize = 4;
const RANK_TIMELINE_BUCKETS: usize = 16; // minute buckets 0..15 for a 15-minute run.

const UPGRADE_PICK_SHARD: u8 = 0;
const UPGRADE_PICK_EVOLUTION: u8 = 1;
const UPGRADE_PICK_SKIP: u8 = 2;
const UPGRADE_PICK_OVERCLOCK: u8 = 3;

#[derive(Copy, Clone)]
enum DamageSource {
    EnemyContact = 0,
    Projectile = 1,
    BossContact = 2,
    VoidShockwave = 3,
}

impl DamageSource {
    fn as_index(self) -> usize {
        self as usize
    }
}

#[derive(Copy, Clone)]
struct UpgradePick {
    time: f32,
    offer_type: u8,
    offer_index: i32,
}

#[derive(Copy, Clone, PartialEq, Eq)]
enum AimDrillKind {
    Flick = 0,
    Track = 1,
    Micro = 2,
}

#[derive(Copy, Clone)]
struct AimTarget {
    pos: Vec2,
    radius: f32,
    kind: AimDrillKind,
    life: f32,
    max_life: f32,
    progress: f32,
    step: u32,
    total: u32,
    orbit_angle: f32,
    orbit_radius: f32,
    strafe_phase: f32,
    strafe_sign: f32,
    ghost_id: i32,
    golden: bool,
    warned: bool,
}

pub struct Game {
    time: f32,
    screen_size: Vec2,

    player: Player,
    enemies: Vec<Enemy>,
    beams: Vec<Beam>,
    particles: Vec<Particle>,
    halos: Vec<Halo>,
    pulses: Vec<InterferencePulse>,
    frost_fields: Vec<FrostField>,
    gems: Vec<XpGem>,
    projectiles: Vec<Projectile>,
    crystals: Vec<Crystal>,
    boss: Option<Boss>,

    input: Vec2,
    player_vel: Vec2,
    jump_timer: f32, // counts down from JUMP_DURATION; altitude = sin(t/T * π)
    dash_input: bool,
    overdrive_input: bool,
    prism_core: PrismCore,
    seed: u32,
    rng: Rng,

    fire_timer: f32,
    camera: Vec2,

    // Wave system.
    wave: u32,
    wave_timer: f32,
    spawn_timer: f32,
    wave_clear_timer: f32,
    crystal_spawn_timer: f32,

    // Progression.
    inventory: Inventory,
    xp: u32,
    rank: u32,
    kills_total: u32,

    pending_echoes: Vec<f32>,
    pending_afterimages: Vec<(f32, Vec2)>,
    interference_timer: f32,
    arc_timer: f32,
    mine_timer: f32,
    lance_timer: f32,

    // Level-up modal & Relic Chest state.
    leveling_up: bool,
    level_choices: [Option<UpgradeOffer>; 3],
    reroll_charges: u32,
    banish_charges: u32,
    relic_chest_active: bool,
    pending_relic_chests: u32,
    overclock_dmg_stacks: u32,
    overclock_cadence_stacks: u32,
    overclock_phase_stacks: u32,
    overclock_count: u32,

    // Death / game-over state.
    dead: bool,
    score: u32,

    halo_trail_timer: f32,
    wave_event_fired: bool,
    prism_cannon_timer: f32,
    lattice_spawned: bool,
    sentinel_spawned: bool,
    sovereign_spawned: bool,
    hydra_spawned: bool,
    eclipse_spawned: bool,
    void_prism_spawned: bool,
    void_victory: bool,
    boss_breather_timer: f32,
    mini_boss_timer: f32,
    boss_kills: u32,
    void_shockwaves: Vec<VoidShockwave>,
    void_shells: Vec<VoidShell>,
    obelisk: Option<PrismObelisk>,
    obelisk_timer: f32,
    obelisks_captured: u32,
    next_weaver_link_id: u32,

    // Run telemetry (reset on restart, read at death/victory).
    damage_taken: f32,
    barrier_absorbed: f32,
    gems_collected: u32,
    kills_by_kind: [u32; ENEMY_KIND_COUNT],
    peak_rank: u32,
    damage_by_source: [f32; DAMAGE_SOURCE_COUNT],
    death_cause: Option<DamageSource>,
    rank_timeline: [u32; RANK_TIMELINE_BUCKETS],
    upgrade_pick_order: Vec<UpgradePick>,
    skip_count: u32,
    reroll_count: u32,
    synergy_times: [f32; SYNERGY_COUNT],
    max_enemies_observed: u32,
    max_circles_observed: u32,
    max_beams_observed: u32,

    // Per-frame audio event counters — cleared at the top of every update().
    audio_beam_count: u32,
    audio_kill_count: u32,
    audio_gem_count: u32,
    audio_event_bits: u32,

    // Screen shake (accumulated amplitude, decays per frame).
    shake_amount: f32,
    shake_offset: Vec2,

    // Combat juice, combo streak, visual flashes & endless mode.
    kill_streak: u32,
    kill_streak_timer: f32,
    peak_kill_streak: u32,
    screen_flash: f32,
    damage_flash: f32,
    hit_stop_pulse: f32,
    total_damage_dealt: f32,
    endless_mode: bool,
    endless_boss_cycle: u32,
    next_endless_boss_time: f32,

    // Spatial hash grid for O(N) soft-separation & broadphase collision queries.
    spatial: SpatialGrid,

    // Hit-flash: list of enemy indices that were hit this frame (used by draw).
    hit_flash_positions: Vec<Vec2>,

    // Per-frame floating combat popups (world pos, value, kind), projected into popup_buf.
    raw_popups: Vec<(Vec2, f32, f32)>,
    popup_buf: Vec<DamagePopup>,

    // FPS Aim-Trainer ("Prism Focus") state & Resonance Nodes (only spawns once mouse/right-stick active).
    aim_screen_offset: Vec2,
    aim_active: bool,
    aim_clicked: bool,
    aim_held: bool,
    aim_fire_cooldown: f32,
    aim_drill_cooldown: f32,
    aim_next_drill: u32,
    aim_tier: u32,
    aim_tier_progress: i32,
    aim_combo: u32,
    peak_aim_combo: u32,
    aim_hits: u32,
    aim_shots: u32,
    aim_drills_completed: u32,
    aim_tracking_active: bool,
    aim_track_progress: f32,
    aim_hovering_target: bool,
    aim_last_hit_pos: Option<Vec2>,
    aim_targets: Vec<AimTarget>,
    aim_target_buf: Vec<AimTargetInstance>,
    // Cumulative Optical Mastery, Ghost Sniper Roster & RMB Dead-Eye Overdrive.
    optical_stacks: u32,
    ghost_duels_won: u32,
    ghost_snipes_taken: u32,
    overdrive_charge: f32,
    deadeye_timer: f32,
    deadeye_locks: Vec<Vec2>,
    ghost_profiles: Vec<GhostProfile>,
    active_ghost_id: i32,
    active_ghost_golden: bool,
    pending_sniper_echoes: Vec<(f32, Vec2, f32)>,
    spectral_salvo_counter: u32,

    // Draw buffers, rebuilt every frame.
    circle_buf: Vec<CircleInstance>,
    beam_buf: Vec<BeamInstance>,
}

// --- Tuning -------------------------------------------------------------

const PLAYER_SPEED: f32 = 340.0;
const PLAYER_RADIUS: f32 = 6.0;

const BEAM_LIFETIME: f32 = 0.14;
const BEAM_COOLDOWN: f32 = 0.20;

// Dash (scales significantly with PhaseStep + Momentum + PhaseBlade core!).
const DASH_DISTANCE: f32 = 125.0;
const DASH_DISTANCE_PER_PHASE: f32 = 32.0;
const DASH_DISTANCE_PER_MOMENTUM: f32 = 12.0;
const DASH_DURATION: f32 = 0.105;
const DASH_DURATION_PER_PHASE: f32 = 0.008;
const DASH_COOLDOWN: f32 = 3.0;
const DASH_BLAST_BASE_RADIUS: f32 = 96.0;
const DASH_BLAST_RADIUS_PER_PHASE: f32 = 11.0;
const DASH_BLAST_BASE_DAMAGE: f32 = 225.0;
const DASH_BLAST_DAMAGE_PER_MOMENTUM: f32 = 20.0;
const DASH_BLAST_PUSH: f32 = 260.0;
const DASH_BLAST_LIFETIME: f32 = 0.34;
const DASH_BLAST_BOSS_DAMAGE_MULT: f32 = 0.45;
const DEADEYE_DURATION: f32 = 3.2;
const DEADEYE_TIME_SCALE: f32 = 0.32;
const DEADEYE_MAX_LOCKS: usize = 6;
const OBELISK_FIRST_TIME: f32 = 75.0;
const OBELISK_INTERVAL: f32 = 95.0;
const OBELISK_RADIUS: f32 = 115.0;
const OBELISK_CAPTURE_TIME: f32 = 7.5;
const OBELISK_MAX_LIFE: f32 = 48.0;

// Wave system.
const WAVE_DURATION: f32 = 30.0;
const BASE_ENEMY_CAP: usize = 300;
const ENEMY_CAP_PER_WAVE: usize = 35;
const ENEMY_CAP_MULT_PER_WAVE_AFTER_5: f32 = 0.20;
const MAX_ENEMIES: usize = 5000;

// Opening on-ramp. A fresh run starts as a trickle and reaches full spawn
// pressure by ONRAMP_DURATION; the enemy cap stays small for the first three
// waves. Late-game pacing (the wave-shape rotation, rank pressure, overdrive)
// is untouched — every on-ramp term is inert past its window.
const ONRAMP_DURATION: f32 = 100.0; // seconds until spawn interval reaches steady state
const ONRAMP_INTERVAL_BOOST: f32 = 2.2; // spawn-interval multiplier at t = 0
const ONRAMP_CAP_BASE: usize = 80; // enemy cap during wave 0
const ONRAMP_CAP_PER_WAVE: usize = 75; // cap growth for waves 1-2; full cap at wave 3
const BASE_SPAWNS_PER_FRAME: u32 = 4;
const MAX_SPAWNS_PER_FRAME: u32 = 14;
const RANK_PRESSURE_START: u32 = 10;
const RANK_PRESSURE_END: u32 = 30;
const SESSION_LENGTH: f32 = 900.0; // 15 minutes
const OVERDRIVE_START: f32 = 600.0; // 10 minutes
const WAVE_CLEAR_BANNER_DURATION: f32 = 1.5;

const PARTICLE_COUNT_PER_DEATH: usize = 10;

// XP gems.
const GEM_MAGNET_RADIUS: f32 = 100.0;
const GEM_COLLECT_RADIUS: f32 = 16.0;
const GEM_MAGNET_SPEED: f32 = 400.0;
const GEM_LIFETIME: f32 = 20.0;
const GEM_VISUAL_RADIUS: f32 = 7.0; // Pickup readability is sacred — gems must pop.
// Player body renders larger than its hitbox: the hero of "you are light"
// needs presence, but the dodge hitbox stays forgiving.
const PLAYER_VISUAL_SCALE: f32 = 1.5;

// Player health.
const PLAYER_MAX_HP: f32 = 100.0;
const IFRAME_DURATION: f32 = 0.33;

// Passive shard scaling.
const ARMOR_DR_PER_LEVEL: f32 = 0.08; // up to 48% DR at L6
const PRISM_HEART_HP_PER_LEVEL: f32 = 15.0; // +15 max HP and instant heal per level
const PRISM_HEART_HEAL_MULT_PER_LEVEL: f32 = 0.10; // +10% level-up heal per level
const PHASE_STEP_IFRAME_PER_LEVEL: f32 = 0.12; // +0.12s i-frames per level during dash

// Screen shake.
const SHAKE_DEATH_PX: f32 = 3.5;
const SHAKE_HIT_PX: f32 = 5.0;
const SHAKE_DECAY: f32 = 12.0;

// Cascade chain-kill depth cap.
const CASCADE_MAX_DEPTH: u32 = 6;

// Emitter projectile.
const EMITTER_RANGE: f32 = 300.0;
const EMITTER_FIRE_INTERVAL: f32 = 1.6;
const PROJ_SPEED: f32 = 240.0;
const PROJ_DAMAGE: f32 = 10.0;
const PROJ_RADIUS: f32 = 4.0;
const PROJ_LIFETIME: f32 = 4.0;
const PULSAR_IDLE_RADIUS: f32 = 11.0;
const PULSAR_PULSE_RADIUS: f32 = 42.0;
const PULSAR_DRIFT_TIME: f32 = 2.4;
const PULSAR_PULSE_TIME: f32 = 0.85;
const UMBRA_WEAVE_FREQ: f32 = 3.2;
const UMBRA_WEAVE_SPEED: f32 = 48.0;
const ORBITER_MIN_RADIUS: f32 = 42.0;
const ORBITER_INWARD_SPEED_BASE: f32 = 9.0;
const ORBITER_INWARD_SPEED_PER_WAVE: f32 = 0.55;

// Crystal obstacles.
const MAX_CRYSTALS: usize = 6;
const CRYSTAL_SPAWN_INTERVAL: f32 = 45.0;

const BOSS_PROJ_SPEED: f32 = 210.0;
const BOSS_PROJ_DAMAGE: f32 = 28.0;
const BOSS_SHIELD_BURST_COUNT: u32 = 5;
// Boss HP is tuned per boss against the TTK evidence harness
// (src/game_tests.rs::boss_ttk_report; design band 20-45 s for an on-curve
// build at each milestone). The old blanket BOSS_HP_MULTIPLIER = 4.0 put the
// 5:00 Sentinel at ~171 s for a balanced 12-level build.
//
// Aura sources (Halo contact, Barrier contact, Interference pulses) deal
// AURA_BOSS_DAMAGE_MULT times their listed DPS to bosses only. Their flat
// contact numbers are tuned for crowds and amount to ~100-130 DPS combined,
// which can never finish a five-to-six-figure boss HP pool; the multiplier
// makes close-range builds a real boss archetype without touching how they
// clear regular enemies.
const AURA_BOSS_DAMAGE_MULT: f32 = 25.0;
const BOSS_REWARD_MULTIPLIER: u32 = 4;
const BOSS_REWARD_GEM_BASE_COUNT: u32 = 18;
const BOSS_ESCALATION_INTERVAL: f32 = 6.0;
const BOSS_ESCALATION_MAX_TIER: u32 = 8;
const BOSS_WEAPON_DAMAGE_RANK_MULT: f32 = 0.55;
const BOSS_WEAPON_DAMAGE_ESCALATION_MULT: f32 = 0.08;

// Audio event bits (per-frame, cleared at top of update).
pub const AUDIO_RANK_UP: u32 = 1 << 0;
pub const AUDIO_PLAYER_HIT: u32 = 1 << 1;
pub const AUDIO_BOSS_SPAWN: u32 = 1 << 2;
pub const AUDIO_BOSS_PHASE: u32 = 1 << 3;
pub const AUDIO_SHIELD_BREAK: u32 = 1 << 4;
pub const AUDIO_DASH_BLAST: u32 = 1 << 5;
pub const AUDIO_MINE_BURST: u32 = 1 << 6;
pub const AUDIO_STREAK_MILESTONE: u32 = 1 << 7;
pub const AUDIO_EVOLUTION: u32 = 1 << 8;
pub const AUDIO_AIM_HIT: u32 = 1 << 9;
pub const AUDIO_AIM_COMPLETE: u32 = 1 << 10;
pub const AUDIO_AIM_MISS: u32 = 1 << 11;
pub const AUDIO_GHOST_LOCK: u32 = 1 << 12;
pub const AUDIO_GHOST_SHOT: u32 = 1 << 13;
pub const AUDIO_DEADEYE_START: u32 = 1 << 14;
pub const AUDIO_DEADEYE_VOLLEY: u32 = 1 << 15;
pub const AUDIO_OBELISK_CAPTURE: u32 = 1 << 16;
pub const AUDIO_WEAKPOINT_CRIT: u32 = 1 << 17;

// GPU SDF shape identifiers packed into CircleInstance::shape.
const SHAPE_ORB: f32 = 0.0;
const SHAPE_DIAMOND: f32 = 1.0;
const SHAPE_HEX: f32 = 2.0;
const SHAPE_CHEVRON: f32 = 3.0;
const SHAPE_RING: f32 = 4.0;
const SHAPE_PRISM: f32 = 5.0;
const SHAPE_STAR: f32 = 6.0;

// Floating combat popup kinds.
const POPUP_NORMAL: f32 = 0.0;
const POPUP_CRIT: f32 = 1.0;
const POPUP_HEAL: f32 = 2.0;
const POPUP_BREAK: f32 = 3.0;
const MAX_POPUPS_PER_FRAME: usize = 48;
const KILL_STREAK_WINDOW: f32 = 3.4;
const ENEMY_SEPARATION_SPEED: f32 = 58.0;
const BOSS_CLEAR_RADIUS: f32 = 260.0;

// Boss milestones (6 distinct multi-phase bosses across a 15-minute run!).
const LATTICE_SPAWN_TIME: f32 = 150.0; // 2:30
const LATTICE_HP: f32 = 36_000.0;
const LATTICE_RADIUS: f32 = 42.0;
const LATTICE_SPOKE_LENGTH: f32 = 250.0;
const LATTICE_RELAY_DIST: f32 = 148.0;
const SENTINEL_SPAWN_TIME: f32 = 300.0; // 5:00
const SOVEREIGN_SPAWN_TIME: f32 = 450.0; // 7:30
const SOVEREIGN_HP: f32 = 155_000.0;
const SOVEREIGN_RADIUS: f32 = 34.0;
const SOVEREIGN_DECOY_ORBIT: f32 = 115.0;
const HYDRA_SPAWN_TIME: f32 = 600.0; // 10:00
const ECLIPSE_SPAWN_TIME: f32 = 750.0; // 12:30
const ECLIPSE_HP: f32 = 460_000.0;
const ECLIPSE_RADIUS: f32 = 48.0;
const HYDRA_HP_PER_LOBE: f32 = 100_000.0;
const HYDRA_ORBIT_RADIUS: f32 = 58.0;
const HYDRA_ORBIT_SPEED: f32 = 0.55;
const HYDRA_LOBE_RADIUS: f32 = 20.0;
const HYDRA_CONTACT_DAMAGE: f32 = 45.0;
const HYDRA_BODY_SPEED: f32 = 65.0;
const HYDRA_FIRE_INTERVAL: f32 = 1.3;
const HYDRA_LOBE_COLORS: [[f32; 3]; 3] = [[1.0, 0.22, 0.18], [0.18, 1.0, 0.32], [0.28, 0.52, 1.0]];
const HYDRA_LOBE_ADDS: [EnemyKind; 3] = [EnemyKind::Dasher, EnemyKind::Emitter, EnemyKind::Orbiter];
const BOSS_TELEGRAPH_TIME: f32 = 2.0;
const BOSS_DEATH_TIME: f32 = 1.0;
const BOSS_POST_BREATHER: f32 = 3.0;
const BOSS_SPAWN_SOFT_CAP: usize = 45;
const SENTINEL_HP: f32 = 62_000.0;
const SENTINEL_RADIUS: f32 = 46.0;
const SENTINEL_BASE_SPEED: f32 = 44.0;
const SENTINEL_SHIELD_HP: f32 = 4_400.0;
const SENTINEL_SHIELD_RADIUS: f32 = 12.0;
const SENTINEL_SHIELD_ORBIT: f32 = 72.0;
const SENTINEL_SHIELD_SPIN: f32 = 1.35;
const VOID_PRISM_SPAWN_TIME: f32 = 840.0; // 14:00 apex finale!
const VOID_PRISM_HP: f32 = 700_000.0;
const VOID_PRISM_RADIUS: f32 = 50.0;
const VOID_PRISM_BASE_SPEED: f32 = 34.0;
const VOID_PRISM_P2_SPEED: f32 = 55.0;
const VOID_PRISM_CONTACT_DAMAGE: f32 = 60.0;
const VOID_PRISM_P2_CONTACT_DAMAGE: f32 = 78.0;
const VOID_PRISM_SHOCKWAVE_INTERVAL_P1: f32 = 2.0;
const VOID_PRISM_SHOCKWAVE_INTERVAL_P2: f32 = 1.2;
const VOID_PRISM_SHOCKWAVE_MAX_RADIUS: f32 = 380.0;
const VOID_PRISM_SHOCKWAVE_DAMAGE: f32 = 30.0;
const VOID_PRISM_PULL_STRENGTH: f32 = 150.0;
const VOID_SHOCKWAVE_IFRAME_DURATION: f32 = 0.25;

// Traversable globe.
// World x/y coordinates are arc lengths on an equirectangular chart:
// x = longitude * radius, y = latitude * radius. Longitude wraps; crossing a
// pole reflects latitude and rotates longitude 180 degrees.
const GLOBE_RADIUS: f32 = 1200.0;
const CRYSTAL_FIRST_WAVE: u32 = 3;

fn globe_normal(pos: Vec2) -> Vec3 {
    let lon = pos.x / GLOBE_RADIUS;
    let lat = pos.y / GLOBE_RADIUS;
    let (sin_lon, cos_lon) = lon.sin_cos();
    let (sin_lat, cos_lat) = lat.sin_cos();
    Vec3::new(sin_lon * cos_lat, sin_lat, cos_lon * cos_lat).normalize_or_zero()
}

fn globe_basis(pos: Vec2) -> (Vec3, Vec3, Vec3) {
    let lon = pos.x / GLOBE_RADIUS;
    let lat = pos.y / GLOBE_RADIUS;
    let (sin_lon, cos_lon) = lon.sin_cos();
    let (sin_lat, cos_lat) = lat.sin_cos();
    let normal = Vec3::new(sin_lon * cos_lat, sin_lat, cos_lon * cos_lat).normalize_or_zero();
    let east = Vec3::new(cos_lon, 0.0, -sin_lon).normalize_or_zero();
    let north = Vec3::new(-sin_lon * sin_lat, cos_lat, -cos_lon * sin_lat).normalize_or_zero();
    (normal, east, north)
}

fn globe_pos_from_normal(normal: Vec3) -> Vec2 {
    let n = normal.normalize_or_zero();
    if n.length_squared() < 1e-8 {
        return Vec2::ZERO;
    }
    let lat = n.y.clamp(-1.0, 1.0).asin();
    let lon = n.x.atan2(n.z);
    Vec2::new(lon * GLOBE_RADIUS, lat * GLOBE_RADIUS)
}

fn nearest_globe_delta(from: Vec2, to: Vec2) -> Vec2 {
    let (normal, east, north) = globe_basis(from);
    let target = globe_normal(to);
    let dot = normal.dot(target).clamp(-1.0, 1.0);
    let angle = dot.acos();
    if angle < 1e-5 {
        return Vec2::ZERO;
    }

    let tangent = target - normal * dot;
    if tangent.length_squared() < 1e-8 {
        return Vec2::new(angle * GLOBE_RADIUS, 0.0);
    }

    let dir = tangent.normalize();
    Vec2::new(dir.dot(east), dir.dot(north)) * (angle * GLOBE_RADIUS)
}

fn nearest_globe_pos(reference: Vec2, pos: Vec2) -> Vec2 {
    reference + nearest_globe_delta(reference, pos)
}

fn globe_distance(a: Vec2, b: Vec2) -> f32 {
    nearest_globe_delta(a, b).length()
}

fn move_on_globe(pos: &mut Vec2, surface_delta: Vec2) {
    let distance = surface_delta.length();
    if distance < 1e-6 {
        return;
    }

    let (normal, east, north) = globe_basis(*pos);
    let tangent = east * surface_delta.x + north * surface_delta.y;
    if tangent.length_squared() < 1e-8 {
        return;
    }

    let theta = distance / GLOBE_RADIUS;
    let dir = tangent.normalize();
    let next = normal * theta.cos() + dir * theta.sin();
    *pos = globe_pos_from_normal(next);
}

fn tangent_point_on_globe(origin: Vec2, local_pos: Vec2) -> Vec2 {
    let mut pos = origin;
    move_on_globe(&mut pos, local_pos - origin);
    pos
}

fn tangent_endpoint_on_globe(start: Vec2, surface_delta: Vec2) -> Vec2 {
    let mut end = start;
    move_on_globe(&mut end, surface_delta);
    end
}

fn tangent_segment_on_globe(origin: Vec2, start: Vec2, end: Vec2) -> (Vec2, Vec2) {
    let globe_start = tangent_point_on_globe(origin, start);
    let globe_end = tangent_endpoint_on_globe(globe_start, end - start);
    (globe_start, globe_end)
}

/// Exact inverse of shader `projectGlobe(rel) = rel * sin(theta)/theta`.
fn unproject_globe_offset(screen_offset: Vec2) -> Vec2 {
    let r = screen_offset.length();
    if r < 1e-4 {
        return Vec2::ZERO;
    }
    let clamped = (r / GLOBE_RADIUS).min(0.985);
    let theta = clamped.asin();
    screen_offset * (theta * GLOBE_RADIUS / r)
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum WaveShape {
    Steady,
    Surge,
    Swarm,
    Elite,
    Crescendo,
}

// Per-type enemy stats: (radius, hp, speed, contact_damage, color)
fn enemy_stats(kind: EnemyKind, minute: f32) -> (f32, f32, f32, f32, [f32; 3]) {
    let overdrive = (minute - OVERDRIVE_START / 60.0).max(0.0);
    let hp_scale = (1.32_f32).powf(minute) * (1.0 + overdrive * overdrive * 0.015);
    let dmg_scale = 1.0 + minute * 0.10 + overdrive * 0.04;
    let spd_scale = 1.0 + minute * 0.035 + overdrive * 0.015;

    match kind {
        EnemyKind::Drone => (
            9.0,
            150.0 * hp_scale,
            100.0 * spd_scale,
            14.0 * dmg_scale,
            [1.00, 0.37, 0.48], // design: Grunt — hot pink-red
        ),
        EnemyKind::Brute => (
            22.0,
            1100.0 * hp_scale,
            52.0 * spd_scale,
            28.0 * dmg_scale,
            [1.00, 0.67, 0.33], // design: Bruiser — bright orange
        ),
        EnemyKind::Dasher => (
            7.0,
            110.0 * hp_scale,
            76.0 * spd_scale,
            20.0 * dmg_scale,
            [0.67, 0.40, 1.00], // design: Darter — bright violet
        ),
        EnemyKind::Splitter => (
            14.0,
            370.0 * hp_scale,
            82.0 * spd_scale,
            16.0 * dmg_scale,
            [0.40, 0.87, 1.00], // design: Tank — ice blue
        ),
        EnemyKind::Orbiter => (
            10.0,
            280.0 * hp_scale,
            124.0 * spd_scale,
            14.0 * dmg_scale,
            [0.95, 0.55, 0.15], // amber-orange (distinct from Brute)
        ),
        EnemyKind::Emitter => (
            11.0,
            230.0 * hp_scale,
            64.0 * spd_scale,
            10.0 * dmg_scale,
            [0.60, 0.35, 1.00], // bright purple (lighter than Dasher)
        ),
        EnemyKind::Pulsar => (
            PULSAR_IDLE_RADIUS,
            420.0 * hp_scale,
            46.0 * spd_scale,
            11.0 * dmg_scale,
            [0.97, 0.88, 0.22], // bright gold-yellow
        ),
        EnemyKind::Umbra => (
            8.0,
            190.0 * hp_scale,
            118.0 * spd_scale,
            20.0 * dmg_scale,
            [0.45, 0.15, 0.70], // dark violet (stealth)
        ),
        EnemyKind::Weaver => (
            10.5,
            290.0 * hp_scale,
            78.0 * spd_scale,
            16.0 * dmg_scale,
            [1.00, 0.36, 0.18], // blazing laser-tether coral-orange
        ),
        EnemyKind::Reflector => (
            15.5,
            640.0 * hp_scale,
            62.0 * spd_scale,
            22.0 * dmg_scale,
            [0.74, 0.94, 1.00], // chrome-mirror silver-cyan
        ),
        EnemyKind::Anchor => (
            14.0,
            520.0 * hp_scale,
            44.0 * spd_scale,
            14.0 * dmg_scale,
            [0.48, 0.32, 1.00], // deep gravity indigo
        ),
        EnemyKind::Stalker => (
            9.5,
            245.0 * hp_scale,
            112.0 * spd_scale,
            22.0 * dmg_scale,
            [0.92, 0.24, 0.92], // phase-blink neon magenta-violet
        ),
        EnemyKind::Carrier => (
            13.0,
            410.0 * hp_scale,
            138.0 * spd_scale,
            4.0 * dmg_scale,
            [1.00, 0.86, 0.24], // shimmering golden loot beetle
        ),
    }
}

fn xp_for_rank(rank: u32) -> u32 {
    8 + rank * 5 + (rank * rank * 3) / 2
}

fn default_ghost_profiles() -> Vec<GhostProfile> {
    vec![
        GhostProfile { id: 0, core: 0, style: 0, peak_rank: 34, aim_tier: 4, hue: 0.91 },
        GhostProfile { id: 1, core: 1, style: 1, peak_rank: 41, aim_tier: 6, hue: 0.86 },
        GhostProfile { id: 2, core: 3, style: 2, peak_rank: 38, aim_tier: 5, hue: 0.95 },
        GhostProfile { id: 3, core: 2, style: 0, peak_rank: 47, aim_tier: 7, hue: 0.89 },
        GhostProfile { id: 4, core: 0, style: 1, peak_rank: 29, aim_tier: 3, hue: 0.93 },
        GhostProfile { id: 5, core: 3, style: 2, peak_rank: 52, aim_tier: 8, hue: 0.84 },
        GhostProfile { id: 6, core: 1, style: 0, peak_rank: 44, aim_tier: 6, hue: 0.96 },
        GhostProfile { id: 7, core: 2, style: 1, peak_rank: 60, aim_tier: 9, hue: 0.88 },
    ]
}

fn make_boss_shell(kind: BossKind, pos: Vec2, radius: f32, hp: f32, speed: f32, contact_damage: f32) -> Boss {
    Boss {
        kind,
        pos,
        radius,
        hp,
        max_hp: hp,
        speed,
        contact_damage,
        state: BossState::Telegraphing,
        state_timer: BOSS_TELEGRAPH_TIME,
        active_time: 0.0,
        phase: 0,
        shield_angle: 0.0,
        shield_hp: [0.0; 3],
        lobe_hp: [0.0; 3],
        lobe_alive: [false; 3],
        lobe_orbit: 0.0,
        fire_timer: 1.4,
        spoke_angle: 0.0,
        spoke_disabled: [0.0; 6],
        aux_timer: 4.5,
        stun_timer: 0.0,
        weakpoint_angle: 0.0,
        weakpoint_cooldown: 0.0,
        aim_dir: Vec2::X,
        aim_charge: 0.0,
        decoy_angles: [2.094, 4.188],
        lunar_prisms: [(pos, false); 6],
    }
}

fn smoothstep01(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

// Shard-specific constants. Split / Mirror / Chromatic / Lens / Refract
// all live in the shards module; these are for the runtime-side shards.
const HALO_DPS: f32 = 38.0;

const INTERFERENCE_DPS: f32 = 60.0;
const INTERFERENCE_RING_THICKNESS: f32 = 12.0;

// Siphon: HP healed per beam hit (scaled by level).
const SIPHON_HEAL_PER_HIT: f32 = 1.0;
const SIPHON_MAX_HEAL_PER_SALVO: f32 = 8.0;

// Frost: slow duration per level.
const FROST_SLOW_DURATION: f32 = 1.2;
const FROST_SLOW_FACTOR: f32 = 0.4; // speed multiplier when frozen

// Barrier: shield HP per level, regen rate.
const BARRIER_HP_PER_LEVEL: f32 = 18.0;
const BARRIER_REGEN_PER_SEC: f32 = 2.0;
const BARRIER_CONTACT_DPS: f32 = 50.0;
const BARRIER_RADIUS: f32 = 50.0;

// Thorns: beams fired when taking damage.
const THORNS_BEAMS_PER_LEVEL: u8 = 3;
const THORNS_BEAM_REACH: f32 = 200.0;
const THORNS_BEAM_DAMAGE: f32 = 40.0;
const THORNS_BEAM_THICKNESS: f32 = 2.0;
const THORNS_BEAM_LIFETIME: f32 = 0.12;

const ECHO_DELAY: f32 = 0.08;
const AFTERIMAGE_ENGINE_DELAYS: [f32; 2] = [0.06, 0.16];
const AFTERIMAGE_ENGINE_PARTICLES: u32 = 14;
const MAGNET_RADIUS_PER_LEVEL: f32 = 45.0;
const MAGNET_SPEED_PER_LEVEL: f32 = 70.0;
const MOMENTUM_SPEED_PER_LEVEL: f32 = 2.12;
const MOMENTUM_DASH_REDUCTION_PER_LEVEL: f32 = 0.0375;

// Blizzard: frost field dropped on frozen enemy death.
const BLIZZARD_FIELD_RADIUS: f32 = 72.0;
const BLIZZARD_FIELD_LIFETIME: f32 = 2.8;
const MAX_FROST_FIELDS: usize = 12;
const WHITEOUT_FIELD_RADIUS: f32 = 108.0;
const WHITEOUT_FIELD_LIFETIME: f32 = 4.2;
const WHITEOUT_STARBURST_BEAMS: u8 = 8;
const WHITEOUT_STARBURST_REACH: f32 = 155.0;
const WHITEOUT_STARBURST_DAMAGE: f32 = 28.0;
const WHITEOUT_STARBURST_THICKNESS: f32 = 2.4;
const WHITEOUT_STARBURST_LIFETIME: f32 = 0.16;
const WHITEOUT_MAX_CHAIN_DEPTH: u32 = 3;

// Kaleidoscope: radial great-circle burst on every primary fire.
const KALEIDOSCOPE_BEAMS: usize = 12;
const KALEIDOSCOPE_REACH: f32 = 260.0;
const KALEIDOSCOPE_DAMAGE: f32 = 30.0;
const KALEIDOSCOPE_THICKNESS: f32 = 2.2;
const KALEIDOSCOPE_LIFETIME: f32 = 0.12;

// Singularity: Interference pulses become powerful gravity wells.
const SINGULARITY_PULL_MULT: f32 = 3.0;
const SINGULARITY_PULL_RANGE_BONUS: f32 = 180.0;
const SINGULARITY_DAMAGE_MULT: f32 = 1.75;

// Solar Crown: Halo contacts regen barrier; barrier hits flare halos.
const SOLAR_CROWN_BARRIER_REGEN_PER_CONTACT: f32 = 8.0;
const SOLAR_CROWN_FLARE_PARTICLES: u32 = 6;

const PRISM_CANNON_INTERVAL: f32 = 1.8;
const PRISM_CANNON_DAMAGE_MULT: f32 = 4.0;
const PRISM_CANNON_THICKNESS_MULT: f32 = 3.5;
const BLOOD_PACT_RANGE: f32 = 90.0;
const SPAWN_GRACE: f32 = 0.50;
const FROZEN_ORBIT_TRAIL_INTERVAL: f32 = 0.35;
const FROZEN_ORBIT_TRAIL_RADIUS: f32 = 28.0;
const FROZEN_ORBIT_TRAIL_LIFETIME: f32 = 1.2;

const DIFFRACT_MINI_DAMAGE: f32 = 35.0;
const DIFFRACT_MINI_REACH: f32 = 95.0;
const DIFFRACT_MINI_THICKNESS: f32 = 1.7;
const DIFFRACT_MINI_LIFETIME: f32 = 0.10;

const CASCADE_DAMAGE: f32 = 40.0;
const CASCADE_REACH: f32 = 130.0;
const CASCADE_THICKNESS: f32 = 2.0;
const CASCADE_LIFETIME: f32 = 0.14;

// --- Altitude ---

const MINI_BOSS_BASE_INTERVAL: f32 = 52.0;
const MINI_BOSS_MIN_INTERVAL: f32 = 24.0;
const MINI_BOSS_ACTIVE_CAP_LATE: usize = 2;
const MINI_BOSS_XP_BASE: u32 = 18;

// Extra weapon shards.
const ARC_BASE_INTERVAL: f32 = 1.15;
const ARC_CHAIN_RANGE: f32 = 240.0;
const ARC_BASE_DAMAGE: f32 = 34.0;
const ARC_DAMAGE_PER_LEVEL: f32 = 8.0;
const ARC_BEAM_LIFETIME: f32 = 0.10;
const ARC_BEAM_THICKNESS: f32 = 2.0;
const MINE_BASE_INTERVAL: f32 = 1.9;
const MINE_BASE_RADIUS: f32 = 130.0;
const MINE_RADIUS_GROWTH: f32 = 1.12;
const MINE_COUNT_GROWTH: f32 = 1.50;
const MINE_BASE_DAMAGE: f32 = 135.0;
const MINE_DAMAGE_GROWTH: f32 = 1.32;
const MINE_BASE_IMPULSE: f32 = 125.0;
const MINE_MAX_COUNT: u32 = 18;
const MINE_PULSE_LIFETIME: f32 = 0.55;
const MINE_TRIPWIRE_BASE_BEAMS: u32 = 6;
const MINE_TRIPWIRE_DAMAGE: f32 = 34.0;
const MINE_TRIPWIRE_REACH_MULT: f32 = 0.68;
const LANCE_BASE_INTERVAL: f32 = 2.9;
const LANCE_REACH: f32 = 620.0;
const LANCE_BASE_DAMAGE: f32 = 130.0;
const LANCE_DAMAGE_PER_LEVEL: f32 = 42.0;
const LANCE_THICKNESS: f32 = 5.0;

const POLAR_BOUNDARY_Y: f32 = GLOBE_RADIUS * 1.0; // |y| > this = polar zone

// Dash-jump arc. Every dash launches a brief hop; altitude = sin(t/T * π).
// Phase Step extends jump duration by 35% per level (up to ~2.4× at L6).
const JUMP_DURATION: f32 = 0.55;

// --- VoidShell ---
const VOID_SHELL_RADIUS: f32 = 11.0;
const VOID_SHELL_DESCENT_TIME: f32 = 2.5; // seconds to descend from alt 1.0 to 0.0
const VOID_SHELL_LAND_DAMAGE: f32 = 18.0; // area damage on landing
const VOID_SHELL_LAND_RADIUS_DAMAGE: f32 = 70.0; // player must be within this to take damage
const VOID_SHELL_INTERCEPT_ALTITUDE: f32 = 0.45; // player must be above this to intercept

fn is_polar_zone(pos: Vec2) -> bool {
    pos.y.abs() > POLAR_BOUNDARY_Y
}

fn weighted_pick<T: Copy>(pool: &[(T, u32)], rng: &mut Rng) -> Option<T> {
    let total: u32 = pool.iter().map(|p| p.1).sum();
    if total == 0 {
        return None;
    }
    let mut roll = rng.next_u32() % total;
    for &(kind, weight) in pool {
        if roll < weight {
            return Some(kind);
        }
        roll -= weight;
    }
    None
}

impl Game {
    pub fn new(w: f32, h: f32, seed: u32) -> Self {
        Self {
            time: 0.0,
            screen_size: Vec2::new(w.max(1.0), h.max(1.0)),
            player: Player {
                pos: Vec2::ZERO,
                radius: PLAYER_RADIUS,
                speed: PLAYER_SPEED,
                hp: PLAYER_MAX_HP,
                max_hp: PLAYER_MAX_HP,
                iframe_timer: 0.0,
                altitude: 0.0,
                dash_cooldown: 0.0,
                dash_timer: 0.0,
                dash_duration_active: DASH_DURATION,
                dash_distance_active: DASH_DISTANCE,
                dash_dir: Vec2::ZERO,
                barrier_hp: 0.0,
                barrier_max: 0.0,
            },
            enemies: Vec::with_capacity(256),
            beams: Vec::with_capacity(256),
            particles: Vec::with_capacity(1024),
            halos: Vec::new(),
            pulses: Vec::with_capacity(16),
            frost_fields: Vec::new(),
            gems: Vec::with_capacity(256),
            projectiles: Vec::with_capacity(64),
            crystals: Vec::new(),
            boss: None,
            input: Vec2::ZERO,
            player_vel: Vec2::ZERO,
            jump_timer: 0.0,
            dash_input: false,
            overdrive_input: false,
            prism_core: PrismCore::SniperLens,
            seed,
            rng: Rng::new(seed),
            fire_timer: 0.0,
            camera: Vec2::ZERO,
            wave: 0,
            wave_timer: 0.0,
            spawn_timer: 0.5,
            wave_clear_timer: 0.0,
            crystal_spawn_timer: CRYSTAL_SPAWN_INTERVAL,
            inventory: Inventory::default(),
            xp: 0,
            rank: 0,
            kills_total: 0,
            pending_echoes: Vec::new(),
            pending_afterimages: Vec::new(),
            interference_timer: 0.0,
            arc_timer: 0.0,
            mine_timer: 0.0,
            lance_timer: 0.0,
            leveling_up: false,
            level_choices: [None; 3],
            reroll_charges: 2,
            banish_charges: 2,
            relic_chest_active: false,
            pending_relic_chests: 0,
            overclock_dmg_stacks: 0,
            overclock_cadence_stacks: 0,
            overclock_phase_stacks: 0,
            overclock_count: 0,
            dead: false,
            score: 0,
            shake_amount: 0.0,
            shake_offset: Vec2::ZERO,
            kill_streak: 0,
            kill_streak_timer: 0.0,
            peak_kill_streak: 0,
            screen_flash: 0.0,
            damage_flash: 0.0,
            hit_stop_pulse: 0.0,
            total_damage_dealt: 0.0,
            endless_mode: false,
            endless_boss_cycle: 0,
            next_endless_boss_time: SESSION_LENGTH + 150.0,
            spatial: SpatialGrid::new(),
            hit_flash_positions: Vec::new(),
            raw_popups: Vec::with_capacity(MAX_POPUPS_PER_FRAME),
            popup_buf: Vec::with_capacity(MAX_POPUPS_PER_FRAME),
            aim_screen_offset: Vec2::ZERO,
            aim_active: false,
            aim_clicked: false,
            aim_held: false,
            aim_fire_cooldown: 0.0,
            aim_drill_cooldown: 1.4,
            aim_next_drill: 0,
            aim_tier: 1,
            aim_tier_progress: 0,
            aim_combo: 0,
            peak_aim_combo: 0,
            aim_hits: 0,
            aim_shots: 0,
            aim_drills_completed: 0,
            aim_tracking_active: false,
            aim_track_progress: 0.0,
            aim_hovering_target: false,
            aim_last_hit_pos: None,
            aim_targets: Vec::with_capacity(8),
            aim_target_buf: Vec::with_capacity(14),
            optical_stacks: 0,
            ghost_duels_won: 0,
            ghost_snipes_taken: 0,
            overdrive_charge: 0.0,
            deadeye_timer: 0.0,
            deadeye_locks: Vec::with_capacity(DEADEYE_MAX_LOCKS),
            ghost_profiles: default_ghost_profiles(),
            active_ghost_id: -1,
            active_ghost_golden: false,
            pending_sniper_echoes: Vec::new(),
            spectral_salvo_counter: 0,
            halo_trail_timer: 0.0,
            wave_event_fired: false,
            prism_cannon_timer: 0.0,
            damage_taken: 0.0,
            barrier_absorbed: 0.0,
            gems_collected: 0,
            kills_by_kind: [0; ENEMY_KIND_COUNT],
            peak_rank: 0,
            damage_by_source: [0.0; DAMAGE_SOURCE_COUNT],
            death_cause: None,
            rank_timeline: [0; RANK_TIMELINE_BUCKETS],
            upgrade_pick_order: Vec::new(),
            skip_count: 0,
            reroll_count: 0,
            synergy_times: [-1.0; SYNERGY_COUNT],
            max_enemies_observed: 0,
            max_circles_observed: 0,
            max_beams_observed: 0,
            audio_beam_count: 0,
            audio_kill_count: 0,
            audio_gem_count: 0,
            audio_event_bits: 0,
            lattice_spawned: false,
            sentinel_spawned: false,
            sovereign_spawned: false,
            hydra_spawned: false,
            eclipse_spawned: false,
            void_prism_spawned: false,
            void_victory: false,
            boss_breather_timer: 0.0,
            mini_boss_timer: MINI_BOSS_BASE_INTERVAL,
            boss_kills: 0,
            void_shockwaves: Vec::new(),
            void_shells: Vec::new(),
            obelisk: None,
            obelisk_timer: OBELISK_FIRST_TIME,
            obelisks_captured: 0,
            next_weaver_link_id: 1,
            circle_buf: Vec::with_capacity(1024),
            beam_buf: Vec::with_capacity(256),
        }
    }

    pub fn resize(&mut self, w: f32, h: f32) {
        self.screen_size = Vec2::new(w.max(1.0), h.max(1.0));
    }

    pub fn set_input(&mut self, x: f32, y: f32) {
        let v = Vec2::new(x, y);
        self.input = if v.length_squared() > 1.0 {
            v.normalize()
        } else {
            v
        };
    }

    pub fn set_dash_input(&mut self, pressed: bool) {
        self.dash_input = pressed;
    }

    pub fn set_overdrive_input(&mut self, pressed: bool) {
        if pressed {
            self.overdrive_input = true;
        }
    }

    pub fn set_prism_core(&mut self, core_idx: u8) {
        let core = PrismCore::from_index(core_idx);
        self.prism_core = core;
        // Apply starter loadout only on a fresh run (rank 0 & time == 0).
        if self.time < 0.05 && self.rank == 0 && self.inventory.levels.iter().all(|&l| l == 0) {
            match core {
                PrismCore::SniperLens => {
                    self.inventory.upgrade(ShardKind::Lens);
                    self.inventory.upgrade(ShardKind::Refract);
                }
                PrismCore::PhaseBlade => {
                    self.inventory.upgrade(ShardKind::PhaseStep);
                    self.inventory.upgrade(ShardKind::PhaseStep);
                    self.inventory.upgrade(ShardKind::Momentum);
                }
                PrismCore::RefractionNova => {
                    self.inventory.upgrade(ShardKind::Split);
                    self.inventory.upgrade(ShardKind::Mirror);
                }
                PrismCore::ResonanceConduit => {
                    self.inventory.upgrade(ShardKind::Cascade);
                    self.inventory.upgrade(ShardKind::Arc);
                    self.optical_stacks = self.optical_stacks.max(2);
                    self.reroll_charges = self.reroll_charges.max(3);
                    self.banish_charges = self.banish_charges.max(3);
                }
            }
        }
    }

    pub fn prism_core(&self) -> u8 {
        self.prism_core as u8
    }

    pub fn clear_ghost_profiles(&mut self) {
        self.ghost_profiles.clear();
    }

    pub fn register_ghost_profile(
        &mut self,
        id: u32,
        core: u8,
        style: u8,
        peak_rank: u32,
        aim_tier: u32,
        hue: f32,
    ) {
        self.ghost_profiles.push(GhostProfile {
            id,
            core: core.min(3),
            style: style % 3,
            peak_rank: peak_rank.clamp(1, 999),
            aim_tier: aim_tier.clamp(1, 10),
            hue: hue.rem_euclid(1.0),
        });
    }

    pub fn set_aim_input(
        &mut self,
        offset_x: f32,
        offset_y: f32,
        active: bool,
        clicked: bool,
        held: bool,
    ) {
        self.aim_screen_offset = Vec2::new(offset_x, offset_y);
        if active {
            self.aim_active = true;
        }
        if clicked {
            self.aim_clicked = true;
        }
        self.aim_held = held;
    }

    pub fn player_altitude(&self) -> f32 {
        self.player.altitude
    }

    pub fn dash_cooldown_pct(&self) -> f32 {
        (self.player.dash_cooldown / self.dash_cooldown_duration()).clamp(0.0, 1.0)
    }

    fn effective_player_speed(&self) -> f32 {
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        let phase_oc = 1.0 + self.overclock_phase_stacks as f32 * 0.14;
        self.player.speed * (1.0 + momentum * MOMENTUM_SPEED_PER_LEVEL) * phase_oc
    }

    pub fn dash_distance_px(&self) -> f32 {
        let phase = self.inventory.level(ShardKind::PhaseStep) as f32;
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        let core_mult = if self.prism_core == PrismCore::PhaseBlade {
            1.25
        } else {
            1.0
        };
        (DASH_DISTANCE
            + phase * DASH_DISTANCE_PER_PHASE
            + momentum * DASH_DISTANCE_PER_MOMENTUM
            + self.overclock_phase_stacks as f32 * 36.0)
            * core_mult
    }

    fn dash_duration_sec(&self) -> f32 {
        let phase = self.inventory.level(ShardKind::PhaseStep) as f32;
        DASH_DURATION + phase * DASH_DURATION_PER_PHASE
    }

    fn dash_cooldown_duration(&self) -> f32 {
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        let core_mult = if self.prism_core == PrismCore::PhaseBlade {
            0.85
        } else {
            1.0
        };
        DASH_COOLDOWN
            * (1.0 - momentum * MOMENTUM_DASH_REDUCTION_PER_LEVEL).max(0.50)
            * core_mult
    }

    pub fn optical_stacks(&self) -> u32 {
        self.optical_stacks
    }

    /// Permanent cumulative Optical Precision milestones unlocked during a run:
    /// bit 0 (3+):  WEAKPOINT SIGHT — Boss & Elite crit weakpoints illuminated (3× sniper DMG)
    /// bit 1 (7+):  PRISM RICOCHET — Sniper hits bounce to nearby enemies/boss weakpoints
    /// bit 2 (12+): PHASE REFUND — Counter-sniping Ghost Phantoms refunds 65–100% Dash cooldown
    /// bit 3 (20+): SPECTRAL OVERCLOCK — Every 4th auto-salvo fires a synced precision rail at cursor
    pub fn optical_perk_bits(&self) -> u32 {
        let mut bits = 0u32;
        if self.optical_stacks >= 3 {
            bits |= 1 << 0;
        }
        if self.optical_stacks >= 7 {
            bits |= 1 << 1;
        }
        if self.optical_stacks >= 12 {
            bits |= 1 << 2;
        }
        if self.optical_stacks >= 20 {
            bits |= 1 << 3;
        }
        bits
    }

    pub fn focus_multiplier(&self) -> f32 {
        (1.0 + (self.aim_combo.min(20) as f32) * 0.20).min(5.0)
    }

    pub fn global_damage_mult(&self) -> f32 {
        let optical = 1.0 + self.optical_stacks as f32 * 0.025;
        let overclock = 1.0 + self.overclock_dmg_stacks as f32 * 0.12;
        optical * overclock
    }

    pub fn global_crit_chance(&self) -> f32 {
        let core_bonus = if self.prism_core == PrismCore::SniperLens {
            0.08
        } else {
            0.0
        };
        (core_bonus + self.optical_stacks as f32 * 0.015).min(0.65)
    }

    pub fn effective_beam_cooldown(&self) -> f32 {
        let focus_boost = 1.0 + (self.focus_multiplier() - 1.0) * 0.105; // up to +42% fire rate at 5x Focus!
        let core_boost = if self.prism_core == PrismCore::RefractionNova {
            1.15
        } else {
            1.0
        };
        let oc_boost = 1.0 + self.overclock_cadence_stacks as f32 * 0.12;
        (BEAM_COOLDOWN / (focus_boost * core_boost * oc_boost)).max(0.085)
    }

    pub fn overdrive_charge(&self) -> f32 {
        self.overdrive_charge.clamp(0.0, 1.0)
    }

    pub fn deadeye_active(&self) -> bool {
        self.deadeye_timer > 0.0
    }

    pub fn deadeye_timer_pct(&self) -> f32 {
        (self.deadeye_timer / DEADEYE_DURATION).clamp(0.0, 1.0)
    }

    pub fn deadeye_locks_count(&self) -> u32 {
        self.deadeye_locks.len() as u32
    }

    pub fn ghost_duels_won(&self) -> u32 {
        self.ghost_duels_won
    }

    pub fn ghost_snipes_taken(&self) -> u32 {
        self.ghost_snipes_taken
    }

    pub fn active_ghost_id(&self) -> i32 {
        self.active_ghost_id
    }

    pub fn active_ghost_is_golden(&self) -> bool {
        self.active_ghost_golden
    }

    pub fn banish_charges(&self) -> u32 {
        self.banish_charges
    }

    pub fn relic_chest_active(&self) -> bool {
        self.relic_chest_active
    }

    pub fn overclock_count(&self) -> u32 {
        self.overclock_count
    }

    pub fn obelisk_active(&self) -> bool {
        self.obelisk.is_some()
    }

    pub fn obelisk_camera_pos(&self) -> Vec2 {
        self.obelisk
            .as_ref()
            .map(|o| nearest_globe_pos(self.camera, o.pos))
            .unwrap_or(self.camera)
    }

    pub fn obelisk_progress(&self) -> f32 {
        self.obelisk.as_ref().map(|o| o.progress).unwrap_or(0.0)
    }

    pub fn obelisks_captured(&self) -> u32 {
        self.obelisks_captured
    }

    fn gem_magnet_radius(&self) -> f32 {
        GEM_MAGNET_RADIUS + self.inventory.level(ShardKind::Magnet) as f32 * MAGNET_RADIUS_PER_LEVEL
    }

    fn gem_magnet_speed(&self) -> f32 {
        GEM_MAGNET_SPEED + self.inventory.level(ShardKind::Magnet) as f32 * MAGNET_SPEED_PER_LEVEL
    }

    pub fn wave_clear_timer(&self) -> f32 {
        self.wave_clear_timer
    }

    pub fn is_victory(&self) -> bool {
        self.dead && !self.endless_mode && (self.time >= SESSION_LENGTH || self.void_victory)
    }

    pub fn is_endless(&self) -> bool {
        self.endless_mode
    }

    pub fn continue_endless(&mut self) {
        if !self.is_victory() {
            return;
        }
        self.endless_mode = true;
        self.dead = false;
        self.void_victory = false;
        self.player.hp = self.player.max_hp;
        self.player.iframe_timer = 1.5;
        self.screen_flash = 0.85;
        self.next_endless_boss_time = self.time + 150.0;
        // Keep live HUD score current during the run.
        self.score = self.compute_score();

        self.build_draw_buffers();
    }

    pub fn boss_active(&self) -> bool {
        self.boss.is_some()
    }

    pub fn boss_kind_index(&self) -> i32 {
        match self.boss.as_ref().map(|b| b.kind) {
            Some(BossKind::Sentinel) => 0,
            Some(BossKind::Hydra) => 1,
            Some(BossKind::VoidPrism) => 2,
            Some(BossKind::PrismLattice) => 3,
            Some(BossKind::MirrorSovereign) => 4,
            Some(BossKind::ChronoEclipse) => 5,
            None => -1,
        }
    }

    pub fn boss_hp_pct(&self) -> f32 {
        self.boss
            .as_ref()
            .map(|b| (b.hp / b.max_hp).clamp(0.0, 1.0))
            .unwrap_or(0.0)
    }

    pub fn boss_camera_pos(&self) -> Vec2 {
        self.boss
            .as_ref()
            .map(|b| nearest_globe_pos(self.camera, b.pos))
            .unwrap_or(self.camera)
    }

    pub fn camera(&self) -> Vec2 {
        self.camera
    }
    pub fn circles(&self) -> &[CircleInstance] {
        &self.circle_buf
    }
    pub fn beams(&self) -> &[BeamInstance] {
        &self.beam_buf
    }
    pub fn popups(&self) -> &[DamagePopup] {
        &self.popup_buf
    }
    pub fn aim_targets(&self) -> &[AimTargetInstance] {
        &self.aim_target_buf
    }
    pub fn aim_tier(&self) -> u32 {
        self.aim_tier
    }
    pub fn aim_combo(&self) -> u32 {
        self.aim_combo
    }
    pub fn peak_aim_combo(&self) -> u32 {
        self.peak_aim_combo
    }
    pub fn aim_hits(&self) -> u32 {
        self.aim_hits
    }
    pub fn aim_shots(&self) -> u32 {
        self.aim_shots
    }
    pub fn aim_drills_completed(&self) -> u32 {
        self.aim_drills_completed
    }
    pub fn aim_tracking_active(&self) -> bool {
        self.aim_tracking_active
    }
    pub fn aim_track_progress(&self) -> f32 {
        self.aim_track_progress
    }
    pub fn aim_last_hit_camera_pos(&self) -> Vec2 {
        self.aim_last_hit_pos
            .map(|p| nearest_globe_pos(self.camera, p))
            .unwrap_or(self.camera)
    }
    pub fn aim_has_prev_link(&self) -> bool {
        self.aim_last_hit_pos.is_some()
            && self
                .aim_targets
                .iter()
                .any(|t| t.kind == AimDrillKind::Flick && t.step > 1)
    }
    pub fn aim_hovering_target(&self) -> bool {
        self.aim_hovering_target
    }
    pub fn kill_streak(&self) -> u32 {
        self.kill_streak
    }
    pub fn peak_kill_streak(&self) -> u32 {
        self.peak_kill_streak
    }
    pub fn kill_streak_timer_pct(&self) -> f32 {
        (self.kill_streak_timer / KILL_STREAK_WINDOW).clamp(0.0, 1.0)
    }
    pub fn screen_flash(&self) -> f32 {
        self.screen_flash
    }
    pub fn damage_flash(&self) -> f32 {
        self.damage_flash
    }
    pub fn hit_stop_pulse(&self) -> f32 {
        self.hit_stop_pulse
    }
    pub fn total_damage_dealt(&self) -> f32 {
        self.total_damage_dealt
    }
    pub fn enemy_count(&self) -> u32 {
        self.enemies.len() as u32
    }

    fn push_popup(&mut self, world_pos: Vec2, value: f32, kind: f32) {
        if value < 1.0 {
            return;
        }
        if self.raw_popups.len() < MAX_POPUPS_PER_FRAME {
            self.raw_popups.push((world_pos, value, kind));
        } else if kind > POPUP_NORMAL {
            if let Some(slot) = self
                .raw_popups
                .iter_mut()
                .find(|p| p.2 <= POPUP_NORMAL)
            {
                *slot = (world_pos, value, kind);
            }
        }
    }

    fn rebuild_spatial_grid(&mut self) {
        let origin = self.player.pos;
        let enemies = &self.enemies;
        self.spatial
            .rebuild(enemies.len(), |i| nearest_globe_delta(origin, enemies[i].pos));
    }

    fn separate_enemies(&mut self, dt: f32) {
        let count = self.enemies.len();
        if count < 2 {
            return;
        }
        // Soft separation keeps swarms flowing organically instead of collapsing to 1 pixel.
        // Capped at 6 local neighbors per enemy via spatial grid -> O(N) deterministic.
        let mut pushes = vec![Vec2::ZERO; count];
        for i in 0..count {
            let e = &self.enemies[i];
            if e.spawn_grace > 0.0 || e.state == EnemyState::Charging {
                continue;
            }
            let pi = self.spatial.local_pos(i);
            let ri = e.radius;
            let mut acc = Vec2::ZERO;
            self.spatial.visit_neighbors(i, 6, |j| {
                let pj = self.spatial.local_pos(j);
                let delta = pi - pj;
                let min_dist = (ri + self.enemies[j].radius) * 0.90;
                let dist_sq = delta.length_squared();
                if dist_sq < min_dist * min_dist {
                    let dir = if dist_sq > 1e-4 {
                        delta / dist_sq.sqrt()
                    } else if i > j {
                        Vec2::X
                    } else {
                        -Vec2::X
                    };
                    let overlap = (min_dist - dist_sq.sqrt()) / min_dist.max(1.0);
                    acc += dir * overlap;
                }
            });
            if acc.length_squared() > 1e-5 {
                let len = acc.length().min(1.5);
                pushes[i] = acc.normalize_or_zero() * (ENEMY_SEPARATION_SPEED * len * dt);
            }
        }
        for (i, push) in pushes.into_iter().enumerate() {
            if push.length_squared() > 1e-6 {
                move_on_globe(&mut self.enemies[i].pos, push);
            }
        }
    }

    /// Clears excess crowd density when a major boss materializes so the boss arena
    /// stays readable and beams aren't body-blocked by 1,000+ standing enemies.
    fn clear_boss_entrance_crowd(&mut self, boss_pos: Vec2) {
        let target_regular = BOSS_SPAWN_SOFT_CAP / 2;
        if self.enemies.len() > BOSS_SPAWN_SOFT_CAP {
            let player_pos = self.player.pos;
            let mut regular_indices: Vec<(usize, f32)> = self
                .enemies
                .iter()
                .enumerate()
                .filter(|(_, e)| e.mini_boss.is_none())
                .map(|(i, e)| (i, globe_distance(player_pos, e.pos)))
                .collect();
            if regular_indices.len() > target_regular {
                // Keep closest `target_regular` regular enemies (deterministic tie-break by index).
                regular_indices.sort_by(|a, b| {
                    a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0))
                });
                let mut keep = vec![true; self.enemies.len()];
                let mut dissolved_particles = 0usize;
                for &(idx, _) in &regular_indices[target_regular..] {
                    keep[idx] = false;
                    if dissolved_particles < 36 {
                        let pos = self.enemies[idx].pos;
                        let a = self.rng.angle();
                        self.particles.push(Particle {
                            pos,
                            vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(60.0, 180.0),
                            life: 0.0,
                            max_life: self.rng.range(0.25, 0.55),
                            color: [0.75, 0.55, 1.0],
                            size: self.rng.range(2.0, 4.5),
                        });
                        dissolved_particles += 1;
                    }
                }
                let mut i = 0usize;
                self.enemies.retain(|_| {
                    let k = keep[i];
                    i += 1;
                    k
                });
            }
        }

        // Radially push remaining non-miniboss enemies out of the boss telegraph zone.
        for e in &mut self.enemies {
            if e.mini_boss.is_some() {
                continue;
            }
            let delta = nearest_globe_delta(boss_pos, e.pos);
            let dist = delta.length();
            if dist < BOSS_CLEAR_RADIUS {
                let dir = if dist > 1e-3 {
                    delta / dist
                } else {
                    Vec2::X
                };
                move_on_globe(&mut e.pos, dir * (BOSS_CLEAR_RADIUS - dist + 24.0));
            }
        }

        // Dramatic visual arrival pulse + flash.
        self.pulses.push(InterferencePulse {
            pos: boss_pos,
            life: 0.0,
            max_life: 0.75,
            max_radius: BOSS_CLEAR_RADIUS * 1.15,
            kind: PulseKind::DashBlast,
            damage_multiplier: 0.0,
        });
        self.screen_flash = self.screen_flash.max(0.65);
        self.hit_stop_pulse = self.hit_stop_pulse.max(0.50);
    }

    fn maybe_spawn_endless_boss(&mut self) {
        if !self.endless_mode || self.boss.is_some() || self.time < self.next_endless_boss_time {
            return;
        }
        let cycle = self.endless_boss_cycle;
        self.endless_boss_cycle += 1;
        self.next_endless_boss_time = self.time + 150.0;
        let hp_scale = 1.35_f32.powi((cycle + 1) as i32);

        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.48);

        match cycle % 6 {
            0 => {
                let hp = LATTICE_HP * 10.0 * hp_scale;
                let mut b = make_boss_shell(BossKind::PrismLattice, pos, LATTICE_RADIUS, hp, 0.0, 0.0);
                b.spoke_angle = self.rng.angle();
                self.boss = Some(b);
            }
            1 => {
                let hp = SENTINEL_HP * 4.5 * hp_scale;
                let mut b = make_boss_shell(BossKind::Sentinel, pos, SENTINEL_RADIUS, hp, 0.0, 0.0);
                b.shield_angle = self.rng.angle();
                b.shield_hp = [SENTINEL_SHIELD_HP * 2.5 * hp_scale; 3];
                self.boss = Some(b);
            }
            2 => {
                let hp = SOVEREIGN_HP * 3.0 * hp_scale;
                let b = make_boss_shell(BossKind::MirrorSovereign, pos, SOVEREIGN_RADIUS, hp, 0.0, 0.0);
                self.boss = Some(b);
            }
            3 => {
                let lobe = HYDRA_HP_PER_LOBE * 2.2 * hp_scale;
                let total_hp = lobe * 3.0;
                let mut b = make_boss_shell(
                    BossKind::Hydra,
                    pos,
                    HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
                    total_hp,
                    HYDRA_BODY_SPEED * 1.15,
                    HYDRA_CONTACT_DAMAGE * 1.25,
                );
                b.lobe_hp = [lobe; 3];
                b.lobe_alive = [true; 3];
                b.lobe_orbit = self.rng.angle();
                b.fire_timer = HYDRA_FIRE_INTERVAL * 0.5;
                self.boss = Some(b);
            }
            4 => {
                let hp = ECLIPSE_HP * 1.6 * hp_scale;
                let b = make_boss_shell(BossKind::ChronoEclipse, pos, ECLIPSE_RADIUS, hp, 0.0, 0.0);
                self.boss = Some(b);
            }
            _ => {
                let hp = VOID_PRISM_HP * 1.15 * hp_scale;
                let mut b = make_boss_shell(BossKind::VoidPrism, pos, VOID_PRISM_RADIUS, hp, 0.0, 0.0);
                b.fire_timer = VOID_PRISM_SHOCKWAVE_INTERVAL_P1;
                self.boss = Some(b);
            }
        }
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 10.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    // Progression accessors (exposed to JS through lib.rs).
    pub fn xp(&self) -> u32 {
        self.xp
    }
    pub fn xp_needed(&self) -> u32 {
        xp_for_rank(self.rank + 1)
    }
    pub fn rank(&self) -> u32 {
        self.rank
    }
    pub fn kills_total(&self) -> u32 {
        self.kills_total
    }
    pub fn seed(&self) -> u32 {
        self.seed
    }
    pub fn is_leveling_up(&self) -> bool {
        self.leveling_up
    }
    pub fn is_dead(&self) -> bool {
        self.dead
    }
    pub fn hp(&self) -> f32 {
        self.player.hp
    }
    pub fn max_hp(&self) -> f32 {
        self.player.max_hp
    }
    pub fn barrier_hp(&self) -> f32 {
        self.player.barrier_hp
    }
    pub fn barrier_max(&self) -> f32 {
        self.player.barrier_max
    }
    pub fn score(&self) -> u32 {
        self.score
    }
    pub fn shake_x(&self) -> f32 {
        self.shake_offset.x
    }
    pub fn shake_y(&self) -> f32 {
        self.shake_offset.y
    }
    pub fn timer(&self) -> f32 {
        self.time
    }
    pub fn wave(&self) -> u32 {
        self.wave
    }
    pub fn arena_radius(&self) -> f32 {
        GLOBE_RADIUS
    }
    pub fn inventory_level(&self, kind_idx: u8) -> u8 {
        ShardKind::from_index(kind_idx)
            .map(|k| self.inventory.level(k))
            .unwrap_or(0)
    }
    pub fn active_synergy_bits(&self) -> u32 {
        self.inventory.active_synergy_bits()
    }
    pub fn near_synergy_bits(&self) -> u32 {
        self.inventory.near_synergy_bits()
    }
    pub fn active_evolution_bits(&self) -> u32 {
        self.inventory.active_evolution_bits()
    }
    pub fn level_choice_type(&self, slot: u8) -> i32 {
        if (slot as usize) >= 3 {
            return -1;
        }
        match self.level_choices[slot as usize] {
            Some(UpgradeOffer::Shard(_)) => 0,
            Some(UpgradeOffer::Evolution(_)) => 1,
            Some(UpgradeOffer::Overclock(_)) => 2,
            None => -1,
        }
    }
    pub fn level_choice(&self, slot: u8) -> i32 {
        if (slot as usize) >= 3 {
            return -1;
        }
        match self.level_choices[slot as usize] {
            Some(UpgradeOffer::Shard(k)) => k as i32,
            Some(UpgradeOffer::Evolution(e)) => e as i32,
            Some(UpgradeOffer::Overclock(o)) => o as i32,
            None => -1,
        }
    }

    fn apply_shard_level(&mut self, kind: ShardKind) {
        if !self.inventory.upgrade(kind) {
            return;
        }
        if kind == ShardKind::Halo {
            self.rebuild_halos();
        }
        if kind == ShardKind::Barrier {
            self.player.barrier_max =
                BARRIER_HP_PER_LEVEL * self.inventory.level(ShardKind::Barrier) as f32;
            self.player.barrier_hp = (self.player.barrier_hp + self.player.barrier_max * 0.5)
                .min(self.player.barrier_max);
        }
        if kind == ShardKind::PrismHeart {
            self.player.max_hp += PRISM_HEART_HP_PER_LEVEL;
            self.player.hp = (self.player.hp + PRISM_HEART_HP_PER_LEVEL).min(self.player.max_hp);
        }
        match kind {
            ShardKind::Arc => self.arc_timer = self.arc_timer.min(0.0),
            ShardKind::Minefield => self.mine_timer = self.mine_timer.min(0.0),
            ShardKind::Lance => self.lance_timer = self.lance_timer.min(0.0),
            _ => {}
        }
    }

    pub fn select_shard(&mut self, slot: u8) {
        if !self.leveling_up || (slot as usize) >= 3 {
            return;
        }
        if let Some(offer) = self.level_choices[slot as usize] {
            let is_relic = self.relic_chest_active;
            self.record_upgrade_pick(offer);
            match offer {
                UpgradeOffer::Shard(kind) => {
                    self.apply_shard_level(kind);
                    // Relic Chests grant DOUBLE shard levels + bonus reroll + full heal!
                    if is_relic {
                        self.apply_shard_level(kind);
                    }
                }
                UpgradeOffer::Evolution(evolution) => {
                    self.inventory.unlock_evolution(evolution);
                    self.spawn_evolution_particles(evolution);
                    self.audio_event_bits |= AUDIO_EVOLUTION;
                    self.screen_flash = self.screen_flash.max(0.75);
                }
                UpgradeOffer::Overclock(oc) => {
                    let stacks = if is_relic { 2 } else { 1 };
                    self.overclock_count += stacks;
                    match oc {
                        OverclockKind::PrismAmplify => self.overclock_dmg_stacks += stacks,
                        OverclockKind::CadenceBoost => self.overclock_cadence_stacks += stacks,
                        OverclockKind::HullAscension => {
                            self.player.max_hp += 30.0 * stacks as f32;
                            self.player.hp = self.player.max_hp;
                        }
                        OverclockKind::HyperPhase => self.overclock_phase_stacks += stacks,
                    }
                    self.audio_event_bits |= AUDIO_EVOLUTION;
                    self.screen_flash = self.screen_flash.max(0.55);
                }
            }
            if is_relic {
                self.player.hp = self.player.max_hp;
                self.reroll_charges += 1;
                self.banish_charges += 1;
                self.relic_chest_active = false;
            }
            self.record_new_synergies();
            self.leveling_up = false;
            self.level_choices = [None; 3];
            // A single on_death or Boss Relic Chest can trigger another modal.
            self.check_for_level_up();
        }
        // If slot was None (empty), do nothing — don't close the modal.
    }

    pub fn banish_level_choice(&mut self, slot: u8) {
        if !self.leveling_up || self.banish_charges == 0 || (slot as usize) >= 3 {
            return;
        }
        if let Some(UpgradeOffer::Shard(kind)) = self.level_choices[slot as usize] {
            if self.inventory.banish(kind) {
                self.banish_charges -= 1;
                // Immediately reroll fresh choices with that shard permanently banished!
                self.level_choices = self
                    .inventory
                    .roll_choices_with_overclock(&mut self.rng, self.endless_mode);
            }
        }
    }

    pub fn skip_level_up(&mut self) {
        if !self.leveling_up {
            return;
        }
        self.leveling_up = false;
        self.relic_chest_active = false;
        self.level_choices = [None; 3];
        self.record_skip_pick();
        let prism_heart = self.inventory.level(ShardKind::PrismHeart) as f32;
        let heal = 6.0 * (1.0 + prism_heart * PRISM_HEART_HEAL_MULT_PER_LEVEL);
        self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
        self.check_for_level_up();
    }

    pub fn reroll_level_up(&mut self) {
        if !self.leveling_up || self.reroll_charges == 0 {
            return;
        }
        self.reroll_charges -= 1;
        self.reroll_count += 1;
        self.level_choices = self
            .inventory
            .roll_choices_with_overclock(&mut self.rng, self.endless_mode);
    }

    pub fn reroll_charges(&self) -> u32 {
        self.reroll_charges
    }

    // Run telemetry accessors.
    pub fn damage_taken(&self) -> f32 {
        self.damage_taken
    }
    pub fn barrier_absorbed(&self) -> f32 {
        self.barrier_absorbed
    }
    pub fn gems_collected(&self) -> u32 {
        self.gems_collected
    }
    pub fn kills_by_kind(&self, kind_idx: u8) -> u32 {
        self.kills_by_kind
            .get(kind_idx as usize)
            .copied()
            .unwrap_or(0)
    }
    pub fn peak_rank(&self) -> u32 {
        self.peak_rank
    }
    pub fn boss_kills_count(&self) -> u32 {
        self.boss_kills
    }
    pub fn damage_by_source(&self, source_idx: u8) -> f32 {
        self.damage_by_source
            .get(source_idx as usize)
            .copied()
            .unwrap_or(0.0)
    }
    pub fn death_cause(&self) -> i32 {
        self.death_cause.map(|source| source as i32).unwrap_or(-1)
    }
    pub fn rank_at_minute(&self, minute_idx: u8) -> u32 {
        self.rank_timeline
            .get(minute_idx as usize)
            .copied()
            .unwrap_or(0)
    }
    pub fn upgrade_pick_count(&self) -> u32 {
        self.upgrade_pick_order.len() as u32
    }
    pub fn upgrade_pick_type(&self, pick_idx: u32) -> i32 {
        self.upgrade_pick_order
            .get(pick_idx as usize)
            .map(|p| p.offer_type as i32)
            .unwrap_or(-1)
    }
    pub fn upgrade_pick_index(&self, pick_idx: u32) -> i32 {
        self.upgrade_pick_order
            .get(pick_idx as usize)
            .map(|p| p.offer_index)
            .unwrap_or(-1)
    }
    pub fn upgrade_pick_time(&self, pick_idx: u32) -> f32 {
        self.upgrade_pick_order
            .get(pick_idx as usize)
            .map(|p| p.time)
            .unwrap_or(0.0)
    }
    pub fn skip_count(&self) -> u32 {
        self.skip_count
    }
    pub fn reroll_count(&self) -> u32 {
        self.reroll_count
    }
    pub fn synergy_time(&self, synergy_idx: u8) -> f32 {
        self.synergy_times
            .get(synergy_idx as usize)
            .copied()
            .unwrap_or(-1.0)
    }
    pub fn max_enemies_observed(&self) -> u32 {
        self.max_enemies_observed
    }
    pub fn max_circles_observed(&self) -> u32 {
        self.max_circles_observed
    }
    pub fn max_beams_observed(&self) -> u32 {
        self.max_beams_observed
    }

    // Audio event accessors — read after update() each frame.
    pub fn audio_beam_count(&self) -> u32 {
        self.audio_beam_count
    }
    pub fn audio_kill_count(&self) -> u32 {
        self.audio_kill_count
    }
    pub fn audio_gem_count(&self) -> u32 {
        self.audio_gem_count
    }
    pub fn audio_event_bits(&self) -> u32 {
        self.audio_event_bits
    }

    pub fn restart(&mut self) {
        let w = self.screen_size.x;
        let h = self.screen_size.y;
        let seed = self.rng.next_u32();
        let core = self.prism_core;
        let ghosts = self.ghost_profiles.clone();
        *self = Self::new(w, h, seed);
        self.ghost_profiles = ghosts;
        self.set_prism_core(core as u8);
    }

    fn record_upgrade_pick(&mut self, offer: UpgradeOffer) {
        let (offer_type, offer_index) = match offer {
            UpgradeOffer::Shard(kind) => (UPGRADE_PICK_SHARD, kind as i32),
            UpgradeOffer::Evolution(evolution) => (UPGRADE_PICK_EVOLUTION, evolution as i32),
            UpgradeOffer::Overclock(oc) => (UPGRADE_PICK_OVERCLOCK, oc as i32),
        };
        self.upgrade_pick_order.push(UpgradePick {
            time: self.time,
            offer_type,
            offer_index,
        });
    }

    fn record_skip_pick(&mut self) {
        self.skip_count += 1;
        self.upgrade_pick_order.push(UpgradePick {
            time: self.time,
            offer_type: UPGRADE_PICK_SKIP,
            offer_index: -1,
        });
    }

    fn record_new_synergies(&mut self) {
        let active_bits = self.inventory.active_synergy_bits();
        for i in 0..SYNERGY_COUNT {
            if ((active_bits >> i) & 1) == 1 && self.synergy_times[i] < 0.0 {
                self.synergy_times[i] = self.time;
            }
        }
    }

    fn record_rank_timeline(&mut self) {
        let minute = (self.time / 60.0).floor() as usize;
        let bucket = minute.min(RANK_TIMELINE_BUCKETS - 1);
        self.rank_timeline[bucket] = self.rank_timeline[bucket].max(self.rank);
    }

    // --- Main update ----------------------------------------------------

    pub fn update(&mut self, raw_dt: f32) {
        self.audio_beam_count = 0;
        self.audio_kill_count = 0;
        self.audio_gem_count = 0;
        self.audio_event_bits = 0;
        self.hit_stop_pulse = 0.0;

        if self.leveling_up || self.dead {
            self.raw_popups.clear();
            self.popup_buf.clear();
            return;
        }

        // RMB / Q Dead-Eye Overdrive trigger (when 100% charged; falls back cleanly to Dash otherwise).
        if self.overdrive_input {
            self.overdrive_input = false;
            if self.overdrive_charge >= 0.999 && self.deadeye_timer <= 0.0 {
                self.overdrive_charge = 0.0;
                self.deadeye_timer = DEADEYE_DURATION;
                self.deadeye_locks.clear();
                self.audio_event_bits |= AUDIO_DEADEYE_START;
                self.screen_flash = self.screen_flash.max(0.45);
                self.shake_amount = (self.shake_amount + 4.0).min(14.0);
            } else if self.player.dash_cooldown <= 0.0 {
                self.dash_input = true;
            }
        }

        let deadeye_was_active = self.deadeye_timer > 0.0;
        if self.deadeye_timer > 0.0 {
            self.deadeye_timer = (self.deadeye_timer - raw_dt).max(0.0);
        }
        // World time dilates smoothly during Prismatic Dead-Eye while aim cursor moves at full speed!
        let dt = if deadeye_was_active {
            raw_dt * DEADEYE_TIME_SCALE
        } else {
            raw_dt
        };

        self.time += dt;
        self.record_rank_timeline();
        self.hit_flash_positions.clear();
        self.raw_popups.clear();

        // Decay visual flashes & kill streak combo timer.
        self.screen_flash = (self.screen_flash - raw_dt * 2.6).max(0.0);
        self.damage_flash = (self.damage_flash - raw_dt * 3.2).max(0.0);
        if self.kill_streak_timer > 0.0 {
            self.kill_streak_timer = (self.kill_streak_timer - dt).max(0.0);
            if self.kill_streak_timer <= 0.0 {
                self.kill_streak = 0;
            }
        }

        // i-frame cooldown.
        if self.player.iframe_timer > 0.0 {
            self.player.iframe_timer -= dt;
        }

        // Dash cooldown.
        if self.player.dash_cooldown > 0.0 {
            self.player.dash_cooldown -= dt;
        }

        // Dash active — distance scales strongly with PhaseStep + Momentum + PhaseBlade core,
        // carving a luminous chromatic warp ribbon that slices enemies crossed!
        let prev_player_pos = self.player.pos;
        if self.player.dash_timer > 0.0 {
            self.player.dash_timer -= dt;
            let seg_start = self.player.pos;
            let dur = self.player.dash_duration_active.max(0.05);
            let speed = self.player.dash_distance_active / dur;
            move_on_globe(&mut self.player.pos, self.player.dash_dir * speed * dt);
            let seg_end = self.player.pos;

            // Chromatic Warp Ribbon beam + dash-through slicing damage!
            let phase_lvl = self.inventory.level(ShardKind::PhaseStep) as f32;
            let core_slice_mult = if self.prism_core == PrismCore::PhaseBlade {
                2.0
            } else {
                1.0
            };
            let slice_dmg = (95.0 + self.rank as f32 * 14.0 + phase_lvl * 38.0)
                * core_slice_mult
                * self.global_damage_mult();
            let slice_thick = 10.0 + phase_lvl * 2.2;
            self.beams.push(Beam {
                start: seg_start,
                end: seg_end,
                life: 0.0,
                max_life: 0.24 + phase_lvl * 0.03,
                thickness: slice_thick * 0.45,
                color: if self.prism_core == PrismCore::PhaseBlade {
                    [0.36, 1.0, 0.88]
                } else {
                    [0.52, 0.94, 1.0]
                },
                is_echo: false,
            });
            for e in &mut self.enemies {
                if e.hp > 0.0
                    && capsule_circle_intersect_globe(
                        seg_start,
                        seg_end,
                        slice_thick,
                        e.pos,
                        e.radius,
                    )
                {
                    e.hp -= slice_dmg;
                    self.total_damage_dealt += slice_dmg;
                    if e.kind == EnemyKind::Reflector {
                        e.shield_broken_timer = e.shield_broken_timer.max(3.5);
                    }
                    self.hit_flash_positions.push(e.pos);
                }
            }
        } else if self.dash_input && self.player.dash_cooldown <= 0.0 {
            // Start dash if there's a movement direction.
            let dir = if self.input.length_squared() > 0.01 {
                self.input.normalize()
            } else {
                Vec2::new(1.0, 0.0) // default right
            };
            let phase_step = self.inventory.level(ShardKind::PhaseStep);
            let dash_start_pos = self.player.pos;
            let dash_dist = self.dash_distance_px();
            let dash_dur = self.dash_duration_sec();
            self.player.dash_dir = dir;
            self.player.dash_distance_active = dash_dist;
            self.player.dash_duration_active = dash_dur;
            self.player.dash_timer = dash_dur;
            self.player.dash_cooldown = self.dash_cooldown_duration();
            self.player.iframe_timer =
                dash_dur + phase_step as f32 * PHASE_STEP_IFRAME_PER_LEVEL;
            // Every dash launches a jump arc; Phase Step extends hang time.
            let phase_step_lvl = self.inventory.level(ShardKind::PhaseStep) as f32;
            self.jump_timer = JUMP_DURATION * (1.0 + phase_step_lvl * 0.35);
            self.emit_dash_blast(dash_start_pos, dir);
            // Phase Step L3+: leave a brief particle afterimage at the start position.
            if phase_step >= 3 {
                for _ in 0..8 {
                    let a = self.rng.angle();
                    self.particles.push(Particle {
                        pos: dash_start_pos,
                        vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(30.0, 90.0),
                        life: 0.0,
                        max_life: 0.32,
                        color: [0.55, 1.0, 0.85],
                        size: self.rng.range(2.5, 5.0),
                    });
                }
            }
            if self
                .inventory
                .has_evolution(EvolutionKind::AfterimageEngine)
            {
                for delay in AFTERIMAGE_ENGINE_DELAYS {
                    self.pending_afterimages
                        .push((self.time + delay, dash_start_pos));
                }
                for _ in 0..AFTERIMAGE_ENGINE_PARTICLES {
                    let a = self.rng.angle();
                    self.particles.push(Particle {
                        pos: dash_start_pos,
                        vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(45.0, 150.0),
                        life: 0.0,
                        max_life: 0.42,
                        color: [1.0, 0.72, 0.36],
                        size: self.rng.range(3.0, 6.5),
                    });
                }
            }
        }
        self.dash_input = false; // consume

        // Screen shake decay.
        self.shake_amount *= (1.0 - SHAKE_DECAY * dt).max(0.0);
        if self.shake_amount > 0.1 {
            let ax = self.rng.range(-1.0, 1.0) * self.shake_amount;
            let ay = self.rng.range(-1.0, 1.0) * self.shake_amount;
            self.shake_offset = Vec2::new(ax, ay);
        } else {
            self.shake_amount = 0.0;
            self.shake_offset = Vec2::ZERO;
        }

        // Movement (suppressed during dash).
        if self.player.dash_timer <= 0.0 {
            let player_step = self.input * self.effective_player_speed() * dt;
            move_on_globe(&mut self.player.pos, player_step);
        }
        if dt > 1e-4 {
            let inst_vel = nearest_globe_delta(prev_player_pos, self.player.pos) / dt;
            self.player_vel = self.player_vel * 0.8 + inst_vel * 0.2;
        }
        self.camera = self.player.pos;

        // --- Jump arc (triggered by dash) ---
        let was_airborne = self.player.altitude > 0.1;
        if self.jump_timer > 0.0 {
            self.jump_timer = (self.jump_timer - dt).max(0.0);
            let phase_step_lvl = self.inventory.level(ShardKind::PhaseStep) as f32;
            let arc_duration = JUMP_DURATION * (1.0 + phase_step_lvl * 0.35);
            let t = self.jump_timer / arc_duration;
            self.player.altitude = (t * std::f32::consts::PI).sin();
        } else {
            self.player.altitude = 0.0;
        }
        // Landing: brief dust ring when touching back down.
        if was_airborne && self.player.altitude <= 0.05 {
            for _ in 0..7 {
                let a = self.rng.angle();
                self.particles.push(Particle {
                    pos: self.player.pos,
                    vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(35.0, 100.0),
                    life: 0.0,
                    max_life: self.rng.range(0.10, 0.20),
                    color: [0.65, 0.82, 1.0],
                    size: self.rng.range(1.2, 3.0),
                });
            }
        }

        // Wave clear banner timer.
        if self.wave_clear_timer > 0.0 {
            self.wave_clear_timer -= dt;
        }

        // Wave system with adaptive breather.
        self.wave_timer += dt;
        let wave_shape = self.wave_shape();
        let breather = self.breather_for_shape(wave_shape);
        if self.wave_timer >= WAVE_DURATION + breather {
            self.wave_timer = 0.0;
            self.wave += 1;
            self.wave_clear_timer = WAVE_CLEAR_BANNER_DURATION;
            self.wave_event_fired = false;
            self.maybe_fire_wave_event();
        }
        let in_breather = self.wave_timer > WAVE_DURATION;

        if self.boss_breather_timer > 0.0 {
            self.boss_breather_timer = (self.boss_breather_timer - dt).max(0.0);
        }
        self.maybe_spawn_lattice();
        self.maybe_spawn_sentinel();
        self.maybe_spawn_sovereign();
        self.maybe_spawn_hydra();
        self.maybe_spawn_eclipse();
        self.maybe_spawn_void_prism();
        self.maybe_spawn_endless_boss();
        self.update_boss(dt);
        self.update_void_shockwaves(dt);
        self.update_obelisk(dt);

        // Spawn enemies (wave-based).
        let enemy_cap = self.enemy_cap_for_wave();
        self.update_rank_minibosses(dt, enemy_cap);
        let boss_spawn_limited = self.boss.is_some() && self.enemies.len() >= BOSS_SPAWN_SOFT_CAP;
        if !in_breather
            && self.boss_breather_timer <= 0.0
            && !boss_spawn_limited
            && self.enemies.len() < enemy_cap
        {
            self.spawn_timer -= dt;
            let mut spawned = 0;
            while self.spawn_timer <= 0.0
                && self.enemies.len() < enemy_cap
                && !(self.boss.is_some() && self.enemies.len() >= BOSS_SPAWN_SOFT_CAP)
                && spawned < self.max_spawns_per_frame()
            {
                self.spawn_wave_enemy();
                let rate = self.spawn_rate_for_wave();
                self.spawn_timer += rate;
                spawned += 1;
            }
        }

        // Enemy AI.
        let player_pos = self.player.pos;
        let minute = self.time / 60.0;
        let void_pull_pos: Option<Vec2> = self.boss.as_ref().and_then(|b| {
            (b.kind == BossKind::VoidPrism && b.state == BossState::Active && b.phase >= 1)
                .then_some(b.pos)
        });
        let mut new_void_shells: Vec<VoidShell> = Vec::new();
        let mut gravity_wells: Vec<Vec2> = Vec::new();
        let mut weaver_links: Vec<(u32, Vec2)> = Vec::new();
        let player_vel_snap = self.player_vel;
        for e in &mut self.enemies {
            if e.spawn_grace > 0.0 {
                e.spawn_grace = (e.spawn_grace - dt).max(0.0);
            }
            // Frost slow, Chromatic Prism Mark, and Reflector broken-shield decay.
            if e.slow_timer > 0.0 {
                e.slow_timer -= dt;
            }
            if e.prism_mark_timer > 0.0 {
                e.prism_mark_timer = (e.prism_mark_timer - dt).max(0.0);
            }
            if e.shield_broken_timer > 0.0 {
                e.shield_broken_timer = (e.shield_broken_timer - dt).max(0.0);
            }
            let speed_mult = if e.slow_timer > 0.0 {
                FROST_SLOW_FACTOR
            } else {
                1.0
            };
            match e.state {
                EnemyState::Drifting => {
                    let to_player = nearest_globe_delta(e.pos, player_pos);
                    let dir = to_player.normalize_or_zero();

                    match e.kind {
                        EnemyKind::Orbiter => {
                            let catch_radius = if e.charge_dir.x > 10.0 {
                                e.charge_dir.x + 18.0
                            } else {
                                150.0
                            };
                            if to_player.length() < catch_radius {
                                e.state = EnemyState::Orbiting;
                                e.state_timer = 0.0;
                            } else {
                                move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            }
                        }
                        EnemyKind::Dasher => {
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            if to_player.length() < 250.0 {
                                e.state = EnemyState::Telegraphing;
                                // Telegraph shortens late-game: 0.45s base, 0.35s after wave 10.
                                let telegraph = if self.wave >= 10 { 0.35 } else { 0.45 };
                                e.state_timer = telegraph;
                                e.charge_dir = dir;
                            }
                        }
                        EnemyKind::Emitter => {
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            if to_player.length() < EMITTER_RANGE {
                                e.state = EnemyState::Shooting;
                                e.state_timer = EMITTER_FIRE_INTERVAL;
                            }
                        }
                        EnemyKind::Pulsar => {
                            e.state_timer += dt;
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            if e.state_timer >= PULSAR_DRIFT_TIME {
                                e.state = EnemyState::Pulsing;
                                e.state_timer = PULSAR_PULSE_TIME;
                                e.radius = PULSAR_IDLE_RADIUS;
                            }
                        }
                        EnemyKind::Umbra => {
                            e.state_timer += dt;
                            let perp = Vec2::new(-dir.y, dir.x);
                            let weave =
                                perp * (e.state_timer * UMBRA_WEAVE_FREQ).sin() * UMBRA_WEAVE_SPEED;
                            move_on_globe(&mut e.pos, (dir * e.speed + weave) * speed_mult * dt);
                        }
                        EnemyKind::Reflector => {
                            // Tracks player with frontal mirror shield facing dir (stored in charge_dir).
                            e.charge_dir = dir;
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                        }
                        EnemyKind::Anchor => {
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            if to_player.length() < 210.0 {
                                e.state = EnemyState::Anchored;
                                e.state_timer = 0.0;
                            }
                        }
                        EnemyKind::Stalker => {
                            e.state_timer += dt;
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                            if e.state_timer >= 2.6 && to_player.length() < 340.0 && to_player.length() > 80.0 {
                                e.state = EnemyState::Blinking;
                                e.state_timer = 0.65;
                                // Predict 135 px ahead of the player's current movement vector!
                                let lead = if player_vel_snap.length_squared() > 900.0 {
                                    player_vel_snap.normalize() * 135.0
                                } else {
                                    -dir * 110.0
                                };
                                e.charge_dir = tangent_endpoint_on_globe(player_pos, lead);
                            }
                        }
                        EnemyKind::Carrier => {
                            e.state = EnemyState::Fleeing;
                            e.state_timer = 10.5;
                            let perp = Vec2::new(-dir.y, dir.x);
                            e.charge_dir = (perp * 0.85 - dir * 0.5).normalize_or_zero();
                        }
                        EnemyKind::Weaver => {
                            // Gently sweeps across the arena while holding its laser tether partner.
                            e.state_timer += dt;
                            let perp = Vec2::new(-dir.y, dir.x);
                            let sweep = perp * (e.state_timer * 1.1).sin() * 34.0;
                            move_on_globe(&mut e.pos, (dir * e.speed + sweep) * speed_mult * dt);
                            if e.link_id > 0 {
                                weaver_links.push((e.link_id, e.pos));
                            }
                        }
                        _ => {
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                        }
                    }
                }
                EnemyState::Blinking => {
                    e.state_timer -= dt;
                    if e.state_timer <= 0.0 {
                        e.pos = e.charge_dir;
                        e.state = EnemyState::Charging;
                        e.state_timer = 0.34;
                        e.charge_dir = nearest_globe_delta(e.pos, player_pos).normalize_or_zero();
                    }
                }
                EnemyState::Anchored => {
                    e.state_timer += dt;
                    gravity_wells.push(e.pos);
                    if globe_distance(e.pos, player_pos) > 300.0 {
                        e.state = EnemyState::Drifting;
                    }
                }
                EnemyState::Fleeing => {
                    e.state_timer -= dt;
                    let from_player = nearest_globe_delta(player_pos, e.pos).normalize_or_zero();
                    let tang = Vec2::new(-from_player.y, from_player.x);
                    let flee_dir = (e.charge_dir * 0.55 + from_player * 0.45 + tang * 0.35).normalize_or_zero();
                    move_on_globe(&mut e.pos, flee_dir * e.speed * speed_mult * dt);
                    if e.state_timer <= 0.0 {
                        e.no_xp = true;
                        e.hp = 0.0; // Escaped!
                    }
                }
                EnemyState::Telegraphing => {
                    e.state_timer -= dt;
                    if e.state_timer <= 0.0 {
                        e.state = EnemyState::Charging;
                        e.state_timer = 0.4;
                    }
                }
                EnemyState::Charging => {
                    move_on_globe(&mut e.pos, e.charge_dir * 320.0 * speed_mult * dt);
                    e.state_timer -= dt;
                    if e.state_timer <= 0.0 {
                        e.state = EnemyState::Drifting;
                    }
                }
                EnemyState::Orbiting => {
                    e.state_timer += dt;
                    // Orbit radius stored in charge_dir.x (set at spawn).
                    let min_radius = (ORBITER_MIN_RADIUS - self.wave as f32 * 0.20)
                        .max(self.player.radius + 22.0);
                    let collapse_speed = ORBITER_INWARD_SPEED_BASE
                        + self.wave as f32 * ORBITER_INWARD_SPEED_PER_WAVE;
                    if e.charge_dir.x > min_radius {
                        e.charge_dir.x =
                            (e.charge_dir.x - collapse_speed * speed_mult * dt).max(min_radius);
                    }
                    let orbit_radius = if e.charge_dir.x > 10.0 {
                        e.charge_dir.x
                    } else {
                        100.0
                    };
                    let spin_sign = if e.charge_dir.y < 0.0 { -1.0 } else { 1.0 };
                    let angle_speed =
                        (1.45 + (160.0 - orbit_radius).max(0.0) * 0.010) * speed_mult * spin_sign;
                    let from_player = nearest_globe_delta(player_pos, e.pos);
                    let base_angle = from_player.y.atan2(from_player.x);
                    let angle = base_angle + angle_speed * dt;
                    e.pos = player_pos;
                    move_on_globe(
                        &mut e.pos,
                        Vec2::new(angle.cos(), angle.sin()) * orbit_radius,
                    );
                }
                EnemyState::Shooting => {
                    let to_player = nearest_globe_delta(e.pos, player_pos);
                    // Drift away if player gets too close.
                    if to_player.length() < EMITTER_RANGE * 0.5 {
                        let away = -to_player.normalize_or_zero();
                        move_on_globe(&mut e.pos, away * e.speed * 0.5 * dt);
                    }
                    // Fire projectiles on timer.
                    e.state_timer -= dt;
                    if e.state_timer <= 0.0 {
                        e.state_timer = EMITTER_FIRE_INTERVAL;
                        // Mark for projectile spawn (charge_dir as aim).
                        e.charge_dir = to_player.normalize_or_zero();
                    }
                    // If player moves out of range, go back to drifting.
                    if to_player.length() > EMITTER_RANGE * 1.5 {
                        e.state = EnemyState::Drifting;
                    }
                }
                EnemyState::Pulsing => {
                    e.state_timer -= dt;
                    let t = (1.0 - e.state_timer / PULSAR_PULSE_TIME).clamp(0.0, 1.0);
                    let pulse = if t < 0.55 { t / 0.55 } else { (1.0 - t) / 0.45 }.clamp(0.0, 1.0);
                    let (_, _, _, base_damage, _) = enemy_stats(EnemyKind::Pulsar, minute);
                    e.radius =
                        PULSAR_IDLE_RADIUS + (PULSAR_PULSE_RADIUS - PULSAR_IDLE_RADIUS) * pulse;
                    e.contact_damage = base_damage * (1.0 + pulse * 1.4);
                    if e.state_timer <= 0.0 {
                        e.state = EnemyState::Drifting;
                        e.state_timer = 0.0;
                        e.radius = PULSAR_IDLE_RADIUS;
                        e.contact_damage = base_damage;
                        // Spawn a VoidShell targeting the player (or near-polar redirect).
                        let shell_target = if !is_polar_zone(player_pos) {
                            player_pos
                        } else {
                            Vec2::new(player_pos.x, player_pos.y.signum() * POLAR_BOUNDARY_Y * 0.9)
                        };
                        new_void_shells.push(VoidShell {
                            pos: e.pos,
                            target: shell_target,
                            altitude: 1.0,
                            radius: VOID_SHELL_RADIUS,
                            descent_speed: 1.0 / VOID_SHELL_DESCENT_TIME,
                        });
                    }
                }
            }
            // Void Prism gravitational pull — all enemies drawn toward boss center.
            if let Some(vp_pos) = void_pull_pos {
                let delta = nearest_globe_delta(e.pos, vp_pos);
                if delta.length() > VOID_PRISM_RADIUS + e.radius {
                    let pull_dir = delta.normalize_or_zero();
                    move_on_globe(&mut e.pos, pull_dir * VOID_PRISM_PULL_STRENGTH * dt);
                }
            }
        }

        // Anchor Gravity Wells: gently pull player & nearby XP gems inward!
        for well_pos in &gravity_wells {
            let to_well = nearest_globe_delta(self.player.pos, *well_pos);
            let dist = to_well.length();
            if dist > 18.0 && dist < 155.0 && self.player.dash_timer <= 0.0 {
                let pull = (1.0 - dist / 155.0) * 115.0;
                move_on_globe(&mut self.player.pos, to_well.normalize_or_zero() * pull * dt);
                self.camera = self.player.pos;
            }
            for g in &mut self.gems {
                let gd = nearest_globe_delta(g.pos, *well_pos);
                let l = gd.length();
                if l > 12.0 && l < 155.0 {
                    move_on_globe(&mut g.pos, gd.normalize_or_zero() * 90.0 * dt);
                }
            }
        }

        // Weaver Laser Tether Wire check (can be cleanly jumped/dashed over!).
        if weaver_links.len() >= 2 && self.player.iframe_timer <= 0.0 && self.player.altitude < 0.14 {
            let mut wire_hit = false;
            for i in 0..weaver_links.len() {
                for j in (i + 1)..weaver_links.len() {
                    if weaver_links[i].0 == weaver_links[j].0 {
                        let a = weaver_links[i].1;
                        let b = weaver_links[j].1;
                        if globe_distance(a, b) < 280.0
                            && capsule_circle_intersect_globe(a, b, 3.5, self.player.pos, self.player.radius)
                        {
                            wire_hit = true;
                            break;
                        }
                    }
                }
                if wire_hit {
                    break;
                }
            }
            if wire_hit {
                self.apply_damage_to_player(16.0, DamageSource::Projectile);
                self.player.iframe_timer = IFRAME_DURATION;
                self.shake_amount += SHAKE_HIT_PX;
            }
        }

        // Spatial-grid O(N) soft separation so swarms flow like liquid geometry.
        self.rebuild_spatial_grid();
        self.separate_enemies(dt);
        self.rebuild_spatial_grid();

        // Cap simultaneous VoidShell mortar zones so late-game Pulsar swarms stay readable.
        const MAX_VOID_SHELLS: usize = 12;
        for shell in new_void_shells {
            if self.void_shells.len() < MAX_VOID_SHELLS {
                self.void_shells.push(shell);
            }
        }

        // --- VoidShell update ---
        for s in &mut self.void_shells {
            s.altitude -= s.descent_speed * dt;
        }
        let (landed, active): (Vec<VoidShell>, Vec<VoidShell>) =
            self.void_shells.drain(..).partition(|s| s.altitude <= 0.0);
        self.void_shells = active;

        for s in landed {
            // Area damage to player.
            if self.player.iframe_timer <= 0.0
                && globe_distance(self.player.pos, s.target) < VOID_SHELL_LAND_RADIUS_DAMAGE
            {
                let armor = self.inventory.level(ShardKind::Armor) as f32;
                let dmg = VOID_SHELL_LAND_DAMAGE * (1.0 - armor * ARMOR_DR_PER_LEVEL).max(0.0);
                self.player.hp -= dmg;
                self.player.iframe_timer = IFRAME_DURATION;
                self.shake_amount = SHAKE_HIT_PX;
                self.damage_taken += dmg;
                self.damage_by_source[DamageSource::Projectile.as_index()] += dmg;
                if self.player.hp <= 0.0 && self.death_cause.is_none() {
                    self.death_cause = Some(DamageSource::Projectile);
                }
            }
            // Spawn landing particles.
            for _ in 0..12 {
                let a = self.rng.angle();
                self.particles.push(Particle {
                    pos: s.target,
                    vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(80.0, 220.0),
                    life: 0.0,
                    max_life: self.rng.range(0.3, 0.7),
                    color: [0.3, 0.05, 0.6],
                    size: self.rng.range(2.0, 5.0),
                });
            }
            self.shake_amount = (self.shake_amount + 3.0).min(10.0);
        }

        // VoidShell beam interception (player must be at altitude).
        if self.player.altitude >= VOID_SHELL_INTERCEPT_ALTITUDE && !self.void_shells.is_empty() {
            let beam_segments: Vec<(Vec2, Vec2, f32)> = self
                .beams
                .iter()
                .map(|b| (b.start, b.end, b.thickness))
                .collect();
            let mut intercepted: Vec<usize> = Vec::new();
            for (si, shell) in self.void_shells.iter().enumerate() {
                let hit = beam_segments.iter().any(|(bstart, bend, bthick)| {
                    capsule_circle_intersect_globe(
                        *bstart,
                        *bend,
                        bthick * 0.5,
                        shell.pos,
                        shell.radius * (2.0 - shell.altitude),
                    )
                });
                if hit {
                    intercepted.push(si);
                }
            }
            for si in intercepted.iter().rev() {
                let shell = self.void_shells.remove(*si);
                for _ in 0..16 {
                    let a = self.rng.angle();
                    self.particles.push(Particle {
                        pos: shell.pos,
                        vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(100.0, 300.0),
                        life: 0.0,
                        max_life: self.rng.range(0.25, 0.55),
                        color: [0.9, 0.7, 1.0],
                        size: self.rng.range(3.0, 7.0),
                    });
                }
                self.shake_amount = (self.shake_amount + 2.5).min(8.0);
                self.audio_kill_count += 1;
            }
        }

        // Spawn emitter projectiles (separate pass to avoid borrow conflict).
        let mut new_projectiles: Vec<Projectile> = Vec::new();
        for e in &self.enemies {
            if e.kind == EnemyKind::Emitter && e.state == EnemyState::Shooting {
                // Fire when timer just reset (within dt tolerance).
                if e.state_timer >= EMITTER_FIRE_INTERVAL - dt * 1.1 {
                    let shots = if e.mini_boss == Some(MiniBossKind::Riftcaller) {
                        3
                    } else {
                        1
                    };
                    let base_angle = e.charge_dir.y.atan2(e.charge_dir.x);
                    let half_spread = (shots - 1) as f32 * 0.5;
                    for shot in 0..shots {
                        let angle = base_angle + (shot as f32 - half_spread) * 0.20;
                        let dir = Vec2::new(angle.cos(), angle.sin());
                        let mini_mult = if e.mini_boss == Some(MiniBossKind::Riftcaller) {
                            1.45
                        } else {
                            1.0
                        };
                        new_projectiles.push(Projectile {
                            pos: e.pos,
                            vel: dir * PROJ_SPEED,
                            life: 0.0,
                            damage: PROJ_DAMAGE * mini_mult,
                            radius: PROJ_RADIUS * mini_mult.sqrt(),
                        });
                    }
                }
            }
        }
        self.projectiles.extend(new_projectiles);

        // Update projectiles on the wrapped globe.
        for p in &mut self.projectiles {
            move_on_globe(&mut p.pos, p.vel * dt);
            p.life += dt;
        }
        // Projectile-player collision.
        if self.player.iframe_timer <= 0.0 {
            let mut proj_damage = 0.0_f32;
            for p in &mut self.projectiles {
                if p.life < PROJ_LIFETIME
                    && globe_distance(p.pos, self.player.pos) < p.radius + self.player.radius
                {
                    proj_damage = p.damage;
                    p.life = PROJ_LIFETIME; // mark for removal
                    break;
                }
            }
            if proj_damage > 0.0 {
                self.apply_damage_to_player(proj_damage, DamageSource::Projectile);
                self.player.iframe_timer = IFRAME_DURATION;
                self.shake_amount += SHAKE_HIT_PX;
            }
        }
        // Projectile-crystal collision (projectiles die on crystals).
        for p in &mut self.projectiles {
            for c in &self.crystals {
                if globe_distance(p.pos, c.pos) < PROJ_RADIUS + c.radius {
                    p.life = PROJ_LIFETIME;
                }
            }
        }
        self.projectiles.retain(|p| p.life < PROJ_LIFETIME);

        // Crystal obstacles.
        if self.wave >= CRYSTAL_FIRST_WAVE && self.crystals.len() < MAX_CRYSTALS {
            self.crystal_spawn_timer -= dt;
            if self.crystal_spawn_timer <= 0.0 {
                self.crystal_spawn_timer = CRYSTAL_SPAWN_INTERVAL;
                let spawn_radius = self.screen_size.length() * 0.6;
                let angle = self.rng.angle();
                let mut pos = self.player.pos;
                move_on_globe(&mut pos, Vec2::new(angle.cos(), angle.sin()) * spawn_radius);
                let radius = self.rng.range(35.0, 70.0);
                let drift_angle = self.rng.angle();
                let drift_speed = self.rng.range(15.0, 25.0);
                self.crystals.push(Crystal {
                    pos,
                    radius,
                    drift_vel: Vec2::new(drift_angle.cos(), drift_angle.sin()) * drift_speed,
                });
            }
        }
        for c in &mut self.crystals {
            move_on_globe(&mut c.pos, c.drift_vel * dt);
        }
        // Crystal-player collision (push player out).
        for c in &self.crystals {
            let to_player = nearest_globe_delta(c.pos, self.player.pos);
            let dist = to_player.length();
            if dist < c.radius + self.player.radius {
                let push = to_player.normalize_or_zero() * (c.radius + self.player.radius - dist);
                move_on_globe(&mut self.player.pos, push);
            }
        }
        // Crystal-enemy collision (Dashers crash and take damage, others push away).
        for c in &self.crystals {
            for e in &mut self.enemies {
                let to_enemy = nearest_globe_delta(c.pos, e.pos);
                let dist = to_enemy.length();
                if dist < c.radius + e.radius {
                    if e.kind == EnemyKind::Dasher && e.state == EnemyState::Charging {
                        e.hp -= 50.0;
                        e.state = EnemyState::Drifting;
                    }
                    let push = to_enemy.normalize_or_zero() * (c.radius + e.radius - dist);
                    move_on_globe(&mut e.pos, push);
                }
            }
        }

        // Enemy contact damage to player (checked BEFORE beams fire so enemies that
        // reach the player aren't killed before they can deal damage).
        if self.player.iframe_timer <= 0.0 {
            let mut contact_dmg = 0.0_f32;
            for e in &self.enemies {
                if e.hp <= 0.0 || e.spawn_grace > 0.0 {
                    continue;
                }
                let dist = globe_distance(e.pos, self.player.pos);
                if dist < e.radius + self.player.radius {
                    contact_dmg = e.contact_damage;
                    break;
                }
            }
            if contact_dmg > 0.0 {
                self.apply_damage_to_player(contact_dmg, DamageSource::EnemyContact);
                self.player.iframe_timer = IFRAME_DURATION;
                self.shake_amount += SHAKE_HIT_PX;
            }
        }
        if self.player.iframe_timer <= 0.0 {
            if let Some(boss) = &self.boss {
                if boss.state == BossState::Active {
                    let hit = match boss.kind {
                        BossKind::Sentinel
                        | BossKind::VoidPrism
                        | BossKind::PrismLattice
                        | BossKind::MirrorSovereign
                        | BossKind::ChronoEclipse => {
                            globe_distance(boss.pos, self.player.pos)
                                < boss.radius + self.player.radius
                        }
                        BossKind::Hydra => (0..3usize).any(|i| {
                            boss.lobe_hp[i] > 0.0
                                && globe_distance(Self::hydra_lobe_pos(boss, i), self.player.pos)
                                    < HYDRA_LOBE_RADIUS + self.player.radius
                        }),
                    };
                    if hit {
                        let dmg = boss.contact_damage;
                        self.apply_damage_to_player(dmg, DamageSource::BossContact);
                        self.player.iframe_timer = IFRAME_DURATION;
                        self.shake_amount += SHAKE_HIT_PX * 1.6;
                    }
                }
            }
        }

        // Player death check (early, before beams fire).
        if self.player.hp <= 0.0 {
            self.player.hp = 0.0;
            self.dead = true;
            self.score = self.compute_score();
            self.build_draw_buffers();
            return;
        }

        // Fire (cadence boosted by live Focus Streak, RefractionNova core, and Cadence Overclocks).
        self.prism_cannon_timer -= dt;
        self.fire_timer -= dt;
        if self.fire_timer <= 0.0 {
            if self.fire_primary() {
                self.fire_timer += self.effective_beam_cooldown();
                // 20-Stack Optical Milestone: SPECTRAL OVERCLOCK fires a synchronized precision lance every 4th salvo!
                if self.optical_stacks >= 20 && self.aim_active {
                    self.spectral_salvo_counter += 1;
                    if self.spectral_salvo_counter % 4 == 0 {
                        let aim_tangent = unproject_globe_offset(self.aim_screen_offset);
                        let aim_world = tangent_endpoint_on_globe(self.player.pos, aim_tangent);
                        self.fire_precision_lance(aim_world, [1.0, 0.72, 1.0], 0.85, false);
                    }
                }
            } else {
                self.fire_timer = 0.1;
            }
        }

        // Echo: scheduled re-fires.
        // Synergy: TRACKING ECHO (Refract+Echo 3+) — salvos target the second-nearest enemy.
        let tracking_echo = self
            .inventory
            .has_synergy(ShardKind::Refract, ShardKind::Echo);
        let now = self.time;
        let mut i = 0;
        while i < self.pending_echoes.len() {
            if self.pending_echoes[i] <= now {
                self.pending_echoes.swap_remove(i);
                let echo_target = if tracking_echo {
                    self.find_secondary_target()
                } else {
                    None
                };
                self.fire_primary_inner(false, true, echo_target, None);
            } else {
                i += 1;
            }
        }

        let mut i = 0;
        while i < self.pending_afterimages.len() {
            if self.pending_afterimages[i].0 <= now {
                let (_, origin) = self.pending_afterimages.swap_remove(i);
                let target = self.find_nearest_enemy_pos_from(origin);
                self.fire_primary_inner(false, true, target, Some(origin));
            } else {
                i += 1;
            }
        }

        self.update_extra_weapons(dt);
        self.update_aim_trainer(dt, raw_dt, deadeye_was_active);

        // Beam visual ageing.
        for b in &mut self.beams {
            b.life += dt;
        }
        self.beams.retain(|b| b.life < b.max_life);

        // Halos: orbit + contact damage.
        // Synergy: FROZEN ORBIT (Halo+Frost 3+) — halo beads slow enemies.
        let frozen_orbit = self
            .inventory
            .has_synergy(ShardKind::Halo, ShardKind::Frost);
        let event_horizon = self
            .inventory
            .has_synergy(ShardKind::Halo, ShardKind::Momentum);
        let solar_crown = self.inventory.has_evolution(EvolutionKind::SolarCrown);
        let halo_speed_mult = if event_horizon { 1.65 } else { 1.0 };
        let halo_radius_mult = if event_horizon { 0.72 } else { 1.0 };
        for h in &mut self.halos {
            h.angle += h.angular_speed * halo_speed_mult * dt;
        }
        let halo_snapshots: Vec<(Vec2, f32)> = self
            .halos
            .iter()
            .map(|h| {
                let mut p = self.player.pos;
                move_on_globe(
                    &mut p,
                    Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius * halo_radius_mult,
                );
                (p, h.size)
            })
            .collect();
        for (hpos, hsize) in &halo_snapshots {
            for e in &mut self.enemies {
                if globe_distance(e.pos, *hpos) < hsize + e.radius {
                    e.hp -= HALO_DPS * dt;
                    if frozen_orbit {
                        e.slow_timer = e.slow_timer.max(FROST_SLOW_DURATION);
                    }
                    // Solar Crown: halo contacts feed barrier HP.
                    if solar_crown {
                        self.player.barrier_hp = (self.player.barrier_hp
                            + SOLAR_CROWN_BARRIER_REGEN_PER_CONTACT * dt)
                            .min(self.player.barrier_max);
                    }
                }
            }
        }
        if let Some(boss) = &mut self.boss {
            if boss.state == BossState::Active {
                // Auras are intentionally unblockable: Sentinel shields teach
                // beam positioning, while close-range orbitals reward risky
                // movement into the boss space.
                for (hpos, hsize) in &halo_snapshots {
                    match boss.kind {
                        BossKind::Hydra => {
                            for i in 0..3usize {
                                if boss.lobe_hp[i] > 0.0 {
                                    let lp = Game::hydra_lobe_pos(boss, i);
                                    if globe_distance(lp, *hpos) < HYDRA_LOBE_RADIUS + hsize {
                                        boss.lobe_hp[i] -=
                                            HALO_DPS * AURA_BOSS_DAMAGE_MULT * dt;
                                    }
                                }
                            }
                        }
                        _ => {
                            if globe_distance(boss.pos, *hpos) < boss.radius + hsize {
                                boss.hp -= HALO_DPS * AURA_BOSS_DAMAGE_MULT * dt;
                            }
                        }
                    }
                }
            }
        }
        // Frozen Orbit: halo beads leave brief frost fields as they orbit.
        if frozen_orbit && !self.halos.is_empty() {
            self.halo_trail_timer -= dt;
            if self.halo_trail_timer <= 0.0 {
                self.halo_trail_timer = FROZEN_ORBIT_TRAIL_INTERVAL;
                for &(hpos, _) in &halo_snapshots {
                    if self.frost_fields.len() < MAX_FROST_FIELDS {
                        self.frost_fields.push(FrostField {
                            pos: hpos,
                            life: 0.0,
                            max_life: FROZEN_ORBIT_TRAIL_LIFETIME,
                            radius: FROZEN_ORBIT_TRAIL_RADIUS,
                        });
                    }
                }
            }
        }

        // Barrier: shield regen + contact damage to nearby enemies.
        let barrier_level = self.inventory.level(ShardKind::Barrier);
        if barrier_level > 0 {
            self.player.barrier_max = BARRIER_HP_PER_LEVEL * barrier_level as f32;
            self.player.barrier_hp =
                (self.player.barrier_hp + BARRIER_REGEN_PER_SEC * dt).min(self.player.barrier_max);
            // Contact damage to enemies within barrier radius.
            for e in &mut self.enemies {
                let dist = globe_distance(e.pos, self.player.pos);
                if dist < BARRIER_RADIUS + e.radius {
                    e.hp -= BARRIER_CONTACT_DPS * dt;
                }
            }
            if let Some(boss) = &mut self.boss {
                if boss.state == BossState::Active {
                    // Barrier contact is aura damage, not a beam, so it bypasses
                    // Sentinel shields by design.
                    match boss.kind {
                        BossKind::Sentinel
                        | BossKind::VoidPrism
                        | BossKind::PrismLattice
                        | BossKind::MirrorSovereign
                        | BossKind::ChronoEclipse => {
                            if globe_distance(boss.pos, self.player.pos)
                                < BARRIER_RADIUS + boss.radius
                            {
                                boss.hp -= BARRIER_CONTACT_DPS * AURA_BOSS_DAMAGE_MULT * dt;
                            }
                        }
                        BossKind::Hydra => {
                            for i in 0..3usize {
                                if boss.lobe_hp[i] > 0.0 {
                                    let lp = Self::hydra_lobe_pos(boss, i);
                                    if globe_distance(lp, self.player.pos)
                                        < BARRIER_RADIUS + HYDRA_LOBE_RADIUS
                                    {
                                        boss.lobe_hp[i] -=
                                            BARRIER_CONTACT_DPS * AURA_BOSS_DAMAGE_MULT * dt;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Interference: emit + expand + damage.
        let interf_level = self.inventory.level(ShardKind::Interference);
        if interf_level > 0 {
            self.interference_timer -= dt;
            if self.interference_timer <= 0.0 {
                self.pulses.push(InterferencePulse {
                    pos: self.player.pos,
                    life: 0.0,
                    max_life: 0.9,
                    max_radius: 320.0 + 40.0 * interf_level as f32,
                    kind: PulseKind::Interference,
                    damage_multiplier: 1.0,
                });
                let resonance = self
                    .inventory
                    .has_synergy(ShardKind::Barrier, ShardKind::Interference);
                self.interference_timer = if resonance { 1.0 } else { 2.0 } / interf_level as f32;
            }
        }
        for p in &mut self.pulses {
            p.life += dt;
        }
        let pulse_snapshots: Vec<(Vec2, f32, PulseKind, f32)> = self
            .pulses
            .iter()
            .map(|p| (p.pos, p.current_radius(), p.kind, p.damage_multiplier))
            .collect();
        let singularity = self.inventory.has_evolution(EvolutionKind::Singularity);
        let gravity_pull: Option<f32> = if self
            .inventory
            .has_synergy(ShardKind::Magnet, ShardKind::Interference)
            || self
                .inventory
                .has_synergy(ShardKind::Minefield, ShardKind::Magnet)
            || singularity
        {
            let base = 70.0
                + self.inventory.level(ShardKind::Magnet) as f32 * MAGNET_SPEED_PER_LEVEL * 0.45;
            Some(if singularity {
                base * SINGULARITY_PULL_MULT
            } else {
                base
            })
        } else {
            None
        };
        let pull_range_bonus = if singularity {
            SINGULARITY_PULL_RANGE_BONUS
        } else {
            110.0
        };
        let seismic_field = self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference);
        let interference_dmg_mult = if singularity {
            SINGULARITY_DAMAGE_MULT
        } else if seismic_field {
            1.35
        } else {
            1.0
        };
        for (ppos, pradius, kind, damage_multiplier) in &pulse_snapshots {
            let ring_thickness = match kind {
                PulseKind::Interference => INTERFERENCE_RING_THICKNESS,
                PulseKind::Mine => INTERFERENCE_RING_THICKNESS * 1.6,
                PulseKind::DashBlast => INTERFERENCE_RING_THICKNESS * 1.35,
            };
            let kind_damage_mult = match kind {
                PulseKind::Interference => 1.0,
                PulseKind::Mine => 1.45,
                PulseKind::DashBlast => 0.95,
            };
            let pulse_damage =
                INTERFERENCE_DPS * interference_dmg_mult * kind_damage_mult * *damage_multiplier;
            let pulse_pull = match kind {
                PulseKind::Interference => gravity_pull,
                PulseKind::Mine => gravity_pull.map(|pull| pull * 1.35),
                PulseKind::DashBlast => None,
            };
            for e in &mut self.enemies {
                let d = globe_distance(e.pos, *ppos);
                if let Some(pull) = pulse_pull {
                    if d > 1.0 && d < *pradius + pull_range_bonus {
                        let falloff = (1.0 - d / (*pradius + pull_range_bonus)).clamp(0.0, 1.0);
                        let to_center = nearest_globe_delta(e.pos, *ppos).normalize_or_zero();
                        move_on_globe(&mut e.pos, to_center * pull * falloff * dt);
                    }
                }
                if (d - *pradius).abs() < ring_thickness + e.radius {
                    e.hp -= pulse_damage * dt;
                }
            }
            if let Some(boss) = &mut self.boss {
                if boss.state == BossState::Active {
                    // Interference is a radial field effect, intentionally not
                    // blocked by Sentinel shields.
                    match boss.kind {
                        BossKind::Hydra => {
                            for i in 0..3usize {
                                if boss.lobe_hp[i] > 0.0 {
                                    let lp = Game::hydra_lobe_pos(boss, i);
                                    let d = globe_distance(lp, *ppos);
                                    if (d - *pradius).abs() < ring_thickness + HYDRA_LOBE_RADIUS {
                                        boss.lobe_hp[i] -=
                                            pulse_damage * AURA_BOSS_DAMAGE_MULT * dt;
                                    }
                                }
                            }
                        }
                        _ => {
                            let d = globe_distance(boss.pos, *ppos);
                            if (d - *pradius).abs() < ring_thickness + boss.radius {
                                boss.hp -= pulse_damage * AURA_BOSS_DAMAGE_MULT * dt;
                            }
                        }
                    }
                }
            }
        }
        self.pulses.retain(|p| p.life < p.max_life);

        // Blizzard frost fields: slow enemies inside them.
        for f in &mut self.frost_fields {
            f.life += dt;
        }
        for f in &self.frost_fields {
            for e in &mut self.enemies {
                if globe_distance(e.pos, f.pos) < f.radius + e.radius {
                    e.slow_timer = e.slow_timer.max(FROST_SLOW_DURATION);
                }
            }
        }
        self.frost_fields.retain(|f| f.life < f.max_life);

        // XP gem collection — magnetize nearby gems, collect touching ones.
        let magnet_radius = self.gem_magnet_radius();
        let magnet_speed = self.gem_magnet_speed();
        for g in &mut self.gems {
            g.life += dt;
            let to_player = nearest_globe_delta(g.pos, self.player.pos);
            let dist = to_player.length();
            if dist < magnet_radius {
                let dir = to_player.normalize_or_zero();
                move_on_globe(&mut g.pos, dir * magnet_speed * dt);
            }
        }
        // Collect gems touching player.
        let mut collected_xp: u32 = 0;
        let mut collected_count: u32 = 0;
        self.gems.retain(|g| {
            let dist = globe_distance(g.pos, self.player.pos);
            if dist < GEM_COLLECT_RADIUS + self.player.radius {
                collected_xp += g.value;
                collected_count += 1;
                false
            } else if g.life >= GEM_LIFETIME {
                false // expired
            } else {
                true
            }
        });
        if collected_xp > 0 {
            let xp_mult = 1.0 + self.optical_stacks as f32 * 0.02;
            let gained = ((collected_xp as f32) * xp_mult).round().max(collected_xp as f32) as u32;
            self.xp += gained;
            self.gems_collected += collected_count;
            self.audio_gem_count += collected_count;
            self.check_for_level_up();
        }

        // Death resolution — loop so that Cascade chain-kills propagate.
        let kills_before_frame = self.kills_total;
        let mut cascade_depth: u32 = 0;
        loop {
            let mut dying: Vec<usize> = (0..self.enemies.len())
                .filter(|&i| self.enemies[i].hp <= 0.0)
                .collect();
            if dying.is_empty() {
                break;
            }
            dying.sort_unstable_by(|a, b| b.cmp(a));
            let mut dead_enemies = Vec::with_capacity(dying.len());
            for i in dying {
                let dead = self.enemies.swap_remove(i);
                dead_enemies.push(dead);
            }
            for dead in &dead_enemies {
                self.on_enemy_death(
                    dead.pos,
                    dead.kind,
                    cascade_depth,
                    dead.no_xp,
                    dead.slow_timer > 0.0,
                    dead.mini_boss,
                    dead.prism_mark_timer > 0.0,
                    dead.link_id,
                );
            }
            cascade_depth += 1;
            if cascade_depth >= CASCADE_MAX_DEPTH {
                self.enemies.retain(|e| e.hp > 0.0);
                break;
            }
        }
        let kills_this_frame = self.kills_total.saturating_sub(kills_before_frame);
        if kills_this_frame >= 6 {
            self.hit_stop_pulse = self.hit_stop_pulse.max(0.42);
            self.screen_flash = self.screen_flash.max(0.24);
        }
        if self
            .boss
            .as_ref()
            .is_some_and(|b| b.state == BossState::Active && b.hp <= 0.0)
        {
            self.start_boss_death();
        }

        // Session victory (survived 15 minutes — skipped once player chooses Endless Mode).
        if !self.endless_mode && self.time >= SESSION_LENGTH && !self.dead {
            self.dead = true;
            self.score = self.compute_score() + 500; // survival bonus
            self.build_draw_buffers();
            return;
        }

        // Particles.
        for p in &mut self.particles {
            p.life += dt;
            move_on_globe(&mut p.pos, p.vel * dt);
            p.vel *= (1.0 - 2.2 * dt).max(0.0);
        }
        self.particles.retain(|p| p.life < p.max_life);

        // Keep live HUD score current during the run.
        self.score = self.compute_score();

        self.build_draw_buffers();
    }

    // --- Capturable Prism Obelisk Globe Objectives ---------------------

    fn update_obelisk(&mut self, dt: f32) {
        if self.obelisk.is_none() {
            if self.boss.is_none() {
                self.obelisk_timer -= dt;
                if self.obelisk_timer <= 0.0 {
                    let angle = self.rng.angle();
                    let dist = self.rng.range(260.0, 380.0);
                    let mut pos = self.player.pos;
                    move_on_globe(&mut pos, Vec2::new(angle.cos(), angle.sin()) * dist);
                    self.obelisk = Some(PrismObelisk {
                        pos,
                        radius: OBELISK_RADIUS,
                        progress: 0.0,
                        life: 0.0,
                        max_life: OBELISK_MAX_LIFE,
                        ambush_spawned: false,
                    });
                    self.obelisk_timer = OBELISK_INTERVAL;
                }
            }
            return;
        }

        let mut captured_pos: Option<Vec2> = None;
        let mut spawn_ambush_at: Option<Vec2> = None;
        let mut expired = false;
        let player_pos = self.player.pos;

        if let Some(ob) = &mut self.obelisk {
            let inside = globe_distance(ob.pos, player_pos) <= ob.radius;
            if inside {
                ob.progress = (ob.progress + dt / OBELISK_CAPTURE_TIME).min(1.0);
                // Pause despawn timer while player is actively capturing!
                if ob.progress >= 0.25 && !ob.ambush_spawned {
                    ob.ambush_spawned = true;
                    spawn_ambush_at = Some(ob.pos);
                }
                if ob.progress >= 1.0 {
                    captured_pos = Some(ob.pos);
                }
            } else {
                ob.life += dt;
                ob.progress = (ob.progress - dt * 0.05).max(0.0);
                if ob.life >= ob.max_life {
                    expired = true;
                }
            }
        }

        if let Some(amb_pos) = spawn_ambush_at {
            // Spawn an elite flank squad + immediately trigger a Ghost Sniper ambush!
            self.spawn_boss_adds(amb_pos, EnemyKind::Dasher, 3, 95.0);
            self.spawn_boss_adds(amb_pos, EnemyKind::Reflector, 1, 110.0);
            if self.aim_active && self.aim_targets.is_empty() {
                self.aim_drill_cooldown = 0.0;
            }
            self.shake_amount = (self.shake_amount + 4.0).min(12.0);
        }

        if let Some(pos) = captured_pos {
            self.obelisk = None;
            self.obelisks_captured += 1;
            self.audio_event_bits |= AUDIO_OBELISK_CAPTURE;
            self.screen_flash = self.screen_flash.max(0.75);
            self.hit_stop_pulse = self.hit_stop_pulse.max(0.55);
            self.shake_amount = (self.shake_amount + 12.0).min(18.0);
            self.pulses.push(InterferencePulse {
                pos,
                life: 0.0,
                max_life: 0.65,
                max_radius: 360.0,
                kind: PulseKind::DashBlast,
                damage_multiplier: 1.8,
            });
            self.damage_area(pos, 320.0, 420.0 + self.rank as f32 * 40.0, 320.0, 0.0, 1.5);
            self.drop_xp_burst(pos, 10, 3 + self.rank / 8, 42.0);
            self.pending_relic_chests += 1;
            self.check_for_level_up();
        } else if expired {
            self.obelisk = None;
        }
    }

    // --- Boss milestones (6 multi-phase bosses across 15 minutes) ------

    fn maybe_spawn_lattice(&mut self) {
        if self.lattice_spawned || self.time < LATTICE_SPAWN_TIME || self.boss.is_some() {
            return;
        }
        self.lattice_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.45);
        let mut b = make_boss_shell(BossKind::PrismLattice, pos, LATTICE_RADIUS, LATTICE_HP, 0.0, 0.0);
        b.spoke_angle = self.rng.angle();
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 8.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn maybe_spawn_sentinel(&mut self) {
        if self.sentinel_spawned || self.time < SENTINEL_SPAWN_TIME || self.boss.is_some() {
            return;
        }

        self.sentinel_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.48);

        let mut b = make_boss_shell(BossKind::Sentinel, pos, SENTINEL_RADIUS, SENTINEL_HP, 0.0, 0.0);
        b.shield_angle = self.rng.angle();
        b.shield_hp = [SENTINEL_SHIELD_HP; 3];
        b.fire_timer = 0.0;
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 8.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn maybe_spawn_sovereign(&mut self) {
        if self.sovereign_spawned || self.time < SOVEREIGN_SPAWN_TIME || self.boss.is_some() {
            return;
        }
        self.sovereign_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.46);
        let mut b = make_boss_shell(BossKind::MirrorSovereign, pos, SOVEREIGN_RADIUS, SOVEREIGN_HP, 0.0, 0.0);
        b.aux_timer = 2.6;
        b.fire_timer = 2.0;
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 9.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn maybe_spawn_hydra(&mut self) {
        if self.hydra_spawned || self.time < HYDRA_SPAWN_TIME || self.boss.is_some() {
            return;
        }
        self.hydra_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.48);
        let total_hp = HYDRA_HP_PER_LOBE * 3.0;
        let mut b = make_boss_shell(
            BossKind::Hydra,
            pos,
            HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
            total_hp,
            HYDRA_BODY_SPEED,
            HYDRA_CONTACT_DAMAGE,
        );
        b.lobe_hp = [HYDRA_HP_PER_LOBE; 3];
        b.lobe_alive = [true; 3];
        b.lobe_orbit = self.rng.angle();
        b.fire_timer = HYDRA_FIRE_INTERVAL * 0.5;
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 8.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn maybe_spawn_eclipse(&mut self) {
        if self.eclipse_spawned || self.time < ECLIPSE_SPAWN_TIME || self.boss.is_some() {
            return;
        }
        self.eclipse_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.46);
        let mut b = make_boss_shell(BossKind::ChronoEclipse, pos, ECLIPSE_RADIUS, ECLIPSE_HP, 0.0, 0.0);
        b.aux_timer = 6.0;
        b.fire_timer = 1.6;
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 10.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn maybe_spawn_void_prism(&mut self) {
        if self.void_prism_spawned || self.time < VOID_PRISM_SPAWN_TIME || self.boss.is_some() {
            return;
        }
        self.void_prism_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.48);
        let mut b = make_boss_shell(BossKind::VoidPrism, pos, VOID_PRISM_RADIUS, VOID_PRISM_HP, 0.0, 0.0);
        b.fire_timer = VOID_PRISM_SHOCKWAVE_INTERVAL_P1;
        self.boss = Some(b);
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 10.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
        self.clear_boss_entrance_crowd(pos);
    }

    fn lattice_spoke_count(boss: &Boss) -> usize {
        if boss.phase >= 1 { 6 } else { 4 }
    }

    fn lattice_relay_pos(boss: &Boss, idx: usize) -> Vec2 {
        let count = Self::lattice_spoke_count(boss);
        let a = boss.spoke_angle + (idx as f32) * std::f32::consts::TAU / count as f32;
        tangent_endpoint_on_globe(boss.pos, Vec2::new(a.cos(), a.sin()) * LATTICE_RELAY_DIST)
    }

    fn boss_weakpoint_pos(boss: &Boss) -> Vec2 {
        let r = boss.radius + 28.0;
        tangent_endpoint_on_globe(
            boss.pos,
            Vec2::new(boss.weakpoint_angle.cos(), boss.weakpoint_angle.sin()) * r,
        )
    }

    fn hydra_lobe_pos(boss: &Boss, i: usize) -> Vec2 {
        let a = boss.lobe_orbit + (i as f32) * std::f32::consts::TAU / 3.0;
        let mut pos = boss.pos;
        move_on_globe(&mut pos, Vec2::new(a.cos(), a.sin()) * HYDRA_ORBIT_RADIUS);
        pos
    }

    fn boss_escalation_tier(active_time: f32) -> u32 {
        ((active_time / BOSS_ESCALATION_INTERVAL).floor() as u32).min(BOSS_ESCALATION_MAX_TIER)
    }

    fn update_boss(&mut self, dt: f32) {
        let mut activated = false;
        let mut phase_changed = false;
        let mut add_spawn: Option<(Vec2, EnemyKind, u32)> = None;
        let mut sentinel_fire_positions: Vec<(Vec2, f32)> = Vec::new();
        let mut hydra_fire_positions: Vec<(Vec2, u32, f32)> = Vec::new();
        let mut lobes_died: Vec<(Vec2, usize)> = Vec::new();
        let mut finish_death = false;
        let mut void_shockwave_origins: Vec<(Vec2, f32)> = Vec::new();
        let mut boss_beam_damage = 0.0_f32;
        let mut boss_sniper_shot: Option<(Vec2, Vec2, f32)> = None;
        let mut boss_warp_trail: Option<(Vec2, Vec2)> = None;
        let mut trigger_void_ghost = false;
        let rank_weapon_scale = 1.0 + self.rank_pressure() * BOSS_WEAPON_DAMAGE_RANK_MULT;
        let player_pos_snap = self.player.pos;
        let player_alt = self.player.altitude;
        let player_r = self.player.radius;

        if let Some(boss) = &mut self.boss {
            boss.weakpoint_angle += 1.25 * dt;
            if boss.weakpoint_cooldown > 0.0 {
                boss.weakpoint_cooldown = (boss.weakpoint_cooldown - dt).max(0.0);
            }
            if boss.stun_timer > 0.0 {
                boss.stun_timer = (boss.stun_timer - dt).max(0.0);
            }
            match boss.state {
                BossState::Telegraphing => {
                    boss.state_timer -= dt;
                    let init_radius = match boss.kind {
                        BossKind::PrismLattice => LATTICE_RADIUS,
                        BossKind::Sentinel => SENTINEL_RADIUS,
                        BossKind::MirrorSovereign => SOVEREIGN_RADIUS,
                        BossKind::Hydra => HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
                        BossKind::ChronoEclipse => ECLIPSE_RADIUS,
                        BossKind::VoidPrism => VOID_PRISM_RADIUS,
                    };
                    let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                    boss.radius = init_radius * (0.35 + t * 0.65);
                    if boss.state_timer <= 0.0 {
                        boss.state = BossState::Active;
                        boss.state_timer = 2.4;
                        boss.active_time = 0.0;
                        boss.radius = init_radius;
                        activated = true;
                        match boss.kind {
                            BossKind::PrismLattice => {
                                boss.speed = 36.0;
                                boss.contact_damage = 28.0;
                            }
                            BossKind::Sentinel => {
                                boss.speed = SENTINEL_BASE_SPEED;
                                boss.contact_damage = 35.0;
                            }
                            BossKind::MirrorSovereign => {
                                boss.speed = 76.0;
                                boss.contact_damage = 40.0;
                            }
                            BossKind::Hydra => {
                                boss.speed = HYDRA_BODY_SPEED;
                                boss.contact_damage = HYDRA_CONTACT_DAMAGE;
                            }
                            BossKind::ChronoEclipse => {
                                boss.speed = 42.0;
                                boss.contact_damage = 50.0;
                            }
                            BossKind::VoidPrism => {
                                boss.speed = VOID_PRISM_BASE_SPEED;
                                boss.contact_damage = VOID_PRISM_CONTACT_DAMAGE;
                            }
                        }
                    }
                }
                BossState::Active => {
                    boss.active_time += dt;
                    let escalation = Self::boss_escalation_tier(boss.active_time);
                    let weapon_scale =
                        rank_weapon_scale + escalation as f32 * BOSS_WEAPON_DAMAGE_ESCALATION_MULT;
                    let stunned = boss.stun_timer > 0.0;
                    let dir = nearest_globe_delta(boss.pos, player_pos_snap).normalize_or_zero();
                    if !stunned {
                        move_on_globe(&mut boss.pos, dir * boss.speed * dt);
                    }

                    match boss.kind {
                        BossKind::PrismLattice => {
                            let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                            let next_phase = if hp_pct > 0.50 { 0 } else { 1 };
                            if next_phase != boss.phase {
                                boss.phase = next_phase;
                                phase_changed = true;
                            }
                            let spin_dir = if boss.phase == 1 && ((boss.active_time / 5.0) as u32 % 2 == 1) {
                                -1.0
                            } else {
                                1.0
                            };
                            let spin_speed = (0.48 + boss.phase as f32 * 0.22 + escalation as f32 * 0.03) * spin_dir;
                            if !stunned {
                                boss.spoke_angle += spin_speed * dt;
                            }
                            let count = Self::lattice_spoke_count(boss);
                            for i in 0..count {
                                if boss.spoke_disabled[i] > 0.0 {
                                    boss.spoke_disabled[i] = (boss.spoke_disabled[i] - dt).max(0.0);
                                } else if !stunned && player_alt < 0.14 {
                                    let a = boss.spoke_angle + (i as f32) * std::f32::consts::TAU / count as f32;
                                    let end = tangent_endpoint_on_globe(
                                        boss.pos,
                                        Vec2::new(a.cos(), a.sin()) * LATTICE_SPOKE_LENGTH,
                                    );
                                    if capsule_circle_intersect_globe(boss.pos, end, 5.5, player_pos_snap, player_r) {
                                        boss_beam_damage = boss_beam_damage.max(22.0 * weapon_scale);
                                    }
                                }
                            }
                            boss.state_timer -= dt;
                            if boss.state_timer <= 0.0 {
                                boss.state_timer = (3.4 - boss.phase as f32 * 0.5).max(1.8);
                                add_spawn = Some((boss.pos, EnemyKind::Weaver, 2));
                            }
                        }
                        BossKind::MirrorSovereign => {
                            let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                            let next_phase = if hp_pct > 0.50 { 0 } else { 1 };
                            if next_phase != boss.phase {
                                boss.phase = next_phase;
                                phase_changed = true;
                            }
                            boss.decoy_angles[0] += (1.1 + boss.phase as f32 * 0.45) * dt;
                            boss.decoy_angles[1] -= (0.95 + boss.phase as f32 * 0.35) * dt;
                            if !stunned {
                                // Periodic aggressive dash-blink across the arena!
                                boss.aux_timer -= dt;
                                if boss.aux_timer <= 0.0 {
                                    boss.aux_timer = if boss.phase == 1 { 2.8 } else { 3.8 };
                                    let old_pos = boss.pos;
                                    let perp = Vec2::new(-dir.y, dir.x);
                                    let side = if ((boss.active_time * 3.0) as u32 % 2) == 0 { 1.0 } else { -1.0 };
                                    let jump = (dir * 0.4 + perp * side * 0.9).normalize_or_zero() * 195.0;
                                    move_on_globe(&mut boss.pos, jump);
                                    boss_warp_trail = Some((old_pos, boss.pos));
                                    // Immediately begin charging a sniper rail from the new flank!
                                    boss.aim_charge = 0.01;
                                    boss.aim_dir = nearest_globe_delta(boss.pos, player_pos_snap).normalize_or_zero();
                                }
                                // Sniper rail charge & release!
                                if boss.aim_charge > 0.0 {
                                    // Tracks player smoothly during first 72% of lock, then locks line so player can Dash!
                                    if boss.aim_charge < 0.72 {
                                        let to_p = nearest_globe_delta(boss.pos, player_pos_snap).normalize_or_zero();
                                        boss.aim_dir = (boss.aim_dir * 0.88 + to_p * 0.12).normalize_or_zero();
                                    }
                                    let lock_rate = if boss.phase == 1 { 0.68 } else { 0.54 };
                                    boss.aim_charge += dt * lock_rate;
                                    if boss.aim_charge >= 1.0 {
                                        boss.aim_charge = 0.0;
                                        boss_sniper_shot = Some((boss.pos, boss.aim_dir, 32.0 * weapon_scale));
                                    }
                                }
                            } else {
                                boss.aim_charge = 0.0;
                            }
                        }
                        BossKind::ChronoEclipse => {
                            // Alternates every 6.5s between Phase 0 (SOLAR FLARE) and Phase 1 (LUNAR ECLIPSE).
                            boss.aux_timer -= dt;
                            if boss.aux_timer <= 0.0 {
                                boss.aux_timer = 6.5;
                                boss.phase = 1 - boss.phase;
                                phase_changed = true;
                                if boss.phase == 1 {
                                    // Spawn 6 dark collapsing Lunar Prisms around the player!
                                    let base = boss.spoke_angle;
                                    for i in 0..6 {
                                        let a = base + (i as f32) * std::f32::consts::TAU / 6.0;
                                        let lp = tangent_endpoint_on_globe(
                                            player_pos_snap,
                                            Vec2::new(a.cos(), a.sin()) * 240.0,
                                        );
                                        boss.lunar_prisms[i] = (lp, true);
                                    }
                                } else {
                                    for i in 0..6 {
                                        boss.lunar_prisms[i].1 = false;
                                    }
                                }
                            }
                            boss.spoke_angle += (0.55 + escalation as f32 * 0.04) * dt;
                            if boss.phase == 0 && !stunned {
                                // Solar Flare: 3 blazing flare corridors (Dash over!).
                                if player_alt < 0.14 {
                                    for i in 0..3 {
                                        let a = boss.spoke_angle + (i as f32) * std::f32::consts::TAU / 3.0;
                                        let end = tangent_endpoint_on_globe(
                                            boss.pos,
                                            Vec2::new(a.cos(), a.sin()) * 290.0,
                                        );
                                        if capsule_circle_intersect_globe(boss.pos, end, 7.5, player_pos_snap, player_r) {
                                            boss_beam_damage = boss_beam_damage.max(28.0 * weapon_scale);
                                        }
                                    }
                                }
                                boss.fire_timer -= dt;
                                if boss.fire_timer <= 0.0 {
                                    boss.fire_timer = 1.45;
                                    void_shockwave_origins.push((boss.pos, weapon_scale * 0.85));
                                }
                            } else if boss.phase == 1 {
                                // Lunar Curtain: 6 dark prisms converge slowly inward — mouse-clicking them detonates safe pockets!
                                for i in 0..6 {
                                    if !boss.lunar_prisms[i].1 {
                                        continue;
                                    }
                                    let to_p = nearest_globe_delta(boss.lunar_prisms[i].0, player_pos_snap);
                                    let dist = to_p.length();
                                    move_on_globe(&mut boss.lunar_prisms[i].0, to_p.normalize_or_zero() * 58.0 * dt);
                                    if dist < 24.0 + player_r {
                                        boss.lunar_prisms[i].1 = false;
                                        boss_beam_damage = boss_beam_damage.max(26.0 * weapon_scale);
                                    }
                                }
                            }
                        }
                        BossKind::Sentinel => {
                            let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                            let next_phase = if hp_pct > 0.60 {
                                0
                            } else if hp_pct > 0.30 {
                                1
                            } else {
                                2
                            };
                            if next_phase != boss.phase {
                                boss.phase = next_phase;
                                phase_changed = true;
                            }
                            let phase_scale = boss.phase as f32;
                            boss.radius = SENTINEL_RADIUS + phase_scale * 5.0;
                            boss.speed = SENTINEL_BASE_SPEED + phase_scale * 12.0;
                            boss.contact_damage = 35.0 + phase_scale * 7.0;
                            boss.shield_angle +=
                                SENTINEL_SHIELD_SPIN * (1.0 + phase_scale * 0.25) * dt;
                            boss.state_timer -= dt;
                            if boss.state_timer <= 0.0 {
                                let base_interval = match boss.phase {
                                    0 => 3.0,
                                    1 => 2.4,
                                    _ => 1.8,
                                };
                                boss.state_timer =
                                    (base_interval - escalation as f32 * 0.10).max(0.75);
                                let kind = match boss.phase {
                                    0 => EnemyKind::Drone,
                                    1 => EnemyKind::Dasher,
                                    _ => EnemyKind::Emitter,
                                };
                                let count = match boss.phase {
                                    0 => 2,
                                    1 => 1,
                                    _ => 3,
                                } + escalation;
                                for i in 0..boss.shield_hp.len() {
                                    if boss.shield_hp[i] > 0.0 {
                                        sentinel_fire_positions.push((
                                            Self::sentinel_shield_pos(boss, i),
                                            weapon_scale,
                                        ));
                                    }
                                }
                                add_spawn = Some((boss.pos, kind, count));
                            }
                        }
                        BossKind::Hydra => {
                            boss.lobe_orbit += HYDRA_ORBIT_SPEED * dt;
                            boss.hp = boss.lobe_hp[0] + boss.lobe_hp[1] + boss.lobe_hp[2];
                            let dead_count =
                                boss.lobe_hp.iter().filter(|&&h| h <= 0.0).count() as u8;
                            if dead_count != boss.phase {
                                boss.phase = dead_count;
                                phase_changed = true;
                            }
                            boss.speed = HYDRA_BODY_SPEED + dead_count as f32 * 18.0;
                            // Detect first-death per lobe.
                            for i in 0..3usize {
                                if boss.lobe_alive[i] && boss.lobe_hp[i] <= 0.0 {
                                    boss.lobe_alive[i] = false;
                                    lobes_died.push((Self::hydra_lobe_pos(boss, i), i));
                                }
                            }
                            // Periodic projectile volley from surviving lobes.
                            boss.fire_timer -= dt;
                            if boss.fire_timer <= 0.0 {
                                boss.fire_timer = (HYDRA_FIRE_INTERVAL
                                    - dead_count as f32 * 0.28
                                    - escalation as f32 * 0.04)
                                    .max(0.45);
                                let shot_count = 1 + escalation.min(5);
                                for i in 0..3usize {
                                    if boss.lobe_hp[i] > 0.0 {
                                        hydra_fire_positions.push((
                                            Self::hydra_lobe_pos(boss, i),
                                            shot_count,
                                            weapon_scale,
                                        ));
                                    }
                                }
                            }
                        }
                        BossKind::VoidPrism => {
                            let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                            let next_phase: u8 = if hp_pct > 0.50 { 0 } else { 1 };
                            if next_phase != boss.phase {
                                boss.phase = next_phase;
                                phase_changed = true;
                                trigger_void_ghost = true;
                            }
                            if boss.phase == 1 {
                                boss.speed = VOID_PRISM_P2_SPEED;
                                boss.contact_damage = VOID_PRISM_P2_CONTACT_DAMAGE;
                            }
                            boss.fire_timer -= dt;
                            if boss.fire_timer <= 0.0 {
                                let base_interval = if boss.phase == 0 {
                                    VOID_PRISM_SHOCKWAVE_INTERVAL_P1
                                } else {
                                    VOID_PRISM_SHOCKWAVE_INTERVAL_P2
                                };
                                boss.fire_timer =
                                    (base_interval - escalation as f32 * 0.05).max(0.55);
                                let wave_count = 1 + (escalation / 2).min(4);
                                void_shockwave_origins.push((boss.pos, weapon_scale));
                                let base_angle = boss.active_time * 0.7;
                                for i in 1..wave_count {
                                    let angle = base_angle
                                        + i as f32 * std::f32::consts::TAU / wave_count as f32;
                                    let mut origin = boss.pos;
                                    move_on_globe(
                                        &mut origin,
                                        Vec2::new(angle.cos(), angle.sin())
                                            * (VOID_PRISM_RADIUS + 46.0),
                                    );
                                    void_shockwave_origins.push((origin, weapon_scale));
                                }
                            }
                        }
                    }
                }
                BossState::Dying => {
                    boss.state_timer -= dt;
                    let init_radius = match boss.kind {
                        BossKind::PrismLattice => LATTICE_RADIUS,
                        BossKind::Sentinel => SENTINEL_RADIUS,
                        BossKind::MirrorSovereign => SOVEREIGN_RADIUS,
                        BossKind::Hydra => HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
                        BossKind::ChronoEclipse => ECLIPSE_RADIUS,
                        BossKind::VoidPrism => VOID_PRISM_RADIUS,
                    };
                    let t = (boss.state_timer / BOSS_DEATH_TIME).clamp(0.0, 1.0);
                    boss.radius = init_radius * t;
                    if boss.state_timer <= 0.0 {
                        finish_death = true;
                    }
                }
            }
        }

        if let Some((a, b)) = boss_warp_trail {
            self.beams.push(Beam {
                start: a,
                end: b,
                life: 0.0,
                max_life: 0.35,
                thickness: 6.5,
                color: [1.0, 0.32, 0.84],
                is_echo: false,
            });
        }
        if let Some((origin, dir, dmg)) = boss_sniper_shot {
            let end = tangent_endpoint_on_globe(origin, dir * 560.0);
            self.beams.push(Beam {
                start: origin,
                end,
                life: 0.0,
                max_life: 0.28,
                thickness: 7.5,
                color: [1.0, 0.22, 0.68],
                is_echo: false,
            });
            self.audio_event_bits |= AUDIO_GHOST_SHOT;
            self.shake_amount = (self.shake_amount + 6.0).min(16.0);
            if self.player.iframe_timer <= 0.0
                && self.player.altitude < 0.15
                && capsule_circle_intersect_globe(origin, end, 9.0, self.player.pos, self.player.radius)
            {
                boss_beam_damage = boss_beam_damage.max(dmg);
            }
        }
        if boss_beam_damage > 0.0 && self.player.iframe_timer <= 0.0 {
            self.apply_damage_to_player(boss_beam_damage, DamageSource::BossContact);
            self.player.iframe_timer = IFRAME_DURATION;
            self.shake_amount += SHAKE_HIT_PX * 1.4;
        }
        if trigger_void_ghost && self.aim_active && self.aim_targets.is_empty() {
            self.aim_drill_cooldown = 0.0;
        }

        if activated {
            self.shake_amount += 12.0;
        }
        if phase_changed {
            self.shake_amount += 6.0;
            self.audio_event_bits |= AUDIO_BOSS_PHASE;
        }
        if let Some((origin, kind, count)) = add_spawn {
            self.spawn_boss_adds(origin, kind, count, SENTINEL_RADIUS);
        }
        // Hydra: lobe death — spawn adds and particle burst for each dead lobe.
        for (lobe_pos, lobe_idx) in lobes_died {
            let add_kind = HYDRA_LOBE_ADDS[lobe_idx];
            self.spawn_boss_adds(lobe_pos, add_kind, 3, HYDRA_LOBE_RADIUS);
            self.shake_amount += 7.0;
            self.audio_event_bits |= AUDIO_BOSS_PHASE;
            let color = HYDRA_LOBE_COLORS[lobe_idx];
            for _ in 0..24 {
                let a = self.rng.angle();
                let speed = self.rng.range(100.0, 280.0);
                self.particles.push(Particle {
                    pos: lobe_pos,
                    vel: Vec2::new(a.cos(), a.sin()) * speed,
                    life: 0.0,
                    max_life: self.rng.range(0.5, 1.1),
                    color,
                    size: self.rng.range(2.0, 4.5),
                });
            }
        }
        // Sentinel: living shield satellites now fire targeted shots while summoning adds.
        let player_pos = self.player.pos;
        for (shield_pos, damage_scale) in sentinel_fire_positions {
            let dir = nearest_globe_delta(shield_pos, player_pos).normalize_or_zero();
            self.projectiles.push(Projectile {
                pos: shield_pos,
                vel: dir * BOSS_PROJ_SPEED * 1.08,
                radius: PROJ_RADIUS * 1.12,
                damage: BOSS_PROJ_DAMAGE * 0.75 * damage_scale,
                life: 0.0,
            });
        }
        // Hydra: fire a projectile from each surviving lobe toward the player.
        for (lobe_pos, shot_count, damage_scale) in hydra_fire_positions {
            let dir = nearest_globe_delta(lobe_pos, player_pos).normalize_or_zero();
            let base_angle = dir.y.atan2(dir.x);
            let half_spread = (shot_count.saturating_sub(1)) as f32 * 0.5;
            for shot in 0..shot_count {
                let angle = base_angle + (shot as f32 - half_spread) * 0.16;
                let shot_dir = Vec2::new(angle.cos(), angle.sin());
                self.projectiles.push(Projectile {
                    pos: lobe_pos,
                    vel: shot_dir * BOSS_PROJ_SPEED,
                    radius: PROJ_RADIUS,
                    damage: BOSS_PROJ_DAMAGE * damage_scale,
                    life: 0.0,
                });
            }
        }
        // Void Prism: emit a player-damaging shockwave ring.
        for (origin, damage_scale) in void_shockwave_origins {
            let phase = self.boss.as_ref().map(|b| b.phase).unwrap_or(0);
            let max_radius = VOID_PRISM_SHOCKWAVE_MAX_RADIUS * if phase == 1 { 1.25 } else { 1.0 };
            let duration = max_radius / 180.0;
            self.void_shockwaves.push(VoidShockwave {
                pos: origin,
                life: 0.0,
                max_life: duration,
                max_radius,
                damage: VOID_PRISM_SHOCKWAVE_DAMAGE * damage_scale,
                hit_player: false,
            });
            self.shake_amount += 3.0;
        }
        if finish_death {
            self.finish_boss_death();
        }

        // Hydra: check if all lobes dead → trigger dying state.
        if let Some(boss) = &mut self.boss {
            if boss.kind == BossKind::Hydra
                && boss.state == BossState::Active
                && boss.lobe_hp.iter().all(|&h| h <= 0.0)
            {
                self.start_boss_death();
            }
        }
    }

    fn spawn_boss_adds(&mut self, origin: Vec2, kind: EnemyKind, count: u32, boss_radius: f32) {
        let base = self.rng.angle();
        for i in 0..count {
            let angle = base + i as f32 * std::f32::consts::TAU / count as f32;
            let dir = Vec2::new(angle.cos(), angle.sin());
            let mut pos = origin;
            move_on_globe(&mut pos, dir * (boss_radius + 26.0));
            self.spawn_enemy_near_pos(kind, pos);
        }
    }

    fn spawn_enemy_near_pos(&mut self, kind: EnemyKind, pos: Vec2) {
        let minute = self.time / 60.0;
        let (radius, hp, speed, contact_damage, color) = enemy_stats(kind, minute);
        self.enemies.push(Enemy {
            pos,
            radius,
            hp,
            speed: speed * self.rng.range(0.9, 1.1),
            kind,
            state: EnemyState::Drifting,
            state_timer: 0.0,
            charge_dir: Vec2::ZERO,
            color,
            contact_damage,
            slow_timer: 0.0,
            no_xp: false,
            spawn_grace: SPAWN_GRACE,
            mini_boss: None,
            prism_mark_timer: 0.0,
            link_id: 0,
            shield_broken_timer: 0.0,
        });
    }

    fn mini_boss_active_count(&self) -> usize {
        self.enemies
            .iter()
            .filter(|e| e.mini_boss.is_some())
            .count()
    }

    fn update_rank_minibosses(&mut self, dt: f32, enemy_cap: usize) {
        if self.rank <= RANK_PRESSURE_START || self.boss.is_some() {
            return;
        }
        let active_cap = if self.rank >= 24 {
            MINI_BOSS_ACTIVE_CAP_LATE
        } else {
            1
        };
        if self.mini_boss_active_count() >= active_cap {
            return;
        }

        self.mini_boss_timer -= dt;
        if self.mini_boss_timer > 0.0 {
            return;
        }

        let interval = MINI_BOSS_BASE_INTERVAL
            - (MINI_BOSS_BASE_INTERVAL - MINI_BOSS_MIN_INTERVAL) * self.rank_pressure();
        self.mini_boss_timer = interval;

        if self.enemies.len() >= enemy_cap {
            return;
        }
        let Some(kind) = self.pick_rank_miniboss_kind() else {
            return;
        };
        self.spawn_rank_miniboss(kind);
    }

    fn pick_rank_miniboss_kind(&mut self) -> Option<MiniBossKind> {
        let rank_after_10 = self.rank.saturating_sub(RANK_PRESSURE_START);
        let pool = [
            (MiniBossKind::Bulwark, 5u32),
            (MiniBossKind::Riftcaller, 4),
            (
                MiniBossKind::MirrorWraith,
                if rank_after_10 >= 5 { 4 } else { 0 },
            ),
            (
                MiniBossKind::SplitCore,
                if rank_after_10 >= 10 { 3 } else { 0 },
            ),
        ];
        weighted_pick(&pool, &mut self.rng)
    }

    fn spawn_rank_miniboss(&mut self, kind: MiniBossKind) {
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.46);
        self.spawn_miniboss_at(kind, pos);
    }

    fn spawn_miniboss_at(&mut self, mini_kind: MiniBossKind, pos: Vec2) {
        let rank_scale = 1.0 + self.rank.saturating_sub(RANK_PRESSURE_START) as f32 * 0.12;
        let pressure = self.rank_pressure();
        let (kind, radius, hp, speed, contact_damage, color) = match mini_kind {
            MiniBossKind::Bulwark => (
                EnemyKind::Brute,
                30.0,
                5200.0 * rank_scale,
                44.0 + pressure * 18.0,
                34.0,
                [1.0, 0.34, 0.18],
            ),
            MiniBossKind::Riftcaller => (
                EnemyKind::Emitter,
                18.0,
                3600.0 * rank_scale,
                62.0 + pressure * 20.0,
                18.0,
                [0.82, 0.22, 1.0],
            ),
            MiniBossKind::MirrorWraith => (
                EnemyKind::Umbra,
                15.0,
                3300.0 * rank_scale,
                122.0 + pressure * 26.0,
                26.0,
                [0.62, 0.22, 1.0],
            ),
            MiniBossKind::SplitCore => (
                EnemyKind::Splitter,
                21.0,
                4300.0 * rank_scale,
                78.0 + pressure * 22.0,
                24.0,
                [0.28, 1.0, 0.48],
            ),
        };

        self.shake_amount += 5.0;
        self.enemies.push(Enemy {
            pos,
            radius,
            hp,
            speed,
            kind,
            state: EnemyState::Drifting,
            state_timer: 0.0,
            charge_dir: Vec2::ZERO,
            color,
            contact_damage,
            slow_timer: 0.0,
            no_xp: true,
            spawn_grace: 0.6,
            mini_boss: Some(mini_kind),
            prism_mark_timer: 0.0,
            link_id: 0,
            shield_broken_timer: 0.0,
        });
    }

    fn start_boss_death(&mut self) {
        if let Some(boss) = &mut self.boss {
            boss.state = BossState::Dying;
            boss.state_timer = BOSS_DEATH_TIME;
            boss.hp = 0.0;
            boss.contact_damage = 0.0;
            boss.shield_hp = [0.0; 3];
            boss.lobe_hp = [0.0; 3];
            self.projectiles.clear();
            self.shake_amount += 16.0;
        }
    }

    fn finish_boss_death(&mut self) {
        let Some(boss) = self.boss.take() else {
            return;
        };

        self.boss_kills += 1;
        self.boss_breather_timer = BOSS_POST_BREATHER;
        self.shake_amount += 18.0;
        self.screen_flash = self.screen_flash.max(0.90);
        self.hit_stop_pulse = self.hit_stop_pulse.max(0.85);
        self.push_popup(boss.pos, boss.max_hp.min(99999.0), POPUP_BREAK);

        if boss.kind == BossKind::VoidPrism && !self.dead && !self.endless_mode {
            self.void_victory = true;
            self.dead = true;
            self.score = self.compute_score() + 1000;
        } else if !self.dead {
            // Every non-final boss defeat awards a guaranteed Prismatic Relic Chest!
            self.pending_relic_chests += 1;
            self.check_for_level_up();
        }

        for _ in 0..44 {
            let angle = self.rng.angle();
            let speed = self.rng.range(120.0, 360.0);
            self.particles.push(Particle {
                pos: boss.pos,
                vel: Vec2::new(angle.cos(), angle.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.65, 1.35),
                color: [1.0, self.rng.range(0.45, 0.95), self.rng.range(0.25, 0.9)],
                size: self.rng.range(2.0, 5.0),
            });
        }

        let reward_gem_count = BOSS_REWARD_GEM_BASE_COUNT * BOSS_REWARD_MULTIPLIER;
        for i in 0..reward_gem_count {
            let angle = i as f32 * std::f32::consts::TAU / reward_gem_count as f32;
            let ring = i / BOSS_REWARD_GEM_BASE_COUNT;
            let mut pos = boss.pos;
            move_on_globe(
                &mut pos,
                Vec2::new(angle.cos(), angle.sin()) * (38.0 + ring as f32 * 14.0),
            );
            self.gems.push(XpGem {
                pos,
                value: 3,
                life: 0.0,
            });
        }
    }

    fn update_void_shockwaves(&mut self, dt: f32) {
        let player_pos = self.player.pos;
        let player_r = self.player.radius;
        let iframe = self.player.iframe_timer;
        let mut hit_damage = 0.0f32;
        for sw in &mut self.void_shockwaves {
            let prev_r = sw.current_radius();
            sw.life += dt;
            let curr_r = sw.current_radius();
            if !sw.hit_player && iframe <= 0.0 {
                let dist = nearest_globe_delta(sw.pos, player_pos).length();
                if dist >= prev_r - player_r && dist <= curr_r + player_r {
                    sw.hit_player = true;
                    hit_damage += sw.damage;
                }
            }
        }
        self.void_shockwaves.retain(|sw| sw.life < sw.max_life);
        if hit_damage > 0.0 {
            self.apply_damage_to_player(hit_damage, DamageSource::VoidShockwave);
            self.player.iframe_timer = VOID_SHOCKWAVE_IFRAME_DURATION;
            self.shake_amount += 4.0;
        }
    }

    fn sentinel_shield_pos(boss: &Boss, idx: usize) -> Vec2 {
        let angle = boss.shield_angle + idx as f32 * std::f32::consts::TAU / 3.0;
        let mut pos = boss.pos;
        move_on_globe(
            &mut pos,
            Vec2::new(angle.cos(), angle.sin()) * SENTINEL_SHIELD_ORBIT,
        );
        pos
    }

    /// Returns Some((impact_pos, lobe_just_died)) on hit, None on miss.
    fn damage_boss_with_beam(
        &mut self,
        start: Vec2,
        end: Vec2,
        cap_half: f32,
        damage: f32,
    ) -> Option<(Vec2, bool)> {
        let boss = self.boss.as_mut()?;
        if boss.state != BossState::Active {
            return None;
        }

        match boss.kind {
            BossKind::Sentinel => {
                for i in 0..boss.shield_hp.len() {
                    if boss.shield_hp[i] <= 0.0 {
                        continue;
                    }
                    let shield_pos = Self::sentinel_shield_pos(boss, i);
                    if capsule_circle_intersect_globe(
                        start,
                        end,
                        cap_half,
                        shield_pos,
                        SENTINEL_SHIELD_RADIUS,
                    ) {
                        boss.shield_hp[i] = (boss.shield_hp[i] - damage).max(0.0);
                        let just_broken = boss.shield_hp[i] <= 0.0;
                        self.hit_flash_positions.push(shield_pos);
                        return Some((shield_pos, just_broken));
                    }
                }
                if capsule_circle_intersect_globe(start, end, cap_half, boss.pos, boss.radius) {
                    boss.hp -= damage;
                    self.hit_flash_positions.push(boss.pos);
                    return Some((boss.pos, false));
                }
            }
            BossKind::Hydra => {
                for i in 0..3usize {
                    if boss.lobe_hp[i] <= 0.0 {
                        continue;
                    }
                    let lobe_pos = Self::hydra_lobe_pos(boss, i);
                    if capsule_circle_intersect_globe(
                        start,
                        end,
                        cap_half,
                        lobe_pos,
                        HYDRA_LOBE_RADIUS,
                    ) {
                        boss.lobe_hp[i] = (boss.lobe_hp[i] - damage).max(0.0);
                        self.hit_flash_positions.push(lobe_pos);
                        return Some((lobe_pos, false));
                    }
                }
            }
            BossKind::VoidPrism
            | BossKind::PrismLattice
            | BossKind::MirrorSovereign
            | BossKind::ChronoEclipse => {
                let mult = if boss.stun_timer > 0.0 { 1.75 } else { 1.0 };
                if capsule_circle_intersect_globe(start, end, cap_half, boss.pos, boss.radius) {
                    boss.hp -= damage * mult;
                    self.hit_flash_positions.push(boss.pos);
                    return Some((boss.pos, false));
                }
            }
        }
        None
    }

    fn fire_shield_break_burst(&mut self, shield_pos: Vec2) {
        self.audio_event_bits |= AUDIO_SHIELD_BREAK;
        self.screen_flash = self.screen_flash.max(0.55);
        self.hit_stop_pulse = self.hit_stop_pulse.max(0.60);
        self.push_popup(shield_pos, SENTINEL_SHIELD_HP, POPUP_BREAK);
        let damage_scale = 1.0 + self.rank_pressure() * BOSS_WEAPON_DAMAGE_RANK_MULT;
        for i in 0..BOSS_SHIELD_BURST_COUNT {
            let angle = (i as f32 / BOSS_SHIELD_BURST_COUNT as f32) * std::f32::consts::TAU;
            let dir = Vec2::new(angle.cos(), angle.sin());
            self.projectiles.push(Projectile {
                pos: shield_pos,
                vel: dir * BOSS_PROJ_SPEED,
                radius: PROJ_RADIUS,
                damage: BOSS_PROJ_DAMAGE * 0.6 * damage_scale,
                life: 0.0,
            });
        }
        self.shake_amount += 4.0;
        for _ in 0..20 {
            let a = self.rng.angle();
            let speed = self.rng.range(90.0, 240.0);
            self.particles.push(Particle {
                pos: shield_pos,
                vel: Vec2::new(a.cos(), a.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.4, 0.9),
                color: [1.0, 0.75, 0.3],
                size: self.rng.range(2.0, 4.5),
            });
        }
    }

    fn damage_boss_with_secondary_beam(
        &mut self,
        start: Vec2,
        end: Vec2,
        cap_half: f32,
        damage: f32,
    ) {
        if let Some((impact, shield_broken)) =
            self.damage_boss_with_beam(start, end, cap_half, damage)
        {
            if shield_broken {
                self.fire_shield_break_burst(impact);
            }
        }
    }

    fn damage_boss_area(&mut self, origin: Vec2, radius: f32, damage: f32, boss_mult: f32) -> u32 {
        let Some(boss) = &mut self.boss else {
            return 0;
        };
        if boss.state != BossState::Active {
            return 0;
        }

        let mut hits = 0;
        match boss.kind {
            BossKind::Hydra => {
                for i in 0..3usize {
                    if boss.lobe_hp[i] <= 0.0 {
                        continue;
                    }
                    let lp = Self::hydra_lobe_pos(boss, i);
                    let d = globe_distance(lp, origin);
                    if d <= radius + HYDRA_LOBE_RADIUS {
                        let falloff = (1.0 - d / radius.max(1.0)).clamp(0.0, 1.0);
                        boss.lobe_hp[i] = (boss.lobe_hp[i]
                            - damage * boss_mult * (0.45 + 0.55 * falloff))
                            .max(0.0);
                        self.hit_flash_positions.push(lp);
                        hits += 1;
                    }
                }
                boss.hp = boss.lobe_hp.iter().sum();
            }
            BossKind::Sentinel
            | BossKind::VoidPrism
            | BossKind::PrismLattice
            | BossKind::MirrorSovereign
            | BossKind::ChronoEclipse => {
                let d = globe_distance(boss.pos, origin);
                if d <= radius + boss.radius {
                    let falloff = (1.0 - d / radius.max(1.0)).clamp(0.0, 1.0);
                    let stun_mult = if boss.stun_timer > 0.0 { 1.75 } else { 1.0 };
                    boss.hp -= damage * boss_mult * stun_mult * (0.45 + 0.55 * falloff);
                    self.hit_flash_positions.push(boss.pos);
                    hits += 1;
                }
            }
        }
        hits
    }

    fn damage_area(
        &mut self,
        origin: Vec2,
        radius: f32,
        damage: f32,
        impulse: f32,
        slow_duration: f32,
        boss_mult: f32,
    ) -> u32 {
        let mut hits = 0;
        let origin_local = nearest_globe_delta(self.player.pos, origin);
        let mut candidates: Vec<usize> = Vec::new();
        self.spatial.query_circle(origin_local, radius, |idx| {
            if idx < self.enemies.len() {
                candidates.push(idx);
            }
        });
        for idx in candidates {
            let e = &mut self.enemies[idx];
            if e.hp <= 0.0 {
                continue;
            }
            let d = globe_distance(e.pos, origin);
            if d <= radius + e.radius {
                let falloff = (1.0 - d / radius.max(1.0)).clamp(0.0, 1.0);
                let dealt = damage * (0.45 + 0.55 * falloff);
                e.hp -= dealt;
                if impulse.abs() > 0.0 && d > 1.0 {
                    let away = nearest_globe_delta(origin, e.pos).normalize_or_zero();
                    let dir = if impulse >= 0.0 { away } else { -away };
                    move_on_globe(&mut e.pos, dir * impulse.abs() * falloff);
                }
                if slow_duration > 0.0 {
                    e.slow_timer = e.slow_timer.max(slow_duration * (0.45 + 0.55 * falloff));
                }
                let epos = e.pos;
                self.total_damage_dealt += dealt;
                self.hit_flash_positions.push(epos);
                self.push_popup(epos, dealt, if dealt >= 95.0 { POPUP_CRIT } else { POPUP_NORMAL });
                hits += 1;
            }
        }
        hits + self.damage_boss_area(origin, radius, damage, boss_mult)
    }

    fn emit_dash_blast(&mut self, pos: Vec2, dir: Vec2) {
        let phase_step = self.inventory.level(ShardKind::PhaseStep) as f32;
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        let afterimage = self
            .inventory
            .has_evolution(EvolutionKind::AfterimageEngine);
        let phase_wake = self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::PhaseStep);

        let radius = DASH_BLAST_BASE_RADIUS
            + phase_step * DASH_BLAST_RADIUS_PER_PHASE
            + if afterimage { 14.0 } else { 0.0 }
            + if phase_wake { 22.0 } else { 0.0 };
        let damage =
            DASH_BLAST_BASE_DAMAGE + momentum * DASH_BLAST_DAMAGE_PER_MOMENTUM + phase_step * 12.0;
        let hits = self.damage_area(
            pos,
            radius,
            damage,
            DASH_BLAST_PUSH,
            0.0,
            DASH_BLAST_BOSS_DAMAGE_MULT,
        );

        self.pulses.push(InterferencePulse {
            pos,
            life: 0.0,
            max_life: DASH_BLAST_LIFETIME,
            max_radius: radius * 1.08,
            kind: PulseKind::DashBlast,
            damage_multiplier: 0.75,
        });

        let base_angle = dir.y.atan2(dir.x);
        for i in 0..5 {
            let a = base_angle + (i as f32 - 2.0) * 0.58;
            let beam_dir = Vec2::new(a.cos(), a.sin());
            self.beams.push(Beam {
                start: pos,
                end: tangent_endpoint_on_globe(pos, beam_dir * radius * 0.78),
                life: 0.0,
                max_life: 0.13,
                thickness: 2.4 + phase_step * 0.18,
                color: [0.58, 1.0, 0.92],
                is_echo: false,
            });
        }
        for _ in 0..14 {
            let a = self.rng.angle();
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(90.0, 290.0),
                life: 0.0,
                max_life: self.rng.range(0.16, 0.38),
                color: [0.62, 1.0, 0.96],
                size: self.rng.range(2.0, 5.8),
            });
        }

        if phase_wake {
            let mine_level = self.inventory.level(ShardKind::Minefield);
            if mine_level > 0 {
                let wake_radius = self.mine_radius(mine_level) * 0.62 + phase_step * 6.0;
                let wake_damage = self.mine_damage(mine_level) * 0.52;
                self.emit_mine(pos, wake_radius, wake_damage, mine_level, 0.65);
            }
        }

        self.audio_event_bits |= AUDIO_DASH_BLAST;
        self.shake_amount += if hits > 0 { 3.8 } else { 1.5 };
    }

    fn mine_count(&self, level: u8) -> u32 {
        let idx = level.saturating_sub(1) as i32;
        let mut count = MINE_COUNT_GROWTH.powi(idx).ceil() as u32;
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Magnet)
        {
            count += 1 + self.inventory.level(ShardKind::Magnet) as u32 / 2;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference)
        {
            count += 1 + self.inventory.level(ShardKind::Interference) as u32 / 3;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Arc)
        {
            count += 1;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::PhaseStep)
        {
            count += self.inventory.level(ShardKind::PhaseStep) as u32 / 3;
        }
        count.min(MINE_MAX_COUNT).max(1)
    }

    fn mine_radius(&self, level: u8) -> f32 {
        let idx = level.saturating_sub(1) as i32;
        let mut radius = MINE_BASE_RADIUS * MINE_RADIUS_GROWTH.powi(idx);
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Magnet)
        {
            radius += self.inventory.level(ShardKind::Magnet) as f32 * 16.0;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference)
        {
            radius *= 1.0 + self.inventory.level(ShardKind::Interference) as f32 * 0.035;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Arc)
        {
            radius += self.inventory.level(ShardKind::Arc) as f32 * 7.0;
        }
        radius
    }

    fn mine_damage(&self, level: u8) -> f32 {
        let idx = level.saturating_sub(1) as i32;
        let mut damage = MINE_BASE_DAMAGE * MINE_DAMAGE_GROWTH.powi(idx);
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference)
        {
            damage *= 1.18;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Arc)
        {
            damage *= 1.12;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Magnet)
        {
            damage *= 1.08;
        }
        damage
    }

    fn mine_interval(&self, level: u8) -> f32 {
        let mut interval = MINE_BASE_INTERVAL / (1.0 + level as f32 * 0.11);
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference)
        {
            interval *= 0.84;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Arc)
        {
            interval *= 0.93;
        }
        if self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::PhaseStep)
        {
            interval *= 0.94;
        }
        interval.max(0.46)
    }

    fn emit_mine(&mut self, pos: Vec2, radius: f32, damage: f32, level: u8, effect_scale: f32) {
        let gravity_mines = self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Magnet);
        let seismic = self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Interference);
        let magnet = self.inventory.level(ShardKind::Magnet) as f32;
        let impulse = if gravity_mines {
            -MINE_BASE_IMPULSE * (1.0 + magnet * 0.18) * effect_scale
        } else {
            MINE_BASE_IMPULSE * 0.55 * effect_scale
        };
        let slow = if gravity_mines || seismic {
            FROST_SLOW_DURATION * (0.32 + level as f32 * 0.035)
        } else {
            0.0
        };
        let blast_radius = radius * (if seismic { 0.82 } else { 0.70 });
        let blast_damage = damage
            * effect_scale
            * (if seismic { 1.12 } else { 1.0 })
            * (if gravity_mines { 1.08 } else { 1.0 });

        let hits = self.damage_area(pos, blast_radius, blast_damage, impulse, slow, 0.38);
        self.pulses.push(InterferencePulse {
            pos,
            life: 0.0,
            max_life: MINE_PULSE_LIFETIME * effect_scale.max(0.72),
            max_radius: radius,
            kind: PulseKind::Mine,
            damage_multiplier: (1.0 + level as f32 * 0.16) * effect_scale,
        });
        if seismic {
            self.pulses.push(InterferencePulse {
                pos,
                life: 0.0,
                max_life: MINE_PULSE_LIFETIME * 1.35,
                max_radius: radius * 1.22,
                kind: PulseKind::Mine,
                damage_multiplier: (1.15 + level as f32 * 0.12) * effect_scale,
            });
        }

        self.fire_mine_tripwires(pos, radius, level, effect_scale);

        let particle_count = 10 + level as u32 * 2 + if seismic { 6 } else { 0 };
        for i in 0..particle_count {
            let a = self.rng.angle();
            let speed = self.rng.range(55.0, 185.0) * effect_scale.max(0.72);
            let color = if i % 3 == 0 {
                [1.0, 0.82, 0.34]
            } else if gravity_mines {
                [0.38, 1.0, 0.84]
            } else {
                [0.74, 1.0, 0.48]
            };
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(a.cos(), a.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.20, 0.52),
                color,
                size: self.rng.range(1.8, 5.2),
            });
        }

        self.audio_event_bits |= AUDIO_MINE_BURST;
        self.shake_amount += if hits > 0 { 2.8 } else { 0.9 };
    }

    fn fire_mine_tripwires(&mut self, pos: Vec2, radius: f32, _level: u8, effect_scale: f32) {
        if !self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Arc)
        {
            return;
        }

        let arc_level = self.inventory.level(ShardKind::Arc).max(1);
        let storm_front = self
            .inventory
            .has_synergy(ShardKind::Arc, ShardKind::Cascade);
        let static_freeze = self.inventory.has_synergy(ShardKind::Arc, ShardKind::Frost);
        let beam_count =
            MINE_TRIPWIRE_BASE_BEAMS + arc_level as u32 / 2 + if storm_front { 2 } else { 0 };
        let reach = radius * MINE_TRIPWIRE_REACH_MULT * (if storm_front { 1.16 } else { 1.0 });
        let damage = MINE_TRIPWIRE_DAMAGE
            * effect_scale
            * (1.0 + arc_level as f32 * 0.16)
            * (if storm_front { 1.16 } else { 1.0 });
        let color = if static_freeze {
            [0.58, 0.95, 1.0]
        } else {
            [0.96, 0.72, 1.0]
        };
        let base = self.rng.angle();

        for i in 0..beam_count {
            let a = base + i as f32 * std::f32::consts::TAU / beam_count as f32;
            let dir = Vec2::new(a.cos(), a.sin());
            let end = tangent_endpoint_on_globe(pos, dir * reach);
            let thickness = 1.8 + arc_level as f32 * 0.12;
            for e in &mut self.enemies {
                if capsule_circle_intersect_globe(pos, end, thickness * 0.5, e.pos, e.radius) {
                    e.hp -= damage;
                    if static_freeze {
                        e.slow_timer = e.slow_timer.max(FROST_SLOW_DURATION);
                    }
                    self.hit_flash_positions.push(e.pos);
                }
            }
            self.damage_boss_with_secondary_beam(pos, end, thickness * 0.5, damage * 0.45);
            self.beams.push(Beam {
                start: pos,
                end,
                life: 0.0,
                max_life: 0.15,
                thickness,
                color,
                is_echo: false,
            });
        }
    }

    // --- Firing ---------------------------------------------------------

    fn update_aim_trainer(&mut self, dt: f32, raw_dt: f32, deadeye_was_active: bool) {
        let clicked = self.aim_clicked;
        self.aim_clicked = false;
        self.aim_tracking_active = false;
        self.aim_track_progress = 0.0;
        self.aim_hovering_target = false;

        // Resolve queued Echo shard delayed precision sniper strikes!
        let now = self.time;
        let mut echo_idx = 0;
        while echo_idx < self.pending_sniper_echoes.len() {
            if self.pending_sniper_echoes[echo_idx].0 <= now {
                let (_, pos, mult) = self.pending_sniper_echoes.swap_remove(echo_idx);
                self.fire_precision_lance(pos, [1.0, 0.62, 0.36], mult, false);
            } else {
                echo_idx += 1;
            }
        }

        if !self.aim_active {
            return;
        }

        if self.aim_fire_cooldown > 0.0 {
            self.aim_fire_cooldown = (self.aim_fire_cooldown - raw_dt).max(0.0);
        }

        let aim_tangent = unproject_globe_offset(self.aim_screen_offset);
        let aim_world = tangent_endpoint_on_globe(self.player.pos, aim_tangent);
        let tier = self.aim_tier.clamp(1, 10) as f32;
        let lens_lvl = self.inventory.level(ShardKind::Lens) as f32;
        let frost_lvl = self.inventory.level(ShardKind::Frost) as f32;
        // Lens shard expands target hitboxes generously (+6%/lvl)!
        let hitbox_mult = 1.28 + lens_lvl * 0.06;

        // 0. PRISMATIC DEAD-EYE OVERDRIVE: sweep cursor to paint up to 6 golden orbital locks!
        if deadeye_was_active {
            let mut candidate: Option<Vec2> = None;
            // Prioritize Ghost Snipers, then Boss, then nearest enemy under cursor!
            for t in &self.aim_targets {
                if globe_distance(aim_world, t.pos) <= t.radius * 1.9 {
                    candidate = Some(t.pos);
                    break;
                }
            }
            if candidate.is_none() {
                if let Some(boss) = &self.boss {
                    if boss.state == BossState::Active
                        && globe_distance(aim_world, boss.pos) <= boss.radius + 42.0
                    {
                        candidate = Some(boss.pos);
                    }
                }
            }
            if candidate.is_none() {
                let local_aim = nearest_globe_delta(self.player.pos, aim_world);
                let mut best: Option<(Vec2, f32)> = None;
                self.spatial.query_circle(local_aim, 48.0, |idx| {
                    if idx < self.enemies.len() && self.enemies[idx].hp > 0.0 {
                        let d = globe_distance(aim_world, self.enemies[idx].pos);
                        if d <= self.enemies[idx].radius + 26.0
                            && best.map_or(true, |(_, bd)| d < bd)
                        {
                            best = Some((self.enemies[idx].pos, d));
                        }
                    }
                });
                candidate = best.map(|(p, _)| p);
            }
            if clicked && candidate.is_none() {
                candidate = Some(aim_world);
            }
            if let Some(lock_pos) = candidate {
                let far_enough = self
                    .deadeye_locks
                    .iter()
                    .all(|&p| globe_distance(p, lock_pos) > 26.0);
                if far_enough && self.deadeye_locks.len() < DEADEYE_MAX_LOCKS {
                    self.deadeye_locks.push(lock_pos);
                    self.audio_event_bits |= AUDIO_AIM_HIT;
                }
            }
            // Execute orbital rail volley when Dead-Eye timer finishes or all 6 locks are painted!
            if self.deadeye_timer <= 0.0 || self.deadeye_locks.len() >= DEADEYE_MAX_LOCKS {
                self.deadeye_timer = 0.0;
                self.execute_deadeye_volley();
            }
            return;
        }

        // 1. Spawn next Pink Ghost Sniper Phantom duel when none active.
        if self.aim_targets.is_empty() {
            self.active_ghost_id = -1;
            self.active_ghost_golden = false;
            self.aim_drill_cooldown -= dt;
            if self.aim_drill_cooldown <= 0.0 {
                self.spawn_next_aim_drill();
            }
        }

        // 2. Update active Ghost Sniper Phantoms (lock-on warning + hostile firing if ignored!).
        let frost_time_scale = if frost_lvl > 0.0 { 0.78 } else { 1.0 };
        let frost_strafe_scale = (1.0 - frost_lvl * 0.06).max(0.58);
        let mut fired_ghosts: Vec<(Vec2, AimDrillKind, bool)> = Vec::new();
        for t in &mut self.aim_targets {
            t.life += dt * frost_time_scale;
            if t.kind == AimDrillKind::Track {
                t.strafe_phase += dt * (1.25 + tier * 0.20) * frost_strafe_scale;
                let angular_speed = (0.76 + tier * 0.13)
                    * frost_strafe_scale
                    * (0.65 + 0.55 * t.strafe_phase.sin().abs())
                    * t.strafe_sign;
                if (t.strafe_phase * 0.72).sin() > 0.96 {
                    t.strafe_sign = -t.strafe_sign;
                }
                t.orbit_angle += angular_speed * dt;
                let r_mod = t.orbit_radius + (t.strafe_phase * 1.4).cos() * (22.0 + tier * 3.2);
                let offset = Vec2::new(t.orbit_angle.cos(), t.orbit_angle.sin()) * r_mod;
                t.pos = tangent_endpoint_on_globe(self.player.pos, offset);
            }
            // Sniper lock warning ping when < 30% lock time remains!
            if !t.warned && t.life >= t.max_life * 0.70 {
                t.warned = true;
                self.audio_event_bits |= AUDIO_GHOST_LOCK;
            }
            if t.life >= t.max_life {
                fired_ghosts.push((t.pos, t.kind, t.golden));
            }
        }

        // Hostile Ghost Sniper fires back if the player failed to counter-snipe in time!
        if !fired_ghosts.is_empty() {
            self.aim_targets.clear();
            self.aim_last_hit_pos = None;
            self.active_ghost_id = -1;
            self.active_ghost_golden = false;
            self.aim_drill_cooldown = 2.0;
            self.aim_combo = 0;
            self.aim_tier_progress -= 1;
            if self.aim_tier_progress <= -2 && self.aim_tier > 1 {
                self.aim_tier -= 1;
                self.aim_tier_progress = 0;
            }
            self.audio_event_bits |= AUDIO_GHOST_SHOT;
            for (gpos, kind, golden) in fired_ghosts {
                let to_p = nearest_globe_delta(gpos, self.player.pos).normalize_or_zero();
                let rail_end = tangent_endpoint_on_globe(gpos, to_p * 540.0);
                self.beams.push(Beam {
                    start: gpos,
                    end: rail_end,
                    life: 0.0,
                    max_life: 0.28,
                    thickness: if golden { 6.5 } else { 5.2 },
                    color: [1.0, 0.20, 0.68],
                    is_echo: false,
                });
                // Sniper shot hits unless player dashed / airborne / i-framed!
                let sniper_dmg = match kind {
                    AimDrillKind::Flick => 18.0 + tier * 1.2,
                    AimDrillKind::Track => 15.0 + tier * 1.0,
                    AimDrillKind::Micro => 11.0 + tier * 0.8,
                };
                if self.player.iframe_timer <= 0.0
                    && self.player.altitude < 0.14
                    && capsule_circle_intersect_globe(
                        gpos,
                        rail_end,
                        8.0,
                        self.player.pos,
                        self.player.radius,
                    )
                {
                    self.apply_damage_to_player(sniper_dmg, DamageSource::Projectile);
                    self.player.iframe_timer = IFRAME_DURATION;
                    self.ghost_snipes_taken += 1;
                    self.shake_amount = (self.shake_amount + 6.0).min(14.0);
                }
                // Spawn a fast trailing pink bolt on Track/Micro escape for extra duel tension.
                if kind != AimDrillKind::Flick {
                    self.projectiles.push(Projectile {
                        pos: gpos,
                        vel: to_p * (PROJ_SPEED * 1.35),
                        life: 0.0,
                        damage: sniper_dmg * 0.7,
                        radius: PROJ_RADIUS * 1.15,
                    });
                }
            }
        }

        // Check hover state (Ghost Phantoms, Boss Weakpoints, Lunar Prisms, Lattice Relays, Enemies).
        for t in &self.aim_targets {
            if globe_distance(aim_world, t.pos) <= t.radius * hitbox_mult {
                self.aim_hovering_target = true;
                break;
            }
        }
        if !self.aim_hovering_target {
            if let Some(boss) = &self.boss {
                if boss.state == BossState::Active {
                    if (self.optical_stacks >= 3 || matches!(boss.kind, BossKind::Sentinel | BossKind::VoidPrism))
                        && boss.weakpoint_cooldown <= 0.0
                        && globe_distance(aim_world, Self::boss_weakpoint_pos(boss)) <= 24.0 * (hitbox_mult / 1.28)
                    {
                        self.aim_hovering_target = true;
                    } else if boss.kind == BossKind::PrismLattice {
                        let count = Self::lattice_spoke_count(boss);
                        for i in 0..count {
                            if boss.spoke_disabled[i] <= 0.0
                                && globe_distance(aim_world, Self::lattice_relay_pos(boss, i)) <= 24.0
                            {
                                self.aim_hovering_target = true;
                                break;
                            }
                        }
                    } else if boss.kind == BossKind::ChronoEclipse && boss.phase == 1 {
                        for &(lp, alive) in &boss.lunar_prisms {
                            if alive && globe_distance(aim_world, lp) <= 26.0 {
                                self.aim_hovering_target = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if !self.aim_hovering_target {
            let local_aim = nearest_globe_delta(self.player.pos, aim_world);
            self.spatial.query_circle(local_aim, 28.0, |idx| {
                if idx < self.enemies.len()
                    && globe_distance(aim_world, self.enemies[idx].pos)
                        <= self.enemies[idx].radius + 14.0
                {
                    self.aim_hovering_target = true;
                }
            });
        }

        // 3. Smooth Tracking Ghost Hunter (hold LMB / RT on its orbital shield core).
        let mut track_completed: Option<(Vec2, bool)> = None;
        for t in &mut self.aim_targets {
            if t.kind != AimDrillKind::Track {
                continue;
            }
            let dist = globe_distance(aim_world, t.pos);
            let on_target = self.aim_held && dist <= t.radius * (hitbox_mult + 0.08);
            if on_target {
                let charge_time = (1.35 - tier * 0.032).max(0.88);
                t.progress = (t.progress + dt / charge_time).min(1.0);
                // Tracking breaks the Ghost's lock-on progress steadily!
                t.life = (t.life - dt * 0.72).max(0.0);
                self.aim_tracking_active = true;
                self.aim_track_progress = t.progress;

                self.beams.push(Beam {
                    start: self.player.pos,
                    end: t.pos,
                    life: 0.0,
                    max_life: 0.06,
                    thickness: 2.8 + t.progress * 3.4 + lens_lvl * 0.35,
                    color: [1.0, 0.42 + t.progress * 0.55, 0.88],
                    is_echo: false,
                });

                if t.progress >= 1.0 {
                    track_completed = Some((t.pos, t.golden));
                }
            } else if t.progress > 0.0 {
                t.progress = (t.progress - dt * 0.40).max(0.0);
            }
        }

        // Continuous burn around Track Hunter while locked.
        if self.aim_tracking_active {
            if let Some(orb_pos) = self.aim_targets.first().map(|t| t.pos) {
                let burn_dps = (125.0 + self.rank as f32 * 18.0 + tier * 22.0)
                    * self.global_damage_mult()
                    * dt;
                self.damage_area(orb_pos, 92.0 + lens_lvl * 8.0, burn_dps, 0.0, 0.0, 1.8);
            }
        }

        if let Some((pos, golden)) = track_completed {
            self.aim_targets.clear();
            self.aim_hits += 1;
            self.aim_shots += 1;
            self.aim_combo += 1;
            self.peak_aim_combo = self.peak_aim_combo.max(self.aim_combo);
            self.on_aim_drill_completed(AimDrillKind::Track, pos, golden);
            return;
        }

        // 4. Precision Click / Counter-Snipe Shot (LMB / RT rising edge).
        if clicked && self.aim_fire_cooldown <= 0.0 {
            // 4a. Check Ghost Sniper Phantom hit first!
            let mut hit_idx: Option<usize> = None;
            let mut best_d = f32::MAX;
            for (i, t) in self.aim_targets.iter().enumerate() {
                if t.kind == AimDrillKind::Track {
                    continue;
                }
                let d = globe_distance(aim_world, t.pos);
                if d <= t.radius * hitbox_mult && d < best_d {
                    best_d = d;
                    hit_idx = Some(i);
                }
            }

            if let Some(idx) = hit_idx {
                self.aim_shots += 1;
                self.aim_hits += 1;
                self.aim_combo += 1;
                self.peak_aim_combo = self.peak_aim_combo.max(self.aim_combo);
                self.aim_fire_cooldown = 0.055;
                self.audio_event_bits |= AUDIO_AIM_HIT;
                self.add_overdrive_charge(0.11);

                let hit = self.aim_targets.remove(idx);
                self.aim_last_hit_pos = Some(hit.pos);
                let lance_col = if hit.golden {
                    [1.0, 0.90, 0.30]
                } else {
                    [1.0, 0.42, 0.86]
                };
                self.fire_precision_lance(hit.pos, lance_col, 1.25, true);

                // PhaseStep / 12-stack Phase Refund cuts Dash cooldown immediately on Ghost counter-snipe!
                let phase_lvl = self.inventory.level(ShardKind::PhaseStep) as f32;
                if phase_lvl > 0.0 || self.optical_stacks >= 12 {
                    let refund = (0.45 + phase_lvl * 0.12
                        + if self.optical_stacks >= 12 { 0.25 } else { 0.0 })
                    .min(1.0);
                    self.player.dash_cooldown =
                        (self.player.dash_cooldown - self.dash_cooldown_duration() * refund).max(0.0);
                }

                match hit.kind {
                    AimDrillKind::Flick => {
                        if hit.step < hit.total {
                            self.spawn_flick_step(hit.pos, hit.step + 1, hit.total, hit.ghost_id, hit.golden);
                        } else {
                            self.on_aim_drill_completed(AimDrillKind::Flick, hit.pos, hit.golden);
                        }
                    }
                    AimDrillKind::Micro => {
                        if self.aim_targets.is_empty() {
                            self.on_aim_drill_completed(AimDrillKind::Micro, hit.pos, hit.golden);
                        }
                    }
                    AimDrillKind::Track => {}
                }
                return;
            }

            // 4b. Check interactive Boss Weakpoint / Lattice Relay / Mirror Sovereign Counter / Lunar Prism clicks!
            if self.try_snipe_boss_mechanic(aim_world, hitbox_mult) {
                self.aim_shots += 1;
                self.aim_hits += 1;
                self.aim_combo += 1;
                self.peak_aim_combo = self.peak_aim_combo.max(self.aim_combo);
                self.aim_fire_cooldown = 0.07;
                self.audio_event_bits |= AUDIO_WEAKPOINT_CRIT;
                self.add_overdrive_charge(0.18);
                return;
            }

            // If clicking a Track Hunter to start holding, don't penalize!
            let clicking_track = self.aim_targets.iter().any(|t| {
                t.kind == AimDrillKind::Track && globe_distance(aim_world, t.pos) <= t.radius * (hitbox_mult + 0.08)
            });
            if clicking_track {
                return;
            }

            // 4c. Direct Precision Sniper Lance at cursor (rewards direct enemy/carrier/reflector flicking!).
            self.aim_shots += 1;
            let hit_enemy = self.fire_precision_lance(aim_world, [0.55, 0.96, 1.0], 1.0, true);
            if hit_enemy {
                self.aim_hits += 1;
                self.aim_combo += 1;
                self.peak_aim_combo = self.peak_aim_combo.max(self.aim_combo);
                self.aim_fire_cooldown = 0.085;
                self.audio_event_bits |= AUDIO_AIM_HIT;
                self.add_overdrive_charge(0.08);
            } else {
                // Miss resets active Focus streak (NEVER removes permanent Optical Precision stacks!).
                self.aim_combo = 0;
                self.aim_fire_cooldown = 0.20;
                self.audio_event_bits |= AUDIO_AIM_MISS;
            }
        }
    }

    fn add_overdrive_charge(&mut self, base: f32) {
        let core_mult = if self.prism_core == PrismCore::SniperLens {
            1.35
        } else {
            1.0
        };
        let stack_mult = 1.0 + self.optical_stacks as f32 * 0.015;
        self.overdrive_charge = (self.overdrive_charge + base * core_mult * stack_mult).min(1.0);
    }

    fn execute_deadeye_volley(&mut self) {
        if self.deadeye_locks.is_empty() {
            // If player didn't paint specific locks, auto-snap up to 4 nearest threats!
            let mut nearest: Vec<(Vec2, f32)> = self
                .enemies
                .iter()
                .filter(|e| e.hp > 0.0)
                .map(|e| (e.pos, globe_distance(self.player.pos, e.pos)))
                .collect();
            nearest.sort_unstable_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            for (p, _) in nearest.into_iter().take(4) {
                self.deadeye_locks.push(p);
            }
            if let Some(boss) = &self.boss {
                if boss.state == BossState::Active {
                    self.deadeye_locks.push(boss.pos);
                }
            }
        }
        let locks = std::mem::take(&mut self.deadeye_locks);
        if locks.is_empty() {
            return;
        }
        self.audio_event_bits |= AUDIO_DEADEYE_VOLLEY;
        self.screen_flash = self.screen_flash.max(0.85);
        self.hit_stop_pulse = self.hit_stop_pulse.max(0.75);
        self.shake_amount = (self.shake_amount + 14.0).min(20.0);

        let cols = [
            [1.0, 0.88, 0.30],
            [0.35, 1.0, 0.92],
            [1.0, 0.36, 0.82],
            [0.62, 0.78, 1.0],
            [0.52, 1.0, 0.56],
            [1.0, 0.58, 0.28],
        ];
        for (i, pos) in locks.into_iter().enumerate() {
            let col = cols[i % cols.len()];
            self.fire_precision_lance(pos, col, 3.6, false);
            self.damage_area(
                pos,
                145.0,
                (380.0 + self.rank as f32 * 45.0) * self.global_damage_mult(),
                220.0,
                0.0,
                2.5,
            );
            // Also obliterate any Ghost Phantom caught near a Dead-Eye lock!
            let mut ghost_done: Option<(AimDrillKind, Vec2, bool)> = None;
            let mut idx_rm: Option<usize> = None;
            for (ti, t) in self.aim_targets.iter().enumerate() {
                if globe_distance(pos, t.pos) <= t.radius * 2.2 {
                    idx_rm = Some(ti);
                    break;
                }
            }
            if let Some(ti) = idx_rm {
                let hit = self.aim_targets.remove(ti);
                ghost_done = Some((hit.kind, hit.pos, hit.golden));
            }
            if let Some((kind, gpos, golden)) = ghost_done {
                self.aim_targets.clear();
                self.on_aim_drill_completed(kind, gpos, golden);
            }
        }
    }

    fn try_snipe_boss_mechanic(&mut self, aim_world: Vec2, hitbox_mult: f32) -> bool {
        let dmg_base = (220.0 + self.rank as f32 * 28.0 + self.aim_tier as f32 * 35.0)
            * self.global_damage_mult()
            * (1.0 + self.inventory.level(ShardKind::Lens) as f32 * 0.20);
        let reach_pad = 24.0 * (hitbox_mult / 1.28);

        let mut hit_pos: Option<Vec2> = None;
        let mut dealt_val = 0.0_f32;
        let mut boss_burst_pos: Option<Vec2> = None;

        if let Some(boss) = &mut self.boss {
            if boss.state != BossState::Active {
                return false;
            }
            // 1. PrismLattice spoke Relay Node click -> shorts out that laser spoke & staggers!
            if boss.kind == BossKind::PrismLattice {
                let count = Self::lattice_spoke_count(boss);
                for i in 0..count {
                    if boss.spoke_disabled[i] <= 0.0 {
                        let rp = Self::lattice_relay_pos(boss, i);
                        if globe_distance(aim_world, rp) <= reach_pad {
                            boss.spoke_disabled[i] = 5.5;
                            let dealt = dmg_base * 3.0;
                            boss.hp -= dealt;
                            hit_pos = Some(rp);
                            dealt_val = dealt;
                            boss_burst_pos = Some(rp);
                            break;
                        }
                    }
                }
            }
            // 2. MirrorSovereign counter-snipe while charging -> shatters clones & STAGGERS 3.0s!
            if hit_pos.is_none()
                && boss.kind == BossKind::MirrorSovereign
                && globe_distance(aim_world, boss.pos) <= boss.radius + 16.0
            {
                let bonus = if boss.aim_charge > 0.05 { 3.5 } else { 2.0 };
                let dealt = dmg_base * bonus;
                boss.hp -= dealt;
                if boss.aim_charge > 0.05 {
                    boss.aim_charge = 0.0;
                    boss.stun_timer = 3.0;
                    boss_burst_pos = Some(boss.pos);
                }
                hit_pos = Some(boss.pos);
                dealt_val = dealt;
            }
            // 3. ChronoEclipse Lunar Curtain prism detonation -> carves safe pocket & reflects 4% max HP!
            if hit_pos.is_none() && boss.kind == BossKind::ChronoEclipse && boss.phase == 1 {
                for i in 0..6 {
                    if boss.lunar_prisms[i].1
                        && globe_distance(aim_world, boss.lunar_prisms[i].0) <= reach_pad + 4.0
                    {
                        let lp = boss.lunar_prisms[i].0;
                        boss.lunar_prisms[i].1 = false;
                        let dealt = (boss.max_hp * 0.04).max(dmg_base * 3.2);
                        boss.hp -= dealt;
                        hit_pos = Some(lp);
                        dealt_val = dealt;
                        boss_burst_pos = Some(lp);
                        break;
                    }
                }
            }
            // 4. Universal Orbiting Boss Weakpoint Core (Weakpoint Sight @ 3 stacks, or Sentinel/VoidPrism)!
            if hit_pos.is_none()
                && (self.optical_stacks >= 3
                    || matches!(boss.kind, BossKind::Sentinel | BossKind::VoidPrism))
                && boss.weakpoint_cooldown <= 0.0
            {
                let wp = Self::boss_weakpoint_pos(boss);
                if globe_distance(aim_world, wp) <= reach_pad {
                    boss.weakpoint_cooldown = 1.6;
                    let dealt = dmg_base * 3.2;
                    if boss.kind == BossKind::Hydra {
                        for h in &mut boss.lobe_hp {
                            if *h > 0.0 {
                                *h = (*h - dealt * 0.5).max(0.0);
                            }
                        }
                        boss.hp = boss.lobe_hp.iter().sum();
                    } else {
                        boss.hp -= dealt;
                    }
                    hit_pos = Some(wp);
                    dealt_val = dealt;
                    boss_burst_pos = Some(wp);
                }
            }
        }

        if let Some(pos) = hit_pos {
            self.total_damage_dealt += dealt_val;
            self.hit_flash_positions.push(pos);
            self.push_popup(pos, dealt_val, POPUP_BREAK);
            self.beams.push(Beam {
                start: self.player.pos,
                end: pos,
                life: 0.0,
                max_life: 0.20,
                thickness: 5.5,
                color: [1.0, 0.90, 0.34],
                is_echo: false,
            });
            if let Some(bp) = boss_burst_pos {
                self.screen_flash = self.screen_flash.max(0.45);
                self.hit_stop_pulse = self.hit_stop_pulse.max(0.42);
                self.shake_amount = (self.shake_amount + 6.0).min(15.0);
                self.pulses.push(InterferencePulse {
                    pos: bp,
                    life: 0.0,
                    max_life: 0.36,
                    max_radius: 130.0,
                    kind: PulseKind::DashBlast,
                    damage_multiplier: 0.8,
                });
            }
            return true;
        }
        false
    }

    fn pick_aim_viewport_pos(&mut self, avoid: Option<Vec2>, min_jump: f32) -> Vec2 {
        let max_x = (self.screen_size.x * 0.36).clamp(160.0, 380.0);
        let max_y = (self.screen_size.y * 0.32).clamp(110.0, 230.0);
        for _ in 0..14 {
            let ox = self.rng.range(-max_x, max_x);
            let oy = self.rng.range(-max_y, max_y);
            let offset = Vec2::new(ox, oy);
            if offset.length() < 92.0 {
                continue;
            }
            let world = tangent_endpoint_on_globe(self.player.pos, offset);
            if let Some(prev) = avoid {
                if globe_distance(prev, world) < min_jump {
                    continue;
                }
            }
            return world;
        }
        let a = self.rng.angle();
        tangent_endpoint_on_globe(self.player.pos, Vec2::new(a.cos(), a.sin()) * 175.0)
    }

    fn spawn_next_aim_drill(&mut self) {
        let kind = match self.aim_next_drill % 3 {
            0 => AimDrillKind::Flick,
            1 => AimDrillKind::Track,
            _ => AimDrillKind::Micro,
        };
        self.aim_next_drill += 1;
        self.aim_last_hit_pos = None;
        let tier = self.aim_tier.clamp(1, 10) as f32;

        // Pick a real/seeded Ghost Player Phantom from the live Ghost Roster!
        let ghost_id = if self.ghost_profiles.is_empty() {
            0
        } else {
            let idx = (self.rng.next_u32() as usize) % self.ghost_profiles.len();
            self.ghost_profiles[idx].id as i32
        };
        // Luck shard scales Golden Ace Phantom spawn chance (12% + 5%/lvl)!
        let luck_lvl = self.inventory.level(ShardKind::Luck) as u32;
        let golden_chance = (12 + luck_lvl * 5).min(55);
        let golden = (self.rng.next_u32() % 100) < golden_chance;
        self.active_ghost_id = ghost_id;
        self.active_ghost_golden = golden;

        match kind {
            AimDrillKind::Flick => {
                let total = if self.aim_tier >= 8 {
                    5
                } else if self.aim_tier >= 4 {
                    4
                } else {
                    3
                };
                self.spawn_flick_step(self.player.pos, 1, total, ghost_id, golden);
            }
            AimDrillKind::Track => {
                let angle = self.rng.angle();
                let orbit_radius = (155.0 + tier * 6.0).min(self.screen_size.y * 0.30).max(115.0);
                let pos = tangent_endpoint_on_globe(
                    self.player.pos,
                    Vec2::new(angle.cos(), angle.sin()) * orbit_radius,
                );
                self.aim_targets.push(AimTarget {
                    pos,
                    radius: (29.0 - tier * 1.0).max(18.0),
                    kind: AimDrillKind::Track,
                    life: 0.0,
                    max_life: (6.4 - tier * 0.16).max(4.5),
                    progress: 0.0,
                    step: 1,
                    total: 1,
                    orbit_angle: angle,
                    orbit_radius,
                    strafe_phase: self.rng.angle(),
                    strafe_sign: if self.rng.next_u32() % 2 == 0 { 1.0 } else { -1.0 },
                    ghost_id,
                    golden,
                    warned: false,
                });
            }
            AimDrillKind::Micro => {
                let center = self.pick_aim_viewport_pos(None, 0.0);
                let radius = (20.5 - tier * 0.70).max(13.0);
                let spacing = (56.0 - tier * 1.8).max(36.0);
                let base_ang = self.rng.angle();
                let max_life = (5.2 - tier * 0.20).max(2.8);
                for i in 0..3u32 {
                    let a = base_ang + (i as f32) * std::f32::consts::TAU / 3.0;
                    let pos =
                        tangent_endpoint_on_globe(center, Vec2::new(a.cos(), a.sin()) * spacing);
                    self.aim_targets.push(AimTarget {
                        pos,
                        radius,
                        kind: AimDrillKind::Micro,
                        life: 0.0,
                        max_life,
                        progress: 0.0,
                        step: i + 1,
                        total: 3,
                        orbit_angle: 0.0,
                        orbit_radius: 0.0,
                        strafe_phase: 0.0,
                        strafe_sign: 1.0,
                        ghost_id,
                        golden,
                        warned: false,
                    });
                }
            }
        }
    }

    fn spawn_flick_step(
        &mut self,
        prev_pos: Vec2,
        step: u32,
        total: u32,
        ghost_id: i32,
        golden: bool,
    ) {
        let tier = self.aim_tier.clamp(1, 10) as f32;
        let min_jump = (135.0 + tier * 14.0).min(265.0);
        let pos = self.pick_aim_viewport_pos(Some(prev_pos), min_jump);
        self.aim_targets.push(AimTarget {
            pos,
            radius: (25.5 - tier * 1.05).max(15.0),
            kind: AimDrillKind::Flick,
            life: 0.0,
            max_life: (4.6 - tier * 0.20).max(2.3),
            progress: (step.saturating_sub(1)) as f32 / total.max(1) as f32,
            step,
            total,
            orbit_angle: 0.0,
            orbit_radius: 0.0,
            strafe_phase: 0.0,
            strafe_sign: 1.0,
            ghost_id,
            golden,
            warned: false,
        });
    }

    /// Fires a Shard-Augmented Precision Prism Lance from the player through `target_world`.
    /// Wired directly into Lens, Split, Chromatic, Refract, Echo, and SniperLens core!
    fn fire_precision_lance(
        &mut self,
        target_world: Vec2,
        color: [f32; 3],
        mult: f32,
        allow_shard_procs: bool,
    ) -> bool {
        let delta = nearest_globe_delta(self.player.pos, target_world);
        let dist = delta.length();
        let dir = if dist > 1.0 {
            delta / dist
        } else {
            Vec2::X
        };
        let lens_lvl = self.inventory.level(ShardKind::Lens) as f32;
        let split_lvl = self.inventory.level(ShardKind::Split);
        let chrom_lvl = self.inventory.level(ShardKind::Chromatic);
        let refract_lvl = self.inventory.level(ShardKind::Refract);
        let echo_lvl = self.inventory.level(ShardKind::Echo);
        let core_mult = if self.prism_core == PrismCore::SniperLens {
            1.25
        } else {
            1.0
        };

        let reach = dist.max(255.0) + 135.0 + lens_lvl * 22.0;
        let tier = self.aim_tier.clamp(1, 10) as f32;
        let combo_mult = 1.0 + (self.aim_combo.min(20) as f32) * 0.06;
        let damage = (135.0 + self.rank as f32 * 20.0 + tier * 24.0)
            * (1.0 + lens_lvl * 0.18)
            * mult
            * combo_mult
            * core_mult
            * self.global_damage_mult();
        let thickness = 4.4 + tier * 0.25 + lens_lvl * 0.95;

        // Split shard adds precision flanking wing-lances (±6°)!
        let mut dirs = vec![dir];
        if allow_shard_procs && split_lvl >= 2 {
            let pairs = (split_lvl / 2).min(2);
            let base_a = dir.y.atan2(dir.x);
            for p in 1..=pairs {
                let off = (p as f32) * 0.105;
                dirs.push(Vec2::new((base_a + off).cos(), (base_a + off).sin()));
                dirs.push(Vec2::new((base_a - off).cos(), (base_a - off).sin()));
            }
        }

        let mut hit_any = false;
        let mut first_hit_pos: Option<Vec2> = None;

        for (beam_i, &bdir) in dirs.iter().enumerate() {
            let end = tangent_endpoint_on_globe(self.player.pos, bdir * reach);
            let b_dmg = if beam_i == 0 { damage } else { damage * 0.65 };
            self.beams.push(Beam {
                start: self.player.pos,
                end,
                life: 0.0,
                max_life: 0.17,
                thickness: if beam_i == 0 { thickness } else { thickness * 0.68 },
                color,
                is_echo: !allow_shard_procs,
            });

            let a_local = Vec2::ZERO;
            let b_local = nearest_globe_delta(self.player.pos, end);
            let mut candidates = Vec::new();
            self.spatial.query_segment(a_local, b_local, 14.0 + lens_lvl * 2.0, |idx| {
                if idx < self.enemies.len() {
                    candidates.push(idx);
                }
            });
            for idx in candidates {
                let e = &mut self.enemies[idx];
                if e.hp <= 0.0 {
                    continue;
                }
                let direct_click = globe_distance(target_world, e.pos) <= e.radius + 16.0 + lens_lvl * 2.0;
                let on_ray = capsule_circle_intersect_globe(
                    self.player.pos,
                    end,
                    9.0 + lens_lvl * 1.4,
                    e.pos,
                    e.radius,
                );
                if direct_click || on_ray {
                    let dealt = if direct_click { b_dmg * 1.45 } else { b_dmg };
                    e.hp -= dealt;
                    // Precision sniper hits shatter Reflector shields & apply Chromatic Prism Mark!
                    if e.kind == EnemyKind::Reflector {
                        e.shield_broken_timer = 5.0;
                    }
                    if chrom_lvl > 0 {
                        e.prism_mark_timer = 5.0;
                    }
                    let epos = e.pos;
                    self.total_damage_dealt += dealt;
                    self.hit_flash_positions.push(epos);
                    self.push_popup(epos, dealt, POPUP_CRIT);
                    if first_hit_pos.is_none() {
                        first_hit_pos = Some(epos);
                    }
                    hit_any = true;
                }
            }
            if let Some((impact, shield_broken)) =
                self.damage_boss_with_beam(self.player.pos, end, 10.0 + lens_lvl, b_dmg * 1.55)
            {
                self.total_damage_dealt += b_dmg * 1.55;
                self.push_popup(impact, b_dmg * 1.55, POPUP_CRIT);
                if shield_broken {
                    self.fire_shield_break_burst(impact);
                }
                if first_hit_pos.is_none() {
                    first_hit_pos = Some(impact);
                }
                hit_any = true;
            }
        }

        // Refract shard / 7-Stack Prism Ricochet perk / SniperLens core: bounce sniper shot into nearby threats!
        let ricochet_hops = (refract_lvl as usize)
            + if self.optical_stacks >= 7 { 1 } else { 0 }
            + if self.prism_core == PrismCore::SniperLens { 1 } else { 0 };
        if allow_shard_procs && ricochet_hops > 0 {
            let mut cur = first_hit_pos.unwrap_or(target_world);
            let mut visited: Vec<usize> = Vec::with_capacity(ricochet_hops);
            let r_dmg = damage * 0.85;
            for _ in 0..ricochet_hops.min(6) {
                let mut best: Option<(usize, f32)> = None;
                for (i, e) in self.enemies.iter().enumerate() {
                    if e.hp <= 0.0 || visited.contains(&i) {
                        continue;
                    }
                    let d = globe_distance(cur, e.pos);
                    if d > 10.0 && d < 280.0 && best.map_or(true, |(_, bd)| d < bd) {
                        best = Some((i, d));
                    }
                }
                if let Some((idx, _)) = best {
                    visited.push(idx);
                    let epos = self.enemies[idx].pos;
                    self.enemies[idx].hp -= r_dmg;
                    if chrom_lvl > 0 {
                        self.enemies[idx].prism_mark_timer = 5.0;
                    }
                    self.total_damage_dealt += r_dmg;
                    self.hit_flash_positions.push(epos);
                    self.push_popup(epos, r_dmg, POPUP_CRIT);
                    self.beams.push(Beam {
                        start: cur,
                        end: epos,
                        life: 0.0,
                        max_life: 0.18,
                        thickness: 3.4,
                        color: [0.55, 0.92, 1.0],
                        is_echo: true,
                    });
                    cur = epos;
                    hit_any = true;
                } else if let Some(bpos) = self.boss.as_ref().filter(|b| b.state == BossState::Active).map(|b| b.pos) {
                    if globe_distance(cur, bpos) < 340.0 {
                        self.damage_boss_with_secondary_beam(cur, bpos, 10.0, r_dmg * 1.4);
                        self.beams.push(Beam {
                            start: cur,
                            end: bpos,
                            life: 0.0,
                            max_life: 0.20,
                            thickness: 3.8,
                            color: [1.0, 0.86, 0.36],
                            is_echo: true,
                        });
                        hit_any = true;
                    }
                    break;
                } else {
                    break;
                }
            }
        }

        // Echo shard queues a delayed 0.12s Ghost-Echo second sniper strike!
        if allow_shard_procs && echo_lvl > 0 && hit_any {
            self.pending_sniper_echoes.push((
                self.time + 0.12,
                first_hit_pos.unwrap_or(target_world),
                0.65 + echo_lvl as f32 * 0.06,
            ));
        }

        // Crisp spark burst at impact point.
        for _ in 0..10 {
            let a = self.rng.angle();
            self.particles.push(Particle {
                pos: target_world,
                vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(60.0, 195.0),
                life: 0.0,
                max_life: self.rng.range(0.16, 0.34),
                color,
                size: self.rng.range(2.0, 4.4),
            });
        }

        // Refraction splash on direct hit (widened by Split/Lens).
        if hit_any {
            self.damage_area(
                target_world,
                60.0 + split_lvl as f32 * 8.0 + lens_lvl * 6.0,
                damage * 0.48,
                75.0,
                0.0,
                0.7,
            );
            self.shake_amount = (self.shake_amount + 2.5).min(12.0);
        }
        hit_any
    }

    fn on_aim_drill_completed(&mut self, kind: AimDrillKind, pos: Vec2, golden: bool) {
        self.aim_drills_completed += 1;
        self.ghost_duels_won += 1;
        self.aim_drill_cooldown = 1.75;
        self.aim_last_hit_pos = None;
        self.active_ghost_id = -1;
        self.active_ghost_golden = false;

        // Permanent Cumulative Optical Precision Stacks (NEVER lost on miss!).
        let base_stacks = if self.prism_core == PrismCore::ResonanceConduit { 2 } else { 1 };
        let gained_stacks = if golden { base_stacks + 1 } else { base_stacks };
        self.optical_stacks += gained_stacks;
        self.add_overdrive_charge(if golden { 0.45 } else { 0.28 });

        // Golden Ace Phantom OR every 4th Ghost Duel awards Reroll + Banish economy!
        if golden {
            self.reroll_charges += 1;
            self.banish_charges += 1;
            self.player.hp = (self.player.hp + 20.0).min(self.player.max_hp);
            self.drop_xp_burst(pos, 8, 4 + (self.aim_tier / 2), 38.0);
        } else if self.ghost_duels_won % 3 == 0 {
            self.reroll_charges += 1;
            if self.prism_core == PrismCore::ResonanceConduit {
                self.banish_charges += 1;
            }
        }

        // Cascade shard triggers bonus chain detonation on Ghost Phantom defeat!
        let cascade_lvl = self.inventory.level(ShardKind::Cascade);
        if cascade_lvl > 0 {
            self.fire_cascade_beams(pos, cascade_lvl + 2, 2, [1.0, 0.38, 0.82]);
        }

        self.aim_tier_progress += 1;
        if self.aim_tier_progress >= 2 && self.aim_tier < 10 {
            self.aim_tier += 1;
            self.aim_tier_progress = 0;
        }

        let tier = self.aim_tier as f32;
        let blast_dmg = (260.0 + self.rank as f32 * 36.0 + tier * 60.0) * self.global_damage_mult();
        let blast_r = 195.0 + tier * 16.0;

        self.audio_event_bits |= AUDIO_AIM_COMPLETE;
        self.screen_flash = self.screen_flash.max(0.55);
        self.hit_stop_pulse = self.hit_stop_pulse.max(0.45);
        self.shake_amount = (self.shake_amount + 6.5).min(16.0);
        self.push_popup(pos, blast_dmg, POPUP_BREAK);

        // Reward XP gems proportional to Aim Tier!
        self.drop_xp_burst(pos, 4 + (self.aim_tier / 2), 2 + (self.aim_tier / 3), 26.0);

        match kind {
            AimDrillKind::Flick => {
                // PRISMATIC SUPERNOVA: expanding optical ring + 8-spoke rainbow starburst!
                self.pulses.push(InterferencePulse {
                    pos,
                    life: 0.0,
                    max_life: 0.52,
                    max_radius: blast_r,
                    kind: PulseKind::DashBlast,
                    damage_multiplier: 1.35,
                });
                self.damage_area(pos, blast_r, blast_dmg, 210.0, 0.0, 2.2);
                for i in 0..8 {
                    let a = (i as f32) * std::f32::consts::TAU / 8.0;
                    let end =
                        tangent_endpoint_on_globe(pos, Vec2::new(a.cos(), a.sin()) * blast_r);
                    let hue = i as f32 / 8.0;
                    let col = [
                        0.5 + 0.5 * (hue * std::f32::consts::TAU).cos(),
                        0.5 + 0.5 * (hue * std::f32::consts::TAU + 2.094).cos(),
                        0.5 + 0.5 * (hue * std::f32::consts::TAU + 4.189).cos(),
                    ];
                    self.beams.push(Beam {
                        start: pos,
                        end,
                        life: 0.0,
                        max_life: 0.24,
                        thickness: 3.4,
                        color: col,
                        is_echo: false,
                    });
                }
            }
            AimDrillKind::Track => {
                // ARC OVERLOAD: chain lightning sweeps across nearby enemies!
                self.damage_area(pos, blast_r * 0.9, blast_dmg * 0.85, 140.0, 1.4, 2.2);
                let mut cur = pos;
                let max_hops = (6 + self.aim_tier as usize).min(14);
                let mut visited: Vec<usize> = Vec::with_capacity(max_hops);
                for _ in 0..max_hops {
                    let mut best: Option<(usize, f32)> = None;
                    for (idx, e) in self.enemies.iter().enumerate() {
                        if e.hp <= 0.0 || visited.contains(&idx) {
                            continue;
                        }
                        let d = globe_distance(cur, e.pos);
                        if d < 260.0 && best.map_or(true, |(_, bd)| d < bd) {
                            best = Some((idx, d));
                        }
                    }
                    let Some((idx, _)) = best else { break };
                    visited.push(idx);
                    let epos = self.enemies[idx].pos;
                    self.enemies[idx].hp -= blast_dmg * 0.95;
                    self.total_damage_dealt += blast_dmg * 0.95;
                    self.hit_flash_positions.push(epos);
                    self.push_popup(epos, blast_dmg * 0.95, POPUP_CRIT);
                    self.beams.push(Beam {
                        start: cur,
                        end: epos,
                        life: 0.0,
                        max_life: 0.22,
                        thickness: 3.2,
                        color: [0.68, 0.48, 1.0],
                        is_echo: false,
                    });
                    cur = epos;
                }
            }
            AimDrillKind::Micro => {
                // TRIPLE PRISM CONVERGENCE: 3 heavy cross-slicing chromatic rail beams!
                self.damage_area(pos, blast_r * 0.95, blast_dmg, 180.0, 0.0, 2.4);
                let cols = [[1.0, 0.32, 0.52], [0.35, 1.0, 0.72], [0.42, 0.72, 1.0]];
                for (i, col) in cols.into_iter().enumerate() {
                    let a = self.time + (i as f32) * std::f32::consts::PI / 3.0;
                    let v = Vec2::new(a.cos(), a.sin()) * (blast_r * 1.25);
                    let p0 = tangent_endpoint_on_globe(pos, -v);
                    let p1 = tangent_endpoint_on_globe(pos, v);
                    self.beams.push(Beam {
                        start: p0,
                        end: p1,
                        life: 0.0,
                        max_life: 0.25,
                        thickness: 4.5,
                        color: col,
                        is_echo: false,
                    });
                }
            }
        }

        for _ in 0..24 {
            let a = self.rng.angle();
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(90.0, 280.0),
                life: 0.0,
                max_life: self.rng.range(0.32, 0.68),
                color: [1.0, 0.88, 0.42],
                size: self.rng.range(2.5, 5.8),
            });
        }
    }

    fn update_extra_weapons(&mut self, dt: f32) {
        let arc = self.inventory.level(ShardKind::Arc);
        if arc > 0 {
            self.arc_timer -= dt;
            if self.arc_timer <= 0.0 {
                self.fire_arc(arc);
                let storm_front = self
                    .inventory
                    .has_synergy(ShardKind::Arc, ShardKind::Cascade);
                let interval =
                    (ARC_BASE_INTERVAL - arc as f32 * 0.07 - if storm_front { 0.16 } else { 0.0 })
                        .max(0.48);
                self.arc_timer += interval;
            }
        }

        let minefield = self.inventory.level(ShardKind::Minefield);
        if minefield > 0 {
            self.mine_timer -= dt;
            if self.mine_timer <= 0.0 {
                self.drop_minefield(minefield);
                self.mine_timer += self.mine_interval(minefield);
            }
        }

        let lance = self.inventory.level(ShardKind::Lance);
        if lance > 0 {
            self.lance_timer -= dt;
            if self.lance_timer <= 0.0 {
                self.fire_lance(lance);
                let rail_focus = self
                    .inventory
                    .has_synergy(ShardKind::Lance, ShardKind::Lens);
                let interval = (LANCE_BASE_INTERVAL
                    - lance as f32 * 0.14
                    - if rail_focus { 0.35 } else { 0.0 })
                .max(1.25);
                self.lance_timer += interval;
            }
        }
    }

    fn fire_arc(&mut self, level: u8) {
        let static_freeze = self.inventory.has_synergy(ShardKind::Arc, ShardKind::Frost);
        let storm_front = self
            .inventory
            .has_synergy(ShardKind::Arc, ShardKind::Cascade);
        let max_chains = 2 + level as usize + if storm_front { 2 } else { 0 };
        let chain_range = ARC_CHAIN_RANGE + level as f32 * 18.0;
        let mut from = self.player.pos;
        let mut used: Vec<usize> = Vec::new();
        let mut hits: Vec<(usize, Vec2, Vec2)> = Vec::new();

        for _ in 0..max_chains {
            let next = self
                .enemies
                .iter()
                .enumerate()
                .filter(|(idx, e)| e.hp > 0.0 && !used.contains(idx))
                .map(|(idx, e)| {
                    let target = nearest_globe_pos(from, e.pos);
                    let dist_sq = (target - from).length_squared();
                    (idx, target, dist_sq)
                })
                .filter(|(_, _, dist_sq)| *dist_sq <= chain_range * chain_range)
                .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));

            let Some((idx, target, _)) = next else {
                break;
            };
            used.push(idx);
            hits.push((idx, from, target));
            from = target;
        }

        if hits.is_empty() {
            return;
        }

        let mut cascade_origins = Vec::new();
        let damage = ARC_BASE_DAMAGE + ARC_DAMAGE_PER_LEVEL * level as f32;
        for (idx, start, end) in &hits {
            if let Some(e) = self.enemies.get_mut(*idx) {
                let was_alive = e.hp > 0.0;
                let mut dmg = damage;
                if static_freeze {
                    if e.slow_timer > 0.0 {
                        dmg *= 1.35;
                    }
                    e.slow_timer = e.slow_timer.max(FROST_SLOW_DURATION * 0.8);
                }
                e.hp -= dmg;
                self.hit_flash_positions.push(e.pos);
                if storm_front && was_alive && e.hp <= 0.0 {
                    cascade_origins.push(e.pos);
                }
            }
            self.beams.push(Beam {
                start: *start,
                end: *end,
                life: 0.0,
                max_life: ARC_BEAM_LIFETIME,
                thickness: ARC_BEAM_THICKNESS + level as f32 * 0.18,
                color: if static_freeze {
                    [0.58, 0.95, 1.0]
                } else {
                    [0.86, 0.72, 1.0]
                },
                is_echo: false,
            });
        }

        if storm_front {
            let cascade_level = self.inventory.level(ShardKind::Cascade).max(1);
            for pos in cascade_origins {
                self.fire_cascade_beams(pos, cascade_level, 2, [0.55, 0.84, 1.0]);
            }
        }
        self.audio_beam_count += 1;
    }

    fn drop_minefield(&mut self, level: u8) {
        let gravity_mines = self
            .inventory
            .has_synergy(ShardKind::Minefield, ShardKind::Magnet);
        let count = self.mine_count(level);
        let radius = self.mine_radius(level);
        let damage = self.mine_damage(level);
        let anchor = self
            .find_nearest_enemy_pos_from(self.player.pos)
            .unwrap_or(self.player.pos);

        for i in 0..count {
            let mut pos = if i == 0 {
                anchor
            } else {
                let angle = self.rng.angle();
                let mut p = if gravity_mines && i % 2 == 0 {
                    anchor
                } else {
                    self.player.pos
                };
                move_on_globe(
                    &mut p,
                    Vec2::new(angle.cos(), angle.sin()) * self.rng.range(60.0, 260.0),
                );
                p
            };
            if is_polar_zone(pos) {
                pos.y = pos.y.signum() * POLAR_BOUNDARY_Y * 0.9;
            }
            let scale = self.rng.range(0.88, 1.12);
            self.emit_mine(pos, radius * scale, damage, level, 1.0);
        }
    }

    fn fire_lance(&mut self, level: u8) {
        let Some(target) = self.find_nearest_enemy_pos_from(self.player.pos) else {
            return;
        };
        let dir = nearest_globe_delta(self.player.pos, target).normalize_or_zero();
        if dir.length_squared() < 1e-4 {
            return;
        }
        let rail_focus = self
            .inventory
            .has_synergy(ShardKind::Lance, ShardKind::Lens);
        let surgical_drain = self
            .inventory
            .has_synergy(ShardKind::Lance, ShardKind::Siphon);
        let reach = LANCE_REACH * if rail_focus { 1.18 } else { 1.0 };
        let damage = (LANCE_BASE_DAMAGE + LANCE_DAMAGE_PER_LEVEL * level as f32)
            * if rail_focus { 1.55 } else { 1.0 }
            * if surgical_drain { 1.18 } else { 1.0 };
        let thickness = LANCE_THICKNESS + level as f32 * 0.65 + if rail_focus { 4.0 } else { 0.0 };

        self.fire_beam(
            BeamRequest {
                start: self.player.pos,
                end: self.player.pos + dir * reach,
                thickness,
                damage,
                color: if surgical_drain {
                    [0.72, 1.0, 0.88]
                } else {
                    [1.0, 0.94, 0.58]
                },
            },
            self.player.pos,
            false,
        );
    }

    fn fire_primary(&mut self) -> bool {
        self.fire_primary_inner(true, false, None, None)
    }

    fn fire_primary_inner(
        &mut self,
        schedule_echo: bool,
        is_echo: bool,
        target_override: Option<Vec2>,
        origin_override: Option<Vec2>,
    ) -> bool {
        let origin = origin_override.unwrap_or(self.player.pos);
        let target = match target_override.or_else(|| self.find_nearest_enemy_pos_from(origin)) {
            Some(t) => t,
            None => return false,
        };
        let mut local_enemies: Vec<Enemy> = self
            .enemies
            .iter()
            .cloned()
            .map(|mut e| {
                e.pos = nearest_globe_pos(origin, e.pos);
                e
            })
            .collect();
        if let Some(boss) = &self.boss {
            if boss.state == BossState::Active {
                match boss.kind {
                    BossKind::Hydra => {
                        for i in 0..3usize {
                            if boss.lobe_alive[i] {
                                let lp = Self::hydra_lobe_pos(boss, i);
                                local_enemies.push(Enemy {
                                    pos: nearest_globe_pos(origin, lp),
                                    radius: HYDRA_LOBE_RADIUS,
                                    hp: boss.lobe_hp[i],
                                    speed: 0.0,
                                    kind: EnemyKind::Brute,
                                    state: EnemyState::Drifting,
                                    state_timer: 0.0,
                                    charge_dir: Vec2::ZERO,
                                    color: [1.0, 1.0, 1.0],
                                    contact_damage: 0.0,
                                    slow_timer: 0.0,
                                    no_xp: true,
                                    spawn_grace: 0.0,
                                    mini_boss: None,
                                    prism_mark_timer: 0.0,
                                    link_id: 0,
                                    shield_broken_timer: 0.0,
                                });
                            }
                        }
                    }
                    BossKind::Sentinel
                    | BossKind::VoidPrism
                    | BossKind::PrismLattice
                    | BossKind::MirrorSovereign
                    | BossKind::ChronoEclipse => {
                        local_enemies.push(Enemy {
                            pos: nearest_globe_pos(origin, boss.pos),
                            radius: boss.radius,
                            hp: boss.hp,
                            speed: 0.0,
                            kind: EnemyKind::Brute,
                            state: EnemyState::Drifting,
                            state_timer: 0.0,
                            charge_dir: Vec2::ZERO,
                            color: [1.0, 1.0, 1.0],
                            contact_damage: 0.0,
                            slow_timer: 0.0,
                            no_xp: true,
                            spawn_grace: 0.0,
                            mini_boss: None,
                            prism_mark_timer: 0.0,
                            link_id: 0,
                            shield_broken_timer: 0.0,
                        });
                    }
                }
            }
        }
        let salvo = compose_salvo(origin, target, &local_enemies, &self.inventory);
        if salvo.is_empty() {
            return false;
        }

        // Synergy: PRISM CANNON (Lens+Chromatic 3+) — periodic convergent white core shot.
        if self
            .inventory
            .has_synergy(ShardKind::Lens, ShardKind::Chromatic)
            && self.prism_cannon_timer <= 0.0
        {
            self.prism_cannon_timer = PRISM_CANNON_INTERVAL;
            let base = &salvo[0];
            let dir = (base.end - base.start).normalize_or_zero();
            let reach = (base.end - base.start).length();
            let core = BeamRequest {
                start: base.start,
                end: base.start + dir * reach,
                thickness: base.thickness * PRISM_CANNON_THICKNESS_MULT,
                damage: base.damage * PRISM_CANNON_DAMAGE_MULT,
                color: [1.0, 1.0, 1.0],
            };
            self.fire_beam(core, origin, is_echo);
        }

        for req in &salvo {
            self.fire_beam(req.clone(), origin, is_echo);
        }

        // Kaleidoscope: after every primary salvo, emit a prismatic great-circle ring.
        if self.inventory.has_evolution(EvolutionKind::Kaleidoscope) {
            self.fire_kaleidoscope_burst(origin);
        }

        // Echo: queue L delayed salvos (only from primary fire, not from echoes).
        if schedule_echo {
            let echo = self.inventory.level(ShardKind::Echo);
            for step in 1..=echo {
                self.pending_echoes
                    .push(self.time + ECHO_DELAY * step as f32);
            }
        }

        self.audio_beam_count += 1;
        true
    }

    fn fire_beam(&mut self, req: BeamRequest, origin: Vec2, is_echo: bool) {
        let diffract = self.inventory.level(ShardKind::Diffract);
        let siphon = self.inventory.level(ShardKind::Siphon);
        let frost = self.inventory.level(ShardKind::Frost);
        let mut impacts: Vec<Vec2> = Vec::new();
        let mut hit_count: u32 = 0;
        let (start, end) = tangent_segment_on_globe(origin, req.start, req.end);

        // Synergy: BLIZZARD (Split+Frost 3+) — frozen enemies take +40% damage.
        let blizzard = self
            .inventory
            .has_synergy(ShardKind::Split, ShardKind::Frost);

        // Primary damage pass (spatial-grid accelerated broadphase).
        let player_origin = self.player.pos;
        let a_local = nearest_globe_delta(player_origin, start);
        let b_local = nearest_globe_delta(player_origin, end);
        let mut candidates: Vec<usize> = Vec::new();
        self.spatial
            .query_segment(a_local, b_local, req.thickness * 0.5, |idx| {
                if idx < self.enemies.len() {
                    candidates.push(idx);
                }
            });
        let heavy_shot = req.damage >= 90.0;
        let global_dmg = self.global_damage_mult();
        let crit_chance = self.global_crit_chance();
        let beam_dir = nearest_globe_delta(start, end).normalize_or_zero();
        let mut reflected_rays: Vec<(Vec2, Vec2)> = Vec::new();
        for idx in candidates {
            let e = &mut self.enemies[idx];
            if capsule_circle_intersect_globe(start, end, req.thickness * 0.5, e.pos, e.radius) {
                let is_blizzard_crit = blizzard && e.slow_timer > 0.0;
                let is_optical_crit = crit_chance > 0.0 && self.rng.unit() < crit_chance;
                let mut dmg = req.damage * global_dmg;
                if is_blizzard_crit {
                    dmg *= 1.4;
                }
                if is_optical_crit {
                    dmg *= 1.85;
                }
                if e.prism_mark_timer > 0.0 {
                    dmg *= 1.35;
                }
                // Reflector: frontal mirror shield deflects auto-beams coming straight from the front!
                if e.kind == EnemyKind::Reflector && e.shield_broken_timer <= 0.0 {
                    let shield_fwd = e.charge_dir.normalize_or_zero();
                    // Beam travels along beam_dir; incoming hits front when (-beam_dir) aligns with shield_fwd.
                    if shield_fwd.length_squared() > 0.1 && (-beam_dir).dot(shield_fwd) > 0.42 {
                        dmg *= 0.22;
                        if reflected_rays.len() < 4 {
                            let refl = beam_dir - 2.0 * beam_dir.dot(shield_fwd) * shield_fwd;
                            reflected_rays.push((e.pos, refl.normalize_or_zero()));
                        }
                    }
                }
                e.hp -= dmg;
                let epos = e.pos;
                // Frost: slow enemies on hit.
                if frost > 0 {
                    e.slow_timer = FROST_SLOW_DURATION * frost as f32;
                }
                self.total_damage_dealt += dmg;
                hit_count += 1;
                self.hit_flash_positions.push(epos);
                let pkind = if is_blizzard_crit || is_optical_crit || heavy_shot {
                    POPUP_CRIT
                } else {
                    POPUP_NORMAL
                };
                self.push_popup(epos, dmg, pkind);
                if diffract > 0 {
                    impacts.push(epos);
                }
            }
        }
        for (rpos, rdir) in reflected_rays {
            self.beams.push(Beam {
                start: rpos,
                end: tangent_endpoint_on_globe(rpos, rdir * 52.0),
                life: 0.0,
                max_life: 0.10,
                thickness: 2.2,
                color: [0.85, 0.96, 1.0],
                is_echo: true,
            });
        }
        let boss_beam_dmg = req.damage * global_dmg;
        if let Some((impact, shield_broken)) =
            self.damage_boss_with_beam(start, end, req.thickness * 0.5, boss_beam_dmg)
        {
            self.total_damage_dealt += boss_beam_dmg;
            self.push_popup(impact, boss_beam_dmg, POPUP_CRIT);
            hit_count += 1;
            if diffract > 0 {
                impacts.push(impact);
            }
            if shield_broken {
                self.fire_shield_break_burst(impact);
            }
        }

        // Siphon: heal player per hit (capped per salvo to prevent god-mode).
        if siphon > 0 && hit_count > 0 {
            let heal = (SIPHON_HEAL_PER_HIT * siphon as f32 * hit_count as f32)
                .min(SIPHON_MAX_HEAL_PER_SALVO);
            let before = self.player.hp;
            self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
            let actual = self.player.hp - before;
            if actual >= 1.0 {
                self.push_popup(self.player.pos, actual, POPUP_HEAL);
            }
        }

        // Primary visual.
        self.beams.push(Beam {
            start,
            end,
            life: 0.0,
            max_life: BEAM_LIFETIME,
            thickness: req.thickness,
            color: req.color,
            is_echo,
        });

        // Diffract: each impact spawns L radial sub-beams (damage + visual).
        // Synergy: SUPERNOVA (Mirror+Diffract 3+) — 2x burst reach and thickness.
        let supernova = self
            .inventory
            .has_synergy(ShardKind::Mirror, ShardKind::Diffract);
        let diffract_reach = if supernova {
            DIFFRACT_MINI_REACH * 2.0
        } else {
            DIFFRACT_MINI_REACH
        };
        let diffract_thick = if supernova {
            DIFFRACT_MINI_THICKNESS * 1.5
        } else {
            DIFFRACT_MINI_THICKNESS
        };
        // Synergy: SUPERNOVA (Mirror+Diffract 3+) — spokes become an evenly-spaced
        //   starburst in bright white-violet instead of random green lines.
        let diffract_color = if supernova {
            [1.0, 0.82, 1.0]
        } else {
            [0.6, 1.0, 0.7]
        };
        for impact in impacts {
            let base_a = self.rng.angle();
            for k in 0..diffract {
                let a = if supernova {
                    base_a + (k as f32 * std::f32::consts::TAU / diffract as f32)
                } else {
                    self.rng.angle()
                };
                let dir = Vec2::new(a.cos(), a.sin());
                let end = tangent_endpoint_on_globe(impact, dir * diffract_reach);

                let da_local = nearest_globe_delta(player_origin, impact);
                let db_local = nearest_globe_delta(player_origin, end);
                let mut sub_candidates: Vec<usize> = Vec::new();
                self.spatial
                    .query_segment(da_local, db_local, diffract_thick * 0.5, |idx| {
                        if idx < self.enemies.len() {
                            sub_candidates.push(idx);
                        }
                    });
                for idx in sub_candidates {
                    let e = &mut self.enemies[idx];
                    if capsule_circle_intersect_globe(
                        impact,
                        end,
                        diffract_thick * 0.5,
                        e.pos,
                        e.radius,
                    ) {
                        e.hp -= DIFFRACT_MINI_DAMAGE;
                        self.total_damage_dealt += DIFFRACT_MINI_DAMAGE;
                    }
                }
                self.damage_boss_with_secondary_beam(
                    impact,
                    end,
                    diffract_thick * 0.5,
                    DIFFRACT_MINI_DAMAGE,
                );

                self.beams.push(Beam {
                    start: impact,
                    end,
                    life: 0.0,
                    max_life: DIFFRACT_MINI_LIFETIME,
                    thickness: diffract_thick,
                    color: diffract_color,
                    is_echo: false,
                });
            }
        }
    }

    fn on_enemy_death(
        &mut self,
        pos: Vec2,
        kind: EnemyKind,
        cascade_depth: u32,
        no_xp: bool,
        was_frozen: bool,
        mini_boss: Option<MiniBossKind>,
        was_prism_marked: bool,
        link_id: u32,
    ) {
        self.kills_total += 1;
        let kind_idx = (kind as usize).min(ENEMY_KIND_COUNT - 1);
        self.kills_by_kind[kind_idx] = self.kills_by_kind[kind_idx].saturating_add(1);
        self.audio_kill_count += 1;
        self.kill_streak = self.kill_streak.saturating_add(1);
        self.kill_streak_timer = KILL_STREAK_WINDOW;
        if self.kill_streak > self.peak_kill_streak {
            self.peak_kill_streak = self.kill_streak;
        }
        if matches!(self.kill_streak, 10 | 25 | 50 | 100 | 250 | 500) {
            self.audio_event_bits |= AUDIO_STREAK_MILESTONE;
            self.screen_flash = self.screen_flash.max(0.32);
        }
        self.spawn_death_particles(pos, kind);

        // Chromatic Sniper Mark detonation: bursts in RGB shards on death!
        if was_prism_marked && cascade_depth < 3 {
            let burst_dmg = (110.0 + self.rank as f32 * 14.0) * self.global_damage_mult();
            self.damage_area(pos, 95.0, burst_dmg, 90.0, 0.0, 1.0);
            self.fire_cascade_beams(pos, 2, 1, [1.0, 0.45, 0.90]);
        }

        // Weaver Tether Snap: killing one linked anchor blasts its partner!
        if kind == EnemyKind::Weaver && link_id > 0 {
            for e in &mut self.enemies {
                if e.link_id == link_id && e.hp > 0.0 {
                    e.link_id = 0;
                    e.hp -= e.hp.max(200.0) * 0.55;
                }
            }
        }

        // Golden Carrier Loot Beetle: vacuums ALL gems on the globe + awards +1 Reroll + XP burst!
        if kind == EnemyKind::Carrier && !no_xp {
            self.reroll_charges += 1;
            self.audio_event_bits |= AUDIO_OBELISK_CAPTURE;
            self.screen_flash = self.screen_flash.max(0.45);
            self.drop_xp_burst(pos, 10, 3 + self.rank / 10, 32.0);
            // Vacuum all active XP gems straight into player orbit!
            for g in &mut self.gems {
                let dir = nearest_globe_delta(g.pos, self.player.pos);
                if dir.length() > 14.0 {
                    g.pos = tangent_endpoint_on_globe(self.player.pos, -dir.normalize_or_zero() * 14.0);
                }
            }
        }

        if let Some(mini_boss) = mini_boss {
            self.on_miniboss_death(pos, mini_boss);
            return;
        }

        // Blizzard leaves a slow field on frozen deaths. Whiteout upgrades
        // that field and adds a capped freezing starburst chain.
        if was_frozen {
            let whiteout = self.inventory.has_evolution(EvolutionKind::Whiteout);
            let blizzard = self
                .inventory
                .has_synergy(ShardKind::Split, ShardKind::Frost);
            if whiteout {
                self.spawn_frost_field(pos, WHITEOUT_FIELD_RADIUS, WHITEOUT_FIELD_LIFETIME, 22);
                if cascade_depth < WHITEOUT_MAX_CHAIN_DEPTH {
                    self.fire_whiteout_starburst(pos);
                }
            } else if blizzard {
                self.spawn_frost_field(pos, BLIZZARD_FIELD_RADIUS, BLIZZARD_FIELD_LIFETIME, 14);
            }
        }

        // Drop XP gem unless this is a mini-drone (Splitter offspring) or escaped Carrier.
        if !no_xp {
            let gem_value = match kind {
                EnemyKind::Drone => 1,
                EnemyKind::Brute => 5,
                EnemyKind::Dasher => 2,
                EnemyKind::Splitter => 3,
                EnemyKind::Orbiter => 2,
                EnemyKind::Emitter => 3,
                EnemyKind::Pulsar => 4,
                EnemyKind::Umbra => 4,
                EnemyKind::Weaver => 4,
                EnemyKind::Reflector => 5,
                EnemyKind::Anchor => 5,
                EnemyKind::Stalker => 4,
                EnemyKind::Carrier => 8,
            };
            self.gems.push(XpGem {
                pos,
                value: gem_value,
                life: 0.0,
            });
        }

        // Splitter: spawn 3 mini drones on death.
        if kind == EnemyKind::Splitter {
            let minute = self.time / 60.0;
            for i in 0..3 {
                let angle = (i as f32) * std::f32::consts::TAU / 3.0 + self.rng.angle() * 0.3;
                let offset = Vec2::new(angle.cos(), angle.sin()) * 20.0;
                let (_, _, _, _, color) = enemy_stats(EnemyKind::Drone, minute);
                let mut spawn_pos = pos;
                move_on_globe(&mut spawn_pos, offset);
                self.enemies.push(Enemy {
                    pos: spawn_pos,
                    radius: 6.0,
                    hp: 40.0,
                    speed: 90.0,
                    kind: EnemyKind::Drone,
                    state: EnemyState::Drifting,
                    state_timer: 0.0,
                    charge_dir: Vec2::ZERO,
                    color,
                    contact_damage: 8.0,
                    slow_timer: 0.0,
                    no_xp: true,
                    spawn_grace: SPAWN_GRACE,
                    mini_boss: None,
                    prism_mark_timer: 0.0,
                    link_id: 0,
                    shield_broken_timer: 0.0,
                });
            }
        }

        // Subtle screen shake on kills.
        self.shake_amount += SHAKE_DEATH_PX;

        // Cascade: short beams from the corpse.
        // Synergy: CHAIN REACTION (Split+Cascade 3+) — beams fan into 3, electric cyan.
        if cascade_depth < CASCADE_MAX_DEPTH {
            let cascade = self.inventory.level(ShardKind::Cascade);
            let chain_reaction = self
                .inventory
                .has_synergy(ShardKind::Split, ShardKind::Cascade);
            let fan_count = if chain_reaction { 3u32 } else { 1 };
            let color = if chain_reaction {
                [0.25, 1.0, 0.88]
            } else {
                [1.0, 0.5, 0.3]
            };
            self.fire_cascade_beams(pos, cascade, fan_count, color);
        }
    }

    fn fire_cascade_beams(&mut self, origin: Vec2, count: u8, fan_count: u32, color: [f32; 3]) {
        const FAN_SPREAD: f32 = 0.3;
        for _ in 0..count {
            let base_a = self.rng.angle();
            for f in 0..fan_count {
                let offset = if fan_count > 1 {
                    (f as f32 - (fan_count - 1) as f32 * 0.5) * FAN_SPREAD
                } else {
                    0.0
                };
                let a = base_a + offset;
                let dir = Vec2::new(a.cos(), a.sin());
                let end = tangent_endpoint_on_globe(origin, dir * CASCADE_REACH);
                for e in &mut self.enemies {
                    if capsule_circle_intersect_globe(
                        origin,
                        end,
                        CASCADE_THICKNESS * 0.5,
                        e.pos,
                        e.radius,
                    ) {
                        e.hp -= CASCADE_DAMAGE;
                    }
                }
                self.damage_boss_with_secondary_beam(
                    origin,
                    end,
                    CASCADE_THICKNESS * 0.5,
                    CASCADE_DAMAGE,
                );
                self.beams.push(Beam {
                    start: origin,
                    end,
                    life: 0.0,
                    max_life: CASCADE_LIFETIME,
                    thickness: CASCADE_THICKNESS,
                    color,
                    is_echo: false,
                });
            }
        }
    }

    fn spawn_frost_field(&mut self, pos: Vec2, radius: f32, lifetime: f32, particles: u32) {
        if self.frost_fields.len() < MAX_FROST_FIELDS {
            self.frost_fields.push(FrostField {
                pos,
                life: 0.0,
                max_life: lifetime,
                radius,
            });
        }

        for _ in 0..particles {
            let angle = self.rng.angle();
            let speed = self.rng.range(80.0, 240.0);
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(angle.cos(), angle.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.5, 1.2),
                color: [0.5, 0.88, 1.0],
                size: self.rng.range(1.8, 3.8),
            });
        }
    }

    fn fire_whiteout_starburst(&mut self, origin: Vec2) {
        let base_a = self.rng.angle();
        let color = [0.72, 0.95, 1.0];
        for i in 0..WHITEOUT_STARBURST_BEAMS {
            let a = base_a + i as f32 * std::f32::consts::TAU / WHITEOUT_STARBURST_BEAMS as f32;
            let dir = Vec2::new(a.cos(), a.sin());
            let end = tangent_endpoint_on_globe(origin, dir * WHITEOUT_STARBURST_REACH);
            for e in &mut self.enemies {
                if capsule_circle_intersect_globe(
                    origin,
                    end,
                    WHITEOUT_STARBURST_THICKNESS * 0.5,
                    e.pos,
                    e.radius,
                ) {
                    e.hp -= WHITEOUT_STARBURST_DAMAGE;
                    e.slow_timer = e.slow_timer.max(FROST_SLOW_DURATION * 2.0);
                }
            }
            self.damage_boss_with_secondary_beam(
                origin,
                end,
                WHITEOUT_STARBURST_THICKNESS * 0.5,
                WHITEOUT_STARBURST_DAMAGE,
            );
            self.beams.push(Beam {
                start: origin,
                end,
                life: 0.0,
                max_life: WHITEOUT_STARBURST_LIFETIME,
                thickness: WHITEOUT_STARBURST_THICKNESS,
                color,
                is_echo: false,
            });
        }
    }

    fn fire_kaleidoscope_burst(&mut self, origin: Vec2) {
        let base_angle = self.rng.angle();
        for i in 0..KALEIDOSCOPE_BEAMS {
            let a = base_angle + i as f32 * std::f32::consts::TAU / KALEIDOSCOPE_BEAMS as f32;
            let dir = Vec2::new(a.cos(), a.sin());
            let end = tangent_endpoint_on_globe(origin, dir * KALEIDOSCOPE_REACH);
            let color: [f32; 3] = match i % 3 {
                0 => [0.5, 1.0, 0.92],
                1 => [1.0, 0.45, 0.92],
                _ => [1.0, 0.95, 0.45],
            };
            for e in &mut self.enemies {
                if capsule_circle_intersect_globe(
                    origin,
                    end,
                    KALEIDOSCOPE_THICKNESS * 0.5,
                    e.pos,
                    e.radius,
                ) {
                    e.hp -= KALEIDOSCOPE_DAMAGE;
                }
            }
            self.damage_boss_with_secondary_beam(
                origin,
                end,
                KALEIDOSCOPE_THICKNESS * 0.5,
                KALEIDOSCOPE_DAMAGE,
            );
            self.beams.push(Beam {
                start: origin,
                end,
                life: 0.0,
                max_life: KALEIDOSCOPE_LIFETIME,
                thickness: KALEIDOSCOPE_THICKNESS,
                color,
                is_echo: false,
            });
        }
    }

    fn drop_xp_burst(&mut self, pos: Vec2, count: u32, value: u32, radius: f32) {
        for i in 0..count {
            let angle = i as f32 * std::f32::consts::TAU / count as f32;
            let mut gem_pos = pos;
            move_on_globe(&mut gem_pos, Vec2::new(angle.cos(), angle.sin()) * radius);
            self.gems.push(XpGem {
                pos: gem_pos,
                value,
                life: 0.0,
            });
        }
    }

    fn on_miniboss_death(&mut self, pos: Vec2, mini_boss: MiniBossKind) {
        let (color, particle_count) = match mini_boss {
            MiniBossKind::Bulwark => ([1.0, 0.46, 0.22], 28),
            MiniBossKind::Riftcaller => ([0.92, 0.35, 1.0], 24),
            MiniBossKind::MirrorWraith => ([0.65, 0.72, 1.0], 24),
            MiniBossKind::SplitCore => ([0.35, 1.0, 0.58], 26),
        };

        let reward_value = (MINI_BOSS_XP_BASE / 4) + self.rank / 10;
        self.drop_xp_burst(pos, 7, reward_value.max(4), 28.0);

        match mini_boss {
            MiniBossKind::Bulwark => {
                self.pulses.push(InterferencePulse {
                    pos,
                    life: 0.0,
                    max_life: 0.55,
                    max_radius: 240.0,
                    kind: PulseKind::Interference,
                    damage_multiplier: 1.25,
                });
            }
            MiniBossKind::Riftcaller => {
                self.spawn_boss_adds(pos, EnemyKind::Emitter, 3, 18.0);
            }
            MiniBossKind::MirrorWraith => {
                self.fire_cascade_beams(pos, 2, 5, [0.64, 0.72, 1.0]);
            }
            MiniBossKind::SplitCore => {
                for i in 0..6 {
                    let angle = i as f32 * std::f32::consts::TAU / 6.0;
                    let mut spawn_pos = pos;
                    move_on_globe(&mut spawn_pos, Vec2::new(angle.cos(), angle.sin()) * 24.0);
                    self.spawn_enemy_near_pos(EnemyKind::Dasher, spawn_pos);
                }
            }
        }

        self.shake_amount += 7.0;
        for _ in 0..particle_count {
            let a = self.rng.angle();
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(70.0, 190.0),
                life: 0.0,
                max_life: self.rng.range(0.3, 0.8),
                color,
                size: self.rng.range(2.2, 5.8),
            });
        }
    }

    fn check_for_level_up(&mut self) {
        if self.leveling_up {
            return;
        }
        // Relic Chests (from Bosses or Prism Obelisks) open first with double upgrades!
        if self.pending_relic_chests > 0 {
            self.pending_relic_chests -= 1;
            self.level_choices = self
                .inventory
                .roll_choices_with_overclock(&mut self.rng, self.endless_mode);
            if self.level_choices.iter().any(|c| c.is_some()) {
                self.relic_chest_active = true;
                self.leveling_up = true;
                self.audio_event_bits |= AUDIO_OBELISK_CAPTURE;
                return;
            }
        }
        while self.xp >= xp_for_rank(self.rank + 1) {
            let needed = xp_for_rank(self.rank + 1);
            self.xp -= needed;
            self.rank += 1;
            self.peak_rank = self.peak_rank.max(self.rank);
            self.record_rank_timeline();
            self.audio_event_bits |= AUDIO_RANK_UP;
            self.screen_flash = self.screen_flash.max(0.55);
            let prism_heart = self.inventory.level(ShardKind::PrismHeart) as f32;
            let heal = (20.0 - self.rank as f32 * 0.6).max(6.0)
                * (1.0 + prism_heart * PRISM_HEART_HEAL_MULT_PER_LEVEL);
            self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
            self.level_choices = self
                .inventory
                .roll_choices_with_overclock(&mut self.rng, self.endless_mode);
            if self.level_choices.iter().any(|c| c.is_some()) {
                self.relic_chest_active = false;
                self.leveling_up = true;
                break;
            }
        }
    }

    fn spawn_evolution_particles(&mut self, evolution: EvolutionKind) {
        let color = match evolution {
            EvolutionKind::AfterimageEngine => [1.0, 0.72, 0.36],
            EvolutionKind::Whiteout => [0.72, 0.95, 1.0],
            EvolutionKind::Kaleidoscope => [0.9, 0.5, 1.0],
            EvolutionKind::Singularity => [0.35, 0.25, 1.0],
            EvolutionKind::SolarCrown => [1.0, 0.92, 0.42],
        };
        self.shake_amount += 4.0;
        for _ in 0..32 {
            let a = self.rng.angle();
            self.particles.push(Particle {
                pos: self.player.pos,
                vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(60.0, 220.0),
                life: 0.0,
                max_life: self.rng.range(0.35, 0.9),
                color,
                size: self.rng.range(2.5, 7.0),
            });
        }
    }

    fn rebuild_halos(&mut self) {
        let level = self.inventory.level(ShardKind::Halo) as usize;
        self.halos.clear();
        for i in 0..level {
            let even = i % 2 == 0;
            self.halos.push(Halo {
                angle: (i as f32) * std::f32::consts::TAU / level as f32,
                radius: 38.0 + 22.0 * i as f32,
                size: 5.0,
                angular_speed: if even { 1.8 } else { -1.4 },
            });
        }
    }

    /// Damage the player. Barrier absorbs the full raw hit first; Armor reduces
    /// whatever leaks through. Thorns fires after HP loss.
    fn apply_damage_to_player(&mut self, raw_damage: f32, source: DamageSource) {
        let mut remaining = raw_damage;

        // Barrier absorbs raw damage before any reduction.
        if self.player.barrier_hp > 0.0 {
            let absorbed = remaining.min(self.player.barrier_hp);
            self.player.barrier_hp -= absorbed;
            remaining -= absorbed;
            self.barrier_absorbed += absorbed;

            // Synergy: RESONANCE (Barrier+Interference 3+) — emit a pulse when barrier absorbs.
            if self
                .inventory
                .has_synergy(ShardKind::Barrier, ShardKind::Interference)
            {
                self.pulses.push(InterferencePulse {
                    pos: self.player.pos,
                    life: 0.0,
                    max_life: 0.6,
                    max_radius: 200.0,
                    kind: PulseKind::Interference,
                    damage_multiplier: 1.0,
                });
            }
            // Solar Crown: barrier absorption flares all halo orbitals.
            if self.inventory.has_evolution(EvolutionKind::SolarCrown) && !self.halos.is_empty() {
                let halo_positions: Vec<Vec2> = self
                    .halos
                    .iter()
                    .map(|h| {
                        let mut p = self.player.pos;
                        move_on_globe(&mut p, Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius);
                        p
                    })
                    .collect();
                for hpos in halo_positions {
                    for _ in 0..SOLAR_CROWN_FLARE_PARTICLES {
                        let a = self.rng.angle();
                        self.particles.push(Particle {
                            pos: hpos,
                            vel: Vec2::new(a.cos(), a.sin()) * self.rng.range(80.0, 240.0),
                            life: 0.0,
                            max_life: self.rng.range(0.14, 0.32),
                            color: [1.0, 0.92, 0.42],
                            size: self.rng.range(2.0, 5.5),
                        });
                    }
                }
            }
        }

        // Armor reduces what leaks through barrier.
        if remaining > 0.0 {
            let armor = self.inventory.level(ShardKind::Armor) as f32;
            remaining *= (1.0 - armor * ARMOR_DR_PER_LEVEL).max(0.10);
            self.player.hp -= remaining;
            self.damage_taken += remaining;
            self.damage_by_source[source.as_index()] += remaining;
            if self.player.hp <= 0.0 && self.death_cause.is_none() {
                self.death_cause = Some(source);
            }
            self.damage_flash = self.damage_flash.max(0.95);
            self.audio_event_bits |= AUDIO_PLAYER_HIT;
        }

        // Thorns: fire retaliatory beams.
        let thorns = self.inventory.level(ShardKind::Thorns);
        if thorns > 0 {
            self.fire_thorns(thorns);
        }
    }

    /// Fire retaliatory beams in random directions (Thorns shard).
    fn fire_thorns(&mut self, level: u8) {
        let beam_count = THORNS_BEAMS_PER_LEVEL as u32 * level as u32;
        let siphon_heal = if self
            .inventory
            .has_synergy(ShardKind::Siphon, ShardKind::Thorns)
        {
            SIPHON_HEAL_PER_HIT * self.inventory.level(ShardKind::Siphon) as f32
        } else {
            0.0
        };
        // Synergy: MARTYRDOM (Thorns+Cascade 3+) — thorns kills trigger cascade.
        let martyrdom = self
            .inventory
            .has_synergy(ShardKind::Thorns, ShardKind::Cascade);

        for _ in 0..beam_count {
            let a = self.rng.angle();
            let dir = Vec2::new(a.cos(), a.sin());
            let start = self.player.pos;
            let end = tangent_endpoint_on_globe(start, dir * THORNS_BEAM_REACH);

            for e in &mut self.enemies {
                if capsule_circle_intersect_globe(
                    start,
                    end,
                    THORNS_BEAM_THICKNESS * 0.5,
                    e.pos,
                    e.radius,
                ) {
                    e.hp -= THORNS_BEAM_DAMAGE;
                    if siphon_heal > 0.0
                        && globe_distance(e.pos, self.player.pos) < BLOOD_PACT_RANGE
                    {
                        self.player.hp = (self.player.hp + siphon_heal).min(self.player.max_hp);
                    }
                }
            }
            if let Some((impact, shield_broken)) = self.damage_boss_with_beam(
                start,
                end,
                THORNS_BEAM_THICKNESS * 0.5,
                THORNS_BEAM_DAMAGE,
            ) {
                if siphon_heal > 0.0 {
                    self.player.hp = (self.player.hp + siphon_heal).min(self.player.max_hp);
                }
                if shield_broken {
                    self.fire_shield_break_burst(impact);
                }
            }

            self.beams.push(Beam {
                start,
                end,
                life: 0.0,
                max_life: THORNS_BEAM_LIFETIME,
                thickness: THORNS_BEAM_THICKNESS,
                color: [1.0, 0.3, 0.3],
                is_echo: false,
            });
        }

        // Martyrdom: kills during thorns trigger cascade from their position.
        if martyrdom {
            let cascade_level = self.inventory.level(ShardKind::Cascade);
            let chain_reaction = self
                .inventory
                .has_synergy(ShardKind::Split, ShardKind::Cascade);
            let fan_count = if chain_reaction { 3u32 } else { 1 };
            let color = if chain_reaction {
                [0.25, 1.0, 0.88]
            } else {
                [1.0, 0.5, 0.3]
            };
            let kills: Vec<Vec2> = self
                .enemies
                .iter()
                .filter(|e| e.hp <= 0.0)
                .map(|e| e.pos)
                .collect();
            for pos in kills {
                self.fire_cascade_beams(pos, cascade_level, fan_count, color);
            }
        }
    }

    fn compute_score(&self) -> u32 {
        let time_bonus = (self.time / 10.0) as u32;
        self.kills_total + self.rank * 5 + time_bonus + self.boss_kills * 500
    }

    fn rank_pressure(&self) -> f32 {
        let span = (RANK_PRESSURE_END - RANK_PRESSURE_START) as f32;
        let t = self.rank.saturating_sub(RANK_PRESSURE_START) as f32 / span;
        smoothstep01(t)
    }

    fn max_spawns_per_frame(&self) -> u32 {
        let extra = (MAX_SPAWNS_PER_FRAME - BASE_SPAWNS_PER_FRAME) as f32 * self.rank_pressure();
        BASE_SPAWNS_PER_FRAME + extra.round() as u32
    }

    fn enemy_cap_for_wave(&self) -> usize {
        let overdrive_minutes = ((self.time - OVERDRIVE_START) / 60.0).max(0.0);
        let overdrive_bonus = (overdrive_minutes * 18.0) as usize;
        let wave_cap = (BASE_ENEMY_CAP + self.wave as usize * ENEMY_CAP_PER_WAVE + overdrive_bonus)
            .min(MAX_ENEMIES);
        let rank_cap = BASE_ENEMY_CAP
            + ((MAX_ENEMIES - BASE_ENEMY_CAP) as f32 * self.rank_pressure()) as usize;
        let post_wave5_multiplier =
            1.0 + self.wave.saturating_sub(5) as f32 * ENEMY_CAP_MULT_PER_WAVE_AFTER_5;
        let cap = (((wave_cap.max(rank_cap) as f32) * post_wave5_multiplier).round() as usize)
            .min(MAX_ENEMIES);
        // Opening on-ramp: small cap for the first waves; no effect from wave 3 on.
        if self.wave < 3 {
            cap.min(ONRAMP_CAP_BASE + self.wave as usize * ONRAMP_CAP_PER_WAVE)
        } else {
            cap
        }
    }

    fn spawn_rate_for_wave(&self) -> f32 {
        let minute = self.time / 60.0;
        let overdrive_minutes = ((self.time - OVERDRIVE_START) / 60.0).max(0.0);
        let rank_pressure = self.rank_pressure();
        // Opening on-ramp: the first ~100 seconds ease from a trickle to full
        // pressure so a fresh run teaches movement before it tests it.
        // Identical to the steady-state formula once time >= ONRAMP_DURATION.
        let onramp = 1.0 + (ONRAMP_INTERVAL_BOOST - 1.0)
            * (1.0 - (self.time / ONRAMP_DURATION).clamp(0.0, 1.0));
        let base = (0.34 - self.wave as f32 * 0.018 - minute * 0.006) * onramp;
        let overdrive_mult = (1.0 - overdrive_minutes * 0.05).max(0.80);
        let rank_mult = 1.0 - rank_pressure * 0.45;
        let min_interval = (0.050 - overdrive_minutes * 0.004 - rank_pressure * 0.024).max(0.018);
        // Shape multiplier: Surge/Swarm spawn faster, Steady is normal.
        let shape_mult = match self.wave_shape() {
            WaveShape::Surge => 0.6,
            WaveShape::Swarm => 0.5,
            WaveShape::Crescendo => {
                // Accelerates within the wave.
                let t = self.wave_timer / WAVE_DURATION;
                0.85 - t * 0.35
            }
            _ => 1.0,
        };
        (base * shape_mult * overdrive_mult * rank_mult).max(min_interval)
    }

    fn spawn_wave_enemy(&mut self) {
        let kind = self.pick_enemy_kind();
        let angle = self.rng.angle();
        self.spawn_enemy_at(kind, angle);
    }

    fn spawn_enemy_at(&mut self, kind: EnemyKind, angle: f32) {
        let minute = self.time / 60.0;
        let (radius, hp, speed, contact_damage, color) = enemy_stats(kind, minute);
        let spawn_radius = self.screen_size.length() * 0.55;
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * spawn_radius);
        let speed = speed * self.rng.range(0.85, 1.15);
        // Orbiters store orbit radius in charge_dir.x and spin direction in charge_dir.y.
        let charge_dir = if kind == EnemyKind::Orbiter {
            let spin = if self.rng.next_u32() % 2 == 0 {
                1.0
            } else {
                -1.0
            };
            Vec2::new(self.rng.range(150.0, 220.0), spin)
        } else {
            Vec2::ZERO
        };
        // Weaver spawns as a linked laser-tether pair separated by ~130 px!
        let link_id = if kind == EnemyKind::Weaver {
            let id = self.next_weaver_link_id;
            self.next_weaver_link_id = self.next_weaver_link_id.wrapping_add(1).max(1);
            id
        } else {
            0
        };
        self.enemies.push(Enemy {
            pos,
            radius,
            hp,
            speed,
            kind,
            state: EnemyState::Drifting,
            state_timer: 0.0,
            charge_dir,
            color,
            contact_damage,
            slow_timer: 0.0,
            no_xp: false,
            spawn_grace: SPAWN_GRACE,
            mini_boss: None,
            prism_mark_timer: 0.0,
            link_id,
            shield_broken_timer: 0.0,
        });
        if kind == EnemyKind::Weaver {
            let perp = Vec2::new(-dir.y, dir.x);
            let partner_pos = tangent_endpoint_on_globe(pos, perp * 128.0);
            self.enemies.push(Enemy {
                pos: partner_pos,
                radius,
                hp,
                speed,
                kind,
                state: EnemyState::Drifting,
                state_timer: 0.5,
                charge_dir: Vec2::ZERO,
                color,
                contact_damage,
                slow_timer: 0.0,
                no_xp: false,
                spawn_grace: SPAWN_GRACE,
                mini_boss: None,
                prism_mark_timer: 0.0,
                link_id,
                shield_broken_timer: 0.0,
            });
        }
    }

    fn maybe_fire_wave_event(&mut self) {
        if self.wave_event_fired {
            return;
        }
        self.wave_event_fired = true;
        match self.wave {
            12 => {
                // Siege: 4 Emitters from cardinal directions + 2 flanking Brutes.
                for i in 0..4 {
                    let angle = i as f32 * std::f32::consts::TAU / 4.0;
                    self.spawn_enemy_at(EnemyKind::Emitter, angle);
                }
                let a = self.rng.angle();
                self.spawn_enemy_at(EnemyKind::Brute, a);
                self.spawn_enemy_at(EnemyKind::Brute, a + std::f32::consts::PI);
            }
            15 => {
                // Veil: 5 Umbras phase in from random angles simultaneously.
                for _ in 0..5 {
                    let angle = self.rng.angle();
                    self.spawn_enemy_at(EnemyKind::Umbra, angle);
                }
            }
            18 => {
                // Cluster: 4 Splitters in two tight pairs (each splits into 3 on death).
                let base = self.rng.angle();
                for i in 0..4 {
                    let spread = (i as f32 - 1.5) * 0.2;
                    self.spawn_enemy_at(EnemyKind::Splitter, base + spread);
                }
            }
            21 => {
                // Iron Ring: 4 Brutes from cardinal directions + 2 Pulsars.
                for i in 0..4 {
                    let angle = i as f32 * std::f32::consts::TAU / 4.0;
                    self.spawn_enemy_at(EnemyKind::Brute, angle);
                }
                let a = self.rng.angle();
                self.spawn_enemy_at(EnemyKind::Pulsar, a);
                self.spawn_enemy_at(EnemyKind::Pulsar, a + std::f32::consts::PI);
            }
            24 => {
                // Orbit Cage: 6 Orbiters from evenly distributed angles.
                for i in 0..6 {
                    let angle = i as f32 * std::f32::consts::TAU / 6.0;
                    self.spawn_enemy_at(EnemyKind::Orbiter, angle);
                }
            }
            27 => {
                // Final Storm: Umbra vanguard + Dasher flanks + Splitter cluster.
                for i in 0..3 {
                    let angle = i as f32 * std::f32::consts::TAU / 3.0;
                    self.spawn_enemy_at(EnemyKind::Umbra, angle);
                    self.spawn_enemy_at(EnemyKind::Dasher, angle + 0.4);
                }
                let base = self.rng.angle();
                for i in 0..3 {
                    self.spawn_enemy_at(EnemyKind::Splitter, base + i as f32 * 0.3);
                }
            }
            _ => {}
        }
    }

    fn pick_enemy_kind(&mut self) -> EnemyKind {
        let minute = self.time / 60.0;

        // Threat cocktail: guaranteed compositions for key waves.
        match (self.wave, self.wave_shape()) {
            (6, _) => {
                // Orbiter + Dasher mix.
                return if self.rng.next_u32() % 2 == 0 {
                    EnemyKind::Orbiter
                } else {
                    EnemyKind::Dasher
                };
            }
            (9, _) => {
                // Splitter swarm.
                if self.rng.next_u32() % 3 != 0 {
                    return EnemyKind::Splitter;
                }
            }
            _ => {}
        }

        // Rare Golden Prism Carrier loot beetle (~1.2% chance from wave 2+, max 1 active).
        if self.wave >= 2
            && self.rng.next_u32() % 85 == 0
            && !self.enemies.iter().any(|e| e.kind == EnemyKind::Carrier)
        {
            return EnemyKind::Carrier;
        }
        // Tactical specialist injection starting from wave 2+: Weaver, Reflector, Anchor, Stalker!
        if self.wave >= 2 && self.rng.next_u32() % 7 == 0 {
            let pool = [
                (EnemyKind::Weaver, 4u32),
                (EnemyKind::Reflector, if self.wave >= 3 { 4 } else { 1 }),
                (EnemyKind::Anchor, if self.wave >= 4 { 3 } else { 0 }),
                (EnemyKind::Stalker, if self.wave >= 5 { 4 } else { 0 }),
            ];
            if let Some(k) = weighted_pick(&pool, &mut self.rng) {
                return k;
            }
        }

        if self.wave >= 20 && self.rng.next_u32() % 4 == 0 {
            let pool = [
                (EnemyKind::Brute, 3u32),
                (EnemyKind::Dasher, 4),
                (EnemyKind::Splitter, 4),
                (EnemyKind::Orbiter, 3),
                (EnemyKind::Emitter, 4),
                (EnemyKind::Pulsar, 3),
                (EnemyKind::Umbra, 3),
                (EnemyKind::Weaver, 3),
                (EnemyKind::Reflector, 3),
                (EnemyKind::Anchor, 2),
                (EnemyKind::Stalker, 3),
            ];
            if let Some(kind) = weighted_pick(&pool, &mut self.rng) {
                return kind;
            }
        }

        let rank_after_10 = self.rank.saturating_sub(RANK_PRESSURE_START);
        if rank_after_10 > 0 {
            let diversity_chance = (22 + rank_after_10 * 3).min(78);
            if self.rng.next_u32() % 100 < diversity_chance {
                let pool = [
                    (EnemyKind::Drone, 3u32),
                    (EnemyKind::Brute, 4 + rank_after_10.min(8)),
                    (EnemyKind::Dasher, 5 + rank_after_10.min(10)),
                    (EnemyKind::Splitter, 4 + rank_after_10.min(8)),
                    (EnemyKind::Orbiter, 4 + rank_after_10.min(8)),
                    (EnemyKind::Emitter, 4 + rank_after_10.min(10)),
                    (EnemyKind::Pulsar, 3 + rank_after_10.min(8)),
                    (EnemyKind::Umbra, 2 + rank_after_10.min(8)),
                ];
                if let Some(kind) = weighted_pick(&pool, &mut self.rng) {
                    return kind;
                }
            }
        }

        // Wave shape overrides.
        match self.wave_shape() {
            WaveShape::Elite => {
                let pool = [
                    (EnemyKind::Brute, 5u32),
                    (EnemyKind::Splitter, 3),
                    (EnemyKind::Emitter, 2),
                    (EnemyKind::Pulsar, if self.wave >= 12 { 2 } else { 0 }),
                    (EnemyKind::Umbra, if self.wave >= 18 { 2 } else { 0 }),
                ];
                return weighted_pick(&pool, &mut self.rng).unwrap_or(EnemyKind::Brute);
            }
            WaveShape::Crescendo if self.wave >= 14 => {
                // Late crescendos mix ranged pressure into the density spike.
                return match self.rng.next_u32() % 4 {
                    0 => EnemyKind::Emitter,
                    1 => EnemyKind::Orbiter,
                    2 => EnemyKind::Pulsar,
                    _ if self.wave >= 18 => EnemyKind::Umbra,
                    _ => EnemyKind::Emitter,
                };
            }
            WaveShape::Swarm => {
                // Lots of drones + dashers.
                if self.wave >= 17 && self.rng.next_u32() % 5 == 0 {
                    return EnemyKind::Splitter;
                }
                return if self.rng.next_u32() % 3 == 0 {
                    EnemyKind::Dasher
                } else {
                    EnemyKind::Drone
                };
            }
            _ => {}
        }

        // Normal weighted pool.
        let mut pool: Vec<(EnemyKind, u32)> = vec![(EnemyKind::Drone, 10)];
        if minute >= 0.5 {
            pool.push((EnemyKind::Brute, 3)); // earlier unlock (was 1.5 min)
        }
        if minute >= 2.0 {
            pool.push((EnemyKind::Dasher, 4));
        }
        if minute >= 3.0 {
            pool.push((EnemyKind::Splitter, 3));
        }
        if minute >= 4.0 {
            pool.push((EnemyKind::Orbiter, 3));
        }
        if minute >= 5.0 {
            pool.push((EnemyKind::Emitter, 3));
            pool[0].1 = 6;
        }
        if minute >= 6.5 {
            pool.push((EnemyKind::Pulsar, 2));
        }
        if minute >= 8.0 {
            pool[0].1 = 4;
            pool.push((EnemyKind::Brute, 2));
            pool.push((EnemyKind::Dasher, 3));
            pool.push((EnemyKind::Splitter, 2));
            pool.push((EnemyKind::Orbiter, 2));
            pool.push((EnemyKind::Emitter, 2));
            pool.push((EnemyKind::Pulsar, 2));
        }
        if minute >= 9.5 {
            pool.push((EnemyKind::Umbra, 2));
        }
        if minute >= 10.0 {
            pool[0].1 = 3;
            pool.push((EnemyKind::Dasher, 4));
            pool.push((EnemyKind::Splitter, 3));
            pool.push((EnemyKind::Orbiter, 3));
            pool.push((EnemyKind::Emitter, 4));
            pool.push((EnemyKind::Pulsar, 3));
            pool.push((EnemyKind::Umbra, 3));
        }

        weighted_pick(&pool, &mut self.rng).unwrap_or(EnemyKind::Drone)
    }

    fn find_nearest_enemy_pos_from(&self, origin: Vec2) -> Option<Vec2> {
        let nearest_enemy = self
            .enemies
            .iter()
            .map(|e| {
                let delta = nearest_globe_delta(origin, e.pos);
                (origin + delta, delta.length_squared())
            })
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(p, d)| (p, d));

        let nearest_boss = self.boss.as_ref().and_then(|b| {
            if b.state != BossState::Active {
                return None;
            }
            match b.kind {
                BossKind::Hydra => (0..3usize)
                    .filter(|&i| b.lobe_hp[i] > 0.0)
                    .map(|i| {
                        let lp = Game::hydra_lobe_pos(b, i);
                        let delta = nearest_globe_delta(origin, lp);
                        (origin + delta, delta.length_squared())
                    })
                    .min_by(|a, c| a.1.partial_cmp(&c.1).unwrap_or(std::cmp::Ordering::Equal)),
                _ => {
                    let delta = nearest_globe_delta(origin, b.pos);
                    Some((origin + delta, delta.length_squared()))
                }
            }
        });

        match (nearest_enemy, nearest_boss) {
            (Some(enemy), Some(boss)) => {
                if boss.1 < enemy.1 {
                    Some(boss.0)
                } else {
                    Some(enemy.0)
                }
            }
            (Some(enemy), None) => Some(enemy.0),
            (None, Some(boss)) => Some(boss.0),
            (None, None) => None,
        }
    }

    fn find_secondary_target(&self) -> Option<Vec2> {
        let mut by_dist: Vec<(Vec2, f32)> = self
            .enemies
            .iter()
            .map(|e| {
                let delta = nearest_globe_delta(self.player.pos, e.pos);
                (self.player.pos + delta, delta.length_squared())
            })
            .collect();
        by_dist.sort_unstable_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        by_dist.get(1).map(|(p, _)| *p)
    }

    fn wave_shape(&self) -> WaveShape {
        // The first cycle is all Steady: the opening teaches movement before
        // the Surge/Swarm/Elite/Crescendo rotation begins at wave 5. Wave 5
        // maps to Steady in the modulo cycle, so shapes for wave >= 5 are
        // exactly what they were without this gate.
        if self.wave < 5 {
            return WaveShape::Steady;
        }
        match self.wave % 5 {
            0 => WaveShape::Steady,
            1 => WaveShape::Surge,
            2 => WaveShape::Swarm,
            3 => WaveShape::Elite,
            4 => WaveShape::Crescendo,
            _ => WaveShape::Steady,
        }
    }

    fn breather_for_shape(&self, shape: WaveShape) -> f32 {
        match shape {
            WaveShape::Surge | WaveShape::Swarm => 3.5,
            _ => 2.0,
        }
    }

    fn spawn_death_particles(&mut self, pos: Vec2, kind: EnemyKind) {
        let (_, _, _, _, color) = enemy_stats(kind, self.time / 60.0);
        let count = match kind {
            EnemyKind::Brute => 18,
            EnemyKind::Splitter => 14,
            EnemyKind::Emitter => 12,
            EnemyKind::Pulsar => 20,
            EnemyKind::Umbra => 16,
            _ => PARTICLE_COUNT_PER_DEATH,
        };
        for _ in 0..count {
            let angle = self.rng.angle();
            let speed = self.rng.range(120.0, 280.0);
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(angle.cos(), angle.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.45, 0.85),
                color,
                size: self.rng.range(1.5, 3.0),
            });
        }
    }

    // --- Rendering ------------------------------------------------------

    fn build_draw_buffers(&mut self) {
        self.circle_buf.clear();
        self.beam_buf.clear();
        self.popup_buf.clear();
        self.aim_target_buf.clear();
        let camera = self.camera;

        // Pack Pink Ghost Player Snipers + Aim-Trainer Targets for WebGL2 bloom & 2D sniper gauges!
        let player_screen = nearest_globe_pos(camera, self.player.pos);
        for t in &self.aim_targets {
            let pos = nearest_globe_pos(camera, t.pos);
            let life_frac = (1.0 - t.life / t.max_life).clamp(0.0, 1.0);
            let mut flags = 0u32;
            if t.golden {
                flags |= 1 << 0;
            }
            if self.deadeye_locks.iter().any(|&p| globe_distance(p, t.pos) < t.radius * 2.0) {
                flags |= 1 << 1;
            }
            if life_frac < 0.30 {
                flags |= 1 << 2;
            }
            self.aim_target_buf.push(AimTargetInstance {
                x: pos.x,
                y: pos.y,
                radius: t.radius,
                kind: t.kind as u32 as f32,
                progress: t.progress,
                life_frac,
                step: t.step as f32,
                total: t.total as f32,
                ghost_id: t.ghost_id as f32,
                flags: flags as f32,
            });
            // Pink/Magenta Ghost Sniper aesthetic (Golden-Rose for Ace Phantoms!).
            let (r, g, b, core_shape) = if t.golden {
                (1.0_f32, 0.86, 0.28, SHAPE_PRISM)
            } else {
                match t.kind {
                    AimDrillKind::Flick => (1.0, 0.28, 0.78, SHAPE_PRISM),
                    AimDrillKind::Track => (0.96, 0.32, 0.94, SHAPE_STAR),
                    AimDrillKind::Micro => (1.0, 0.22, 0.62, SHAPE_HEX),
                }
            };
            // Hostile narrowing sniper laser sightline painted onto the player!
            let threat = (1.0 - life_frac).clamp(0.0, 1.0);
            let pulse = if life_frac < 0.30 {
                0.65 + 0.35 * (self.time * 28.0).sin().abs()
            } else {
                1.0
            };
            self.beam_buf.push(BeamInstance {
                x0: pos.x,
                y0: pos.y,
                x1: player_screen.x,
                y1: player_screen.y,
                thickness: (0.8 + threat * 2.1) * pulse,
                r: 1.0,
                g: if t.golden { 0.82 } else { 0.22 + (1.0 - threat) * 0.28 },
                b: if t.golden { 0.32 } else { 0.72 },
                a: (0.16 + threat * 0.56) * pulse,
                glow: (0.8 + threat * 2.2) * pulse,
            });
            // Outer glowing optical ring (shrinks smoothly as the Ghost locks on!).
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: t.radius * (1.0 + life_frac * 0.45),
                r,
                g,
                b,
                a: 0.76,
                glow: 2.3 + threat * 1.4,
                shape: SHAPE_RING,
            });
            // Luminous crystalline Ghost Prism silhouette.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: t.radius * 0.58,
                r,
                g,
                b,
                a: 0.94,
                glow: 2.6 + t.progress * 2.0 + threat * 1.2,
                shape: core_shape,
            });
        }

        // Dead-Eye Overdrive locked-on orbital target reticles!
        for &lp in &self.deadeye_locks {
            let pos = nearest_globe_pos(camera, lp);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: 26.0,
                r: 1.0,
                g: 0.90,
                b: 0.32,
                a: 0.92,
                glow: 3.4,
                shape: SHAPE_DIAMOND,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: 34.0,
                r: 1.0,
                g: 0.72,
                b: 0.22,
                a: 0.65,
                glow: 2.2,
                shape: SHAPE_RING,
            });
        }

        // Capturable Prism Obelisk monolith + filling capture ring!
        if let Some(ob) = &self.obelisk {
            let opos = nearest_globe_pos(camera, ob.pos);
            let pulse = 0.8 + 0.2 * (self.time * 4.5).sin();
            self.circle_buf.push(CircleInstance {
                x: opos.x,
                y: opos.y,
                radius: ob.radius,
                r: 1.0,
                g: 0.84,
                b: 0.34,
                a: 0.34 + ob.progress * 0.38,
                glow: 1.5 + ob.progress * 2.4,
                shape: SHAPE_RING,
            });
            if ob.progress > 0.01 {
                self.circle_buf.push(CircleInstance {
                    x: opos.x,
                    y: opos.y,
                    radius: ob.radius * ob.progress,
                    r: 0.42,
                    g: 1.0,
                    b: 0.88,
                    a: 0.38,
                    glow: 2.2,
                    shape: SHAPE_RING,
                });
            }
            self.circle_buf.push(CircleInstance {
                x: opos.x,
                y: opos.y,
                radius: 20.0 * pulse,
                r: 1.0,
                g: 0.88,
                b: 0.42,
                a: 0.95,
                glow: 3.4,
                shape: SHAPE_PRISM,
            });
        }

        for &(world_pos, value, kind) in &self.raw_popups {
            let pos = nearest_globe_pos(camera, world_pos);
            self.popup_buf.push(DamagePopup {
                x: pos.x,
                y: pos.y,
                value,
                kind,
            });
        }

        // Blizzard frost fields — icy blue slow zones with crystalline hex core.
        for f in &self.frost_fields {
            let t = f.life / f.max_life;
            let fade = (1.0 - t).powf(0.6); // linger bright, then fade
            let pos = nearest_globe_pos(camera, f.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: f.radius,
                r: 0.35,
                g: 0.78,
                b: 1.0,
                a: 0.24 * fade,
                glow: 0.8 * fade,
                shape: SHAPE_RING,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: f.radius * 0.32,
                r: 0.6,
                g: 0.94,
                b: 1.0,
                a: 0.45 * fade,
                glow: 1.8 * fade,
                shape: SHAPE_HEX,
            });
        }

        // Ground pulses underneath everything else — crisp optical wave rings!
        let singularity_visual = self.inventory.has_evolution(EvolutionKind::Singularity);
        for p in &self.pulses {
            let t = p.life / p.max_life;
            let r = p.current_radius();
            let pos = nearest_globe_pos(camera, p.pos);
            let fade = (1.0 - t).clamp(0.0, 1.0);
            match p.kind {
                PulseKind::Interference => {
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: r,
                        r: if singularity_visual { 0.36 } else { 0.42 },
                        g: if singularity_visual { 0.22 } else { 0.72 },
                        b: 1.0,
                        a: if singularity_visual { 0.72 } else { 0.56 } * fade,
                        glow: (if singularity_visual { 1.8 } else { 1.3 }) * fade,
                        shape: SHAPE_RING,
                    });
                    // Singularity: dark absorption core grows as the ring expands.
                    if singularity_visual {
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: (r * 0.34).max(6.0),
                            r: 0.14,
                            g: 0.08,
                            b: 0.42,
                            a: 0.78 * fade,
                            glow: 0.2,
                            shape: SHAPE_HEX,
                        });
                    }
                }
                PulseKind::Mine => {
                    let pulse = 0.85 + (self.time * 7.0 + p.pos.x * 0.01).sin() * 0.15;
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: r,
                        r: 0.22,
                        g: 1.0 * pulse,
                        b: 0.62,
                        a: 0.52 * fade,
                        glow: 1.55 * fade,
                        shape: SHAPE_RING,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: (r * 0.18).max(7.0),
                        r: 1.0,
                        g: 0.76,
                        b: 0.26,
                        a: 0.78 * fade,
                        glow: 2.4 * fade,
                        shape: SHAPE_HEX,
                    });
                    let glyph_r = (r * 0.43).max(12.0);
                    let spin = self.time * 3.2 + p.pos.x * 0.002 + p.pos.y * 0.003;
                    for i in 0..3 {
                        let a = spin + i as f32 * std::f32::consts::TAU / 3.0;
                        let node = pos + Vec2::new(a.cos(), a.sin()) * glyph_r;
                        self.beam_buf.push(BeamInstance {
                            x0: pos.x,
                            y0: pos.y,
                            x1: node.x,
                            y1: node.y,
                            thickness: 1.4 + fade,
                            r: 0.86,
                            g: 1.0,
                            b: 0.42,
                            a: 0.34 * fade,
                            glow: 1.2 * fade,
                        });
                        self.circle_buf.push(CircleInstance {
                            x: node.x,
                            y: node.y,
                            radius: 4.8 + 2.0 * fade,
                            r: 0.5,
                            g: 1.0,
                            b: 0.72,
                            a: 0.84 * fade,
                            glow: 2.0 * fade,
                            shape: SHAPE_DIAMOND,
                        });
                    }
                }
                PulseKind::DashBlast => {
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: r,
                        r: 0.52,
                        g: 1.0,
                        b: 0.96,
                        a: 0.74 * fade,
                        glow: 2.2 * fade,
                        shape: SHAPE_RING,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: (r * 0.62).max(10.0),
                        r: 0.85,
                        g: 0.96,
                        b: 1.0,
                        a: 0.44 * fade,
                        glow: 1.1 * fade,
                        shape: SHAPE_RING,
                    });
                }
            }
        }

        // Jump shadow — offset from the player so the hop reads as height.
        if self.player.altitude > 0.02 {
            let mut shadow_pos = self.player.pos;
            let alt = self.player.altitude;
            move_on_globe(&mut shadow_pos, Vec2::new(-18.0, 24.0) * alt);
            let pos = nearest_globe_pos(camera, shadow_pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius * (1.45 + alt * 3.1),
                r: 0.0,
                g: 0.0,
                b: 0.04,
                a: alt * 0.26,
                glow: 0.0,
                shape: SHAPE_ORB,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius * (0.78 + alt * 0.28),
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: alt * 0.62,
                glow: 0.0,
                shape: SHAPE_ORB,
            });
        }

        // Player (blink during i-frames, grows slightly at jump peak to sell height).
        let visible =
            self.player.iframe_timer <= 0.0 || ((self.player.iframe_timer * 16.0) as u32 % 2 == 0);
        if visible {
            let pos = nearest_globe_pos(camera, self.player.pos);
            let visual_r =
                self.player.radius * PLAYER_VISUAL_SCALE * (1.0 + self.player.altitude * 0.45);

            // ── Inventory-driven body evolution visuals ──────────────────
            // Precompute aggregated stats from inventory.
            let total_levels: u32 = {
                let mut s = 0u32;
                for i in 0..crate::shards::SHARD_COUNT {
                    s += self.inventory.levels[i] as u32;
                }
                s
            };
            let intensity = ((1.0 + total_levels as f32).ln() / (7.0_f32).ln()).min(1.0);

            // Beam-modifying shard total (for emitter node count).
            let beam_mod_levels = self.inventory.level(ShardKind::Split) as u32
                + self.inventory.level(ShardKind::Mirror) as u32
                + self.inventory.level(ShardKind::Chromatic) as u32
                + self.inventory.level(ShardKind::Lens) as u32
                + self.inventory.level(ShardKind::Refract) as u32
                + self.inventory.level(ShardKind::Echo) as u32;
            let emitter_count = (beam_mod_levels as usize).min(6);

            let barrier_lvl = self.inventory.level(ShardKind::Barrier);
            let thorns_lvl = self.inventory.level(ShardKind::Thorns);
            let halo_lvl = self.inventory.level(ShardKind::Halo);
            let evolution_active = self.inventory.active_evolution_bits() != 0;
            let kaleidoscope_active =
                self.inventory.has_evolution(EvolutionKind::Kaleidoscope);

            // 1a. Faint outer ring when 1-3 shards collected (shard count check).
            let owned_shards = (0..crate::shards::SHARD_COUNT)
                .filter(|&i| self.inventory.levels[i] > 0)
                .count();
            if owned_shards >= 1 && owned_shards <= 3 {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: visual_r + 10.0,
                    r: 0.5,
                    g: 0.92,
                    b: 1.0,
                    a: 0.36,
                    glow: 0.7,
                    shape: SHAPE_RING,
                });
            }

            // 1b. Defensive shield ring (Barrier or Thorns owned).
            if barrier_lvl > 0 || thorns_lvl > 0 {
                let pulse = 0.7 + 0.3 * (self.time * 3.5).sin();
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: visual_r + 14.0,
                    r: 0.25,
                    g: 0.82,
                    b: 1.0,
                    a: 0.42 * pulse,
                    glow: (0.8 + (barrier_lvl + thorns_lvl) as f32 * 0.14) * pulse,
                    shape: SHAPE_RING,
                });
            }

            // 1c. Orbiting emitter nodes for beam-modifying shards.
            if emitter_count > 0 {
                let orbit_speed = 1.2 + total_levels as f32 * 0.04;
                let orbit_r = 19.0;
                let chrom = self.inventory.level(ShardKind::Chromatic) as f32 / 6.0;
                let node_r = 0.5 + chrom * 0.5;
                let node_g = 0.9 - chrom * 0.4;
                let node_b = 1.0;
                for i in 0..emitter_count {
                    let angle = self.time * orbit_speed
                        + i as f32 * (std::f32::consts::TAU / emitter_count as f32);
                    let offset = Vec2::new(angle.cos(), angle.sin()) * orbit_r;
                    let mut node_world = self.player.pos;
                    move_on_globe(&mut node_world, offset);
                    let np = nearest_globe_pos(camera, node_world);
                    self.circle_buf.push(CircleInstance {
                        x: np.x,
                        y: np.y,
                        radius: 4.2 + intensity * 1.6,
                        r: node_r,
                        g: node_g,
                        b: node_b,
                        a: 0.92,
                        glow: 1.9 + intensity * 1.0,
                        shape: SHAPE_DIAMOND,
                    });
                }
            }

            // 1d. Second inner orbit ring when total shards > 10.
            if total_levels > 10 {
                let inner_count = 6usize;
                let inner_speed = 2.5 + total_levels as f32 * 0.05;
                let inner_r = 12.0;
                for i in 0..inner_count {
                    let angle = -self.time * inner_speed
                        + i as f32 * (std::f32::consts::TAU / inner_count as f32);
                    let offset = Vec2::new(angle.cos(), angle.sin()) * inner_r;
                    let mut node_world = self.player.pos;
                    move_on_globe(&mut node_world, offset);
                    let np = nearest_globe_pos(camera, node_world);
                    self.circle_buf.push(CircleInstance {
                        x: np.x,
                        y: np.y,
                        radius: 2.6 + intensity * 0.9,
                        r: 0.8,
                        g: 1.0,
                        b: 0.95,
                        a: 0.72,
                        glow: 1.3,
                        shape: SHAPE_DIAMOND,
                    });
                }
            }

            // 1e. 12-point geometric ring when any evolution active.
            if evolution_active {
                let geo_r = 31.0 + (if kaleidoscope_active { 5.0 } else { 0.0 });
                let geo_count = 12usize;
                let spin = self.time * 0.35;
                for i in 0..geo_count {
                    let angle =
                        spin + i as f32 * (std::f32::consts::TAU / geo_count as f32);
                    let offset = Vec2::new(angle.cos(), angle.sin()) * geo_r;
                    let mut node_world = self.player.pos;
                    move_on_globe(&mut node_world, offset);
                    let np = nearest_globe_pos(camera, node_world);
                    let hue_shift = i as f32 / geo_count as f32;
                    let cr = 0.5 + 0.5 * (hue_shift * std::f32::consts::TAU).cos();
                    let cg = 0.5 + 0.5 * (hue_shift * std::f32::consts::TAU + 2.094).cos();
                    let cb = 0.5 + 0.5 * (hue_shift * std::f32::consts::TAU + 4.189).cos();
                    self.circle_buf.push(CircleInstance {
                        x: np.x,
                        y: np.y,
                        radius: 3.6,
                        r: cr,
                        g: cg,
                        b: cb,
                        a: 0.82 + 0.18 * intensity,
                        glow: 1.7 + intensity,
                        shape: SHAPE_DIAMOND,
                    });
                }
            }

            // Targeting ring — dotted circle showing attack intent, design-spec dashed orbit.
            {
                let ring_r = 28.0;
                let dot_count = 12usize;
                let ring_alpha = (0.18 + intensity * 0.12).min(0.32);
                let spin = self.time * 0.12;
                for i in 0..dot_count {
                    let angle = spin + i as f32 * std::f32::consts::TAU / dot_count as f32;
                    let offset = Vec2::new(angle.cos(), angle.sin()) * ring_r;
                    let mut dot_world = self.player.pos;
                    move_on_globe(&mut dot_world, offset);
                    let dp = nearest_globe_pos(camera, dot_world);
                    self.circle_buf.push(CircleInstance {
                        x: dp.x,
                        y: dp.y,
                        radius: 1.4,
                        r: 0.66,
                        g: 0.94,
                        b: 1.0,
                        a: ring_alpha,
                        glow: 0.15,
                        shape: SHAPE_DIAMOND,
                    });
                }
            }

            // Soft lantern aura — restrained so faceted prism crystal reads cleanly.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: visual_r * 2.6,
                r: 0.45,
                g: 0.88,
                b: 1.0,
                a: 0.07,
                glow: 0.95 + intensity * 0.4,
                shape: SHAPE_ORB,
            });

            // Core player body — spinning faceted prismatic crystal!
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: visual_r * 1.65,
                r: 0.72,
                g: 0.96,
                b: 1.0,
                a: 1.0,
                glow: 1.45 + self.player.altitude * 0.8 + intensity * 0.45,
                shape: SHAPE_PRISM,
            });

            // Halo enhancement: bright crystalline center when Halo is owned.
            if halo_lvl > 0 {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: visual_r * 0.62,
                    r: 1.0,
                    g: 0.98,
                    b: 0.85,
                    a: 0.92,
                    glow: 2.0 + halo_lvl as f32 * 0.45,
                    shape: SHAPE_DIAMOND,
                });
            }
        }

        // Altitude ring — crisp horizon ring at jump peak.
        if self.player.altitude > 0.05 {
            let pos = nearest_globe_pos(camera, self.player.pos);
            let ring_r =
                self.player.radius * PLAYER_VISUAL_SCALE * (1.0 + self.player.altitude * 0.45) + 9.0;
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: ring_r,
                r: 0.58,
                g: 0.92,
                b: 1.0,
                a: self.player.altitude * 0.65,
                glow: 0.9,
                shape: SHAPE_RING,
            });
        }

        // HP ring around player.
        let hp_frac = self.player.hp / self.player.max_hp;
        if hp_frac < 1.0 {
            let pos = nearest_globe_pos(camera, self.player.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius * PLAYER_VISUAL_SCALE + 6.0,
                r: 1.0 - hp_frac * 0.45,
                g: hp_frac * 0.8,
                b: hp_frac * 0.5,
                a: 0.45 + (1.0 - hp_frac) * 0.4,
                glow: 1.2 + (1.0 - hp_frac) * 1.4,
                shape: SHAPE_RING,
            });
        }

        // Halos — luminous golden crystal diamonds.
        for h in &self.halos {
            let mut p = self.player.pos;
            move_on_globe(&mut p, Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius);
            let p = nearest_globe_pos(camera, p);
            self.circle_buf.push(CircleInstance {
                x: p.x,
                y: p.y,
                radius: h.size * 1.25,
                r: 1.0,
                g: 0.94,
                b: 0.62,
                a: 1.0,
                glow: 2.2,
                shape: SHAPE_DIAMOND,
            });
        }

        // Barrier shield ring — crisp glowing optical bubble rim!
        if self.player.barrier_max > 0.0 {
            let fill = self.player.barrier_hp / self.player.barrier_max;
            let pos = nearest_globe_pos(camera, self.player.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: BARRIER_RADIUS,
                r: 0.34,
                g: 0.78,
                b: 1.0,
                a: 0.36 * fill,
                glow: 1.2 * fill,
                shape: SHAPE_RING,
            });
        }

        // Boss rendering — dispatches by kind.
        if let Some(boss) = &self.boss {
            let pos = nearest_globe_pos(camera, boss.pos);
            let dying_alpha = if boss.state == BossState::Dying {
                (boss.state_timer / BOSS_DEATH_TIME).clamp(0.0, 1.0)
            } else {
                1.0
            };

            match boss.kind {
                BossKind::Sentinel => match boss.state {
                    BossState::Telegraphing => {
                        let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: SENTINEL_RADIUS * (1.0 + t * 1.6),
                            r: 1.0,
                            g: 0.95,
                            b: 0.75,
                            a: 0.40 + t * 0.35,
                            glow: 2.4 + t * 3.5,
                            shape: SHAPE_RING,
                        });
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius,
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: 0.72,
                            glow: 3.8,
                            shape: SHAPE_STAR,
                        });
                    }
                    BossState::Active | BossState::Dying => {
                        let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                        let (r, g, b, glow) = match boss.phase {
                            0 => (1.0_f32, 0.96, 0.88, 3.6_f32),
                            1 => (1.0, 0.48, 0.18, 4.4),
                            _ => (1.0, 0.14, 0.14, 5.0),
                        };
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius + 10.0,
                            r,
                            g,
                            b,
                            a: 0.50 * dying_alpha,
                            glow: glow * 1.1 * dying_alpha,
                            shape: SHAPE_RING,
                        });
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius * 1.08,
                            r,
                            g,
                            b,
                            a: (0.78 + hp_pct * 0.18) * dying_alpha,
                            glow: glow * dying_alpha,
                            shape: SHAPE_STAR,
                        });
                        if boss.state == BossState::Active {
                            for i in 0..boss.shield_hp.len() {
                                if boss.shield_hp[i] <= 0.0 {
                                    continue;
                                }
                                let shield_fill = boss.shield_hp[i] / SENTINEL_SHIELD_HP;
                                let sp =
                                    nearest_globe_pos(camera, Self::sentinel_shield_pos(boss, i));
                                self.circle_buf.push(CircleInstance {
                                    x: sp.x,
                                    y: sp.y,
                                    radius: SENTINEL_SHIELD_RADIUS + 4.0 * shield_fill,
                                    r: 0.55,
                                    g: 0.92,
                                    b: 1.0,
                                    a: 0.70 + shield_fill * 0.25,
                                    glow: 3.0 + shield_fill * 1.8,
                                    shape: SHAPE_HEX,
                                });
                            }
                        }
                    }
                },
                BossKind::Hydra => match boss.state {
                    BossState::Telegraphing => {
                        let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                        for i in 0..3usize {
                            let lp = nearest_globe_pos(camera, Self::hydra_lobe_pos(boss, i));
                            let [r, g, b] = HYDRA_LOBE_COLORS[i];
                            self.circle_buf.push(CircleInstance {
                                x: lp.x,
                                y: lp.y,
                                radius: HYDRA_LOBE_RADIUS * (0.4 + t * 0.7),
                                r,
                                g,
                                b,
                                a: 0.36 + t * 0.45,
                                glow: 2.0 + t * 3.2,
                                shape: SHAPE_HEX,
                            });
                        }
                    }
                    BossState::Active | BossState::Dying => {
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: HYDRA_LOBE_RADIUS * 0.7,
                            r: 0.65,
                            g: 0.65,
                            b: 0.75,
                            a: 0.34 * dying_alpha,
                            glow: 1.4 * dying_alpha,
                            shape: SHAPE_STAR,
                        });
                        for i in 0..3usize {
                            if boss.lobe_hp[i] <= 0.0 && boss.state != BossState::Dying {
                                continue;
                            }
                            let lobe_fill = (boss.lobe_hp[i] / HYDRA_HP_PER_LOBE).clamp(0.0, 1.0);
                            let lp = nearest_globe_pos(camera, Self::hydra_lobe_pos(boss, i));
                            let [r, g, b] = HYDRA_LOBE_COLORS[i];
                            self.circle_buf.push(CircleInstance {
                                x: lp.x,
                                y: lp.y,
                                radius: HYDRA_LOBE_RADIUS + 5.0 * lobe_fill,
                                r,
                                g,
                                b,
                                a: (0.68 + lobe_fill * 0.28) * dying_alpha,
                                glow: (3.2 + lobe_fill * 2.2) * dying_alpha,
                                shape: SHAPE_HEX,
                            });
                        }
                    }
                },
                BossKind::VoidPrism => {
                    let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                    match boss.state {
                        BossState::Telegraphing => {
                            let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: VOID_PRISM_RADIUS * (0.3 + t * 1.7),
                                r: 0.65,
                                g: 0.32,
                                b: 1.0,
                                a: 0.30 + t * 0.40,
                                glow: 2.0 + t * 4.5,
                                shape: SHAPE_RING,
                            });
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: VOID_PRISM_RADIUS * (0.4 + t * 0.65),
                                r: 0.25,
                                g: 0.08,
                                b: 0.55,
                                a: 0.62 + t * 0.32,
                                glow: 2.2 + t * 2.8,
                                shape: SHAPE_PRISM,
                            });
                        }
                        BossState::Active | BossState::Dying => {
                            let glow_base = if boss.phase == 1 { 5.2 } else { 4.0 };
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius + 14.0,
                                r: 0.72,
                                g: 0.35,
                                b: 1.0,
                                a: (0.45 + hp_pct * 0.25) * dying_alpha,
                                glow: glow_base * 1.15 * dying_alpha,
                                shape: SHAPE_RING,
                            });
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius * 1.05,
                                r: 0.24,
                                g: 0.06,
                                b: 0.52,
                                a: (0.86 + hp_pct * 0.14) * dying_alpha,
                                glow: glow_base * dying_alpha,
                                shape: SHAPE_PRISM,
                            });
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius * 0.66,
                                r: 0.85,
                                g: 0.55,
                                b: 1.0,
                                a: (0.55 + hp_pct * 0.25) * dying_alpha,
                                glow: (glow_base * 0.85) * dying_alpha,
                                shape: SHAPE_STAR,
                            });
                        }
                    }
                }
                BossKind::PrismLattice => {
                    let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                    let count = Self::lattice_spoke_count(boss);
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius + 12.0,
                        r: 0.35,
                        g: 0.95,
                        b: 1.0,
                        a: 0.52 * dying_alpha,
                        glow: 3.4 * dying_alpha,
                        shape: SHAPE_RING,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius,
                        r: 0.25,
                        g: 0.78,
                        b: 1.0,
                        a: (0.78 + hp_pct * 0.2) * dying_alpha,
                        glow: 3.6 * dying_alpha,
                        shape: SHAPE_HEX,
                    });
                    if boss.state == BossState::Active {
                        for i in 0..count {
                            let a = boss.spoke_angle
                                + (i as f32) * std::f32::consts::TAU / count as f32;
                            let end_w = tangent_endpoint_on_globe(
                                boss.pos,
                                Vec2::new(a.cos(), a.sin()) * LATTICE_SPOKE_LENGTH,
                            );
                            let end_s = nearest_globe_pos(camera, end_w);
                            let disabled = boss.spoke_disabled[i] > 0.0;
                            self.beam_buf.push(BeamInstance {
                                x0: pos.x,
                                y0: pos.y,
                                x1: end_s.x,
                                y1: end_s.y,
                                thickness: if disabled { 1.2 } else { 5.2 },
                                r: if disabled { 0.35 } else { 1.0 },
                                g: if disabled { 0.55 } else { 0.34 },
                                b: if disabled { 0.7 } else { 0.22 },
                                a: if disabled { 0.22 } else { 0.85 },
                                glow: if disabled { 0.4 } else { 2.8 },
                            });
                            if !disabled {
                                let rp = nearest_globe_pos(camera, Self::lattice_relay_pos(boss, i));
                                self.circle_buf.push(CircleInstance {
                                    x: rp.x,
                                    y: rp.y,
                                    radius: 13.0,
                                    r: 1.0,
                                    g: 0.86,
                                    b: 0.28,
                                    a: 0.92,
                                    glow: 3.0,
                                    shape: SHAPE_DIAMOND,
                                });
                                self.aim_target_buf.push(AimTargetInstance {
                                    x: rp.x,
                                    y: rp.y,
                                    radius: 17.0,
                                    kind: 3.0,
                                    progress: 0.0,
                                    life_frac: 1.0,
                                    step: (i + 1) as f32,
                                    total: count as f32,
                                    ghost_id: -1.0,
                                    flags: 1.0,
                                });
                            }
                        }
                    }
                }
                BossKind::MirrorSovereign => {
                    let stunned = boss.stun_timer > 0.0;
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius + 10.0,
                        r: if stunned { 1.0 } else { 1.0 },
                        g: if stunned { 0.92 } else { 0.26 },
                        b: if stunned { 0.36 } else { 0.84 },
                        a: 0.62 * dying_alpha,
                        glow: (if stunned { 4.4 } else { 3.2 }) * dying_alpha,
                        shape: SHAPE_RING,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius,
                        r: 1.0,
                        g: if stunned { 0.94 } else { 0.36 },
                        b: if stunned { 0.48 } else { 0.88 },
                        a: 0.92 * dying_alpha,
                        glow: 3.8 * dying_alpha,
                        shape: SHAPE_PRISM,
                    });
                    if boss.state == BossState::Active && !stunned {
                        // 2 translucent Mirror Decoys orbiting the Sovereign!
                        for &da in &boss.decoy_angles {
                            let dp = nearest_globe_pos(
                                camera,
                                tangent_endpoint_on_globe(
                                    boss.pos,
                                    Vec2::new(da.cos(), da.sin()) * SOVEREIGN_DECOY_ORBIT,
                                ),
                            );
                            self.circle_buf.push(CircleInstance {
                                x: dp.x,
                                y: dp.y,
                                radius: boss.radius * 0.82,
                                r: 0.92,
                                g: 0.38,
                                b: 0.96,
                                a: 0.44,
                                glow: 2.0,
                                shape: SHAPE_PRISM,
                            });
                        }
                        // Visible boss sniper lock sightline while charging!
                        if boss.aim_charge > 0.01 {
                            let aim_end = nearest_globe_pos(
                                camera,
                                tangent_endpoint_on_globe(boss.pos, boss.aim_dir * 520.0),
                            );
                            self.beam_buf.push(BeamInstance {
                                x0: pos.x,
                                y0: pos.y,
                                x1: aim_end.x,
                                y1: aim_end.y,
                                thickness: 1.4 + boss.aim_charge * 3.2,
                                r: 1.0,
                                g: 0.22 + (1.0 - boss.aim_charge) * 0.5,
                                b: 0.72,
                                a: 0.35 + boss.aim_charge * 0.55,
                                glow: 2.4 + boss.aim_charge * 2.2,
                            });
                            self.aim_target_buf.push(AimTargetInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius + 8.0,
                                kind: 3.0,
                                progress: boss.aim_charge,
                                life_frac: (1.0 - boss.aim_charge).clamp(0.0, 1.0),
                                step: 1.0,
                                total: 1.0,
                                ghost_id: -1.0,
                                flags: 5.0,
                            });
                        }
                    }
                }
                BossKind::ChronoEclipse => {
                    let is_lunar = boss.phase == 1;
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius + 14.0,
                        r: if is_lunar { 0.56 } else { 1.0 },
                        g: if is_lunar { 0.42 } else { 0.76 },
                        b: if is_lunar { 1.0 } else { 0.22 },
                        a: 0.60 * dying_alpha,
                        glow: 3.8 * dying_alpha,
                        shape: SHAPE_RING,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: boss.radius,
                        r: if is_lunar { 0.28 } else { 1.0 },
                        g: if is_lunar { 0.16 } else { 0.56 },
                        b: if is_lunar { 0.72 } else { 0.14 },
                        a: 0.90 * dying_alpha,
                        glow: 4.0 * dying_alpha,
                        shape: SHAPE_STAR,
                    });
                    if boss.state == BossState::Active {
                        if !is_lunar {
                            // Solar Flare scorching corridors!
                            for i in 0..3 {
                                let a = boss.spoke_angle + (i as f32) * std::f32::consts::TAU / 3.0;
                                let end_s = nearest_globe_pos(
                                    camera,
                                    tangent_endpoint_on_globe(boss.pos, Vec2::new(a.cos(), a.sin()) * 290.0),
                                );
                                self.beam_buf.push(BeamInstance {
                                    x0: pos.x,
                                    y0: pos.y,
                                    x1: end_s.x,
                                    y1: end_s.y,
                                    thickness: 8.5,
                                    r: 1.0,
                                    g: 0.68,
                                    b: 0.18,
                                    a: 0.80,
                                    glow: 3.4,
                                });
                            }
                        } else {
                            // Click-to-detonate converging Lunar Prisms!
                            for (i, &(lp_w, alive)) in boss.lunar_prisms.iter().enumerate() {
                                if !alive {
                                    continue;
                                }
                                let lp = nearest_globe_pos(camera, lp_w);
                                self.circle_buf.push(CircleInstance {
                                    x: lp.x,
                                    y: lp.y,
                                    radius: 17.0,
                                    r: 0.76,
                                    g: 0.42,
                                    b: 1.0,
                                    a: 0.92,
                                    glow: 3.2,
                                    shape: SHAPE_DIAMOND,
                                });
                                self.aim_target_buf.push(AimTargetInstance {
                                    x: lp.x,
                                    y: lp.y,
                                    radius: 20.0,
                                    kind: 3.0,
                                    progress: 0.0,
                                    life_frac: 1.0,
                                    step: (i + 1) as f32,
                                    total: 6.0,
                                    ghost_id: -1.0,
                                    flags: 1.0,
                                });
                            }
                        }
                    }
                }
            }

            // Universal Orbiting Boss Weakpoint Core (Weakpoint Sight @3+ Optical Stacks, or Sentinel/VoidPrism)!
            if boss.state == BossState::Active
                && boss.weakpoint_cooldown <= 0.0
                && (self.optical_stacks >= 3
                    || matches!(boss.kind, BossKind::Sentinel | BossKind::VoidPrism))
            {
                let wp = nearest_globe_pos(camera, Self::boss_weakpoint_pos(boss));
                self.circle_buf.push(CircleInstance {
                    x: wp.x,
                    y: wp.y,
                    radius: 13.0,
                    r: 1.0,
                    g: 0.92,
                    b: 0.30,
                    a: 0.95,
                    glow: 3.8,
                    shape: SHAPE_DIAMOND,
                });
                self.aim_target_buf.push(AimTargetInstance {
                    x: wp.x,
                    y: wp.y,
                    radius: 18.0,
                    kind: 3.0,
                    progress: 0.0,
                    life_frac: 1.0,
                    step: 1.0,
                    total: 1.0,
                    ghost_id: -1.0,
                    flags: 1.0,
                });
            }
        }

        // Void shockwaves — crisp expanding violet wave rings.
        for sw in &self.void_shockwaves {
            let sw_pos = nearest_globe_pos(camera, sw.pos);
            let r = sw.current_radius();
            let fade = (1.0 - sw.life / sw.max_life).clamp(0.0, 1.0);
            self.circle_buf.push(CircleInstance {
                x: sw_pos.x,
                y: sw_pos.y,
                radius: r,
                r: 0.68,
                g: 0.24,
                b: 1.0,
                a: fade * 0.72,
                glow: 2.8 * fade,
                shape: SHAPE_RING,
            });
            if r > 12.0 {
                self.circle_buf.push(CircleInstance {
                    x: sw_pos.x,
                    y: sw_pos.y,
                    radius: r - 8.0,
                    r: 0.28,
                    g: 0.06,
                    b: 0.62,
                    a: fade * 0.36,
                    glow: 1.1,
                    shape: SHAPE_RING,
                });
            }
        }

        // VoidShells — descending dark crystalline orbs with crisp telegraph rings.
        for s in &self.void_shells {
            let pos = nearest_globe_pos(camera, s.target);
            let t = 1.0 - s.altitude;
            let visual_r = s.radius * (3.5 - t * 2.5);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: visual_r,
                r: 0.52,
                g: 0.12,
                b: 1.0,
                a: 0.62 + t * 0.3,
                glow: 2.5 - t * 0.9,
                shape: SHAPE_STAR,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: VOID_SHELL_LAND_RADIUS_DAMAGE,
                r: 0.72,
                g: 0.12,
                b: 0.92,
                a: 0.22 + t * 0.45,
                glow: 0.6 + t * 1.2,
                shape: SHAPE_RING,
            });
        }

        // Weaver laser-tether beams drawn cleanly between linked pairs!
        let mut drawn_weavers: Vec<(u32, Vec2)> = Vec::new();
        for e in &self.enemies {
            if e.kind == EnemyKind::Weaver && e.link_id > 0 {
                let p = nearest_globe_pos(camera, e.pos);
                if let Some((_, other)) = drawn_weavers.iter().find(|(id, _)| *id == e.link_id) {
                    if (*other - p).length() < 320.0 {
                        self.beam_buf.push(BeamInstance {
                            x0: other.x,
                            y0: other.y,
                            x1: p.x,
                            y1: p.y,
                            thickness: 4.0,
                            r: 1.0,
                            g: 0.34,
                            b: 0.16,
                            a: 0.86,
                            glow: 2.6,
                        });
                    }
                } else {
                    drawn_weavers.push((e.link_id, p));
                }
            }
        }

        // Enemies — distinct geometric SDF silhouettes by combat role.
        let hit_set: Vec<Vec2> = self.hit_flash_positions.clone();
        for e in &self.enemies {
            let pos = nearest_globe_pos(camera, e.pos);
            let is_hit = hit_set.iter().any(|h| globe_distance(*h, e.pos) < 1.0);
            let body_shape = if e.mini_boss.is_some() {
                SHAPE_STAR
            } else {
                match e.kind {
                    EnemyKind::Drone | EnemyKind::Dasher | EnemyKind::Umbra | EnemyKind::Stalker => {
                        SHAPE_CHEVRON
                    }
                    EnemyKind::Brute | EnemyKind::Splitter | EnemyKind::Reflector => SHAPE_HEX,
                    EnemyKind::Carrier => SHAPE_DIAMOND,
                    EnemyKind::Orbiter
                    | EnemyKind::Emitter
                    | EnemyKind::Pulsar
                    | EnemyKind::Weaver
                    | EnemyKind::Anchor => SHAPE_STAR,
                }
            };
            // Role-specific tactical telegraphs & auras!
            if e.kind == EnemyKind::Anchor && e.state == EnemyState::Anchored {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: 135.0,
                    r: 0.45,
                    g: 0.28,
                    b: 1.0,
                    a: 0.22,
                    glow: 1.1,
                    shape: SHAPE_RING,
                });
            } else if e.kind == EnemyKind::Stalker && e.state == EnemyState::Blinking {
                let dest = nearest_globe_pos(camera, e.charge_dir);
                self.circle_buf.push(CircleInstance {
                    x: dest.x,
                    y: dest.y,
                    radius: 18.0 * (0.5 + e.state_timer),
                    r: 1.0,
                    g: 0.28,
                    b: 0.96,
                    a: 0.72,
                    glow: 2.4,
                    shape: SHAPE_RING,
                });
            } else if e.kind == EnemyKind::Reflector && e.shield_broken_timer <= 0.0 {
                // Gleaming front mirror shield arc + glowing amber dorsal weakpoint!
                let fwd = e.charge_dir.normalize_or_zero();
                let sp = pos + fwd * (e.radius * 0.92);
                self.circle_buf.push(CircleInstance {
                    x: sp.x,
                    y: sp.y,
                    radius: e.radius * 0.72,
                    r: 0.85,
                    g: 0.97,
                    b: 1.0,
                    a: 0.82,
                    glow: 2.4,
                    shape: SHAPE_RING,
                });
                let weak = pos - fwd * (e.radius * 0.78);
                self.circle_buf.push(CircleInstance {
                    x: weak.x,
                    y: weak.y,
                    radius: 5.5,
                    r: 1.0,
                    g: 0.82,
                    b: 0.22,
                    a: 0.92,
                    glow: 2.8,
                    shape: SHAPE_DIAMOND,
                });
            } else if e.kind == EnemyKind::Carrier {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: e.radius * 1.9,
                    r: 1.0,
                    g: 0.88,
                    b: 0.28,
                    a: 0.55,
                    glow: 2.6,
                    shape: SHAPE_RING,
                });
            }
            if e.prism_mark_timer > 0.0 {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: e.radius + 7.0,
                    r: 1.0,
                    g: 0.42,
                    b: 0.92,
                    a: 0.65,
                    glow: 2.2,
                    shape: SHAPE_RING,
                });
            }

            if is_hit {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: e.radius * 1.55,
                    r: 1.0,
                    g: 1.0,
                    b: 1.0,
                    a: 1.0,
                    glow: 3.6,
                    shape: body_shape,
                });
            } else {
                let (er, eg, eb, base_alpha, glow_mult) = match e.state {
                    EnemyState::Telegraphing => {
                        let flash = if (e.state_timer * 12.0) as u32 % 2 == 0 {
                            1.9
                        } else {
                            0.7
                        };
                        (e.color[0], e.color[1], e.color[2], 1.0_f32, flash)
                    }
                    EnemyState::Pulsing => {
                        let pulse = (1.0 - e.state_timer / PULSAR_PULSE_TIME).clamp(0.0, 1.0);
                        (
                            1.0_f32,
                            0.95 + pulse * 0.05,
                            0.35 + pulse * 0.35,
                            0.76 + pulse * 0.20,
                            1.8 + pulse * 3.0,
                        )
                    }
                    _ if e.kind == EnemyKind::Umbra => {
                        let phase = (self.time * 2.7 + e.state_timer).sin() * 0.5 + 0.5;
                        (
                            e.color[0],
                            e.color[1],
                            e.color[2],
                            0.22 + phase * 0.62,
                            0.4 + phase * 2.0,
                        )
                    }
                    _ if e.kind == EnemyKind::Orbiter && e.state == EnemyState::Orbiting => {
                        let collapse =
                            (1.0 - (e.charge_dir.x - ORBITER_MIN_RADIUS) / 160.0).clamp(0.0, 1.0);
                        (
                            e.color[0],
                            e.color[1],
                            e.color[2],
                            1.0,
                            1.0 + collapse * 2.0,
                        )
                    }
                    _ if e.mini_boss.is_some() => {
                        let pulse = (self.time * 4.5).sin() * 0.5 + 0.5;
                        (
                            e.color[0],
                            e.color[1],
                            e.color[2],
                            1.0,
                            1.6 + pulse * 2.2,
                        )
                    }
                    _ => (e.color[0], e.color[1], e.color[2], 1.0_f32, 1.0_f32),
                };

                // Layer 1: Subtle tight atmospheric halo (pure soft glow, never a flat disc!).
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: e.radius * 1.55,
                    r: er,
                    g: eg,
                    b: eb,
                    a: base_alpha * 0.14,
                    glow: glow_mult * 0.45,
                    shape: SHAPE_ORB,
                });

                // Layer 2: Crisp faceted geometric threat body.
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: e.radius * 1.12,
                    r: er,
                    g: eg,
                    b: eb,
                    a: base_alpha * 0.94,
                    glow: 0.14 * glow_mult,
                    shape: body_shape,
                });

                // Layer 3: Crisp luminous inner core (tinted instead of pure white blowout).
                if e.kind != EnemyKind::Umbra {
                    let core_alpha = if e.mini_boss.is_some() { 0.80 } else { 0.52 };
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: e.radius * 0.36,
                        r: 0.65 + er * 0.35,
                        g: 0.65 + eg * 0.35,
                        b: 0.68 + eb * 0.32,
                        a: core_alpha * base_alpha,
                        glow: 0.25 * glow_mult,
                        shape: SHAPE_DIAMOND,
                    });
                }

                // Frost slow overlay: icy crystalline ring when slowed.
                if e.slow_timer > 0.0 {
                    let ice_t = (e.slow_timer / FROST_SLOW_DURATION).clamp(0.0, 1.0);
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: e.radius * 1.32,
                        r: 0.42,
                        g: 0.88,
                        b: 1.0,
                        a: ice_t * 0.55,
                        glow: 0.7,
                        shape: SHAPE_RING,
                    });
                }
            }
        }

        // Radiance gems — unmistakable rotating faceted emerald/sapphire/gold crystals!
        for g in &self.gems {
            let pos = nearest_globe_pos(camera, g.pos);
            let pulse = 1.0 + (g.life * 7.5).sin() * 0.22;
            let fade = if g.life > GEM_LIFETIME - 2.0 {
                (GEM_LIFETIME - g.life) / 2.0
            } else {
                1.0
            };
            let (r, g_col, b, tier_glow) = if g.value >= 5 {
                (1.0, 0.84, 0.26, 2.2)
            } else if g.value >= 3 {
                (0.30, 0.78, 1.0, 1.9)
            } else {
                (0.22, 1.0, 0.72, 1.7)
            };
            let radius = GEM_VISUAL_RADIUS * 1.15;
            let core_radius = radius * 0.54;

            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius,
                r,
                g: g_col,
                b,
                a: 0.72 * fade,
                glow: tier_glow * pulse * fade,
                shape: SHAPE_DIAMOND,
            });

            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: core_radius,
                r: 0.94,
                g: 1.0,
                b: 0.96,
                a: 0.88 * fade,
                glow: tier_glow * 1.35 * pulse * fade,
                shape: SHAPE_DIAMOND,
            });
        }

        // Particles.
        for p in &self.particles {
            let pos = nearest_globe_pos(camera, p.pos);
            let t = 1.0 - (p.life / p.max_life);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: p.size * t.max(0.15),
                r: p.color[0],
                g: p.color[1],
                b: p.color[2],
                a: t,
                glow: 2.0 * t,
                shape: SHAPE_ORB,
            });
        }

        // Beams — enhanced visuals: glow varies with remaining life, chromatic split,
        // lens thickness, echo tint, inner core overlay.
        let chromatic_lvl = self.inventory.level(ShardKind::Chromatic);
        let lens_lvl = self.inventory.level(ShardKind::Lens);
        let cascade_lvl = self.inventory.level(ShardKind::Cascade);
        let diffract_lvl = self.inventory.level(ShardKind::Diffract);
        let interference_lvl = self.inventory.level(ShardKind::Interference);
        // Dramatic shards boost glow intensity across all beams.
        let drama_glow = 1.0
            + cascade_lvl as f32 * 0.18
            + diffract_lvl as f32 * 0.13
            + interference_lvl as f32 * 0.22;
        for b in &self.beams {
            let life_frac = b.life / b.max_life; // 0 = just spawned, 1 = expired
            let t = 1.0 - life_frac;
            let start = nearest_globe_pos(camera, b.start);
            let end = nearest_globe_pos(camera, b.end);

            // Echo: orange tint. Otherwise apply shard-specific color accents.
            let (mut beam_r, mut beam_g, mut beam_b, alpha_scale) = if b.is_echo {
                (
                    b.color[0] * 0.9 + 0.1,
                    b.color[1] * 0.7 + 0.3 * 0.6,
                    b.color[2] * 0.5 + 0.3,
                    0.7_f32,
                )
            } else {
                (b.color[0], b.color[1], b.color[2], 1.0_f32)
            };
            // Cascade L3+: emerald shimmer (chain potential reads as green energy).
            if cascade_lvl >= 3 && !b.is_echo {
                let t = (cascade_lvl as f32 - 2.0) / 4.0 * 0.22;
                beam_r = beam_r * (1.0 - t) + 0.1 * t;
                beam_g = (beam_g + t * 0.35).min(1.0);
                beam_b = beam_b * (1.0 - t) + 0.3 * t;
            }
            // Interference L3+: teal/aqua resonance accent.
            if interference_lvl >= 3 && !b.is_echo {
                let t = (interference_lvl as f32 - 2.0) / 4.0 * 0.18;
                beam_r = beam_r * (1.0 - t) + 0.15 * t;
                beam_g = (beam_g + t * 0.10).min(1.0);
                beam_b = (beam_b + t * 0.35).min(1.0);
            }

            // Glow varies with remaining lifetime + drama-shard boost.
            let glow = (2.5 + life_frac * 1.5) * t * drama_glow;

            // Lens shard: visual thickness scales with level.
            let vis_thick = if lens_lvl > 0 {
                b.thickness * (1.0 + lens_lvl as f32 * 0.25)
            } else {
                b.thickness
            };

            // Chromatic shard: split into 3 sub-beams (R/G/B offsets).
            if chromatic_lvl > 0 && !b.is_echo {
                let delta = end - start;
                let len = delta.length();
                if len > 1.0 {
                    let beam_perp = Vec2::new(-delta.y, delta.x) / len;
                    let sub_colors: [[f32; 3]; 3] = [
                        [1.0, 0.2, 0.15],
                        [0.2, 1.0, 0.25],
                        [0.15, 0.4, 1.0],
                    ];
                    let offsets = [-0.06_f32, 0.0, 0.06];
                    for ci in 0..3 {
                        let ang_off = offsets[ci];
                        let rot_cos = ang_off.cos();
                        let rot_sin = ang_off.sin();
                        let rotated = Vec2::new(
                            delta.x * rot_cos - delta.y * rot_sin,
                            delta.x * rot_sin + delta.y * rot_cos,
                        );
                        let sub_end = start + rotated;
                        let lateral = beam_perp * (ci as f32 - 1.0) * vis_thick * 0.3;
                        self.beam_buf.push(BeamInstance {
                            x0: start.x + lateral.x,
                            y0: start.y + lateral.y,
                            x1: sub_end.x + lateral.x,
                            y1: sub_end.y + lateral.y,
                            thickness: vis_thick * 0.7,
                            r: sub_colors[ci][0],
                            g: sub_colors[ci][1],
                            b: sub_colors[ci][2],
                            a: t * alpha_scale * 0.85,
                            glow: glow * 0.9,
                        });
                    }
                }
            } else {
                // Standard beam.
                self.beam_buf.push(BeamInstance {
                    x0: start.x,
                    y0: start.y,
                    x1: end.x,
                    y1: end.y,
                    thickness: vis_thick,
                    r: beam_r,
                    g: beam_g,
                    b: beam_b,
                    a: t * alpha_scale,
                    glow,
                });
            }

            // Inner luminous filament — carries shard hue instead of flat pure white blowout.
            self.beam_buf.push(BeamInstance {
                x0: start.x,
                y0: start.y,
                x1: end.x,
                y1: end.y,
                thickness: 1.0,
                r: 0.45 + beam_r * 0.55,
                g: 0.45 + beam_g * 0.55,
                b: 0.45 + beam_b * 0.55,
                a: t * 0.62 * alpha_scale,
                glow: 0.55 * t,
            });
        }

        // Projectiles — bright magenta energy shards.
        for p in &self.projectiles {
            let pos = nearest_globe_pos(camera, p.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: p.radius * 1.25,
                r: 1.0,
                g: 0.25,
                b: 0.78,
                a: 1.0,
                glow: 2.2,
                shape: SHAPE_DIAMOND,
            });
        }

        // Crystals — beveled translucent teal prism obstacles.
        for c in &self.crystals {
            let pos = nearest_globe_pos(camera, c.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: c.radius,
                r: 0.28,
                g: 0.78,
                b: 0.92,
                a: 0.44,
                glow: 0.75,
                shape: SHAPE_HEX,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: c.radius * 0.34,
                r: 0.58,
                g: 0.95,
                b: 1.0,
                a: 0.72,
                glow: 1.6,
                shape: SHAPE_DIAMOND,
            });
        }

        self.max_enemies_observed = self.max_enemies_observed.max(self.enemies.len() as u32);
        self.max_circles_observed = self.max_circles_observed.max(self.circle_buf.len() as u32);
        self.max_beams_observed = self.max_beams_observed.max(self.beam_buf.len() as u32);
    }
}

fn capsule_circle_intersect(a: Vec2, b: Vec2, cap_half: f32, c: Vec2, cr: f32) -> bool {
    let ab = b - a;
    let len_sq = ab.length_squared();
    if len_sq < 1e-6 {
        return a.distance(c) <= cap_half + cr;
    }
    let t = ((c - a).dot(ab) / len_sq).clamp(0.0, 1.0);
    let closest = a + ab * t;
    closest.distance(c) <= cap_half + cr
}

fn capsule_circle_intersect_globe(a: Vec2, b: Vec2, cap_half: f32, c: Vec2, cr: f32) -> bool {
    capsule_circle_intersect(
        a,
        nearest_globe_pos(a, b),
        cap_half,
        nearest_globe_pos(a, c),
        cr,
    )
}
