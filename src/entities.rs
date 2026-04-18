//! Plain data structs for the entities the game tracks. Logic lives in game.rs.

use glam::Vec2;

pub struct Player {
    pub pos: Vec2,
    pub radius: f32,
    pub speed: f32,
}

pub struct Enemy {
    pub pos: Vec2,
    pub radius: f32,
    pub hp: f32,
    pub speed: f32,
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
