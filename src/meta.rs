use crate::math::Rng;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Copy, Clone, Default)]
pub struct WaveParams {
    pub amplitude: f32,
    pub frequency: f32,
    pub phase: f32,
}

#[wasm_bindgen]
#[derive(Copy, Clone, Default)]
pub struct RunModifiers {
    pub enemy_mass: f32,   // Wave 1 alignment
    pub game_speed: f32,   // Wave 2 alignment
    pub refraction: f32,   // Wave 3 alignment
    pub is_jackpot: bool,
    pub is_glitch: bool,
}

#[wasm_bindgen]
pub struct Interferometer {
    rng: Rng,
    pub w1: WaveParams,
    pub w2: WaveParams,
    pub w3: WaveParams,
    pub resonance: u32,
}

#[wasm_bindgen]
impl Interferometer {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32, initial_resonance: u32) -> Self {
        let mut rng = Rng::new(seed);
        Self {
            w1: Self::random_wave(&mut rng),
            w2: Self::random_wave(&mut rng),
            w3: Self::random_wave(&mut rng),
            resonance: initial_resonance,
            rng,
        }
    }

    fn random_wave(rng: &mut Rng) -> WaveParams {
        // Quantize random values slightly so alignments are actually possible
        let amplitudes = [0.5, 0.75, 1.0, 1.25, 1.5];
        let frequencies = [0.5, 1.0, 1.5, 2.0];
        let phases = [0.0, std::f32::consts::PI / 4.0, std::f32::consts::PI / 2.0, std::f32::consts::PI, std::f32::consts::PI * 1.5];
        
        WaveParams {
            amplitude: amplitudes[(rng.next_u32() as usize) % amplitudes.len()],
            frequency: frequencies[(rng.next_u32() as usize) % frequencies.len()],
            phase: phases[(rng.next_u32() as usize) % phases.len()],
        }
    }

    pub fn w1_amp(&self) -> f32 { self.w1.amplitude }
    pub fn w1_freq(&self) -> f32 { self.w1.frequency }
    pub fn w1_phase(&self) -> f32 { self.w1.phase }
    
    pub fn w2_amp(&self) -> f32 { self.w2.amplitude }
    pub fn w2_freq(&self) -> f32 { self.w2.frequency }
    pub fn w2_phase(&self) -> f32 { self.w2.phase }
    
    pub fn w3_amp(&self) -> f32 { self.w3.amplitude }
    pub fn w3_freq(&self) -> f32 { self.w3.frequency }
    pub fn w3_phase(&self) -> f32 { self.w3.phase }

    pub fn spin(&mut self, lock_w1: bool, lock_w2: bool, lock_w3: bool) -> bool {
        let cost = 10 + (lock_w1 as u32 * 20) + (lock_w2 as u32 * 20) + (lock_w3 as u32 * 20);
        if self.resonance < cost {
            return false;
        }
        self.resonance -= cost;
        
        if !lock_w1 { self.w1 = Self::random_wave(&mut self.rng); }
        if !lock_w2 { self.w2 = Self::random_wave(&mut self.rng); }
        if !lock_w3 { self.w3 = Self::random_wave(&mut self.rng); }
        
        true
    }

    pub fn evaluate(&self) -> RunModifiers {
        let mut mods = RunModifiers {
            enemy_mass: self.w1.amplitude * self.w1.frequency,
            game_speed: self.w2.amplitude * self.w2.frequency,
            refraction: self.w3.amplitude * self.w3.frequency,
            is_jackpot: false,
            is_glitch: false,
        };

        // Check alignments.
        let a12_match = (self.w1.amplitude - self.w2.amplitude).abs() < 0.1 && 
                        (self.w1.frequency - self.w2.frequency).abs() < 0.1;
        let a23_match = (self.w2.amplitude - self.w3.amplitude).abs() < 0.1 && 
                        (self.w2.frequency - self.w3.frequency).abs() < 0.1;

        let p12_match = (self.w1.phase - self.w2.phase).abs() < 0.1 || (self.w1.phase - self.w2.phase).abs() > std::f32::consts::PI * 1.9;
        let p13_out = (self.w1.phase - self.w3.phase).abs() > std::f32::consts::PI * 0.8 && (self.w1.phase - self.w3.phase).abs() < std::f32::consts::PI * 1.2;

        if a12_match && a23_match && p12_match && !p13_out {
            mods.is_jackpot = true;
            mods.enemy_mass = 2.0;
            mods.game_speed = 1.5;
            mods.refraction = 2.0;
        } else if a12_match && p13_out {
            mods.is_glitch = true;
            mods.enemy_mass = 0.5; // low mass
            mods.game_speed = 2.0; // very fast
            mods.refraction = 0.5; // low refraction
        }

        mods
    }
}
