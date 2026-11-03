// xoshiro128** (xoshiro-core.wgsl), stateful: 16 bytes per thread; four steps per rand4u. Each
// thread's state is a Philox hash of (thread, seed), never all zero. (The authors suggest seeding
// from splitmix64, or jump() for parallel streams; a hash per thread is the GPU-friendly way.)

@group(0) @binding(9) var<storage, read_write> states: array<Xoshiro128>;

var<private> rng_thread: u32;
var<private> rng_state: Xoshiro128;

fn rng_begin(thread: u32, frame: u32) {
  rng_thread = thread;
  rng_state = states[thread];
}

fn rng_end() {
  states[rng_thread] = rng_state;
}

fn next_u32() -> u32 {
  let step = xoshiro128ss(rng_state);
  rng_state = step.state;
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
  var s = philox4x32_10(vec4u(id.x, 0u, 0u, 0u), vec2u(params.seed, 0x50517u));
  if (all(s == vec4u(0u))) { s.x = 1u; }
  states[id.x] = Xoshiro128(s);
}
