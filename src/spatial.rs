//! Zero-allocation flat spatial hash grid for local globe tangent queries.
//!
//! Indexes enemy positions projected into the player's local tangent plane so
//! late-game hordes (1,000+ enemies) get O(1) neighborhood lookups for
//! enemy soft-separation, beams, halos, frost fields, and area pulses.

use glam::Vec2;

const CELL_SIZE: f32 = 72.0;
const INV_CELL_SIZE: f32 = 1.0 / CELL_SIZE;
const GRID_DIM: usize = 32;
const GRID_CELLS: usize = GRID_DIM * GRID_DIM;
const HALF_EXTENT: f32 = (GRID_DIM as f32 * 0.5) * CELL_SIZE; // 1152.0 world units

pub struct SpatialGrid {
    head: [i32; GRID_CELLS],
    next: Vec<i32>,
    local_pos: Vec<Vec2>,
    overflow: Vec<usize>,
}

impl SpatialGrid {
    pub fn new() -> Self {
        Self {
            head: [-1; GRID_CELLS],
            next: Vec::with_capacity(1024),
            local_pos: Vec::with_capacity(1024),
            overflow: Vec::with_capacity(64),
        }
    }

    /// Rebuilds the grid in O(N) with zero heap allocations after warm-up.
    /// `positions` yields the tangent delta `nearest_globe_delta(origin, e.pos)` for each index.
    pub fn rebuild<F>(&mut self, count: usize, mut local_pos_fn: F)
    where
        F: FnMut(usize) -> Vec2,
    {
        self.head.fill(-1);
        self.next.clear();
        self.local_pos.clear();
        self.overflow.clear();

        self.next.resize(count, -1);
        self.local_pos.reserve(count);

        for i in 0..count {
            let p = local_pos_fn(i);
            self.local_pos.push(p);
            if let Some(cell) = Self::cell_index(p) {
                self.next[i] = self.head[cell];
                self.head[cell] = i as i32;
            } else {
                self.overflow.push(i);
            }
        }
    }

    #[inline]
    pub fn local_pos(&self, idx: usize) -> Vec2 {
        self.local_pos[idx]
    }

    #[inline]
    fn coord_to_cell(v: f32) -> i32 {
        ((v + HALF_EXTENT) * INV_CELL_SIZE).floor() as i32
    }

    #[inline]
    fn cell_index(p: Vec2) -> Option<usize> {
        let cx = Self::coord_to_cell(p.x);
        let cy = Self::coord_to_cell(p.y);
        if cx < 0 || cy < 0 || cx >= GRID_DIM as i32 || cy >= GRID_DIM as i32 {
            None
        } else {
            Some(cy as usize * GRID_DIM + cx as usize)
        }
    }

    /// Visits all enemy indices whose grid cell overlaps the axis-aligned box
    /// `[min_p, max_p]` in the player's local tangent frame, plus any overflow
    /// entries when the box touches the outer grid boundary.
    pub fn query_aabb<F>(&self, min_p: Vec2, max_p: Vec2, mut visit: F)
    where
        F: FnMut(usize),
    {
        let raw_min_x = Self::coord_to_cell(min_p.x);
        let raw_max_x = Self::coord_to_cell(max_p.x);
        let raw_min_y = Self::coord_to_cell(min_p.y);
        let raw_max_y = Self::coord_to_cell(max_p.y);

        let touches_outside = raw_min_x < 0
            || raw_min_y < 0
            || raw_max_x >= GRID_DIM as i32
            || raw_max_y >= GRID_DIM as i32;

        let min_x = raw_min_x.clamp(0, GRID_DIM as i32 - 1) as usize;
        let max_x = raw_max_x.clamp(0, GRID_DIM as i32 - 1) as usize;
        let min_y = raw_min_y.clamp(0, GRID_DIM as i32 - 1) as usize;
        let max_y = raw_max_y.clamp(0, GRID_DIM as i32 - 1) as usize;

        if raw_max_x >= 0
            && raw_max_y >= 0
            && raw_min_x < GRID_DIM as i32
            && raw_min_y < GRID_DIM as i32
        {
            for cy in min_y..=max_y {
                let row = cy * GRID_DIM;
                for cx in min_x..=max_x {
                    let mut idx = self.head[row + cx];
                    while idx >= 0 {
                        let u = idx as usize;
                        visit(u);
                        idx = self.next[u];
                    }
                }
            }
        }

        if touches_outside {
            for &u in &self.overflow {
                visit(u);
            }
        }
    }

    /// Visits all enemy indices near a circle `(center, radius)` in local tangent coordinates.
    #[inline]
    pub fn query_circle<F>(&self, center: Vec2, radius: f32, visit: F)
    where
        F: FnMut(usize),
    {
        let pad = Vec2::splat(radius + 28.0);
        self.query_aabb(center - pad, center + pad, visit);
    }

    /// Visits all enemy indices near a line segment `(a, b)` inflated by `half_width`.
    #[inline]
    pub fn query_segment<F>(&self, a: Vec2, b: Vec2, half_width: f32, visit: F)
    where
        F: FnMut(usize),
    {
        let pad = Vec2::splat(half_width + 32.0);
        let min_p = a.min(b) - pad;
        let max_p = a.max(b) + pad;
        self.query_aabb(min_p, max_p, visit);
    }

    /// Visits up to `max_neighbors` nearby indices in the 3x3 cell neighborhood of `idx`.
    pub fn visit_neighbors<F>(&self, idx: usize, max_neighbors: usize, mut visit: F)
    where
        F: FnMut(usize),
    {
        let p = self.local_pos[idx];
        let cx = Self::coord_to_cell(p.x);
        let cy = Self::coord_to_cell(p.y);
        if cx < 0 || cy < 0 || cx >= GRID_DIM as i32 || cy >= GRID_DIM as i32 {
            return;
        }
        let min_x = (cx - 1).max(0) as usize;
        let max_x = (cx + 1).min(GRID_DIM as i32 - 1) as usize;
        let min_y = (cy - 1).max(0) as usize;
        let max_y = (cy + 1).min(GRID_DIM as i32 - 1) as usize;

        let mut seen = 0usize;
        for ny in min_y..=max_y {
            let row = ny * GRID_DIM;
            for nx in min_x..=max_x {
                let mut cur = self.head[row + nx];
                while cur >= 0 {
                    let u = cur as usize;
                    if u != idx {
                        visit(u);
                        seen += 1;
                        if seen >= max_neighbors {
                            return;
                        }
                    }
                    cur = self.next[u];
                }
            }
        }
    }
}

impl Default for SpatialGrid {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spatial_grid_finds_all_points_in_radius_and_overflow() {
        let pts = [
            Vec2::new(10.0, 10.0),
            Vec2::new(45.0, -20.0),
            Vec2::new(400.0, 400.0),
            Vec2::new(1500.0, 0.0), // overflow
        ];
        let mut grid = SpatialGrid::new();
        grid.rebuild(pts.len(), |i| pts[i]);

        let mut found = Vec::new();
        grid.query_circle(Vec2::ZERO, 60.0, |i| found.push(i));
        found.sort_unstable();
        assert_eq!(found, vec![0, 1]);

        let mut far = Vec::new();
        grid.query_circle(Vec2::new(1480.0, 0.0), 60.0, |i| far.push(i));
        assert!(far.contains(&3));
    }
}
