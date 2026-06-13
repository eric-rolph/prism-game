//! Deterministic smoke tests for the simulation. These run natively via
//! `cargo test` — the sim is pure Rust with no web dependencies.
//!
//! The `boss_ttk_report` test is #[ignore]d: it is a balance-evidence
//! harness, not a pass/fail gate. Run it with:
//!   cargo test --release boss_ttk_report -- --ignored --nocapture

use super::*;
use crate::shards::{EVOLUTION_COUNT, SHARD_COUNT};

const DT: f32 = 1.0 / 60.0;

fn new_game(seed: u32) -> Game {
    Game::new(1280.0, 800.0, seed)
}

/// Deterministic wander input derived from the frame counter only.
fn wander_input(frame: u32) -> Vec2 {
    let a = frame as f32 * 0.013;
    Vec2::new(a.cos(), (a * 0.7).sin())
}

/// Step the game, resolving any level-up by picking slot 0.
fn step(g: &mut Game, frames: u32) {
    for f in 0..frames {
        if g.is_leveling_up() {
            g.select_shard(0);
        }
        let dir = wander_input(f);
        g.set_input(dir.x, dir.y);
        g.update(DT);
    }
}

fn god_mode(g: &mut Game) {
    g.player.max_hp = 1.0e9;
    g.player.hp = 1.0e9;
}

fn set_build(g: &mut Game, build: &[(ShardKind, u8)]) {
    for &(kind, level) in build {
        g.inventory.levels[kind.as_index()] = level;
    }
    g.rebuild_halos();
}

fn state_fingerprint(g: &Game) -> (u32, u32, u32, u32, u32, u32, usize, u32) {
    (
        g.time.to_bits(),
        g.player.pos.x.to_bits(),
        g.player.pos.y.to_bits(),
        g.player.hp.to_bits(),
        g.xp,
        g.kills_total,
        g.enemies.len(),
        g.score,
    )
}

#[test]
fn same_seed_same_input_is_deterministic() {
    let mut a = new_game(12345);
    let mut b = new_game(12345);
    step(&mut a, 3000);
    step(&mut b, 3000);
    assert_eq!(
        state_fingerprint(&a),
        state_fingerprint(&b),
        "two sims with the same seed and input script diverged"
    );
}

#[test]
fn different_seeds_diverge() {
    let mut a = new_game(1);
    let mut b = new_game(2);
    step(&mut a, 1200);
    step(&mut b, 1200);
    assert_ne!(
        state_fingerprint(&a),
        state_fingerprint(&b),
        "different seeds produced identical runs — RNG is not seeded"
    );
}

#[test]
fn onramp_spawn_interval_eases_to_steady_state() {
    let mut g = new_game(7);
    // At t = 0 the interval carries the full on-ramp boost.
    g.time = 0.0;
    g.wave = 0;
    let at_start = g.spawn_rate_for_wave();
    // Past the ramp window the formula must equal the steady-state value.
    g.time = ONRAMP_DURATION;
    let at_steady = g.spawn_rate_for_wave();
    g.time = ONRAMP_DURATION + 60.0;
    let past_steady = g.spawn_rate_for_wave();

    let minute = ONRAMP_DURATION / 60.0;
    let expected_steady = 0.34 - minute * 0.006; // wave 0, Steady shape
    assert!(
        (at_steady - expected_steady).abs() < 1e-5,
        "interval at the end of the ramp should match the steady formula: {at_steady} vs {expected_steady}"
    );
    assert!(
        at_start > at_steady * 1.8,
        "opening interval should be much longer than steady state: {at_start} vs {at_steady}"
    );
    // Inert past the window: only the wave/minute terms move it.
    let minute2 = (ONRAMP_DURATION + 60.0) / 60.0;
    let expected2 = 0.34 - minute2 * 0.006;
    assert!((past_steady - expected2).abs() < 1e-5);
}

#[test]
fn onramp_caps_first_three_waves_only() {
    let mut g = new_game(7);
    g.time = 0.0;
    g.wave = 0;
    assert_eq!(g.enemy_cap_for_wave(), ONRAMP_CAP_BASE);
    g.wave = 1;
    assert_eq!(g.enemy_cap_for_wave(), ONRAMP_CAP_BASE + ONRAMP_CAP_PER_WAVE);
    g.wave = 2;
    assert_eq!(
        g.enemy_cap_for_wave(),
        ONRAMP_CAP_BASE + 2 * ONRAMP_CAP_PER_WAVE
    );
    // Wave 3 on: the unclamped formula.
    g.wave = 3;
    assert_eq!(
        g.enemy_cap_for_wave(),
        BASE_ENEMY_CAP + 3 * ENEMY_CAP_PER_WAVE
    );
}

#[test]
fn first_wave_cycle_is_steady_then_rotation_unchanged() {
    let mut g = new_game(7);
    for w in 0..5u32 {
        g.wave = w;
        assert_eq!(g.wave_shape(), WaveShape::Steady, "wave {w} must be Steady");
    }
    let expected = [
        WaveShape::Steady,
        WaveShape::Surge,
        WaveShape::Swarm,
        WaveShape::Elite,
        WaveShape::Crescendo,
    ];
    for w in 5..15u32 {
        g.wave = w;
        assert_eq!(
            g.wave_shape(),
            expected[(w % 5) as usize],
            "wave {w} shape must follow the original modulo cycle"
        );
    }
}

#[test]
fn early_spawns_respect_the_onramp_cap() {
    let mut g = new_game(99);
    god_mode(&mut g); // survive regardless of input
    for f in 0..3600u32 {
        if g.is_leveling_up() {
            g.select_shard(0);
        }
        let dir = wander_input(f);
        g.set_input(dir.x, dir.y);
        g.update(DT);
        // Waves 0-1 only spawn Drones/Brutes — no cap-bypassing spawn paths.
        if g.wave < 2 {
            let cap = g.enemy_cap_for_wave();
            assert!(
                g.enemies.len() <= cap,
                "enemy count {} exceeded cap {} at t={:.1}",
                g.enemies.len(),
                cap,
                g.time
            );
        }
    }
}

#[test]
fn level_up_offers_three_choices_and_applies_pick() {
    let mut g = new_game(42);
    g.xp = xp_for_rank(1);
    g.check_for_level_up();
    assert!(g.is_leveling_up(), "granting enough XP must open the picker");
    let mut valid = 0;
    for slot in 0..3u8 {
        if g.level_choices[slot as usize].is_some() {
            valid += 1;
        }
    }
    assert_eq!(valid, 3, "a fresh rank-up should offer three choices");

    let offer = g.level_choices[0];
    g.select_shard(0);
    assert!(!g.is_leveling_up(), "selecting must close the picker");
    if let Some(UpgradeOffer::Shard(kind)) = offer {
        assert!(
            g.inventory.level(kind) >= 1,
            "picked shard must gain a level"
        );
    }
    assert_eq!(g.rank, 1);
}

#[test]
fn lethal_contact_kills_and_records_cause() {
    let mut g = new_game(5);
    g.player.hp = 1.0;
    g.player.iframe_timer = 0.0;
    // Park a brute directly on the player.
    let pos = g.player.pos;
    g.enemies.push(Enemy {
        pos,
        radius: 20.0,
        hp: 1000.0,
        speed: 0.0,
        kind: EnemyKind::Brute,
        state: EnemyState::Drifting,
        state_timer: 0.0,
        charge_dir: Vec2::ZERO,
        color: [1.0, 0.0, 0.0],
        contact_damage: 50.0,
        slow_timer: 0.0,
        no_xp: true,
        spawn_grace: 0.0,
        mini_boss: None,
    });
    for _ in 0..120 {
        if g.is_dead() {
            break;
        }
        g.set_input(0.0, 0.0);
        g.update(DT);
    }
    assert!(g.is_dead(), "1 HP player standing in a brute must die");
    assert!(!g.is_victory());
    assert!(g.death_cause() >= 0, "death cause must be recorded");
}

#[test]
fn surviving_the_session_is_a_victory() {
    let mut g = new_game(5);
    god_mode(&mut g);
    g.time = SESSION_LENGTH - 0.5;
    for _ in 0..120 {
        if g.is_dead() {
            break;
        }
        g.update(DT);
    }
    assert!(g.is_dead(), "the run must end at the session cap");
    assert!(g.is_victory(), "reaching 15:00 must count as a victory");
}

#[test]
fn boss_milestones_spawn_in_order() {
    let mut g = new_game(11);
    god_mode(&mut g);

    g.time = SENTINEL_SPAWN_TIME;
    g.maybe_spawn_sentinel();
    assert!(g.boss.is_some(), "sentinel must spawn at its milestone");
    assert_eq!(g.boss.as_ref().unwrap().kind, BossKind::Sentinel);
    assert!(g.sentinel_spawned);
    // A second call must not double-spawn.
    g.maybe_spawn_sentinel();
    assert_eq!(g.boss.as_ref().unwrap().kind, BossKind::Sentinel);

    g.boss = None;
    g.time = HYDRA_SPAWN_TIME;
    g.maybe_spawn_hydra();
    assert_eq!(g.boss.as_ref().unwrap().kind, BossKind::Hydra);

    g.boss = None;
    g.time = VOID_PRISM_SPAWN_TIME;
    g.maybe_spawn_void_prism();
    assert_eq!(g.boss.as_ref().unwrap().kind, BossKind::VoidPrism);
}

#[test]
fn killing_the_void_prism_ends_the_run_in_victory() {
    let mut g = new_game(11);
    god_mode(&mut g);
    g.time = VOID_PRISM_SPAWN_TIME;
    g.maybe_spawn_void_prism();
    assert!(g.boss.is_some());
    // Skip the telegraph, then leave it one hit from death.
    {
        let boss = g.boss.as_mut().unwrap();
        boss.state = BossState::Active;
        boss.state_timer = 0.0;
        boss.hp = 1.0;
    }
    for f in 0..1200u32 {
        if g.is_dead() {
            break;
        }
        if g.is_leveling_up() {
            g.select_shard(0);
        }
        // Stay put; auto-fire targets the boss even with no enemies around.
        g.enemies.clear();
        let dir = wander_input(f);
        g.set_input(dir.x * 0.3, dir.y * 0.3);
        g.update(DT);
    }
    assert!(g.is_dead(), "run must end when the Void Prism dies");
    assert!(
        g.is_victory(),
        "killing the final boss must count as a victory"
    );
    assert_eq!(g.boss_kills, 1);
}

#[test]
fn void_shell_lands_and_damages_nearby_player() {
    let mut g = new_game(3);
    g.player.hp = 100.0;
    g.player.max_hp = 100.0;
    g.player.iframe_timer = 0.0;
    let target = g.player.pos;
    g.void_shells.push(VoidShell {
        pos: target,
        target,
        altitude: 0.05,
        radius: VOID_SHELL_RADIUS,
        descent_speed: 1.0 / VOID_SHELL_DESCENT_TIME,
    });
    let hp_before = g.player.hp;
    for _ in 0..30 {
        g.set_input(0.0, 0.0);
        g.update(DT);
        if g.void_shells.is_empty() {
            break;
        }
    }
    assert!(g.void_shells.is_empty(), "shell must land and be consumed");
    assert!(
        g.player.hp < hp_before,
        "landing next to the player must deal damage"
    );
}

#[test]
fn five_minute_run_survives_without_panicking() {
    let mut g = new_game(2026);
    god_mode(&mut g);
    let mut last_time = 0.0f32;
    let mut f = 0u32;
    // Run on game time (level-up frames pause the clock), with a hard cap.
    while g.time < 302.0 && f < 30_000 {
        f += 1;
        if g.is_leveling_up() {
            g.select_shard(0);
        }
        let dir = wander_input(f);
        g.set_input(dir.x, dir.y);
        g.set_dash_input(f % 300 == 0);
        g.update(DT);
        debug_assert!(g.time >= last_time, "time must be monotonic");
        last_time = g.time;
    }
    assert!(g.time >= 302.0, "sim must reach the five-minute mark");
    assert!(g.kills_total > 0, "auto-fire must kill something in 5 minutes");
    assert!(g.boss.is_some() || g.sentinel_spawned, "sentinel milestone must fire");
}

// ---------------------------------------------------------------------------
// Balance evidence harness (not a pass/fail gate).
// ---------------------------------------------------------------------------

/// Measure how long a reference build takes to kill a boss, from the first
/// Active frame to the boss slot clearing (includes the 1 s death animation).
/// The player is invulnerable, orbits the boss, and the arena is kept clear
/// of regular enemies so beams always target the boss.
fn measure_boss_ttk(kind: BossKind, build: &[(ShardKind, u8)], seed: u32) -> Option<f32> {
    // Close-range builds (Halo/Barrier) only deal damage near the boss; hug it.
    // Beam builds hold a comfortable mid-range orbit.
    let close_range = build
        .iter()
        .any(|&(k, _)| k == ShardKind::Halo || k == ShardKind::Barrier);
    let (orbit_near, orbit_far) = if close_range { (40.0, 90.0) } else { (160.0, 220.0) };
    let mut g = new_game(seed);
    god_mode(&mut g);
    set_build(&mut g, build);
    match kind {
        BossKind::Sentinel => {
            g.time = SENTINEL_SPAWN_TIME;
            g.maybe_spawn_sentinel();
        }
        BossKind::Hydra => {
            g.time = HYDRA_SPAWN_TIME;
            g.maybe_spawn_hydra();
        }
        BossKind::VoidPrism => {
            g.time = VOID_PRISM_SPAWN_TIME;
            g.maybe_spawn_void_prism();
        }
    }
    assert!(g.boss.is_some());

    let mut fight_time = 0.0f32;
    let mut started = false;
    let max_fight = 240.0f32;
    let mut frame = 0u32;
    while g.boss.is_some() && fight_time < max_fight && !g.is_dead() {
        if g.is_leveling_up() {
            g.skip_level_up(); // keep the reference build frozen
            continue;
        }
        g.enemies.clear();
        g.gems.clear();
        let active = g
            .boss
            .as_ref()
            .map(|b| b.state != BossState::Telegraphing)
            .unwrap_or(false);
        if active {
            started = true;
        }
        // Orbit the boss to vary the attack angle (matters for Sentinel shields).
        let input = if let Some(b) = &g.boss {
            let to_boss = nearest_globe_delta(g.player.pos, b.pos);
            let dist = to_boss.length();
            let tangent = Vec2::new(-to_boss.y, to_boss.x).normalize_or_zero();
            let radial = to_boss.normalize_or_zero();
            // Hold the build's preferred orbit band.
            let correction = if dist > orbit_far {
                radial
            } else if dist < orbit_near {
                -radial
            } else {
                Vec2::ZERO
            };
            (tangent * 0.8 + correction).normalize_or_zero()
        } else {
            Vec2::ZERO
        };
        g.set_input(input.x, input.y);
        g.update(DT);
        if started {
            fight_time += DT;
        }
        frame += 1;
        if frame > 60 * 300 {
            break;
        }
    }
    (g.boss.is_none() && started && fight_time < max_fight).then_some(fight_time)
}

// ---------------------------------------------------------------------------
// Baseline full-run harness (roadmap Near-Term #3): three archetypes play the
// whole 15:00 session with a shared survival pilot, so differences between
// archetypes reflect build power, not pilot skill. Evidence, not a gate.
// ---------------------------------------------------------------------------

/// How an archetype spends level-ups.
#[derive(Copy, Clone)]
enum PickPolicy {
    /// "Normal input, no forced build": take the first offered slot.
    FirstOffer,
    /// Committed path: take the best-ranked matching offer (evolutions always
    /// count), reroll when nothing matches, skip once rerolls are spent.
    Prefer(&'static [ShardKind]),
}

/// Close the level-up modal according to the policy. Loops because a pick can
/// bank enough XP to reopen the modal immediately, and rerolls re-deal the
/// same modal; both paths strictly consume a rank or a charge, so this ends.
fn resolve_level_up(g: &mut Game, policy: PickPolicy) {
    while g.is_leveling_up() {
        let choices = g.level_choices;
        match policy {
            PickPolicy::FirstOffer => match (0..3).find(|&s| choices[s].is_some()) {
                Some(s) => g.select_shard(s as u8),
                None => g.skip_level_up(),
            },
            PickPolicy::Prefer(prefs) => {
                if let Some(s) =
                    (0..3).find(|&s| matches!(choices[s], Some(UpgradeOffer::Evolution(_))))
                {
                    g.select_shard(s as u8);
                    continue;
                }
                let mut best: Option<(usize, usize)> = None; // (pref rank, slot)
                for (s, choice) in choices.iter().enumerate() {
                    if let Some(UpgradeOffer::Shard(kind)) = choice {
                        if let Some(rank) = prefs.iter().position(|p| p == kind) {
                            if best.is_none_or(|(r, _)| rank < r) {
                                best = Some((rank, s));
                            }
                        }
                    }
                }
                match best {
                    Some((_, s)) => g.select_shard(s as u8),
                    None if g.reroll_charges() > 0 => g.reroll_level_up(),
                    None => g.skip_level_up(),
                }
            }
        }
    }
}

/// Deterministic survival pilot shared by every archetype: steer away from
/// concrete threats, drift toward gems when calm, dash through the worst.
/// Bosses are engaged in the archetype's orbit band while healthy — a pilot
/// that only flees can never let a contact-aura build fight a boss — and
/// fled from below the retreat HP fraction.
fn survival_input(g: &Game, frame: u32, orbit: (f32, f32)) -> (Vec2, bool) {
    let p = g.player.pos;
    let mut steer = Vec2::ZERO;
    let mut threat = 0.0f32;
    let mut dash = false;

    for e in &g.enemies {
        let to_e = nearest_globe_delta(p, e.pos);
        let danger_r = 150.0 + e.radius;
        let dist = to_e.length();
        if dist < danger_r {
            let kind_weight = match e.kind {
                EnemyKind::Brute => 1.6,
                EnemyKind::Dasher if e.state == EnemyState::Charging => 2.2,
                EnemyKind::Umbra => 1.4,
                _ => 1.0,
            };
            let w = (1.0 - dist / danger_r) * kind_weight;
            steer -= to_e.normalize_or_zero() * w;
            threat += w;
            if e.state == EnemyState::Charging && dist < 90.0 {
                dash = true;
            }
        }
    }

    for proj in &g.projectiles {
        // Dodge where the shot will be shortly, not where it is now.
        let to_p = nearest_globe_delta(p, proj.pos + proj.vel * 0.25);
        let dist = to_p.length();
        if dist < 110.0 {
            let w = (1.0 - dist / 110.0) * 1.4;
            steer -= to_p.normalize_or_zero() * w;
            threat += w;
        }
    }

    if let Some(b) = &g.boss {
        let to_b = nearest_globe_delta(p, b.pos);
        let dist = to_b.length();
        let healthy = g.player.hp > g.player.max_hp * 0.35;
        if healthy && b.state != BossState::Telegraphing {
            // Hold the orbit band (same shape as measure_boss_ttk) so beams
            // and auras actually fight the boss instead of kiting forever.
            let (near, far) = orbit;
            let tangent = Vec2::new(-to_b.y, to_b.x).normalize_or_zero();
            let radial = to_b.normalize_or_zero();
            let correction = if dist > far {
                radial
            } else if dist < near {
                -radial
            } else {
                Vec2::ZERO
            };
            steer += (tangent * 0.8 + correction) * 1.2;
        } else if dist < 170.0 {
            let w = (1.0 - dist / 170.0) * 1.8;
            steer -= to_b.normalize_or_zero() * w;
            threat += w;
        }
    }

    for sw in &g.void_shockwaves {
        let from_center = nearest_globe_delta(sw.pos, p);
        let dist = from_center.length();
        let ring = sw.current_radius();
        // The front hits once when it crosses the player; i-frame through it.
        if ring < dist && dist - ring < 70.0 {
            dash = true;
            steer += from_center.normalize_or_zero() * 0.8;
            threat += 0.8;
        }
    }

    for shell in &g.void_shells {
        let to_zone = nearest_globe_delta(p, shell.target);
        let zone_r = shell.radius + 40.0;
        let dist = to_zone.length();
        if dist < zone_r {
            steer -= to_zone.normalize_or_zero() * (1.5 * (1.0 - dist / zone_r));
            threat += 1.0;
        }
    }

    if threat < 0.8 {
        let mut nearest: Option<(f32, Vec2)> = None;
        for gem in &g.gems {
            let to_g = nearest_globe_delta(p, gem.pos);
            let d = to_g.length();
            if d < 280.0 && nearest.is_none_or(|(nd, _)| d < nd) {
                nearest = Some((d, to_g));
            }
        }
        if let Some((_, to_g)) = nearest {
            steer += to_g.normalize_or_zero() * (0.9 * (0.8 - threat));
        }
    }

    steer += wander_input(frame) * 0.25;
    if threat > 2.4 {
        dash = true; // panic button
    }
    (steer.normalize_or_zero(), dash)
}

struct RunRecord {
    seed: u32,
    victory: bool,
    end_time: f32,
    death_cause: i32,
    peak_rank: u32,
    kills: u32,
    boss_kills: u32,
    damage_taken: f32,
    damage_by_source: [f32; DAMAGE_SOURCE_COUNT],
    gems: u32,
    skips: u32,
    rerolls: u32,
    max_enemies: u32,
    /// (boss, fight seconds) — None when the run ended with the boss alive.
    boss_fights: Vec<(BossKind, Option<f32>)>,
    rank_by_minute: [u32; RANK_TIMELINE_BUCKETS],
    /// Cumulative damage taken at each minute boundary.
    damage_marks: [f32; RANK_TIMELINE_BUCKETS],
    build: Vec<(ShardKind, u8)>,
    evolutions: Vec<EvolutionKind>,
}

fn play_full_run(seed: u32, policy: PickPolicy, orbit: (f32, f32)) -> RunRecord {
    let mut g = new_game(seed);
    let mut frame = 0u32;
    let mut boss_active: Option<(BossKind, f32)> = None;
    let mut boss_fights: Vec<(BossKind, Option<f32>)> = Vec::new();
    let mut damage_marks = [0.0f32; RANK_TIMELINE_BUCKETS];
    let mut minute_cursor = 0usize;

    while !g.is_dead() && frame < 80_000 {
        frame += 1;
        if g.is_leveling_up() {
            resolve_level_up(&mut g, policy);
            continue; // modal frames do not advance the sim clock
        }
        let (dir, dash) = survival_input(&g, frame, orbit);
        g.set_input(dir.x, dir.y);
        g.set_dash_input(dash);
        g.update(DT);

        // In-situ boss fight clock: first non-telegraph frame -> slot clear.
        if let Some(b) = &g.boss {
            if boss_active.is_none() && b.state != BossState::Telegraphing {
                boss_active = Some((b.kind, g.time));
            }
        } else if let Some((kind, t0)) = boss_active.take() {
            boss_fights.push((kind, Some(g.time - t0)));
        }

        let minute = ((g.time / 60.0) as usize).min(RANK_TIMELINE_BUCKETS - 1);
        while minute_cursor < minute {
            minute_cursor += 1;
            damage_marks[minute_cursor] = g.damage_taken();
        }
    }
    if let Some((kind, _)) = boss_active {
        boss_fights.push((kind, None));
    }
    for mark in damage_marks.iter_mut().skip(minute_cursor + 1) {
        *mark = g.damage_taken();
    }

    let mut build: Vec<(ShardKind, u8)> = (0..SHARD_COUNT as u8)
        .filter_map(ShardKind::from_index)
        .map(|k| (k, g.inventory.level(k)))
        .filter(|&(_, lvl)| lvl > 0)
        .collect();
    build.sort_by(|a, b| b.1.cmp(&a.1));
    let evolutions = (0..EVOLUTION_COUNT as u8)
        .filter_map(EvolutionKind::from_index)
        .filter(|e| g.inventory.evolutions[e.as_index()])
        .collect();

    let mut rank_by_minute = [0u32; RANK_TIMELINE_BUCKETS];
    for (m, slot) in rank_by_minute.iter_mut().enumerate() {
        *slot = g.rank_at_minute(m as u8);
    }
    let mut damage_by_source = [0.0f32; DAMAGE_SOURCE_COUNT];
    for (i, slot) in damage_by_source.iter_mut().enumerate() {
        *slot = g.damage_by_source(i as u8);
    }

    RunRecord {
        seed,
        victory: g.is_victory(),
        end_time: g.time,
        death_cause: g.death_cause(),
        peak_rank: g.peak_rank(),
        kills: g.kills_total,
        boss_kills: g.boss_kills_count(),
        damage_taken: g.damage_taken(),
        damage_by_source,
        gems: g.gems_collected(),
        skips: g.skip_count(),
        rerolls: g.reroll_count(),
        max_enemies: g.max_enemies_observed(),
        boss_fights,
        rank_by_minute,
        damage_marks,
        build,
        evolutions,
    }
}

fn mmss(t: f32) -> String {
    format!("{}:{:02}", t as u32 / 60, t as u32 % 60)
}

#[test]
#[ignore = "balance evidence harness — run with --ignored --nocapture"]
fn baseline_runs_report() {
    use ShardKind::*;
    const DAMAGE_SOURCE_NAMES: [&str; DAMAGE_SOURCE_COUNT] =
        ["contact", "projectile", "boss", "shockwave"];
    // Orbit bands match measure_boss_ttk: contact-aura builds must hug the
    // boss to damage it; everyone else holds a mid-range beam orbit.
    let archetypes: [(&str, PickPolicy, (f32, f32)); 3] = [
        ("normal / no forced build", PickPolicy::FirstOffer, (160.0, 220.0)),
        (
            "aggressive close-range",
            PickPolicy::Prefer(&[Halo, Barrier, Siphon, Interference, Thorns, Armor, PrismHeart]),
            (40.0, 90.0),
        ),
        (
            "runaway beam",
            PickPolicy::Prefer(&[Split, Mirror, Cascade, Lens, Chromatic, Refract, Armor]),
            (160.0, 220.0),
        ),
    ];
    let seeds = [101u32, 2026, 4242, 7777, 90210];

    println!();
    println!("BASELINE 15:00 RUNS (shared survival pilot, {} seeds/archetype)", seeds.len());
    println!("targets: unfocused first death ~min 4-7; bosses 20-45 s; post-10:00 still moving");
    println!("{:=<78}", "");

    for (label, policy, orbit) in archetypes {
        let runs: Vec<RunRecord> = seeds
            .iter()
            .map(|&s| play_full_run(s, policy, orbit))
            .collect();

        println!();
        println!("== {label} ==");
        for r in &runs {
            let outcome = if r.victory {
                format!("VICTORY at {}", mmss(r.end_time))
            } else {
                let cause = DAMAGE_SOURCE_NAMES
                    .get(r.death_cause as usize)
                    .copied()
                    .unwrap_or("?");
                format!("death   at {} ({cause})", mmss(r.end_time))
            };
            println!(
                "seed {:5}  {outcome:24} rank {:2}  kills {:4}  dmg {:5.0}  gems {:3}  maxE {:3}",
                r.seed, r.peak_rank, r.kills, r.damage_taken, r.gems, r.max_enemies
            );
            let fights: Vec<String> = r
                .boss_fights
                .iter()
                .map(|(k, t)| match t {
                    Some(t) => format!("{k:?} {t:.1}s"),
                    None => format!("{k:?} DNF"),
                })
                .collect();
            let build: Vec<String> = r
                .build
                .iter()
                .take(7)
                .map(|(k, l)| format!("{k:?} {l}"))
                .collect();
            let evos: Vec<String> = r.evolutions.iter().map(|e| format!("{e:?}")).collect();
            println!(
                "           bosses [{}]  skips {} rerolls {}  build [{}]{}",
                fights.join(", "),
                r.skips,
                r.rerolls,
                build.join(", "),
                if evos.is_empty() {
                    String::new()
                } else {
                    format!("  evo [{}]", evos.join(", "))
                }
            );
        }

        // Archetype aggregates.
        let mut end_times: Vec<f32> = runs.iter().map(|r| r.end_time).collect();
        end_times.sort_by(f32::total_cmp);
        let median = end_times[end_times.len() / 2];
        let victories = runs.iter().filter(|r| r.victory).count();
        let avg_peak: f32 =
            runs.iter().map(|r| r.peak_rank as f32).sum::<f32>() / runs.len() as f32;

        let mut source_totals = [0.0f32; DAMAGE_SOURCE_COUNT];
        for r in &runs {
            for (total, v) in source_totals.iter_mut().zip(r.damage_by_source) {
                *total += v;
            }
        }
        let source_summary: Vec<String> = DAMAGE_SOURCE_NAMES
            .iter()
            .zip(source_totals)
            .filter(|(_, v)| *v > 0.0)
            .map(|(n, v)| format!("{n} {:.0}", v / runs.len() as f32))
            .collect();

        // Damage rate before and after overdrive, only over minutes a run
        // actually survived (otherwise dead runs dilute the late rate).
        let (mut early_dmg, mut early_min, mut late_dmg, mut late_min) = (0.0f32, 0u32, 0.0f32, 0u32);
        for r in &runs {
            let end_minute = (r.end_time / 60.0).min(15.0);
            for m in 1..RANK_TIMELINE_BUCKETS {
                if (m as f32) > end_minute.ceil() {
                    break;
                }
                let delta = (r.damage_marks[m]
                    - r.damage_marks[m - 1])
                    .max(0.0);
                if m <= 10 {
                    early_dmg += delta;
                    early_min += 1;
                } else {
                    late_dmg += delta;
                    late_min += 1;
                }
            }
        }

        let mut rank_line = String::new();
        for m in [3usize, 5, 8, 10, 13, 15] {
            let avg: f32 = runs
                .iter()
                .map(|r| r.rank_by_minute[m.min(RANK_TIMELINE_BUCKETS - 1)] as f32)
                .sum::<f32>()
                / runs.len() as f32;
            rank_line.push_str(&format!("{m}:00->{avg:.0}  "));
        }

        let avg_boss_kills: f32 =
            runs.iter().map(|r| r.boss_kills as f32).sum::<f32>() / runs.len() as f32;
        println!(
            "-- {victories}/{} victories, median end {}, avg peak rank {avg_peak:.1}, avg boss kills {avg_boss_kills:.1}",
            runs.len(),
            mmss(median)
        );
        println!("-- avg dmg by source: {}", source_summary.join(", "));
        println!(
            "-- dmg/min survived: {:.0} (min 1-10) vs {:.0} (min 11-15)",
            if early_min > 0 { early_dmg / early_min as f32 } else { 0.0 },
            if late_min > 0 { late_dmg / late_min as f32 } else { 0.0 }
        );
        println!("-- avg rank at {rank_line}");
    }
    println!();
    println!("{:=<78}", "");
}

#[test]
#[ignore = "balance evidence harness — run with --ignored --nocapture"]
fn boss_ttk_report() {
    use ShardKind::*;
    // Reference builds sized to plausible pick budgets at each milestone:
    // ~12 levels at 5:00 (Sentinel), ~22 at 10:00 (Hydra), ~28 at 13:00
    // (Void Prism). Three archetypes per milestone.
    let balanced_5 = [
        (Split, 3u8),
        (Lens, 2),
        (Mirror, 2),
        (Refract, 1),
        (Armor, 2),
        (PrismHeart, 2),
    ];
    let beam_5 = [(Split, 4u8), (Mirror, 3), (Lens, 3), (Chromatic, 2)];
    let close_5 = [(Halo, 4u8), (Barrier, 4), (Siphon, 2), (Interference, 2)];

    let balanced_10 = [
        (Split, 4u8),
        (Lens, 4),
        (Mirror, 3),
        (Refract, 2),
        (Halo, 3),
        (Armor, 3),
        (PrismHeart, 3),
    ];
    let beam_10 = [
        (Split, 6u8),
        (Mirror, 6),
        (Cascade, 4),
        (Lens, 4),
        (Chromatic, 2),
    ];
    let close_10 = [
        (Halo, 6u8),
        (Barrier, 6),
        (Siphon, 4),
        (Interference, 4),
        (Thorns, 2),
    ];

    let beam_13 = [
        (Split, 6u8),
        (Mirror, 6),
        (Cascade, 6),
        (Lens, 6),
        (Chromatic, 4),
    ];
    let close_13 = [
        (Halo, 6u8),
        (Barrier, 6),
        (Interference, 6),
        (Siphon, 4),
        (Thorns, 4),
        (Armor, 2),
    ];
    let balanced_13 = [
        (Split, 4u8),
        (Lens, 4),
        (Mirror, 3),
        (Refract, 2),
        (Halo, 3),
        (Cascade, 3),
        (Frost, 3),
        (Armor, 3),
        (PrismHeart, 3),
    ];

    let cases: [(&str, BossKind, &[(ShardKind, u8)]); 9] = [
        ("Sentinel / balanced@5:00", BossKind::Sentinel, &balanced_5),
        ("Sentinel / beam@5:00", BossKind::Sentinel, &beam_5),
        ("Sentinel / close@5:00", BossKind::Sentinel, &close_5),
        ("Hydra    / balanced@10:00", BossKind::Hydra, &balanced_10),
        ("Hydra    / beam@10:00", BossKind::Hydra, &beam_10),
        ("Hydra    / close@10:00", BossKind::Hydra, &close_10),
        ("VoidPrism/ beam@13:00", BossKind::VoidPrism, &beam_13),
        ("VoidPrism/ close@13:00", BossKind::VoidPrism, &close_13),
        ("VoidPrism/ balanced@13:00", BossKind::VoidPrism, &balanced_13),
    ];

    println!();
    println!("BOSS TTK REPORT (target band: 20-45 s on a healthy build)");
    println!("{:-<64}", "");
    for (label, kind, build) in cases {
        let mut times: Vec<f32> = Vec::new();
        for seed in [11u32, 222, 3333] {
            match measure_boss_ttk(kind, build, seed) {
                Some(t) => times.push(t),
                None => println!("{label:34} seed run DID NOT FINISH (>240 s)"),
            }
        }
        if !times.is_empty() {
            let avg = times.iter().sum::<f32>() / times.len() as f32;
            let lo = times.iter().cloned().fold(f32::MAX, f32::min);
            let hi = times.iter().cloned().fold(f32::MIN, f32::max);
            println!("{label:34} avg {avg:6.1} s   (min {lo:5.1} / max {hi:5.1})");
        }
    }
    println!("{:-<64}", "");
}
