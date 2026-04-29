//! Game state and update logic.
//!
//! This step introduces the shard system. The update loop short-circuits
//! when the player is in the middle of a level-up choice (pause), so the
//! JS side can show a picker UI in response to `is_leveling_up()`.

use crate::entities::{
    Beam, Crystal, Enemy, EnemyKind, EnemyState, FrostField, Halo, InterferencePulse, Particle,
    Player, Projectile, XpGem,
};
use crate::math::Rng;
use crate::shards::{compose_salvo, BeamRequest, Inventory, ShardKind};
use crate::{BeamInstance, CircleInstance};
use glam::{Vec2, Vec3};

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

    input: Vec2,
    dash_input: bool,
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
    interference_timer: f32,

    // Level-up modal state.
    leveling_up: bool,
    level_choices: [Option<ShardKind>; 3],

    // Death / game-over state.
    dead: bool,
    score: u32,

    halo_trail_timer: f32,
    wave_event_fired: bool,

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

// Wave system.
const WAVE_DURATION: f32 = 30.0;
const BASE_ENEMY_CAP: usize = 140;
const ENEMY_CAP_PER_WAVE: usize = 12;
const MAX_ENEMIES: usize = 420;
const MAX_SPAWNS_PER_FRAME: u32 = 4;
const SESSION_LENGTH: f32 = 900.0; // 15 minutes
const OVERDRIVE_START: f32 = 600.0; // 10 minutes
const WAVE_CLEAR_BANNER_DURATION: f32 = 1.5;

const PARTICLE_COUNT_PER_DEATH: usize = 10;

// XP gems.
const GEM_MAGNET_RADIUS: f32 = 100.0;
const GEM_COLLECT_RADIUS: f32 = 16.0;
const GEM_MAGNET_SPEED: f32 = 400.0;
const GEM_LIFETIME: f32 = 20.0;
const GEM_RADIUS: f32 = 4.0;

// Player health.
const PLAYER_MAX_HP: f32 = 100.0;
const IFRAME_DURATION: f32 = 0.33;

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
            [0.35, 0.18, 0.55],
        ),
        EnemyKind::Brute => (
            22.0,
            1100.0 * hp_scale,
            52.0 * spd_scale,
            28.0 * dmg_scale,
            [0.7, 0.15, 0.15],
        ),
        EnemyKind::Dasher => (
            7.0,
            110.0 * hp_scale,
            76.0 * spd_scale,
            20.0 * dmg_scale,
            [0.2, 0.8, 0.9],
        ),
        EnemyKind::Splitter => (
            14.0,
            370.0 * hp_scale,
            82.0 * spd_scale,
            16.0 * dmg_scale,
            [0.2, 0.7, 0.3],
        ),
        EnemyKind::Orbiter => (
            10.0,
            280.0 * hp_scale,
            124.0 * spd_scale,
            14.0 * dmg_scale,
            [0.9, 0.5, 0.15],
        ),
        EnemyKind::Emitter => (
            11.0,
            230.0 * hp_scale,
            64.0 * spd_scale,
            10.0 * dmg_scale,
            [0.7, 0.3, 0.8],
        ),
        EnemyKind::Pulsar => (
            PULSAR_IDLE_RADIUS,
            420.0 * hp_scale,
            46.0 * spd_scale,
            11.0 * dmg_scale,
            [0.95, 0.86, 0.22],
        ),
        EnemyKind::Umbra => (
            8.0,
            190.0 * hp_scale,
            118.0 * spd_scale,
            20.0 * dmg_scale,
            [0.48, 0.16, 0.72],
        ),
    }
}

fn xp_for_rank(rank: u32) -> u32 {
    8 + rank * 6 + rank * rank * 2
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
const MAGNET_RADIUS_PER_LEVEL: f32 = 45.0;
const MAGNET_SPEED_PER_LEVEL: f32 = 70.0;
const MOMENTUM_SPEED_PER_LEVEL: f32 = 0.05;
const MOMENTUM_DASH_REDUCTION_PER_LEVEL: f32 = 0.075;

// Blizzard: frost field dropped on frozen enemy death.
const BLIZZARD_FIELD_RADIUS: f32 = 72.0;
const BLIZZARD_FIELD_LIFETIME: f32 = 2.8;
const MAX_FROST_FIELDS: usize = 12;

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
            input: Vec2::ZERO,
            dash_input: false,
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
            interference_timer: 0.0,
            leveling_up: false,
            level_choices: [None; 3],
            dead: false,
            score: 0,
            shake_amount: 0.0,
            shake_offset: Vec2::ZERO,
            hit_flash_positions: Vec::new(),
            halo_trail_timer: 0.0,
            wave_event_fired: false,
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
        self.dead && self.time >= SESSION_LENGTH
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
    pub fn level_choice(&self, slot: u8) -> i32 {
        if (slot as usize) >= 3 {
            return -1;
        }
        match self.level_choices[slot as usize] {
            Some(k) => k as i32,
            None => -1,
        }
    }

    pub fn select_shard(&mut self, slot: u8) {
        if !self.leveling_up || (slot as usize) >= 3 {
            return;
        }
        if let Some(kind) = self.level_choices[slot as usize] {
            self.inventory.upgrade(kind);
            if kind == ShardKind::Halo {
                self.rebuild_halos();
            }
            if kind == ShardKind::Barrier {
                self.player.barrier_max =
                    BARRIER_HP_PER_LEVEL * self.inventory.level(ShardKind::Barrier) as f32;
                self.player.barrier_hp = (self.player.barrier_hp + self.player.barrier_max * 0.5)
                    .min(self.player.barrier_max);
            }
            self.leveling_up = false;
            self.level_choices = [None; 3];
            // A single on_death can earn multiple ranks' worth of XP.
            self.check_for_level_up();
        }
        // If slot was None (empty), do nothing — don't close the modal.
    }

    pub fn restart(&mut self) {
        let w = self.screen_size.x;
        let h = self.screen_size.y;
        let seed = self.rng.next_u32();
        *self = Self::new(w, h, seed);
    }

    // --- Main update ----------------------------------------------------

    pub fn update(&mut self, dt: f32) {
        if self.leveling_up || self.dead {
            return;
        }

        self.time += dt;
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
            self.player.dash_dir = dir;
            self.player.dash_timer = DASH_DURATION;
            self.player.dash_cooldown = self.dash_cooldown_duration();
            self.player.iframe_timer = DASH_DURATION; // i-frames during dash
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

        // Spawn enemies (wave-based).
        let enemy_cap = self.enemy_cap_for_wave();
        if !in_breather && self.enemies.len() < enemy_cap {
            self.spawn_timer -= dt;
            let mut spawned = 0;
            while self.spawn_timer <= 0.0
                && self.enemies.len() < enemy_cap
                && spawned < MAX_SPAWNS_PER_FRAME
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
                    }
                }
            }
        }

        // Spawn emitter projectiles (separate pass to avoid borrow conflict).
        let mut new_projectiles: Vec<Projectile> = Vec::new();
        for e in &self.enemies {
            if e.kind == EnemyKind::Emitter && e.state == EnemyState::Shooting {
                // Fire when timer just reset (within dt tolerance).
                if e.state_timer >= EMITTER_FIRE_INTERVAL - dt * 1.1 {
                    new_projectiles.push(Projectile {
                        pos: e.pos,
                        vel: e.charge_dir * PROJ_SPEED,
                        life: 0.0,
                        damage: PROJ_DAMAGE,
                        radius: PROJ_RADIUS,
                    });
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
                    && globe_distance(p.pos, self.player.pos) < PROJ_RADIUS + self.player.radius
                {
                    proj_damage = p.damage;
                    p.life = PROJ_LIFETIME; // mark for removal
                    break;
                }
            }
            if proj_damage > 0.0 {
                self.apply_damage_to_player(proj_damage);
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
                self.apply_damage_to_player(contact_dmg);
                self.player.iframe_timer = IFRAME_DURATION;
                self.shake_amount += SHAKE_HIT_PX;
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
        self.fire_timer -= dt;
        if self.fire_timer <= 0.0 {
            if self.fire_primary() {
                self.fire_timer += BEAM_COOLDOWN;
            } else {
                self.fire_timer = 0.1;
            }
        }

        // Echo: scheduled re-fires.
        let now = self.time;
        let mut i = 0;
        while i < self.pending_echoes.len() {
            if self.pending_echoes[i] <= now {
                self.pending_echoes.swap_remove(i);
                self.fire_primary_inner(false);
            } else {
                i += 1;
            }
        }

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
                });
                let resonance = self
                    .inventory
                    .has_synergy(ShardKind::Barrier, ShardKind::Interference);
                self.interference_timer =
                    if resonance { 1.0 } else { 2.0 } / interf_level as f32;
            }
        }
        for p in &mut self.pulses {
            p.life += dt;
        }
        let pulse_snapshots: Vec<(Vec2, f32)> = self
            .pulses
            .iter()
            .map(|p| (p.pos, p.current_radius()))
            .collect();
        let gravity_pull: Option<f32> = if self
            .inventory
            .has_synergy(ShardKind::Magnet, ShardKind::Interference)
        {
            Some(70.0 + self.inventory.level(ShardKind::Magnet) as f32 * MAGNET_SPEED_PER_LEVEL * 0.45)
        } else {
            None
        };
        for (ppos, pradius) in &pulse_snapshots {
            for e in &mut self.enemies {
                let d = globe_distance(e.pos, *ppos);
                if let Some(pull) = gravity_pull {
                    if d > 1.0 && d < *pradius + 110.0 {
                        let falloff = (1.0 - d / (*pradius + 110.0)).clamp(0.0, 1.0);
                        let to_center = nearest_globe_delta(e.pos, *ppos).normalize_or_zero();
                        move_on_globe(&mut e.pos, to_center * pull * falloff * dt);
                    }
                }
                if (d - *pradius).abs() < INTERFERENCE_RING_THICKNESS + e.radius {
                    e.hp -= INTERFERENCE_DPS * dt;
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
        self.gems.retain(|g| {
            let dist = globe_distance(g.pos, self.player.pos);
            if dist < GEM_COLLECT_RADIUS + self.player.radius {
                collected_xp += g.value;
                false
            } else if g.life >= GEM_LIFETIME {
                false // expired
            } else {
                true
            }
        });
        if collected_xp > 0 {
            self.xp += collected_xp;
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
                self.on_enemy_death(dead.pos, dead.kind, cascade_depth, dead.no_xp, dead.slow_timer > 0.0);
            }
            cascade_depth += 1;
            if cascade_depth >= CASCADE_MAX_DEPTH {
                self.enemies.retain(|e| e.hp > 0.0);
                break;
            }
        }

        // Session victory (survived 10 minutes).
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

    // --- Firing ---------------------------------------------------------

    fn fire_primary(&mut self) -> bool {
        self.fire_primary_inner(true)
    }

    fn fire_primary_inner(&mut self, schedule_echo: bool) -> bool {
        let target = match self.find_nearest_enemy_pos() {
            Some(t) => t,
            None => return false,
        };
        let local_enemies: Vec<Enemy> = self
            .enemies
            .iter()
            .cloned()
            .map(|mut e| {
                e.pos = nearest_globe_pos(self.player.pos, e.pos);
                e
            })
            .collect();
        let salvo = compose_salvo(self.player.pos, target, &local_enemies, &self.inventory);
        if salvo.is_empty() {
            return false;
        }

        for req in &salvo {
            self.fire_beam(req.clone());
        }

        // Echo: queue L delayed salvos (only from primary fire, not from echoes).
        if schedule_echo {
            let echo = self.inventory.level(ShardKind::Echo);
            for step in 1..=echo {
                self.pending_echoes
                    .push(self.time + ECHO_DELAY * step as f32);
            }
        }

        true
    }

    fn fire_beam(&mut self, req: BeamRequest) {
        let diffract = self.inventory.level(ShardKind::Diffract);
        let siphon = self.inventory.level(ShardKind::Siphon);
        let frost = self.inventory.level(ShardKind::Frost);
        let mut impacts: Vec<Vec2> = Vec::new();
        let mut hit_count: u32 = 0;
        let (start, end) = tangent_segment_on_globe(self.player.pos, req.start, req.end);

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

                self.beams.push(Beam {
                    start: impact,
                    end,
                    life: 0.0,
                    max_life: DIFFRACT_MINI_LIFETIME,
                    thickness: diffract_thick,
                    color: diffract_color,
                });
            }
        }
    }

    fn on_enemy_death(&mut self, pos: Vec2, kind: EnemyKind, cascade_depth: u32, no_xp: bool, was_frozen: bool) {
        self.kills_total += 1;
        self.spawn_death_particles(pos, kind);

        // Blizzard: frozen enemy death leaves a lingering frost slow-field.
        if was_frozen
            && self.frost_fields.len() < MAX_FROST_FIELDS
            && self.inventory.has_synergy(ShardKind::Split, ShardKind::Frost)
        {
            self.frost_fields.push(FrostField {
                pos,
                life: 0.0,
                max_life: BLIZZARD_FIELD_LIFETIME,
                radius: BLIZZARD_FIELD_RADIUS,
            });
            // Spawn extra frost-colored particles on shatter.
            for _ in 0..14 {
                let angle = self.rng.angle();
                let speed = self.rng.range(80.0, 220.0);
                self.particles.push(Particle {
                    pos,
                    vel: Vec2::new(angle.cos(), angle.sin()) * speed,
                    life: 0.0,
                    max_life: self.rng.range(0.5, 1.1),
                    color: [0.5, 0.88, 1.0],
                    size: self.rng.range(1.8, 3.5),
                });
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
                    spawn_grace: 0.0,
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
            let color = if chain_reaction { [0.25, 1.0, 0.88] } else { [1.0, 0.5, 0.3] };
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
                self.beams.push(Beam {
                    start: origin,
                    end,
                    life: 0.0,
                    max_life: CASCADE_LIFETIME,
                    thickness: CASCADE_THICKNESS,
                    color,
                });
            }
        }
    }

    fn check_for_level_up(&mut self) {
        if self.leveling_up {
            return;
        }
        let needed = xp_for_rank(self.rank + 1);
        if self.xp >= needed {
            self.xp -= needed;
            self.rank += 1;
            // Heal on level up — diminishing with rank.
            let heal = (20.0 - self.rank as f32 * 1.0).max(5.0);
            self.player.hp = (self.player.hp + heal).min(self.player.max_hp);
            self.level_choices = self.inventory.roll_choices(&mut self.rng);
            // If every shard is maxed, silently skip the picker.
            if self.level_choices.iter().any(|c| c.is_some()) {
                self.leveling_up = true;
            }
        }
    }

    fn rebuild_halos(&mut self) {
        let level = self.inventory.level(ShardKind::Halo) as usize;
        self.halos.clear();
        let n = level.max(1);
        for i in 0..level {
            let even = i % 2 == 0;
            self.halos.push(Halo {
                angle: (i as f32) * std::f32::consts::TAU / n as f32,
                radius: 38.0 + 22.0 * i as f32,
                size: 5.0,
                angular_speed: if even { 1.8 } else { -1.4 },
            });
        }
    }

    /// Damage the player, absorbing with Barrier first, then triggering Thorns.
    fn apply_damage_to_player(&mut self, raw_damage: f32) {
        let mut remaining = raw_damage;

        // Barrier absorbs damage first.
        if self.player.barrier_hp > 0.0 {
            let absorbed = remaining.min(self.player.barrier_hp);
            self.player.barrier_hp -= absorbed;
            remaining -= absorbed;

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
                });
            }
        }

        if remaining > 0.0 {
            self.player.hp -= remaining;
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

            self.beams.push(Beam {
                start,
                end,
                life: 0.0,
                max_life: THORNS_BEAM_LIFETIME,
                thickness: THORNS_BEAM_THICKNESS,
                color: [1.0, 0.3, 0.3],
            });
        }

        // Martyrdom: kills during thorns trigger cascade from their position.
        if martyrdom {
            let cascade_level = self.inventory.level(ShardKind::Cascade);
            let kills: Vec<Vec2> = self.enemies.iter().filter(|e| e.hp <= 0.0).map(|e| e.pos).collect();
            for pos in kills {
                self.fire_cascade_beams(pos, cascade_level, 1, [1.0, 0.5, 0.3]);
            }
        }
    }

    fn compute_score(&self) -> u32 {
        let time_bonus = (self.time / 10.0) as u32;
        self.kills_total + self.rank * 5 + time_bonus
    }

    fn enemy_cap_for_wave(&self) -> usize {
        let overdrive_minutes = ((self.time - OVERDRIVE_START) / 60.0).max(0.0);
        let overdrive_bonus = (overdrive_minutes * 18.0) as usize;
        (BASE_ENEMY_CAP + self.wave as usize * ENEMY_CAP_PER_WAVE + overdrive_bonus)
            .min(MAX_ENEMIES)
    }

    fn spawn_rate_for_wave(&self) -> f32 {
        let minute = self.time / 60.0;
        let overdrive_minutes = ((self.time - OVERDRIVE_START) / 60.0).max(0.0);
        let base = 0.34 - self.wave as f32 * 0.018 - minute * 0.006;
        let overdrive_mult = (1.0 - overdrive_minutes * 0.05).max(0.80);
        let min_interval = (0.050 - overdrive_minutes * 0.004).max(0.032);
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
        (base * shape_mult * overdrive_mult).max(min_interval)
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
            let spin = if self.rng.next_u32() % 2 == 0 { 1.0 } else { -1.0 };
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
                match self.rng.next_u32() % 4 {
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

    fn find_nearest_enemy_pos(&self) -> Option<Vec2> {
        self.enemies
            .iter()
            .map(|e| {
                let delta = nearest_globe_delta(self.player.pos, e.pos);
                (self.player.pos + delta, delta.length_squared())
            })
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(p, _)| p)
    }

    fn wave_shape(&self) -> WaveShape {
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

        // Interference pulses underneath everything else.
        for p in &self.pulses {
            let t = p.life / p.max_life;
            let r = p.current_radius();
            let pos = nearest_globe_pos(camera, p.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: r,
                r: 0.4,
                g: 0.55,
                b: 1.0,
                a: 0.20 * (1.0 - t),
                glow: 0.9 * (1.0 - t),
            });
        }

        // Player (blink during i-frames).
        let visible =
            self.player.iframe_timer <= 0.0 || ((self.player.iframe_timer * 16.0) as u32 % 2 == 0);
        if visible {
            let pos = nearest_globe_pos(camera, self.player.pos);
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: self.player.radius,
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 1.0,
                glow: 3.0,
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

        // Enemies — colored per-type, flash white on hit.
        let hit_set: Vec<Vec2> = self.hit_flash_positions.clone();
        for e in &self.enemies {
            let pos = nearest_globe_pos(camera, e.pos);
            let is_hit = hit_set.iter().any(|h| globe_distance(*h, e.pos) < 1.0);
            let (glow, r, g, b, alpha) = if is_hit {
                (3.0, 1.0_f32, 1.0_f32, 1.0_f32, 1.0_f32)
            } else {
                match e.state {
                    EnemyState::Telegraphing => {
                        let flash = if (e.state_timer * 12.0) as u32 % 2 == 0 {
                            2.0
                        } else {
                            0.8
                        };
                        (flash, e.color[0], e.color[1], e.color[2], 1.0)
                    }
                    EnemyState::Pulsing => {
                        let pulse = (1.0 - e.state_timer / PULSAR_PULSE_TIME).clamp(0.0, 1.0);
                        (
                            1.8 + pulse * 2.8,
                            1.0,
                            0.95 + pulse * 0.05,
                            0.35 + pulse * 0.35,
                            0.72 + pulse * 0.20,
                        )
                    }
                    _ if e.kind == EnemyKind::Umbra => {
                        let phase = (self.time * 2.7 + e.state_timer).sin() * 0.5 + 0.5;
                        let alpha = 0.18 + phase * 0.62;
                        let glow = 0.35 + phase * 2.45;
                        (glow, e.color[0], e.color[1], e.color[2], alpha)
                    }
                    _ if e.kind == EnemyKind::Orbiter && e.state == EnemyState::Orbiting => {
                        let collapse =
                            (1.0 - (e.charge_dir.x - ORBITER_MIN_RADIUS) / 160.0).clamp(0.0, 1.0);
                        (
                            1.0 + collapse * 1.8,
                            e.color[0],
                            e.color[1],
                            e.color[2],
                            1.0,
                        )
                    }
                    _ => (0.6, e.color[0], e.color[1], e.color[2], 1.0),
                }
            };
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: e.radius,
                r,
                g,
                b,
                a: alpha,
                glow,
            });
        }

        // XP gems — bright cyan/green, small, pulsing glow.
        for g in &self.gems {
            let pos = nearest_globe_pos(camera, g.pos);
            let pulse = 1.0 + (g.life * 6.0).sin() * 0.3;
            let fade = if g.life > GEM_LIFETIME - 2.0 {
                (GEM_LIFETIME - g.life) / 2.0
            } else {
                1.0
            };
            self.circle_buf.push(CircleInstance {
                x: pos.x,
                y: pos.y,
                radius: GEM_RADIUS,
                r: 0.3,
                g: 1.0,
                b: 0.7,
                a: fade,
                glow: 2.5 * pulse * fade,
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

        // Beams — colored per-shard (Diffract mini, Cascade burst, Chromatic RGB, default cyan).
        for b in &self.beams {
            let t = 1.0 - (b.life / b.max_life);
            let start = nearest_globe_pos(camera, b.start);
            let end = nearest_globe_pos(camera, b.end);
            self.beam_buf.push(BeamInstance {
                x0: start.x,
                y0: start.y,
                x1: end.x,
                y1: end.y,
                thickness: b.thickness,
                r: b.color[0],
                g: b.color[1],
                b: b.color[2],
                a: t,
                glow: 3.0 * t,
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
