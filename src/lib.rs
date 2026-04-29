mod entities;
mod game;
mod math;
mod shards;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&format!("{info}").into());
    }));
}

/// GPU instance data for a colored, glowing SDF circle. 8 × f32 = 32 bytes.
#[repr(C)]
#[derive(Copy, Clone, Default)]
pub struct CircleInstance {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
    pub glow: f32,
}

/// GPU instance data for a colored, glowing beam (capsule). 10 × f32 = 40 bytes.
#[repr(C)]
#[derive(Copy, Clone, Default)]
pub struct BeamInstance {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub thickness: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
    pub glow: f32,
}

#[wasm_bindgen]
pub struct Game {
    inner: game::Game,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(width: f32, height: f32, seed: u32) -> Game {
        Game {
            inner: game::Game::new(width, height, seed),
        }
    }

    pub fn resize(&mut self, width: f32, height: f32) {
        self.inner.resize(width, height);
    }

    pub fn set_input(&mut self, x: f32, y: f32) {
        self.inner.set_input(x, y);
    }

    pub fn set_dash_input(&mut self, pressed: bool) {
        self.inner.set_dash_input(pressed);
    }

    pub fn update(&mut self, dt: f32) {
        self.inner.update(dt);
    }

    pub fn camera_x(&self) -> f32 {
        self.inner.camera().x
    }
    pub fn camera_y(&self) -> f32 {
        self.inner.camera().y
    }

    // Zero-copy instance buffers.
    pub fn circles_ptr(&self) -> *const CircleInstance {
        self.inner.circles().as_ptr()
    }
    pub fn circles_len(&self) -> usize {
        self.inner.circles().len()
    }
    pub fn beams_ptr(&self) -> *const BeamInstance {
        self.inner.beams().as_ptr()
    }
    pub fn beams_len(&self) -> usize {
        self.inner.beams().len()
    }

    // --- Progression / shard queries ---

    pub fn xp(&self) -> u32 {
        self.inner.xp()
    }
    pub fn xp_needed(&self) -> u32 {
        self.inner.xp_needed()
    }
    pub fn rank(&self) -> u32 {
        self.inner.rank()
    }
    pub fn kills_total(&self) -> u32 {
        self.inner.kills_total()
    }
    pub fn is_leveling_up(&self) -> bool {
        self.inner.is_leveling_up()
    }

    /// Shard kind index (0..16) for the given choice slot (0..3), or -1 if empty.
    pub fn level_choice(&self, slot: u8) -> i32 {
        self.inner.level_choice(slot)
    }

    /// The current level (0..6) of the given shard kind index (0..16).
    pub fn inventory_level(&self, kind: u8) -> u8 {
        self.inner.inventory_level(kind)
    }
    /// Bitmask: bit i set if SYNERGIES[i] is fully active (both shards ≥ 3).
    pub fn active_synergy_bits(&self) -> u32 {
        self.inner.active_synergy_bits()
    }
    /// Bitmask: bit i set if SYNERGIES[i] is near-active (one shard ≥ 3, the other ≥ 1).
    pub fn near_synergy_bits(&self) -> u32 {
        self.inner.near_synergy_bits()
    }

    /// Commit a level-up choice by slot (0..3). No-op outside of a pause.
    pub fn select_shard(&mut self, slot: u8) {
        self.inner.select_shard(slot);
    }

    // --- Health / death ---

    pub fn hp(&self) -> f32 {
        self.inner.hp()
    }
    pub fn max_hp(&self) -> f32 {
        self.inner.max_hp()
    }
    pub fn barrier_hp(&self) -> f32 {
        self.inner.barrier_hp()
    }
    pub fn barrier_max(&self) -> f32 {
        self.inner.barrier_max()
    }
    pub fn is_dead(&self) -> bool {
        self.inner.is_dead()
    }
    pub fn score(&self) -> u32 {
        self.inner.score()
    }
    pub fn restart(&mut self) {
        self.inner.restart();
    }

    // --- Screen shake ---

    pub fn shake_x(&self) -> f32 {
        self.inner.shake_x()
    }
    pub fn shake_y(&self) -> f32 {
        self.inner.shake_y()
    }

    // --- Timer / wave ---

    pub fn timer(&self) -> f32 {
        self.inner.timer()
    }
    pub fn wave(&self) -> u32 {
        self.inner.wave()
    }

    pub fn dash_cooldown_pct(&self) -> f32 {
        self.inner.dash_cooldown_pct()
    }

    pub fn wave_clear_timer(&self) -> f32 {
        self.inner.wave_clear_timer()
    }

    pub fn is_victory(&self) -> bool {
        self.inner.is_victory()
    }

    pub fn arena_radius(&self) -> f32 {
        self.inner.arena_radius()
    }
}
