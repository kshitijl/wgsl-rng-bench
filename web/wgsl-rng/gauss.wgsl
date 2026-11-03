// Gaussian samples by Box-Muller: each thread turns one rand4 into four standard normals and
// counts them into a histogram over [-6, 6), first per workgroup, then one atomic per bin.

struct Params {
  count: u32, // threads
  frame: u32,
  seed: u32,
  pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>, 128>;

const CALLS = 1u;
const BINS = 128u;
const RANGE = 6.0;
const PI = 3.14159265;

var<workgroup> group_hist: array<atomic<u32>, 128>;

fn thread_count() -> u32 {
  return params.count;
}

fn gaussians(u: vec4f) -> vec4f {
  let r1 = sqrt(-2.0 * log(1.0 - u.x));
  let r2 = sqrt(-2.0 * log(1.0 - u.z));
  let a1 = 2.0 * PI * u.y;
  let a2 = 2.0 * PI * u.w;
  return vec4f(r1 * cos(a1), r1 * sin(a1), r2 * cos(a2), r2 * sin(a2));
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) local: u32) {
  // No early return: every thread has to reach the barriers.
  if (local < BINS) { atomicStore(&group_hist[local], 0u); }
  workgroupBarrier();
  if (id.x < params.count) {
    rng_begin(id.x, params.frame);
    let g = gaussians(rand4(0u));
    rng_end();
    for (var j = 0u; j < 4u; j++) {
      let b = u32(clamp((g[j] + RANGE) / (2.0 * RANGE) * f32(BINS), 0.0, f32(BINS - 1u)));
      atomicAdd(&group_hist[b], 1u);
    }
  }
  workgroupBarrier();
  if (local < BINS) {
    let c = atomicLoad(&group_hist[local]);
    if (c > 0u) { atomicAdd(&hist[local], c); }
  }
}
