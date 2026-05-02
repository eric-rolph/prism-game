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
    pub altitude: f32, // 0.0 (surface) to 1.0 (max altitude)
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EnemyKind {
    Drone,
    Brute,
    Dasher,
    Splitter,
    Orbiter,
    Emitter,
    Pulsar,
    Umbra,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum MiniBossKind {
    VoidSpawn,
    Bulwark,
    Riftcaller,
    MirrorWraith,
    SplitCore,
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
    /// Pulsar: swelling area-denial pulse.
    Pulsing,
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
    pub spawn_grace: f32,
    pub surface_time: f32, // seconds spent drifting on the surface
    pub mini_boss: Option<MiniBossKind>,
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

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum BossKind {
    Sentinel,
    Hydra,
    VoidPrism,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum BossState {
    Telegraphing,
    Active,
    Dying,
}

pub struct Boss {
    pub kind: BossKind,
    pub pos: Vec2,
    pub radius: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub speed: f32,
    pub contact_damage: f32,
    pub state: BossState,
    pub state_timer: f32,
    pub active_time: f32,
    pub phase: u8,
    // Sentinel fields
    pub shield_angle: f32,
    pub shield_hp: [f32; 3],
    // Hydra fields
    pub lobe_hp: [f32; 3],
    pub lobe_alive: [bool; 3],
    pub lobe_orbit: f32,
    pub fire_timer: f32,
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

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PulseKind {
    Interference,
    Mine,
    DashBlast,
}

/// Expanding ground pulse emitted by Interference, mines, or dash blasts.
/// Damages enemies as the ring front passes through them.
pub struct InterferencePulse {
    pub pos: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub max_radius: f32,
    pub kind: PulseKind,
    pub damage_multiplier: f32,
}

impl InterferencePulse {
    pub fn current_radius(&self) -> f32 {
        (self.life / self.max_life).min(1.0) * self.max_radius
    }
}

/// Expanding shockwave ring emitted by the Void Prism boss. Damages the player
/// when the ring front passes through them; rendered as a dark fading ring.
pub struct VoidShockwave {
    pub pos: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub max_radius: f32,
    pub damage: f32,
    /// Tracks whether the player has already been hit by this shockwave.
    pub hit_player: bool,
}

impl VoidShockwave {
    pub fn current_radius(&self) -> f32 {
        (self.life / self.max_life).clamp(0.0, 1.0) * self.max_radius
    }
}

/// Lingering slow-zone left by a frozen enemy killed with Blizzard active.
pub struct FrostField {
    pub pos: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub radius: f32,
}

/// Corruption left on the surface by lingering enemies.
pub struct CorruptionPatch {
    pub pos: Vec2,
    pub radius: f32,
    pub level: f32,          // 0.0 to 1.0
    pub age: f32,            // seconds since spawn
    pub spawn_cooldown: f32, // remaining cooldown before next Void Spawn can emerge
}

/// Descending void projectile fired by Pulsars. Corrupts and deals area damage on landing.
#[derive(Clone)]
pub struct VoidShell {
    pub pos: Vec2,
    pub target: Vec2,  // surface target position
    pub altitude: f32, // 1.0 (spawned high) to 0.0 (landed)
    pub radius: f32,
    pub descent_speed: f32, // altitude units per second
}
