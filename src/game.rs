//! Game state and update logic.
//!
//! This step introduces the shard system. The update loop short-circuits
//! when the player is in the middle of a level-up choice (pause), so the
//! JS side can show a picker UI in response to `is_leveling_up()`.

use crate::entities::{Beam, Crystal, Enemy, EnemyKind, EnemyState, Halo, InterferencePulse, Particle, Player, Projectile, XpGem};
use crate::math::Rng;
use crate::shards::{compose_salvo, BeamRequest, Inventory, ShardKind};
use crate::{BeamInstance, CircleInstance};
use glam::Vec2;

pub struct Game {
    time: f32,
    screen_size: Vec2,

    player: Player,
    enemies: Vec<Enemy>,
    beams: Vec<Beam>,
    particles: Vec<Particle>,
    halos: Vec<Halo>,
    pulses: Vec<InterferencePulse>,
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
const DASH_COOLDOWN: f32 = 2.0;

// Wave system.
const WAVE_DURATION: f32 = 30.0;
const MAX_ENEMIES: usize = 200;
const SESSION_LENGTH: f32 = 600.0; // 10 minutes
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
const IFRAME_DURATION: f32 = 0.5;
const HEAL_ON_LEVELUP: f32 = 20.0;

// Screen shake.
const SHAKE_DEATH_PX: f32 = 3.5;
const SHAKE_HIT_PX: f32 = 5.0;
const SHAKE_DECAY: f32 = 12.0;

// Cascade chain-kill depth cap.
const CASCADE_MAX_DEPTH: u32 = 10;

// Emitter projectile.
const EMITTER_RANGE: f32 = 300.0;
const EMITTER_FIRE_INTERVAL: f32 = 2.0;
const PROJ_SPEED: f32 = 200.0;
const PROJ_DAMAGE: f32 = 10.0;
const PROJ_RADIUS: f32 = 4.0;
const PROJ_LIFETIME: f32 = 4.0;

// Crystal obstacles.
const MAX_CRYSTALS: usize = 6;
const CRYSTAL_SPAWN_INTERVAL: f32 = 45.0;
const CRYSTAL_FIRST_WAVE: u32 = 3;

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
    let hp_scale = (1.17_f32).powf(minute); // exponential 17% per minute (10% above 15% review target)
    match kind {
        EnemyKind::Drone => (9.0, 96.0 * hp_scale, 86.0, 12.0, [0.35, 0.18, 0.55]),
        EnemyKind::Brute => (22.0, 720.0 * hp_scale, 46.0, 24.0, [0.7, 0.15, 0.15]),
        EnemyKind::Dasher => (7.0, 72.0 * hp_scale, 66.0, 18.0, [0.2, 0.8, 0.9]),
        EnemyKind::Splitter => (14.0, 240.0 * hp_scale, 72.0, 14.0, [0.2, 0.7, 0.3]),
        EnemyKind::Orbiter => (10.0, 180.0 * hp_scale, 108.0, 12.0, [0.9, 0.5, 0.15]),
        EnemyKind::Emitter => (11.0, 150.0 * hp_scale, 55.0, 8.0, [0.7, 0.3, 0.8]),
    }
}

fn xp_for_rank(rank: u32) -> u32 {
    8 + rank.saturating_sub(1) * 6
}

// Shard-specific constants. Split / Mirror / Chromatic / Lens / Refract
// all live in the shards module; these are for the runtime-side shards.
const HALO_DPS: f32 = 38.0;

const INTERFERENCE_DPS: f32 = 60.0;
const INTERFERENCE_RING_THICKNESS: f32 = 12.0;

const ECHO_DELAY: f32 = 0.08;

const DIFFRACT_MINI_DAMAGE: f32 = 35.0;
const DIFFRACT_MINI_REACH: f32 = 95.0;
const DIFFRACT_MINI_THICKNESS: f32 = 1.7;
const DIFFRACT_MINI_LIFETIME: f32 = 0.10;

const CASCADE_DAMAGE: f32 = 55.0;
const CASCADE_REACH: f32 = 130.0;
const CASCADE_THICKNESS: f32 = 2.0;
const CASCADE_LIFETIME: f32 = 0.14;

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
            },
            enemies: Vec::with_capacity(256),
            beams: Vec::with_capacity(256),
            particles: Vec::with_capacity(1024),
            halos: Vec::new(),
            pulses: Vec::with_capacity(16),
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
        (self.player.dash_cooldown / DASH_COOLDOWN).clamp(0.0, 1.0)
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
    pub fn inventory_level(&self, kind_idx: u8) -> u8 {
        ShardKind::from_index(kind_idx)
            .map(|k| self.inventory.level(k))
            .unwrap_or(0)
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
            self.player.pos += self.player.dash_dir * speed * dt;
        } else if self.dash_input && self.player.dash_cooldown <= 0.0 {
            // Start dash if there's a movement direction.
            let dir = if self.input.length_squared() > 0.01 {
                self.input.normalize()
            } else {
                Vec2::new(1.0, 0.0) // default right
            };
            self.player.dash_dir = dir;
            self.player.dash_timer = DASH_DURATION;
            self.player.dash_cooldown = DASH_COOLDOWN;
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
            self.player.pos += self.input * self.player.speed * dt;
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
        }
        let in_breather = self.wave_timer > WAVE_DURATION;

        // Spawn enemies (wave-based).
        if !in_breather && self.enemies.len() < MAX_ENEMIES {
            self.spawn_timer -= dt;
            if self.spawn_timer <= 0.0 {
                self.spawn_wave_enemy();
                let rate = self.spawn_rate_for_wave();
                self.spawn_timer += rate;
            }
        }

        // Enemy AI.
        let player_pos = self.player.pos;
        let _minute = self.time / 60.0;
        for e in &mut self.enemies {
            match e.state {
                EnemyState::Drifting => {
                    let to_player = player_pos - e.pos;
                    let dir = to_player.normalize_or_zero();

                    match e.kind {
                        EnemyKind::Orbiter => {
                            if to_player.length() < 120.0 {
                                e.state = EnemyState::Orbiting;
                                e.state_timer = 0.0;
                            } else {
                                e.pos += dir * e.speed * dt;
                            }
                        }
                        EnemyKind::Dasher => {
                            e.pos += dir * e.speed * dt;
                            if to_player.length() < 250.0 {
                                e.state = EnemyState::Telegraphing;
                                // Telegraph shortens late-game: 0.45s base, 0.35s after wave 10.
                                let telegraph = if self.wave >= 10 { 0.35 } else { 0.45 };
                                e.state_timer = telegraph;
                                e.charge_dir = dir;
                            }
                        }
                        EnemyKind::Emitter => {
                            e.pos += dir * e.speed * dt;
                            if to_player.length() < EMITTER_RANGE {
                                e.state = EnemyState::Shooting;
                                e.state_timer = EMITTER_FIRE_INTERVAL;
                            }
                        }
                        _ => {
                            e.pos += dir * e.speed * dt;
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
                    e.pos += e.charge_dir * 320.0 * dt;
                    e.state_timer -= dt;
                    if e.state_timer <= 0.0 {
                        e.state = EnemyState::Drifting;
                    }
                }
                EnemyState::Orbiting => {
                    e.state_timer += dt;
                    // Orbit radius stored in charge_dir.x (set at spawn).
                    let orbit_radius = if e.charge_dir.x > 10.0 { e.charge_dir.x } else { 100.0 };
                    let angle_speed = 1.8;
                    let base_angle = (e.pos - player_pos).y.atan2((e.pos - player_pos).x);
                    let angle = base_angle + angle_speed * dt;
                    e.pos = player_pos + Vec2::new(angle.cos(), angle.sin()) * orbit_radius;
                }
                EnemyState::Shooting => {
                    let to_player = player_pos - e.pos;
                    // Drift away if player gets too close.
                    if to_player.length() < EMITTER_RANGE * 0.5 {
                        let away = -to_player.normalize_or_zero();
                        e.pos += away * e.speed * 0.5 * dt;
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

        // Update projectiles.
        for p in &mut self.projectiles {
            p.pos += p.vel * dt;
            p.life += dt;
        }
        // Projectile-player collision.
        if self.player.iframe_timer <= 0.0 {
            let mut hit = false;
            for p in &mut self.projectiles {
                if p.life < PROJ_LIFETIME && (p.pos - self.player.pos).length() < PROJ_RADIUS + self.player.radius {
                    self.player.hp -= p.damage;
                    self.player.iframe_timer = IFRAME_DURATION;
                    self.shake_amount += SHAKE_HIT_PX;
                    p.life = PROJ_LIFETIME; // mark for removal
                    hit = true;
                    break;
                }
            }
            let _ = hit;
        }
        // Projectile-crystal collision (projectiles die on crystals).
        for p in &mut self.projectiles {
            for c in &self.crystals {
                if (p.pos - c.pos).length() < PROJ_RADIUS + c.radius {
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
                let pos = self.player.pos + Vec2::new(angle.cos(), angle.sin()) * spawn_radius;
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
            c.pos += c.drift_vel * dt;
        }
        // Crystal-player collision (push player out).
        for c in &self.crystals {
            let to_player = self.player.pos - c.pos;
            let dist = to_player.length();
            if dist < c.radius + self.player.radius {
                let push = to_player.normalize_or_zero() * (c.radius + self.player.radius - dist);
                self.player.pos += push;
            }
        }
        // Crystal-enemy collision (Dashers crash and take damage, others push away).
        for c in &self.crystals {
            for e in &mut self.enemies {
                let to_enemy = e.pos - c.pos;
                let dist = to_enemy.length();
                if dist < c.radius + e.radius {
                    if e.kind == EnemyKind::Dasher && e.state == EnemyState::Charging {
                        e.hp -= 50.0;
                        e.state = EnemyState::Drifting;
                    }
                    let push = to_enemy.normalize_or_zero() * (c.radius + e.radius - dist);
                    e.pos += push;
                }
            }
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
        for h in &mut self.halos {
            h.angle += h.angular_speed * dt;
        }
        let halo_snapshots: Vec<(Vec2, f32)> = self
            .halos
            .iter()
            .map(|h| {
                let p = self.player.pos + Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius;
                (p, h.size)
            })
            .collect();
        for (hpos, hsize) in &halo_snapshots {
            for e in &mut self.enemies {
                if (e.pos - *hpos).length() < hsize + e.radius {
                    e.hp -= HALO_DPS * dt;
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
                self.interference_timer = 2.0 / interf_level as f32;
            }
        }
        for p in &mut self.pulses {
            p.life += dt;
        }
        let pulse_snapshots: Vec<(Vec2, f32)> =
            self.pulses.iter().map(|p| (p.pos, p.current_radius())).collect();
        for (ppos, pradius) in &pulse_snapshots {
            for e in &mut self.enemies {
                let d = (e.pos - *ppos).length();
                if (d - *pradius).abs() < INTERFERENCE_RING_THICKNESS + e.radius {
                    e.hp -= INTERFERENCE_DPS * dt;
                }
            }
        }
        self.pulses.retain(|p| p.life < p.max_life);

        // XP gem collection — magnetize nearby gems, collect touching ones.
        for g in &mut self.gems {
            g.life += dt;
            let to_player = self.player.pos - g.pos;
            let dist = to_player.length();
            if dist < GEM_MAGNET_RADIUS {
                let dir = to_player.normalize_or_zero();
                g.pos += dir * GEM_MAGNET_SPEED * dt;
            }
        }
        // Collect gems touching player.
        let mut collected_xp: u32 = 0;
        self.gems.retain(|g| {
            let dist = (g.pos - self.player.pos).length();
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

        // Enemy contact damage to player.
        if self.player.iframe_timer <= 0.0 {
            for e in &self.enemies {
                let dist = (e.pos - self.player.pos).length();
                if dist < e.radius + self.player.radius {
                    self.player.hp -= e.contact_damage;
                    self.player.iframe_timer = IFRAME_DURATION;
                    self.shake_amount += SHAKE_HIT_PX;
                    break;
                }
            }
        }

        // Player death check.
        if self.player.hp <= 0.0 {
            self.player.hp = 0.0;
            self.dead = true;
            self.score = self.compute_score();
            self.build_draw_buffers();
            return;
        }

        // Session victory (survived 10 minutes).
        if self.time >= SESSION_LENGTH && !self.dead {
            self.dead = true;
            self.score = self.compute_score() + 500; // survival bonus
            self.build_draw_buffers();
            return;
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
                self.on_enemy_death(dead.pos, dead.kind, cascade_depth);
            }
            cascade_depth += 1;
            if cascade_depth >= CASCADE_MAX_DEPTH {
                self.enemies.retain(|e| e.hp > 0.0);
                break;
            }
        }

        // Particles.
        for p in &mut self.particles {
            p.life += dt;
            p.pos += p.vel * dt;
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
        let salvo = compose_salvo(self.player.pos, target, &self.enemies, &self.inventory);
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
        let mut impacts: Vec<Vec2> = Vec::new();

        // Primary damage pass.
        for e in &mut self.enemies {
            if capsule_circle_intersect(
                req.start,
                req.end,
                req.thickness * 0.5,
                e.pos,
                e.radius,
            ) {
                e.hp -= req.damage;
                self.hit_flash_positions.push(e.pos);
                if diffract > 0 {
                    impacts.push(e.pos);
                }
            }
        }

        // Primary visual.
        self.beams.push(Beam {
            start: req.start,
            end: req.end,
            life: 0.0,
            max_life: BEAM_LIFETIME,
            thickness: req.thickness,
            color: req.color,
        });

        // Diffract: each impact spawns L radial sub-beams (damage + visual).
        for impact in impacts {
            for _ in 0..diffract {
                let a = self.rng.angle();
                let dir = Vec2::new(a.cos(), a.sin());
                let end = impact + dir * DIFFRACT_MINI_REACH;

                for e in &mut self.enemies {
                    if capsule_circle_intersect(
                        impact,
                        end,
                        DIFFRACT_MINI_THICKNESS * 0.5,
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
                    thickness: DIFFRACT_MINI_THICKNESS,
                    color: [0.6, 1.0, 0.7],
                });
            }
        }
    }

    fn on_enemy_death(&mut self, pos: Vec2, kind: EnemyKind, cascade_depth: u32) {
        self.kills_total += 1;
        self.spawn_death_particles(pos, kind);

        // Drop XP gem instead of instant XP.
        let gem_value = match kind {
            EnemyKind::Drone => 1,
            EnemyKind::Brute => 5,
            EnemyKind::Dasher => 2,
            EnemyKind::Splitter => 3,
            EnemyKind::Orbiter => 2,
            EnemyKind::Emitter => 3,
        };
        self.gems.push(XpGem {
            pos,
            value: gem_value,
            life: 0.0,
        });

        // Splitter: spawn 3 mini drones on death.
        if kind == EnemyKind::Splitter {
            let minute = self.time / 60.0;
            for i in 0..3 {
                let angle = (i as f32) * std::f32::consts::TAU / 3.0 + self.rng.angle() * 0.3;
                let offset = Vec2::new(angle.cos(), angle.sin()) * 20.0;
                let (_, _, _, _, color) = enemy_stats(EnemyKind::Drone, minute);
                self.enemies.push(Enemy {
                    pos: pos + offset,
                    radius: 6.0,
                    hp: 40.0,
                    speed: 90.0,
                    kind: EnemyKind::Drone,
                    state: EnemyState::Drifting,
                    state_timer: 0.0,
                    charge_dir: Vec2::ZERO,
                    color,
                    contact_damage: 8.0,
                });
            }
        }

        // Subtle screen shake on kills.
        self.shake_amount += SHAKE_DEATH_PX;

        // Cascade: short beams in random directions from the corpse.
        if cascade_depth < CASCADE_MAX_DEPTH {
            let cascade = self.inventory.level(ShardKind::Cascade);
            for _ in 0..cascade {
                let a = self.rng.angle();
                let dir = Vec2::new(a.cos(), a.sin());
                let end = pos + dir * CASCADE_REACH;
                for e in &mut self.enemies {
                    if capsule_circle_intersect(
                        pos,
                        end,
                        CASCADE_THICKNESS * 0.5,
                        e.pos,
                        e.radius,
                    ) {
                        e.hp -= CASCADE_DAMAGE;
                    }
                }
                self.beams.push(Beam {
                    start: pos,
                    end,
                    life: 0.0,
                    max_life: CASCADE_LIFETIME,
                    thickness: CASCADE_THICKNESS,
                    color: [1.0, 0.5, 0.3],
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
            // Heal on level up.
            self.player.hp = (self.player.hp + HEAL_ON_LEVELUP).min(self.player.max_hp);
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

    fn compute_score(&self) -> u32 {
        let time_bonus = (self.time / 10.0) as u32;
        self.kills_total + self.rank * 5 + time_bonus
    }

    fn spawn_rate_for_wave(&self) -> f32 {
        let base = 0.44 - self.wave as f32 * 0.026;
        let base = base.max(0.065);
        // Shape multiplier: Surge/Swarm spawn faster, Steady is normal.
        let shape_mult = match self.wave_shape() {
            WaveShape::Surge => 0.6,
            WaveShape::Swarm => 0.5,
            WaveShape::Crescendo => {
                // Accelerates within the wave.
                let t = self.wave_timer / WAVE_DURATION;
                1.0 - t * 0.5
            }
            _ => 1.0,
        };
        base * shape_mult
    }

    fn spawn_wave_enemy(&mut self) {
        let minute = self.time / 60.0;
        let kind = self.pick_enemy_kind();
        let (radius, hp, speed, contact_damage, color) = enemy_stats(kind, minute);

        let spawn_radius = self.screen_size.length() * 0.55;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let pos = self.player.pos + dir * spawn_radius;
        let speed = speed * self.rng.range(0.85, 1.15);

        // Store per-enemy data in charge_dir: Orbiters use x for orbit radius.
        let charge_dir = if kind == EnemyKind::Orbiter {
            Vec2::new(self.rng.range(80.0, 140.0), 0.0)
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
        });
    }

    fn pick_enemy_kind(&mut self) -> EnemyKind {
        let minute = self.time / 60.0;

        // Threat cocktail: guaranteed compositions for key waves.
        match (self.wave, self.wave_shape()) {
            (6, _) => {
                // Orbiter + Dasher mix.
                return if self.rng.next_u32() % 2 == 0 { EnemyKind::Orbiter } else { EnemyKind::Dasher };
            }
            (9, _) => {
                // Splitter swarm.
                if self.rng.next_u32() % 3 != 0 { return EnemyKind::Splitter; }
            }
            _ => {}
        }

        // Wave shape overrides.
        match self.wave_shape() {
            WaveShape::Elite => {
                // Heavy enemies only.
                let pool = [(EnemyKind::Brute, 5u32), (EnemyKind::Splitter, 3), (EnemyKind::Emitter, 2)];
                let total: u32 = pool.iter().map(|p| p.1).sum();
                let mut roll = self.rng.next_u32() % total;
                for (kind, weight) in &pool {
                    if roll < *weight { return *kind; }
                    roll -= weight;
                }
                return EnemyKind::Brute;
            }
            WaveShape::Swarm => {
                // Lots of drones + dashers.
                return if self.rng.next_u32() % 3 == 0 { EnemyKind::Dasher } else { EnemyKind::Drone };
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

        let total: u32 = pool.iter().map(|p| p.1).sum();
        let mut roll = self.rng.next_u32() % total;
        for (kind, weight) in &pool {
            if roll < *weight {
                return *kind;
            }
            roll -= weight;
        }
        EnemyKind::Drone
    }

    fn find_nearest_enemy_pos(&self) -> Option<Vec2> {
        self.enemies
            .iter()
            .map(|e| (e.pos, (e.pos - self.player.pos).length_squared()))
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

        // Interference pulses underneath everything else.
        for p in &self.pulses {
            let t = p.life / p.max_life;
            let r = p.current_radius();
            self.circle_buf.push(CircleInstance {
                x: p.pos.x,
                y: p.pos.y,
                radius: r,
                r: 0.4,
                g: 0.55,
                b: 1.0,
                a: 0.20 * (1.0 - t),
                glow: 0.9 * (1.0 - t),
            });
        }

        // Player (blink during i-frames).
        let visible = self.player.iframe_timer <= 0.0
            || ((self.player.iframe_timer * 16.0) as u32 % 2 == 0);
        if visible {
            self.circle_buf.push(CircleInstance {
                x: self.player.pos.x,
                y: self.player.pos.y,
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
            self.circle_buf.push(CircleInstance {
                x: self.player.pos.x,
                y: self.player.pos.y,
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
            let p = self.player.pos + Vec2::new(h.angle.cos(), h.angle.sin()) * h.radius;
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

        // Enemies — colored per-type, flash white on hit.
        let hit_set: Vec<Vec2> = self.hit_flash_positions.clone();
        for e in &self.enemies {
            let is_hit = hit_set.iter().any(|h| (*h - e.pos).length() < 1.0);
            let (glow, r, g, b, alpha) = if is_hit {
                (3.0, 1.0_f32, 1.0_f32, 1.0_f32, 1.0_f32)
            } else {
                match e.state {
                    EnemyState::Telegraphing => {
                        let flash = if (e.state_timer * 12.0) as u32 % 2 == 0 { 2.0 } else { 0.8 };
                        (flash, e.color[0], e.color[1], e.color[2], 1.0)
                    }
                    _ => (0.6, e.color[0], e.color[1], e.color[2], 1.0),
                }
            };
            self.circle_buf.push(CircleInstance {
                x: e.pos.x,
                y: e.pos.y,
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
            let pulse = 1.0 + (g.life * 6.0).sin() * 0.3;
            let fade = if g.life > GEM_LIFETIME - 2.0 {
                (GEM_LIFETIME - g.life) / 2.0
            } else {
                1.0
            };
            self.circle_buf.push(CircleInstance {
                x: g.pos.x,
                y: g.pos.y,
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
            let t = 1.0 - (p.life / p.max_life);
            self.circle_buf.push(CircleInstance {
                x: p.pos.x,
                y: p.pos.y,
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
            self.beam_buf.push(BeamInstance {
                x0: b.start.x,
                y0: b.start.y,
                x1: b.end.x,
                y1: b.end.y,
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
            self.circle_buf.push(CircleInstance {
                x: p.pos.x,
                y: p.pos.y,
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
            self.circle_buf.push(CircleInstance {
                x: c.pos.x,
                y: c.pos.y,
                radius: c.radius,
                r: 0.3,
                g: 0.7,
                b: 0.8,
                a: 0.35,
                glow: 0.4,
            });
            // Inner bright core.
            self.circle_buf.push(CircleInstance {
                x: c.pos.x,
                y: c.pos.y,
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
