//! Tiny xorshift32 RNG. Deterministic from a seed, zero dependencies.
//! Sufficient for spawn jitter, particle velocities, and visual variation —
//! do not use for anything that needs cryptographic or statistical quality.

pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        // xorshift doesn't tolerate a zero state.
        Self {
            state: if seed == 0 { 0xA5A5_A5A5 } else { seed },
        }
    }

    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / ((1u32 << 24) as f32)
    }

    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + self.unit() * (hi - lo)
    }

    /// Uniform angle in [0, 2π).
    pub fn angle(&mut self) -> f32 {
        self.unit() * std::f32::consts::TAU
    }
}
