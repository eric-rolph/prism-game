use glam::Vec2;
use wasm_bindgen::prelude::*;

/// Called automatically by wasm-bindgen when the module loads.
/// Wires Rust panics into the browser console so we can actually debug them.
#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&format!("{info}").into());
    }));
}

/// Game state. For step 1 this is just a ticking clock and a player position;
/// the shape is deliberately small so we can grow into it without refactors.
#[wasm_bindgen]
pub struct Game {
    time: f32,
    player: Vec2,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(width: f32, height: f32) -> Game {
        Game {
            time: 0.0,
            player: Vec2::new(width * 0.5, height * 0.5),
        }
    }

    /// Step the simulation by `dt` seconds. JS calls this once per animation frame.
    pub fn update(&mut self, dt: f32) {
        self.time += dt;
    }

    // Scalar getters. wasm-bindgen doesn't let us return Vec2 directly without
    // extra machinery, and for step 1 two floats are fine. We'll switch to a
    // shared memory draw-command buffer in step 2.
    pub fn time(&self) -> f32 {
        self.time
    }
    pub fn player_x(&self) -> f32 {
        self.player.x
    }
    pub fn player_y(&self) -> f32 {
        self.player.y
    }
}
