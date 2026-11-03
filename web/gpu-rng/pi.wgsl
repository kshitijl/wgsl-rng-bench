// Estimating pi by throwing darts at the unit square: the fraction landing inside the quarter
// circle x^2 + y^2 < 1 is pi / 4. Each thread throws DARTS darts per frame, counts its hits, and
// keeps its first dart's position for drawing. Two darts, one draw: with more draws per thread the
// arithmetic hides the cost of the stateful variant's state (8 darts: 1.03x, 2 darts: 2.3x). Needs rand4 from rng-stateful.wgsl or
// rng-stateless.wgsl.

struct Params {
  count: u32, // threads
  frame: u32,
  seed: u32,
  pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> hits: array<atomic<u32>, 1>;
@group(0) @binding(2) var<storage, read_write> darts: array<vec2f>;

const DARTS = 2u;
const CALLS = DARTS / 2u; // each draw gives four floats: two darts

var<workgroup> group_hits: atomic<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) local: u32) {
  // No early return: every thread has to reach the barrier.
  var inside = 0u;
  if (id.x < params.count) {
    rng_begin(id.x, params.frame);
    for (var c = 0u; c < CALLS; c++) {
      let r = rand4(c);
      inside += select(0u, 1u, dot(r.xy, r.xy) < 1.0) + select(0u, 1u, dot(r.zw, r.zw) < 1.0);
      if (c == 0u) { darts[id.x] = r.xy; }
    }
    rng_end();
  }
  // Add up the workgroup's hits, then one atomic per workgroup.
  atomicAdd(&group_hits, inside);
  workgroupBarrier();
  if (local == 0u) { atomicAdd(&hits[0], atomicLoad(&group_hits)); }
}
