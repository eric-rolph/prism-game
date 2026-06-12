//! Game state and update logic.
//!
//! This step introduces the shard system. The update loop short-circuits
//! when the player is in the middle of a level-up choice (pause), so the
//! JS side can show a picker UI in response to `is_leveling_up()`.

use crate::entities::{
    Beam, Boss, BossKind, BossState, Crystal, Enemy, EnemyKind, EnemyState, FrostField, Halo,
    InterferencePulse, MiniBossKind, Particle, Player, Projectile, PulseKind, VoidShell,
    VoidShockwave, XpGem,
};
use crate::math::Rng;
use crate::shards::{
    compose_salvo, BeamRequest, EvolutionKind, Inventory, ShardKind, UpgradeOffer, SYNERGY_COUNT,
};
use crate::{BeamInstance, CircleInstance};
use glam::{Vec2, Vec3};

const DAMAGE_SOURCE_COUNT: usize = 4;
const RANK_TIMELINE_BUCKETS: usize = 16; // minute buckets 0..15 for a 15-minute run.

const UPGRADE_PICK_SHARD: u8 = 0;
const UPGRADE_PICK_EVOLUTION: u8 = 1;
const UPGRADE_PICK_SKIP: u8 = 2;

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
    jump_timer: f32, // counts down from JUMP_DURATION; altitude = sin(t/T * π)
    dash_input: bool,
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

    // Level-up modal state.
    leveling_up: bool,
    level_choices: [Option<UpgradeOffer>; 3],
    reroll_charges: u32,

    // Death / game-over state.
    dead: bool,
    score: u32,

    halo_trail_timer: f32,
    wave_event_fired: bool,
    prism_cannon_timer: f32,
    sentinel_spawned: bool,
    hydra_spawned: bool,
    void_prism_spawned: bool,
    void_victory: bool,
    boss_breather_timer: f32,
    mini_boss_timer: f32,
    boss_kills: u32,
    void_shockwaves: Vec<VoidShockwave>,
    void_shells: Vec<VoidShell>,

    // Run telemetry (reset on restart, read at death/victory).
    damage_taken: f32,
    barrier_absorbed: f32,
    gems_collected: u32,
    kills_by_kind: [u32; 8],
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

    // Hit-flash: list of enemy indices that were hit this frame (used by draw).
    hit_flash_positions: Vec<Vec2>,

    // Draw buffers, rebuilt every frame.
    circle_buf: Vec<CircleInstance>,
    beam_buf: Vec<BeamInstance>,
}

// --- Tuning -------------------------------------------------------------

const PLAYER_SPEED: f32 = 340.0;
const PLAYER_RADIUS: f32 = 6.0;

const BEAM_LIFETIME: f32 = 0.14;
const BEAM_COOLDOWN: f32 = 0.20;

// Dash.
const DASH_DISTANCE: f32 = 120.0;
const DASH_DURATION: f32 = 0.10;
const DASH_COOLDOWN: f32 = 3.0;
const DASH_BLAST_BASE_RADIUS: f32 = 92.0;
const DASH_BLAST_RADIUS_PER_PHASE: f32 = 9.0;
const DASH_BLAST_BASE_DAMAGE: f32 = 210.0;
const DASH_BLAST_DAMAGE_PER_MOMENTUM: f32 = 18.0;
const DASH_BLAST_PUSH: f32 = 260.0;
const DASH_BLAST_LIFETIME: f32 = 0.34;
const DASH_BLAST_BOSS_DAMAGE_MULT: f32 = 0.40;

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
const GEM_VISUAL_RADIUS: f32 = 4.5; // Half the starter Drone radius.

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
const BOSS_HP_MULTIPLIER: f32 = 4.0;
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

// Boss milestones.
const SENTINEL_SPAWN_TIME: f32 = 300.0;
const HYDRA_SPAWN_TIME: f32 = 600.0;
const HYDRA_HP_PER_LOBE: f32 = 38000.0 * BOSS_HP_MULTIPLIER;
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
const SENTINEL_HP: f32 = 60000.0 * BOSS_HP_MULTIPLIER;
const SENTINEL_RADIUS: f32 = 46.0;
const SENTINEL_BASE_SPEED: f32 = 44.0;
const SENTINEL_SHIELD_HP: f32 = 4400.0 * BOSS_HP_MULTIPLIER;
const SENTINEL_SHIELD_RADIUS: f32 = 12.0;
const SENTINEL_SHIELD_ORBIT: f32 = 72.0;
const SENTINEL_SHIELD_SPIN: f32 = 1.35;
const VOID_PRISM_SPAWN_TIME: f32 = 780.0; // 13:00
const VOID_PRISM_HP: f32 = 120000.0 * BOSS_HP_MULTIPLIER;
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
    }
}

fn xp_for_rank(rank: u32) -> u32 {
    8 + rank * 6 + rank * rank * 2
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
            jump_timer: 0.0,
            dash_input: false,
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
            dead: false,
            score: 0,
            shake_amount: 0.0,
            shake_offset: Vec2::ZERO,
            hit_flash_positions: Vec::new(),
            halo_trail_timer: 0.0,
            wave_event_fired: false,
            prism_cannon_timer: 0.0,
            damage_taken: 0.0,
            barrier_absorbed: 0.0,
            gems_collected: 0,
            kills_by_kind: [0; 8],
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
            sentinel_spawned: false,
            hydra_spawned: false,
            void_prism_spawned: false,
            void_victory: false,
            boss_breather_timer: 0.0,
            mini_boss_timer: MINI_BOSS_BASE_INTERVAL,
            boss_kills: 0,
            void_shockwaves: Vec::new(),
            void_shells: Vec::new(),
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

    pub fn player_altitude(&self) -> f32 {
        self.player.altitude
    }

    pub fn dash_cooldown_pct(&self) -> f32 {
        (self.player.dash_cooldown / self.dash_cooldown_duration()).clamp(0.0, 1.0)
    }

    fn effective_player_speed(&self) -> f32 {
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        self.player.speed * (1.0 + momentum * MOMENTUM_SPEED_PER_LEVEL)
    }

    fn dash_cooldown_duration(&self) -> f32 {
        let momentum = self.inventory.level(ShardKind::Momentum) as f32;
        DASH_COOLDOWN * (1.0 - momentum * MOMENTUM_DASH_REDUCTION_PER_LEVEL).max(0.50)
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
        self.dead && (self.time >= SESSION_LENGTH || self.void_victory)
    }

    pub fn boss_active(&self) -> bool {
        self.boss.is_some()
    }

    pub fn boss_kind_index(&self) -> i32 {
        match self.boss.as_ref().map(|b| b.kind) {
            Some(BossKind::Sentinel) => 0,
            Some(BossKind::Hydra) => 1,
            Some(BossKind::VoidPrism) => 2,
            None => -1,
        }
    }

    pub fn boss_hp_pct(&self) -> f32 {
        self.boss
            .as_ref()
            .map(|b| (b.hp / b.max_hp).clamp(0.0, 1.0))
            .unwrap_or(0.0)
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
            None => -1,
        }
    }

    pub fn select_shard(&mut self, slot: u8) {
        if !self.leveling_up || (slot as usize) >= 3 {
            return;
        }
        if let Some(offer) = self.level_choices[slot as usize] {
            self.record_upgrade_pick(offer);
            match offer {
                UpgradeOffer::Shard(kind) => {
                    self.inventory.upgrade(kind);
                    if kind == ShardKind::Halo {
                        self.rebuild_halos();
                    }
                    if kind == ShardKind::Barrier {
                        self.player.barrier_max =
                            BARRIER_HP_PER_LEVEL * self.inventory.level(ShardKind::Barrier) as f32;
                        self.player.barrier_hp = (self.player.barrier_hp
                            + self.player.barrier_max * 0.5)
                            .min(self.player.barrier_max);
                    }
                    if kind == ShardKind::PrismHeart {
                        self.player.max_hp += PRISM_HEART_HP_PER_LEVEL;
                        self.player.hp =
                            (self.player.hp + PRISM_HEART_HP_PER_LEVEL).min(self.player.max_hp);
                    }
                    match kind {
                        ShardKind::Arc => self.arc_timer = self.arc_timer.min(0.0),
                        ShardKind::Minefield => self.mine_timer = self.mine_timer.min(0.0),
                        ShardKind::Lance => self.lance_timer = self.lance_timer.min(0.0),
                        _ => {}
                    }
                }
                UpgradeOffer::Evolution(evolution) => {
                    self.inventory.unlock_evolution(evolution);
                    self.spawn_evolution_particles(evolution);
                }
            }
            self.record_new_synergies();
            self.leveling_up = false;
            self.level_choices = [None; 3];
            // A single on_death can earn multiple ranks' worth of XP.
            self.check_for_level_up();
        }
        // If slot was None (empty), do nothing — don't close the modal.
    }

    pub fn skip_level_up(&mut self) {
        if !self.leveling_up {
            return;
        }
        self.leveling_up = false;
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
        self.level_choices = self.inventory.roll_choices(&mut self.rng);
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
        *self = Self::new(w, h, seed);
    }

    fn record_upgrade_pick(&mut self, offer: UpgradeOffer) {
        let (offer_type, offer_index) = match offer {
            UpgradeOffer::Shard(kind) => (UPGRADE_PICK_SHARD, kind as i32),
            UpgradeOffer::Evolution(evolution) => (UPGRADE_PICK_EVOLUTION, evolution as i32),
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

    pub fn update(&mut self, dt: f32) {
        self.audio_beam_count = 0;
        self.audio_kill_count = 0;
        self.audio_gem_count = 0;
        self.audio_event_bits = 0;

        if self.leveling_up || self.dead {
            return;
        }

        self.time += dt;
        self.record_rank_timeline();
        self.hit_flash_positions.clear();

        // i-frame cooldown.
        if self.player.iframe_timer > 0.0 {
            self.player.iframe_timer -= dt;
        }

        // Dash cooldown.
        if self.player.dash_cooldown > 0.0 {
            self.player.dash_cooldown -= dt;
        }

        // Dash active.
        if self.player.dash_timer > 0.0 {
            self.player.dash_timer -= dt;
            let speed = DASH_DISTANCE / DASH_DURATION;
            move_on_globe(&mut self.player.pos, self.player.dash_dir * speed * dt);
        } else if self.dash_input && self.player.dash_cooldown <= 0.0 {
            // Start dash if there's a movement direction.
            let dir = if self.input.length_squared() > 0.01 {
                self.input.normalize()
            } else {
                Vec2::new(1.0, 0.0) // default right
            };
            let phase_step = self.inventory.level(ShardKind::PhaseStep);
            let dash_start_pos = self.player.pos;
            self.player.dash_dir = dir;
            self.player.dash_timer = DASH_DURATION;
            self.player.dash_cooldown = self.dash_cooldown_duration();
            self.player.iframe_timer =
                DASH_DURATION + phase_step as f32 * PHASE_STEP_IFRAME_PER_LEVEL;
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
        self.maybe_spawn_sentinel();
        self.maybe_spawn_hydra();
        self.maybe_spawn_void_prism();
        self.update_boss(dt);
        self.update_void_shockwaves(dt);

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
        for e in &mut self.enemies {
            if e.spawn_grace > 0.0 {
                e.spawn_grace = (e.spawn_grace - dt).max(0.0);
            }
            // Frost slow decay.
            if e.slow_timer > 0.0 {
                e.slow_timer -= dt;
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
                        _ => {
                            move_on_globe(&mut e.pos, dir * e.speed * speed_mult * dt);
                        }
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

        self.void_shells.extend(new_void_shells);

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
                        BossKind::Sentinel | BossKind::VoidPrism => {
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

        // Fire.
        self.prism_cannon_timer -= dt;
        self.fire_timer -= dt;
        if self.fire_timer <= 0.0 {
            if self.fire_primary() {
                self.fire_timer += BEAM_COOLDOWN;
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
                                        boss.lobe_hp[i] -= HALO_DPS * dt;
                                    }
                                }
                            }
                        }
                        _ => {
                            if globe_distance(boss.pos, *hpos) < boss.radius + hsize {
                                boss.hp -= HALO_DPS * dt;
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
                        BossKind::Sentinel => {
                            if globe_distance(boss.pos, self.player.pos)
                                < BARRIER_RADIUS + boss.radius
                            {
                                boss.hp -= BARRIER_CONTACT_DPS * dt;
                            }
                        }
                        BossKind::Hydra => {
                            for i in 0..3usize {
                                if boss.lobe_hp[i] > 0.0 {
                                    let lp = Self::hydra_lobe_pos(boss, i);
                                    if globe_distance(lp, self.player.pos)
                                        < BARRIER_RADIUS + HYDRA_LOBE_RADIUS
                                    {
                                        boss.lobe_hp[i] -= BARRIER_CONTACT_DPS * dt;
                                    }
                                }
                            }
                        }
                        BossKind::VoidPrism => {
                            if globe_distance(boss.pos, self.player.pos)
                                < BARRIER_RADIUS + boss.radius
                            {
                                boss.hp -= BARRIER_CONTACT_DPS * dt;
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
                                        boss.lobe_hp[i] -= pulse_damage * dt;
                                    }
                                }
                            }
                        }
                        _ => {
                            let d = globe_distance(boss.pos, *ppos);
                            if (d - *pradius).abs() < ring_thickness + boss.radius {
                                boss.hp -= pulse_damage * dt;
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
            self.xp += collected_xp;
            self.gems_collected += collected_count;
            self.audio_gem_count += collected_count;
            self.check_for_level_up();
        }

        // Death resolution — loop so that Cascade chain-kills propagate.
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
                );
            }
            cascade_depth += 1;
            if cascade_depth >= CASCADE_MAX_DEPTH {
                self.enemies.retain(|e| e.hp > 0.0);
                break;
            }
        }
        if self
            .boss
            .as_ref()
            .is_some_and(|b| b.state == BossState::Active && b.hp <= 0.0)
        {
            self.start_boss_death();
        }

        // Session victory (survived 15 minutes).
        if self.time >= SESSION_LENGTH && !self.dead {
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

        self.build_draw_buffers();
    }

    // --- Boss milestones -----------------------------------------------

    fn maybe_spawn_sentinel(&mut self) {
        if self.sentinel_spawned || self.time < SENTINEL_SPAWN_TIME || self.boss.is_some() {
            return;
        }

        self.sentinel_spawned = true;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let mut pos = self.player.pos;
        move_on_globe(&mut pos, dir * self.screen_size.length() * 0.48);

        self.boss = Some(Boss {
            kind: BossKind::Sentinel,
            pos,
            radius: SENTINEL_RADIUS,
            hp: SENTINEL_HP,
            max_hp: SENTINEL_HP,
            speed: 0.0,
            contact_damage: 0.0,
            state: BossState::Telegraphing,
            state_timer: BOSS_TELEGRAPH_TIME,
            active_time: 0.0,
            phase: 0,
            shield_angle: self.rng.angle(),
            shield_hp: [SENTINEL_SHIELD_HP; 3],
            lobe_hp: [0.0; 3],
            lobe_alive: [false; 3],
            lobe_orbit: 0.0,
            fire_timer: 0.0,
        });
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 8.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
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
        self.boss = Some(Boss {
            kind: BossKind::Hydra,
            pos,
            radius: HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
            hp: total_hp,
            max_hp: total_hp,
            speed: HYDRA_BODY_SPEED,
            contact_damage: HYDRA_CONTACT_DAMAGE,
            state: BossState::Telegraphing,
            state_timer: BOSS_TELEGRAPH_TIME,
            active_time: 0.0,
            phase: 0,
            shield_angle: 0.0,
            shield_hp: [0.0; 3],
            lobe_hp: [HYDRA_HP_PER_LOBE; 3],
            lobe_alive: [true; 3],
            lobe_orbit: self.rng.angle(),
            fire_timer: HYDRA_FIRE_INTERVAL * 0.5,
        });
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 8.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
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
        self.boss = Some(Boss {
            kind: BossKind::VoidPrism,
            pos,
            radius: VOID_PRISM_RADIUS,
            hp: VOID_PRISM_HP,
            max_hp: VOID_PRISM_HP,
            speed: 0.0,
            contact_damage: 0.0,
            state: BossState::Telegraphing,
            state_timer: BOSS_TELEGRAPH_TIME,
            active_time: 0.0,
            phase: 0,
            shield_angle: 0.0,
            shield_hp: [0.0; 3],
            lobe_hp: [0.0; 3],
            lobe_alive: [false; 3],
            lobe_orbit: 0.0,
            fire_timer: VOID_PRISM_SHOCKWAVE_INTERVAL_P1,
        });
        self.projectiles.clear();
        self.boss_breather_timer = BOSS_TELEGRAPH_TIME;
        self.shake_amount += 10.0;
        self.audio_event_bits |= AUDIO_BOSS_SPAWN;
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
        let rank_weapon_scale = 1.0 + self.rank_pressure() * BOSS_WEAPON_DAMAGE_RANK_MULT;

        if let Some(boss) = &mut self.boss {
            match boss.state {
                BossState::Telegraphing => {
                    boss.state_timer -= dt;
                    let init_radius = match boss.kind {
                        BossKind::Sentinel => SENTINEL_RADIUS,
                        BossKind::Hydra => HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
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
                            BossKind::Sentinel => {
                                boss.speed = SENTINEL_BASE_SPEED;
                                boss.contact_damage = 35.0;
                            }
                            BossKind::Hydra => {
                                boss.speed = HYDRA_BODY_SPEED;
                                boss.contact_damage = HYDRA_CONTACT_DAMAGE;
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
                    let dir = nearest_globe_delta(boss.pos, self.player.pos).normalize_or_zero();
                    move_on_globe(&mut boss.pos, dir * boss.speed * dt);

                    match boss.kind {
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
                        BossKind::Sentinel => SENTINEL_RADIUS,
                        BossKind::Hydra => HYDRA_ORBIT_RADIUS + HYDRA_LOBE_RADIUS,
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

        if boss.kind == BossKind::VoidPrism && !self.dead {
            self.void_victory = true;
            self.dead = true;
            self.score = self.compute_score() + 1000;
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
            BossKind::VoidPrism => {
                if capsule_circle_intersect_globe(start, end, cap_half, boss.pos, boss.radius) {
                    boss.hp -= damage;
                    self.hit_flash_positions.push(boss.pos);
                    return Some((boss.pos, false));
                }
            }
        }
        None
    }

    fn fire_shield_break_burst(&mut self, shield_pos: Vec2) {
        self.audio_event_bits |= AUDIO_SHIELD_BREAK;
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
            BossKind::Sentinel | BossKind::VoidPrism => {
                let d = globe_distance(boss.pos, origin);
                if d <= radius + boss.radius {
                    let falloff = (1.0 - d / radius.max(1.0)).clamp(0.0, 1.0);
                    boss.hp -= damage * boss_mult * (0.45 + 0.55 * falloff);
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
        for e in &mut self.enemies {
            if e.hp <= 0.0 {
                continue;
            }
            let d = globe_distance(e.pos, origin);
            if d <= radius + e.radius {
                let falloff = (1.0 - d / radius.max(1.0)).clamp(0.0, 1.0);
                e.hp -= damage * (0.45 + 0.55 * falloff);
                if impulse.abs() > 0.0 && d > 1.0 {
                    let away = nearest_globe_delta(origin, e.pos).normalize_or_zero();
                    let dir = if impulse >= 0.0 { away } else { -away };
                    move_on_globe(&mut e.pos, dir * impulse.abs() * falloff);
                }
                if slow_duration > 0.0 {
                    e.slow_timer = e.slow_timer.max(slow_duration * (0.45 + 0.55 * falloff));
                }
                self.hit_flash_positions.push(e.pos);
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
                    BossKind::Sentinel => {
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
                        });
                    }
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
                                });
                            }
                        }
                    }
                    BossKind::VoidPrism => {
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

        // Primary damage pass.
        for e in &mut self.enemies {
            if capsule_circle_intersect_globe(start, end, req.thickness * 0.5, e.pos, e.radius) {
                let mut dmg = req.damage;
                if blizzard && e.slow_timer > 0.0 {
                    dmg *= 1.4;
                }
                e.hp -= dmg;
                hit_count += 1;
                self.hit_flash_positions.push(e.pos);
                if diffract > 0 {
                    impacts.push(e.pos);
                }
                // Frost: slow enemies on hit.
                if frost > 0 {
                    e.slow_timer = FROST_SLOW_DURATION * frost as f32;
                }
            }
        }
        if let Some((impact, shield_broken)) =
            self.damage_boss_with_beam(start, end, req.thickness * 0.5, req.damage)
        {
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
            self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
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

                for e in &mut self.enemies {
                    if capsule_circle_intersect_globe(
                        impact,
                        end,
                        diffract_thick * 0.5,
                        e.pos,
                        e.radius,
                    ) {
                        e.hp -= DIFFRACT_MINI_DAMAGE;
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
    ) {
        self.kills_total += 1;
        self.kills_by_kind[kind as usize] = self.kills_by_kind[kind as usize].saturating_add(1);
        self.audio_kill_count += 1;
        self.spawn_death_particles(pos, kind);

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

        // Drop XP gem unless this is a mini-drone (Splitter offspring).
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
        while self.xp >= xp_for_rank(self.rank + 1) {
            let needed = xp_for_rank(self.rank + 1);
            self.xp -= needed;
            self.rank += 1;
            self.peak_rank = self.peak_rank.max(self.rank);
            self.record_rank_timeline();
            self.audio_event_bits |= AUDIO_RANK_UP;
            let prism_heart = self.inventory.level(ShardKind::PrismHeart) as f32;
            let heal = (20.0 - self.rank as f32 * 1.0).max(5.0)
                * (1.0 + prism_heart * PRISM_HEART_HEAL_MULT_PER_LEVEL);
            self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
            self.level_choices = self.inventory.roll_choices(&mut self.rng);
            if self.level_choices.iter().any(|c| c.is_some()) {
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
        });
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

        if self.wave >= 20 && self.rng.next_u32() % 4 == 0 {
            let pool = [
                (EnemyKind::Brute, 3u32),
                (EnemyKind::Dasher, 4),
                (EnemyKind::Splitter, 4),
                (EnemyKind::Orbiter, 3),
                (EnemyKind::Emitter, 4),
                (EnemyKind::Pulsar, 3),
                (EnemyKind::Umbra, 3),
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
        let camera = self.camera;

        // Blizzard frost fields — icy blue slow zones on the ground.
        for f in &self.frost_fields {
            let t = f.life / f.max_life;
            let fade = (1.0 - t).powf(0.6); // linger bright, then fade
            let pos = nearest_globe_pos(camera, f.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: f.radius,
                r: 0.35,
                g: 0.75,
                b: 1.0,
                a: 0.18 * fade,
                glow: 0.6 * fade,
            });
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: f.radius * 0.3,
                r: 0.6,
                g: 0.92,
                b: 1.0,
                a: 0.45 * fade,
                glow: 1.8 * fade,
            });
        }

        // Ground pulses underneath everything else.
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
                        r: if singularity_visual { 0.25 } else { 0.4 },
                        g: if singularity_visual { 0.18 } else { 0.55 },
                        b: 1.0,
                        a: if singularity_visual { 0.35 } else { 0.20 } * fade,
                        glow: (if singularity_visual { 1.4 } else { 0.9 }) * fade,
                    });
                    // Singularity: dark absorption core grows as the ring expands.
                    if singularity_visual {
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: (r * 0.38).max(6.0),
                            r: 0.06,
                            g: 0.04,
                            b: 0.18,
                            a: 0.85 * fade,
                            glow: 0.0,
                        });
                    }
                }
                PulseKind::Mine => {
                    let pulse = 0.85 + (self.time * 7.0 + p.pos.x * 0.01).sin() * 0.15;
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: r,
                        r: 0.18,
                        g: 0.96 * pulse,
                        b: 0.58,
                        a: 0.18 * fade,
                        glow: 1.35 * fade,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: (r * 0.18).max(7.0),
                        r: 1.0,
                        g: 0.72,
                        b: 0.24,
                        a: 0.62 * fade,
                        glow: 2.4 * fade,
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
                            radius: 4.5 + 2.0 * fade,
                            r: 0.5,
                            g: 1.0,
                            b: 0.72,
                            a: 0.78 * fade,
                            glow: 2.0 * fade,
                        });
                    }
                }
                PulseKind::DashBlast => {
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: r,
                        r: 0.48,
                        g: 1.0,
                        b: 0.94,
                        a: 0.20 * fade,
                        glow: 1.8 * fade,
                    });
                    self.circle_buf.push(CircleInstance {
                        x: pos.x,
                        y: pos.y,
                        radius: (r * 0.46).max(9.0),
                        r: 1.0,
                        g: 1.0,
                        b: 1.0,
                        a: 0.25 * fade,
                        glow: 0.7 * fade,
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
            // Outer diffuse shadow (cast area shrinks as player rises).
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius * (1.45 + alt * 3.1),
                r: 0.0,
                g: 0.0,
                b: 0.04,
                a: alt * 0.26,
                glow: 0.0,
            });
            // Inner sharp occlusion directly below.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius * (0.78 + alt * 0.28),
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: alt * 0.62,
                glow: 0.0,
            });
        }

        // Player (blink during i-frames, grows slightly at jump peak to sell height).
        let visible =
            self.player.iframe_timer <= 0.0 || ((self.player.iframe_timer * 16.0) as u32 % 2 == 0);
        if visible {
            let pos = nearest_globe_pos(camera, self.player.pos);
            let visual_r = self.player.radius * (1.0 + self.player.altitude * 0.45);

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
                    radius: visual_r + 8.0,
                    r: 0.5,
                    g: 0.9,
                    b: 1.0,
                    a: 0.15,
                    glow: 0.4,
                });
            }

            // 1b. Defensive shield ring (Barrier or Thorns owned).
            if barrier_lvl > 0 || thorns_lvl > 0 {
                let pulse = 0.7 + 0.3 * (self.time * 3.5).sin();
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: visual_r + 12.0,
                    r: 0.2,
                    g: 0.75,
                    b: 1.0,
                    a: 0.18 * pulse,
                    glow: (0.6 + (barrier_lvl + thorns_lvl) as f32 * 0.12) * pulse,
                });
            }

            // 1c. Orbiting emitter nodes for beam-modifying shards.
            if emitter_count > 0 {
                // Fire rate proxy: base 1 rev/s, speed up with total levels.
                let orbit_speed = 1.2 + total_levels as f32 * 0.04;
                let orbit_r = 18.0;
                // Mix color from active beam shards: cyan-to-violet based on chromatic presence.
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
                        radius: 3.5 + intensity * 1.5,
                        r: node_r,
                        g: node_g,
                        b: node_b,
                        a: 0.85,
                        glow: 1.8 + intensity * 1.0,
                    });
                }
            }

            // 1d. Second inner orbit ring when total shards > 10.
            if total_levels > 10 {
                let inner_count = 6usize;
                let inner_speed = 2.5 + total_levels as f32 * 0.05;
                let inner_r = 11.0;
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
                        radius: 2.0 + intensity * 0.8,
                        r: 0.8,
                        g: 1.0,
                        b: 0.9,
                        a: 0.6,
                        glow: 1.2,
                    });
                }
            }

            // 1e. 12-point geometric ring when any evolution active.
            if evolution_active {
                let geo_r = 30.0 + (if kaleidoscope_active { 5.0 } else { 0.0 });
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
                        radius: 3.0,
                        r: cr,
                        g: cg,
                        b: cb,
                        a: 0.75 + 0.25 * intensity,
                        glow: 1.5 + intensity,
                    });
                }
            }

            // Targeting ring — dotted circle showing attack intent, design-spec dashed orbit.
            // Rotates slowly; 12 dots spaced at 30° = visual dash pattern.
            {
                let ring_r = 28.0;
                let dot_count = 12usize;
                let ring_alpha = (0.14 + intensity * 0.10).min(0.28);
                let spin = self.time * 0.10;
                for i in 0..dot_count {
                    let angle = spin + i as f32 * std::f32::consts::TAU / dot_count as f32;
                    let offset = Vec2::new(angle.cos(), angle.sin()) * ring_r;
                    let mut dot_world = self.player.pos;
                    move_on_globe(&mut dot_world, offset);
                    let dp = nearest_globe_pos(camera, dot_world);
                    self.circle_buf.push(CircleInstance {
                        x: dp.x, y: dp.y,
                        radius: 1.2,
                        r: 0.66, g: 0.92, b: 1.0,
                        a: ring_alpha,
                        glow: 0.0, // crisp dot, no halo
                    });
                }
            }

            // Core player circle — bright cyan-white, base glow 2.4 (as specified).
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: visual_r,
                r: 0.9,
                g: 1.0,
                b: 1.0,
                a: 1.0,
                glow: 2.4 + self.player.altitude * 1.5 + intensity * 0.6,
            });

            // Halo enhancement: if Halo is owned make core even brighter.
            if halo_lvl > 0 {
                self.circle_buf.push(CircleInstance {
                    x: pos.x,
                    y: pos.y,
                    radius: visual_r * 0.55,
                    r: 1.0,
                    g: 1.0,
                    b: 0.9,
                    a: 0.9,
                    glow: 2.0 + halo_lvl as f32 * 0.5,
                });
            }
        }

        // Altitude ring — subtle horizon line at jump peak.
        if self.player.altitude > 0.05 {
            let pos = nearest_globe_pos(camera, self.player.pos);
            let ring_r = self.player.radius * (1.0 + self.player.altitude * 0.45) + 7.0;
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: ring_r,
                r: 0.55,
                g: 0.88,
                b: 1.0,
                a: self.player.altitude * 0.35,
                glow: 0.0,
            });
        }

        // HP ring around player.
        let hp_frac = self.player.hp / self.player.max_hp;
        if hp_frac < 1.0 {
            // Red-tinged ring, dimmer as health decreases.
            let pos = nearest_globe_pos(camera, self.player.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius + 4.0,
                r: 1.0 - hp_frac * 0.5,
                g: hp_frac * 0.8,
                b: hp_frac * 0.5,
                a: 0.3 + (1.0 - hp_frac) * 0.3,
                glow: 1.0 + (1.0 - hp_frac) * 1.5,
            });
        }

        // Halos.
        for h in &self.halos {
            let mut p = self.player.pos;
            move_on_globe(&mut p, Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius);
            let p = nearest_globe_pos(camera, p);
            self.circle_buf.push(CircleInstance {
                x: p.x,
                y: p.y,
                radius: h.size,
                r: 1.0,
                g: 0.95,
                b: 0.7,
                a: 1.0,
                glow: 2.2,
            });
        }

        // Barrier shield ring.
        if self.player.barrier_max > 0.0 {
            let fill = self.player.barrier_hp / self.player.barrier_max;
            let pos = nearest_globe_pos(camera, self.player.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: BARRIER_RADIUS,
                r: 0.3,
                g: 0.7,
                b: 1.0,
                a: 0.12 * fill,
                glow: 0.8 * fill,
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
                            a: 0.10 + t * 0.18,
                            glow: 2.0 + t * 4.0,
                        });
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius,
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: 0.65,
                            glow: 4.0,
                        });
                    }
                    BossState::Active | BossState::Dying => {
                        let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                        let (r, g, b, glow) = match boss.phase {
                            0 => (1.0_f32, 0.96, 0.88, 4.0_f32),
                            1 => (1.0, 0.48, 0.18, 4.8),
                            _ => (1.0, 0.12, 0.12, 5.5),
                        };
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius + 8.0,
                            r,
                            g,
                            b,
                            a: 0.18 * dying_alpha,
                            glow: glow * 1.1 * dying_alpha,
                        });
                        self.circle_buf.push(CircleInstance {
                            x: pos.x,
                            y: pos.y,
                            radius: boss.radius,
                            r,
                            g,
                            b,
                            a: (0.72 + hp_pct * 0.18) * dying_alpha,
                            glow: glow * dying_alpha,
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
                                    g: 0.9,
                                    b: 1.0,
                                    a: 0.55 + shield_fill * 0.25,
                                    glow: 3.0 + shield_fill * 2.0,
                                });
                            }
                        }
                    }
                },
                BossKind::Hydra => {
                    match boss.state {
                        BossState::Telegraphing => {
                            let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                            for i in 0..3usize {
                                let lp = nearest_globe_pos(camera, Self::hydra_lobe_pos(boss, i));
                                let [r, g, b] = HYDRA_LOBE_COLORS[i];
                                self.circle_buf.push(CircleInstance {
                                    x: lp.x,
                                    y: lp.y,
                                    radius: HYDRA_LOBE_RADIUS * (0.4 + t * 0.6),
                                    r,
                                    g,
                                    b,
                                    a: 0.30 + t * 0.45,
                                    glow: 2.0 + t * 3.5,
                                });
                            }
                        }
                        BossState::Active | BossState::Dying => {
                            // Dim center orb.
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: HYDRA_LOBE_RADIUS * 0.6,
                                r: 0.5,
                                g: 0.5,
                                b: 0.5,
                                a: 0.22 * dying_alpha,
                                glow: 1.2 * dying_alpha,
                            });
                            // Living lobes.
                            for i in 0..3usize {
                                if boss.lobe_hp[i] <= 0.0 && boss.state != BossState::Dying {
                                    continue;
                                }
                                let lobe_fill =
                                    (boss.lobe_hp[i] / HYDRA_HP_PER_LOBE).clamp(0.0, 1.0);
                                let lp = nearest_globe_pos(camera, Self::hydra_lobe_pos(boss, i));
                                let [r, g, b] = HYDRA_LOBE_COLORS[i];
                                self.circle_buf.push(CircleInstance {
                                    x: lp.x,
                                    y: lp.y,
                                    radius: HYDRA_LOBE_RADIUS + 5.0 * lobe_fill,
                                    r,
                                    g,
                                    b,
                                    a: (0.55 + lobe_fill * 0.3) * dying_alpha,
                                    glow: (3.5 + lobe_fill * 2.5) * dying_alpha,
                                });
                            }
                        }
                    }
                }
                BossKind::VoidPrism => {
                    let hp_pct = (boss.hp / boss.max_hp).clamp(0.0, 1.0);
                    match boss.state {
                        BossState::Telegraphing => {
                            let t = (1.0 - boss.state_timer / BOSS_TELEGRAPH_TIME).clamp(0.0, 1.0);
                            // Dark pulsing void core materializing.
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: VOID_PRISM_RADIUS * (0.2 + t * 1.8),
                                r: 0.6,
                                g: 0.3,
                                b: 1.0,
                                a: 0.08 + t * 0.14,
                                glow: 1.5 + t * 5.0,
                            });
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: VOID_PRISM_RADIUS * (0.35 + t * 0.65),
                                r: 0.05,
                                g: 0.0,
                                b: 0.12,
                                a: 0.55 + t * 0.35,
                                glow: 2.0 + t * 3.0,
                            });
                        }
                        BossState::Active | BossState::Dying => {
                            let glow_base = if boss.phase == 1 { 6.0 } else { 4.5 };
                            // Outer void aura — pale violet rim.
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius + 14.0,
                                r: 0.7,
                                g: 0.35,
                                b: 1.0,
                                a: (0.12 + hp_pct * 0.08) * dying_alpha,
                                glow: glow_base * 1.2 * dying_alpha,
                            });
                            // Dark core body.
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius,
                                r: 0.04,
                                g: 0.0,
                                b: 0.10,
                                a: (0.88 + hp_pct * 0.12) * dying_alpha,
                                glow: glow_base * dying_alpha,
                            });
                            // Bright inner rim ring.
                            self.circle_buf.push(CircleInstance {
                                x: pos.x,
                                y: pos.y,
                                radius: boss.radius * 0.72,
                                r: 0.8,
                                g: 0.55,
                                b: 1.0,
                                a: (0.35 + hp_pct * 0.25) * dying_alpha,
                                glow: (glow_base * 0.8) * dying_alpha,
                            });
                        }
                    }
                }
            }
        }

        // Void shockwaves — expanding dark rings.
        for sw in &self.void_shockwaves {
            let sw_pos = nearest_globe_pos(camera, sw.pos);
            let r = sw.current_radius();
            let fade = (1.0 - sw.life / sw.max_life).clamp(0.0, 1.0);
            self.circle_buf.push(CircleInstance {
                x: sw_pos.x,
                y: sw_pos.y,
                radius: r,
                r: 0.55,
                g: 0.2,
                b: 0.9,
                a: fade * 0.22,
                glow: 2.5 * fade,
            });
            if r > 8.0 {
                self.circle_buf.push(CircleInstance {
                    x: sw_pos.x,
                    y: sw_pos.y,
                    radius: r - 6.0,
                    r: 0.04,
                    g: 0.0,
                    b: 0.08,
                    a: fade * 0.30,
                    glow: 1.0,
                });
            }
        }

        // VoidShells — descending dark orbs with target warning rings.
        for s in &self.void_shells {
            let pos = nearest_globe_pos(camera, s.target);
            let t = 1.0 - s.altitude; // 0.0 = just spawned, 1.0 = landing
            let visual_r = s.radius * (3.5 - t * 2.5); // large at altitude, shrinks as it lands
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: visual_r,
                r: 0.45,
                g: 0.08,
                b: 0.9,
                a: 0.5 + t * 0.3,
                glow: 2.5 - t * 1.0,
            });
            // Warning target ring grows brighter as shell approaches.
            // Ring radius matches the landing damage radius so the telegraph is honest.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: VOID_SHELL_LAND_RADIUS_DAMAGE,
                r: 0.55,
                g: 0.0,
                b: 0.7,
                a: t * 0.18,
                glow: t * 0.5,
            });
        }

        // Enemies — design-spec 3-layer rendering: atmospheric glow + crisp fill + white core.
        // Layering on additive blend: outer wide halo → solid body (glow≈0 = crisp) → hot center.
        let hit_set: Vec<Vec2> = self.hit_flash_positions.clone();
        for e in &self.enemies {
            let pos = nearest_globe_pos(camera, e.pos);
            let is_hit = hit_set.iter().any(|h| globe_distance(*h, e.pos) < 1.0);

            if is_hit {
                // Hit flash: single bright white burst.
                self.circle_buf.push(CircleInstance {
                    x: pos.x, y: pos.y,
                    radius: e.radius * 1.5,
                    r: 1.0, g: 1.0, b: 1.0, a: 1.0,
                    glow: 3.5,
                });
            } else {
                let (er, eg, eb, base_alpha, glow_mult) = match e.state {
                    EnemyState::Telegraphing => {
                        let flash = if (e.state_timer * 12.0) as u32 % 2 == 0 { 1.8 } else { 0.7 };
                        (e.color[0], e.color[1], e.color[2], 1.0_f32, flash)
                    }
                    EnemyState::Pulsing => {
                        let pulse = (1.0 - e.state_timer / PULSAR_PULSE_TIME).clamp(0.0, 1.0);
                        (1.0_f32, 0.95 + pulse * 0.05, 0.35 + pulse * 0.35,
                         0.72 + pulse * 0.20, 1.8 + pulse * 3.0)
                    }
                    _ if e.kind == EnemyKind::Umbra => {
                        let phase = (self.time * 2.7 + e.state_timer).sin() * 0.5 + 0.5;
                        (e.color[0], e.color[1], e.color[2], 0.18 + phase * 0.62, 0.4 + phase * 2.0)
                    }
                    _ if e.kind == EnemyKind::Orbiter && e.state == EnemyState::Orbiting => {
                        let collapse = (1.0 - (e.charge_dir.x - ORBITER_MIN_RADIUS) / 160.0).clamp(0.0, 1.0);
                        (e.color[0], e.color[1], e.color[2], 1.0, 1.0 + collapse * 2.0)
                    }
                    _ if e.mini_boss.is_some() => {
                        let pulse = (self.time * 4.5).sin() * 0.5 + 0.5;
                        (e.color[0], e.color[1], e.color[2], 1.0, 1.6 + pulse * 2.2)
                    }
                    _ => (e.color[0], e.color[1], e.color[2], 1.0_f32, 1.0_f32),
                };

                // Layer 1: Wide atmospheric glow — sets the colored halo / mood.
                self.circle_buf.push(CircleInstance {
                    x: pos.x, y: pos.y,
                    radius: e.radius * 2.4,
                    r: er, g: eg, b: eb,
                    a: base_alpha * 0.16,
                    glow: glow_mult * 1.1,
                });

                // Layer 2: Crisp solid body — near-zero glow gives hard-edged circle.
                self.circle_buf.push(CircleInstance {
                    x: pos.x, y: pos.y,
                    radius: e.radius,
                    r: er, g: eg, b: eb,
                    a: base_alpha * 0.88,
                    glow: 0.06,
                });

                // Layer 3: White-hot inner core (skipped for stealth Umbra).
                if e.kind != EnemyKind::Umbra {
                    let core_alpha = if e.mini_boss.is_some() { 0.80 } else { 0.55 };
                    self.circle_buf.push(CircleInstance {
                        x: pos.x, y: pos.y,
                        radius: e.radius * 0.38,
                        r: 1.0, g: 1.0, b: 0.95,
                        a: core_alpha * base_alpha,
                        glow: 0.25 * glow_mult,
                    });
                }

                // Frost slow overlay: ice crystal tint when slowed.
                if e.slow_timer > 0.0 {
                    let ice_t = (e.slow_timer / FROST_SLOW_DURATION).clamp(0.0, 1.0);
                    self.circle_buf.push(CircleInstance {
                        x: pos.x, y: pos.y,
                        radius: e.radius * 1.15,
                        r: 0.38, g: 0.85, b: 1.0,
                        a: ice_t * 0.38,
                        glow: 0.35,
                    });
                }
            }
        }

        // Radiance gems — pickup-only crystals, not enemy-like round dots.
        for g in &self.gems {
            let pos = nearest_globe_pos(camera, g.pos);
            let pulse = 1.0 + (g.life * 7.5).sin() * 0.25;
            let fade = if g.life > GEM_LIFETIME - 2.0 {
                (GEM_LIFETIME - g.life) / 2.0
            } else {
                1.0
            };
            let (r, g_col, b, tier_glow) = if g.value >= 5 {
                (1.0, 0.82, 0.24, 1.1)
            } else if g.value >= 3 {
                (0.28, 0.72, 1.0, 0.9)
            } else {
                (0.20, 1.0, 0.68, 0.75)
            };
            let radius = GEM_VISUAL_RADIUS;
            let core_radius = radius * 0.52;

            // Colored pickup shell: outer visible silhouette is half a starter Drone.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius,
                r,
                g: g_col,
                b,
                a: 0.36 * fade,
                glow: tier_glow * pulse * fade,
            });

            // White-hot center makes the collectible read as "reward" instead of threat.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: core_radius,
                r: 0.92,
                g: 1.0,
                b: 0.92,
                a: 0.8 * fade,
                glow: tier_glow * 1.4 * pulse * fade,
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

            // Inner core beam (thin white, high glow) on every beam.
            self.beam_buf.push(BeamInstance {
                x0: start.x,
                y0: start.y,
                x1: end.x,
                y1: end.y,
                thickness: 1.0,
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: t * 0.8 * alpha_scale,
                glow: 0.8 * t,
            });
        }

        // Projectiles — small magenta orbs.
        for p in &self.projectiles {
            let pos = nearest_globe_pos(camera, p.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: p.radius,
                r: 0.9,
                g: 0.2,
                b: 0.7,
                a: 1.0,
                glow: 2.0,
            });
        }

        // Crystals — semi-transparent teal obstacles.
        for c in &self.crystals {
            let pos = nearest_globe_pos(camera, c.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: c.radius,
                r: 0.3,
                g: 0.7,
                b: 0.8,
                a: 0.35,
                glow: 0.4,
            });
            // Inner bright core.
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: c.radius * 0.3,
                r: 0.5,
                g: 0.9,
                b: 1.0,
                a: 0.6,
                glow: 1.5,
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
