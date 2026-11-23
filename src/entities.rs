//! Plain data structs for the entities the game tracks. Logic lives in game.rs.

use glam::Vec2;

/// Playable starter archetype chosen on the title screen.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PrismCore {
    /// Precision mouse specialist: starts with Lens + Refract, +25% sniper DMG, +1 built-in ricochet, faster Dead-Eye.
    SniperLens = 0,
    /// Hyper-mobility dash assassin: starts with PhaseStep L2 + Momentum, +25% dash reach, 2× warp-slice DMG.
    PhaseBlade = 1,
    /// Classic bullet-heaven prism: starts with Split + Mirror, +15% auto-salvo cadence.
    RefractionNova = 2,
    /// Ghost Duelist specialist: starts with Cascade + Arc + 2 Optical Stacks; 2× stacks & bonus Reroll/Banish from Duels.
    ResonanceConduit = 3,
}

impl PrismCore {
    pub fn from_index(i: u8) -> Self {
        match i {
            1 => Self::PhaseBlade,
            2 => Self::RefractionNova,
            3 => Self::ResonanceConduit,
            _ => Self::SniperLens,
        }
    }
}

pub struct Player {
    pub pos: Vec2,
    pub radius: f32,
    pub speed: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub iframe_timer: f32,
    pub dash_cooldown: f32,
    pub dash_timer: f32,
    pub dash_duration_active: f32,
    pub dash_distance_active: f32,
    pub dash_dir: Vec2,
    pub barrier_hp: f32,
    pub barrier_max: f32,
    pub altitude: f32, // 0.0 (surface) to 1.0 (max altitude)
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EnemyKind {
    Drone = 0,
    Brute = 1,
    Dasher = 2,
    Splitter = 3,
    Orbiter = 4,
    Emitter = 5,
    Pulsar = 6,
    Umbra = 7,
    /// Linked laser-tether pair: dash over the beam or snipe either anchor to snap it.
    Weaver = 8,
    /// Directional front mirror shield that deflects frontal auto-beams; flank or snipe rear core.
    Reflector = 9,
    /// Stationary gravity well that pulls the player & gems inward; high-priority snipe target.
    Anchor = 10,
    /// Predictive teleporter that blinks ahead of your movement vector.
    Stalker = 11,
    /// Fleeing golden crystalline loot beetle carrying a Vacuum Magnet + Reroll + XP cache.
    Carrier = 12,
}

pub const ENEMY_KIND_COUNT: usize = 13;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum MiniBossKind {
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
    /// Stalker: telegraphing predictive phase-blink destination in `charge_dir`.
    Blinking,
    /// Anchor: planted gravity well pulling player & gems inward.
    Anchored,
    /// Carrier: fleeing golden loot beetle before escaping.
    Fleeing,
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
    pub mini_boss: Option<MiniBossKind>,
    /// Chromatic sniper mark: takes +35% damage from all sources & detonates in RGB shards on death.
    pub prism_mark_timer: f32,
    /// Pair identifier for linked Weaver laser-tether anchors (0 = unlinked).
    pub link_id: u32,
    /// When > 0, Reflector's front mirror shield is shattered by a precision snipe or flank.
    pub shield_broken_timer: f32,
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
    /// 5:00 — Tri-shield bastion with radial barrier volleys & shatter stun.
    Sentinel = 0,
    /// 10:00 — 3 RGB elemental heads whose kill order shapes enraged patterns.
    Hydra = 1,
    /// 14:00 — Apex cosmic finale with void shockwaves, pull, weakpoint shards & Ghost summons.
    VoidPrism = 2,
    /// 2:30 — Clockwork rotating laser-spoke boss; snipe relay nodes on spokes to short-circuit beams!
    PrismLattice = 3,
    /// 7:30 — Fast anti-player sniper duelist that dashes, telegraphs sniper rails & spawns mirror decoys!
    MirrorSovereign = 4,
    /// 12:30 — Alternates Solar Flare danger lanes and Lunar Eclipse click-to-detonate prism curtains!
    ChronoEclipse = 5,
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
    // Extended multi-phase boss fields (PrismLattice, MirrorSovereign, ChronoEclipse, Weakpoints)
    pub spoke_angle: f32,
    pub spoke_disabled: [f32; 6],
    pub aux_timer: f32,
    pub stun_timer: f32,
    pub weakpoint_angle: f32,
    pub weakpoint_cooldown: f32,
    pub aim_dir: Vec2,
    pub aim_charge: f32,
    pub decoy_angles: [f32; 2],
    pub lunar_prisms: [(Vec2, bool); 6],
}

pub struct Beam {
    pub start: Vec2,
    pub end: Vec2,
    pub life: f32,
    pub max_life: f32,
    pub thickness: f32,
    pub color: [f32; 3],
    /// True when this beam originated from an Echo re-fire (delayed salvo).
    pub is_echo: bool,
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

/// Descending void projectile fired by Pulsars. Deals area damage on landing.
#[derive(Clone)]
pub struct VoidShell {
    pub pos: Vec2,
    pub target: Vec2,  // surface target position
    pub altitude: f32, // 1.0 (spawned high) to 0.0 (landed)
    pub radius: f32,
    pub descent_speed: f32, // altitude units per second
}

/// Capturable mid-run globe objective ("Prism Obelisk"): stand inside the ring
/// while holding off a Ghost ambush to trigger a purifying wave + Relic Chest!
#[derive(Clone)]
pub struct PrismObelisk {
    pub pos: Vec2,
    pub radius: f32,
    pub progress: f32, // 0.0 .. 1.0
    pub life: f32,
    pub max_life: f32,
    pub ambush_spawned: bool,
}

/// Real or seeded player ghost profile used to parameterize invading pink Ghost Snipers.
#[allow(dead_code)]
#[derive(Copy, Clone, Debug)]
pub struct GhostProfile {
    pub id: u32,
    pub core: u8,
    pub style: u8, // 0 = Flick Duelist, 1 = Track Hunter, 2 = Tri-Clone Sniper
    pub peak_rank: u32,
    pub aim_tier: u32,
    pub hue: f32,
}
