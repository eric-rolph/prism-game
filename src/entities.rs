//! Plain data structs for the entities the game tracks. Logic lives in game.rs.

use glam::Vec2;

pub struct Player {
    pub pos: Vec2,
    pub radius: f32,
    pub speed: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub iframe_timer: f32,
    pub dash_cooldown: f32,
    pub dash_timer: f32,
    pub dash_dir: Vec2,
    pub barrier_hp: f32,
    pub barrier_max: f32,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EnemyKind {
    Drone,
    Brute,
    Dasher,
    Splitter,
    Orbiter,
    Emitter,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EnemyState {
    Drifting,
    /// Dasher telegraph before charge (countdown timer stored in `state_timer`).
    Telegraphing,
    /// Dasher charging in `charge_dir`.
    Charging,
    /// Orbiter locked into orbit ring.
    Orbiting,
    /// Emitter: stationary, firing projectiles.
    Shooting,
}

#[derive(Clone)]
pub struct Enemy {
    pub pos: Vec2,
    pub radius: f32,
    pub hp: f32,
    pub speed: f32,
    pub kind: EnemyKind,
    pub state: EnemyState,
    pub state_timer: f32,
    pub charge_dir: Vec2,
    pub color: [f32; 3],
    pub contact_damage: f32,
    pub slow_timer: f32,
    pub no_xp: bool,
}

pub struct XpGem {
    pub pos: Vec2,
    pub value: u32,
    pub life: f32,
}

pub struct Projectile {
    pub pos: Vec2,
    pub vel: Vec2,
    pub life: f32,
    pub damage: f32,
    pub radius: f32,
}

pub struct Crystal {
    pub pos: Vec2,
    pub radius: f32,
    pub drift_vel: Vec2,
}

pub struct Beam {
    pub start: Vec2,
    pub end: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub thickness: f32,
    pub color: [f32; 3],
}

pub struct Particle {
    pub pos: Vec2,
    pub vel: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub color: [f32; 3],
    pub size: f32,
}

/// Orbiting damage source granted by the Halo shard. One per shard level,
/// each orbits at a different radius and angular speed.
pub struct Halo {
    pub angle: f32,
    pub radius: f32,
    pub size: f32,
    pub angular_speed: f32,
}

/// Expanding ring emitted by the Interference shard. Damages any enemy the
/// ring front passes through; rendered as a fading translucent disk.
pub struct InterferencePulse {
    pub pos: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub max_radius: f32,
}

impl InterferencePulse {
    pub fn current_radius(&self) -> f32 {
        (self.life / self.max_life).min(1.0) * self.max_radius
    }
}
