// PCG32 (pcg32-core.wgsl), stateful: 16 bytes per thread (state and increment); four steps per
// rand4u. Each thread is its own PCG stream, pcg32_srandom_r(h, thread), where h is a Philox hash
// of (thread, seed). With pcg32_srandom_r(seed, thread), every thread starting from the same state,
// the threads' outputs are correlated: PractRand fails at 64 MB (quality/README.md).

@group(0) @binding(9) var<storage, read_write> states: array<Pcg32>;

var<private> rng_thread: u32;
var<private> rng_state: Pcg32;

fn rng_begin(thread: u32, frame: u32) {
  rng_thread = thread;
  rng_state = states[thread];
}

fn rng_end() {
  states[rng_thread] = rng_state;
}

fn next_u32() -> u32 {
  let step = pcg32_next(rng_state);
  rng_state = step.rng;
  return step.out;
}

fn rand4u(call: u32) -> vec4u {
  let a = next_u32();
  let b = next_u32();
  let c = next_u32();
  let d = next_u32();
  return vec4u(a, b, c, d);
}

@compute @workgroup_size(256)
fn init(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= thread_count()) { return; }
  let h = philox4x32_10(vec4u(id.x, 0u, 0u, 0u), vec2u(params.seed, 0x9C632u));
  states[id.x] = pcg32_seeded(h.xy, vec2u(id.x, 0u));
}
