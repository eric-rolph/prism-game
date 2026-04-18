//! Game state and update logic.
//!
//! This step introduces the shard system. The update loop short-circuits
//! when the player is in the middle of a level-up choice (pause), so the
//! JS side can show a picker UI in response to `is_leveling_up()`.

use crate::entities::{Beam, Enemy, Halo, InterferencePulse, Particle, Player};
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

    input: Vec2,
    rng: Rng,

    spawn_timer: f32,
    fire_timer: f32,
    camera: Vec2,

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

    // Draw buffers, rebuilt every frame.
    circle_buf: Vec<CircleInstance>,
    beam_buf: Vec<BeamInstance>,
}

// --- Tuning -------------------------------------------------------------

const PLAYER_SPEED: f32 = 340.0;
const PLAYER_RADIUS: f32 = 6.0;

const ENEMY_SPEED_BASE: f32 = 72.0;
const ENEMY_RADIUS: f32 = 9.0;
const ENEMY_HP: f32 = 100.0;

const BEAM_LIFETIME: f32 = 0.14;
const BEAM_COOLDOWN: f32 = 0.20;

const SPAWN_RATE_INITIAL: f32 = 0.55;
const SPAWN_RATE_MIN: f32 = 0.09;
const SPAWN_RATE_DECAY: f32 = 0.004;

const PARTICLE_COUNT_PER_DEATH: usize = 10;

const XP_PER_KILL: u32 = 1;
fn xp_for_rank(rank: u32) -> u32 {
    // Rank N costs 8 + 6·(N-1) XP. Early ranks arrive quickly; the curve
    // slopes up so late-game upgrades feel earned.
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
            },
            enemies: Vec::with_capacity(256),
            beams: Vec::with_capacity(256),
            particles: Vec::with_capacity(1024),
            halos: Vec::new(),
            pulses: Vec::with_capacity(16),
            input: Vec2::ZERO,
            rng: Rng::new(seed),
            spawn_timer: 0.8,
            fire_timer: 0.0,
            camera: Vec2::ZERO,
            inventory: Inventory::default(),
            xp: 0,
            rank: 0,
            kills_total: 0,
            pending_echoes: Vec::new(),
            interference_timer: 0.0,
            leveling_up: false,
            level_choices: [None; 3],
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
        }
        self.leveling_up = false;
        self.level_choices = [None; 3];
        // A single on_death can earn multiple ranks' worth of XP.
        self.check_for_level_up();
    }

    // --- Main update ----------------------------------------------------

    pub fn update(&mut self, dt: f32) {
        if self.leveling_up {
            return;
        }

        self.time += dt;

        // Movement + camera.
        self.player.pos += self.input * self.player.speed * dt;
        self.camera = self.player.pos;

        // Spawn.
        self.spawn_timer -= dt;
        if self.spawn_timer <= 0.0 {
            self.spawn_enemy();
            let rate = (SPAWN_RATE_INITIAL - self.time * SPAWN_RATE_DECAY).max(SPAWN_RATE_MIN);
            self.spawn_timer += rate;
        }

        // Enemies drift toward player.
        for e in &mut self.enemies {
            let to_player = self.player.pos - e.pos;
            let dir = to_player.normalize_or_zero();
            e.pos += dir * e.speed * dt;
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
                self.fire_primary();
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

        // Death resolution — loop so that Cascade chain-kills propagate.
        loop {
            let mut dying: Vec<usize> = (0..self.enemies.len())
                .filter(|&i| self.enemies[i].hp <= 0.0)
                .collect();
            if dying.is_empty() {
                break;
            }
            // Remove in reverse index order so earlier indices stay valid.
            dying.sort_unstable_by(|a, b| b.cmp(a));
            let mut dead_positions = Vec::with_capacity(dying.len());
            for i in dying {
                let dead = self.enemies.swap_remove(i);
                dead_positions.push(dead.pos);
            }
            for pos in dead_positions {
                self.on_enemy_death(pos);
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

        // Echo: queue L delayed salvos.
        let echo = self.inventory.level(ShardKind::Echo);
        for step in 1..=echo {
            self.pending_echoes
                .push(self.time + ECHO_DELAY * step as f32);
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

    fn on_enemy_death(&mut self, pos: Vec2) {
        self.kills_total += 1;
        self.xp += XP_PER_KILL;
        self.check_for_level_up();

        self.spawn_death_particles(pos);

        // Cascade: short beams in random directions from the corpse.
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

    fn check_for_level_up(&mut self) {
        if self.leveling_up {
            return;
        }
        let needed = xp_for_rank(self.rank + 1);
        if self.xp >= needed {
            self.xp -= needed;
            self.rank += 1;
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

    fn spawn_enemy(&mut self) {
        let radius = self.screen_size.length() * 0.55;
        let angle = self.rng.angle();
        let dir = Vec2::new(angle.cos(), angle.sin());
        let pos = self.player.pos + dir * radius;
        let speed = ENEMY_SPEED_BASE * self.rng.range(0.85, 1.15);
        self.enemies.push(Enemy {
            pos,
            radius: ENEMY_RADIUS,
            hp: ENEMY_HP,
            speed,
        });
    }

    fn find_nearest_enemy_pos(&self) -> Option<Vec2> {
        self.enemies
            .iter()
            .map(|e| (e.pos, (e.pos - self.player.pos).length_squared()))
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(p, _)| p)
    }

    fn spawn_death_particles(&mut self, pos: Vec2) {
        for _ in 0..PARTICLE_COUNT_PER_DEATH {
            let angle = self.rng.angle();
            let speed = self.rng.range(120.0, 280.0);
            self.particles.push(Particle {
                pos,
                vel: Vec2::new(angle.cos(), angle.sin()) * speed,
                life: 0.0,
                max_life: self.rng.range(0.45, 0.85),
                color: [0.65, 0.35, 1.0],
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

        // Player.
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

        // Enemies.
        for e in &self.enemies {
            self.circle_buf.push(CircleInstance {
                x: e.pos.x,
                y: e.pos.y,
                radius: e.radius,
                r: 0.35,
                g: 0.18,
                b: 0.55,
                a: 1.0,
                glow: 0.6,
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
