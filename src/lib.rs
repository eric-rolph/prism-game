mod entities;
mod game;
mod math;
mod shards;
mod spatial;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&format!("{info}").into());
    }));
}

/// GPU instance data for colored, glowing SDF geometry. 9 × f32 = 36 bytes.
/// `shape` selects the GPU SDF silhouette:
/// - `0.0` = soft luminous sphere / aura / particle
/// - `1.0` = rotating faceted crystal diamond (XP radiance gems, shard crystals)
/// - `2.0` = beveled crystalline hexagon (crystal obstacles, shields, mines, brutes)
/// - `3.0` = razor geometric chevron / shard (drones, dashers, umbra)
/// - `4.0` = hollow optical wave ring with chromatic rim (pulses, barrier, shockwaves, telegraphs)
/// - `5.0` = faceted spinning prismatic hero core (player prism)
/// - `6.0` = radiant crystalline starburst / octagon (elites, orbiters, pulsars, bosses)
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
    pub shape: f32,
}

/// Per-frame floating combat popup record. 4 × f32 = 16 bytes.
/// `kind`: 0 = normal hit, 1 = crit / heavy / boss hit, 2 = siphon heal, 3 = shield/boss break.
#[repr(C)]
#[derive(Copy, Clone, Default)]
pub struct DamagePopup {
    pub x: f32,
    pub y: f32,
    pub value: f32,
    pub kind: f32,
}

/// Per-frame FPS Aim-Trainer Resonance Target record. 8 × f32 = 32 bytes.
/// `kind`: 0 = Flick Chain, 1 = Smooth Track Orb, 2 = Micro-Cluster.
#[repr(C)]
#[derive(Copy, Clone, Default)]
pub struct AimTargetInstance {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub kind: f32,
    pub progress: f32,
    pub life_frac: f32,
    pub step: f32,
    pub total: f32,
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

    pub fn set_aim_input(
        &mut self,
        offset_x: f32,
        offset_y: f32,
        active: bool,
        clicked: bool,
        held: bool,
    ) {
        self.inner
            .set_aim_input(offset_x, offset_y, active, clicked, held);
    }

    pub fn player_altitude(&self) -> f32 {
        self.inner.player_altitude()
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
    pub fn popups_ptr(&self) -> *const DamagePopup {
        self.inner.popups().as_ptr()
    }
    pub fn popups_len(&self) -> usize {
        self.inner.popups().len()
    }
    pub fn aim_targets_ptr(&self) -> *const AimTargetInstance {
        self.inner.aim_targets().as_ptr()
    }
    pub fn aim_targets_len(&self) -> usize {
        self.inner.aim_targets().len()
    }

    // --- FPS Aim-Trainer telemetry ---

    pub fn aim_tier(&self) -> u32 {
        self.inner.aim_tier()
    }
    pub fn aim_combo(&self) -> u32 {
        self.inner.aim_combo()
    }
    pub fn peak_aim_combo(&self) -> u32 {
        self.inner.peak_aim_combo()
    }
    pub fn aim_hits(&self) -> u32 {
        self.inner.aim_hits()
    }
    pub fn aim_shots(&self) -> u32 {
        self.inner.aim_shots()
    }
    pub fn aim_drills_completed(&self) -> u32 {
        self.inner.aim_drills_completed()
    }
    pub fn aim_tracking_active(&self) -> bool {
        self.inner.aim_tracking_active()
    }
    pub fn aim_track_progress(&self) -> f32 {
        self.inner.aim_track_progress()
    }
    pub fn aim_last_hit_x(&self) -> f32 {
        self.inner.aim_last_hit_camera_pos().x
    }
    pub fn aim_last_hit_y(&self) -> f32 {
        self.inner.aim_last_hit_camera_pos().y
    }
    pub fn aim_has_prev_link(&self) -> bool {
        self.inner.aim_has_prev_link()
    }
    pub fn aim_hovering_target(&self) -> bool {
        self.inner.aim_hovering_target()
    }

    // --- Combat juice, telemetry & endless mode ---

    pub fn kill_streak(&self) -> u32 {
        self.inner.kill_streak()
    }
    pub fn peak_kill_streak(&self) -> u32 {
        self.inner.peak_kill_streak()
    }
    pub fn kill_streak_timer_pct(&self) -> f32 {
        self.inner.kill_streak_timer_pct()
    }
    pub fn screen_flash(&self) -> f32 {
        self.inner.screen_flash()
    }
    pub fn damage_flash(&self) -> f32 {
        self.inner.damage_flash()
    }
    pub fn hit_stop_pulse(&self) -> f32 {
        self.inner.hit_stop_pulse()
    }
    pub fn total_damage_dealt(&self) -> f32 {
        self.inner.total_damage_dealt()
    }
    pub fn boss_world_x(&self) -> f32 {
        self.inner.boss_camera_pos().x
    }
    pub fn boss_world_y(&self) -> f32 {
        self.inner.boss_camera_pos().y
    }
    pub fn enemy_count(&self) -> u32 {
        self.inner.enemy_count()
    }
    pub fn is_endless(&self) -> bool {
        self.inner.is_endless()
    }
    pub fn continue_endless(&mut self) {
        self.inner.continue_endless();
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
    pub fn seed(&self) -> u32 {
        self.inner.seed()
    }
    pub fn is_leveling_up(&self) -> bool {
        self.inner.is_leveling_up()
    }

    /// Offer type for the given choice slot: 0 = shard, 1 = evolution, -1 = empty.
    pub fn level_choice_type(&self, slot: u8) -> i32 {
        self.inner.level_choice_type(slot)
    }

    /// Offer index for the given choice slot, or -1 if empty.
    pub fn level_choice(&self, slot: u8) -> i32 {
        self.inner.level_choice(slot)
    }

    /// The current level (0..6) of the given shard kind index (0..22).
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
    pub fn active_evolution_bits(&self) -> u32 {
        self.inner.active_evolution_bits()
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

    pub fn boss_active(&self) -> bool {
        self.inner.boss_active()
    }

    pub fn boss_kind_index(&self) -> i32 {
        self.inner.boss_kind_index()
    }

    pub fn boss_hp_pct(&self) -> f32 {
        self.inner.boss_hp_pct()
    }

    pub fn arena_radius(&self) -> f32 {
        self.inner.arena_radius()
    }

    // --- Level-up skip ---

    pub fn skip_level_up(&mut self) {
        self.inner.skip_level_up();
    }
    pub fn reroll_level_up(&mut self) {
        self.inner.reroll_level_up();
    }
    pub fn reroll_charges(&self) -> u32 {
        self.inner.reroll_charges()
    }

    // --- Run telemetry ---

    pub fn damage_taken(&self) -> f32 {
        self.inner.damage_taken()
    }
    pub fn barrier_absorbed(&self) -> f32 {
        self.inner.barrier_absorbed()
    }
    pub fn gems_collected(&self) -> u32 {
        self.inner.gems_collected()
    }
    pub fn kills_by_kind(&self, kind_idx: u8) -> u32 {
        self.inner.kills_by_kind(kind_idx)
    }
    pub fn peak_rank(&self) -> u32 {
        self.inner.peak_rank()
    }
    pub fn boss_kills_count(&self) -> u32 {
        self.inner.boss_kills_count()
    }
    pub fn damage_by_source(&self, source_idx: u8) -> f32 {
        self.inner.damage_by_source(source_idx)
    }
    pub fn death_cause(&self) -> i32 {
        self.inner.death_cause()
    }
    pub fn rank_at_minute(&self, minute_idx: u8) -> u32 {
        self.inner.rank_at_minute(minute_idx)
    }
    pub fn upgrade_pick_count(&self) -> u32 {
        self.inner.upgrade_pick_count()
    }
    pub fn upgrade_pick_type(&self, pick_idx: u32) -> i32 {
        self.inner.upgrade_pick_type(pick_idx)
    }
    pub fn upgrade_pick_index(&self, pick_idx: u32) -> i32 {
        self.inner.upgrade_pick_index(pick_idx)
    }
    pub fn upgrade_pick_time(&self, pick_idx: u32) -> f32 {
        self.inner.upgrade_pick_time(pick_idx)
    }
    pub fn skip_count(&self) -> u32 {
        self.inner.skip_count()
    }
    pub fn reroll_count(&self) -> u32 {
        self.inner.reroll_count()
    }
    pub fn synergy_time(&self, synergy_idx: u8) -> f32 {
        self.inner.synergy_time(synergy_idx)
    }
    pub fn max_enemies_observed(&self) -> u32 {
        self.inner.max_enemies_observed()
    }
    pub fn max_circles_observed(&self) -> u32 {
        self.inner.max_circles_observed()
    }
    pub fn max_beams_observed(&self) -> u32 {
        self.inner.max_beams_observed()
    }

    // --- Per-frame audio events ---

    pub fn audio_beam_count(&self) -> u32 {
        self.inner.audio_beam_count()
    }
    pub fn audio_kill_count(&self) -> u32 {
        self.inner.audio_kill_count()
    }
    pub fn audio_gem_count(&self) -> u32 {
        self.inner.audio_gem_count()
    }
    pub fn audio_event_bits(&self) -> u32 {
        self.inner.audio_event_bits()
    }
}
