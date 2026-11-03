// XORWOW (../gpu-rng/xorwow-core.wgsl), stateful: 24 bytes per thread, loaded and stored each
// frame; four steps per rand4u.

@group(0) @binding(9) var<storage, read_write> states: array<XorwowState>;

var<private> rng_thread: u32;
var<private> rng_state: XorwowState;

fn rng_begin(thread: u32, frame: u32) {
  rng_thread = thread;
  rng_state = states[thread];
}

fn rng_end() {
  states[rng_thread] = rng_state;
}

fn next_u32() -> u32 {
  rng_state = xorwow_step(rng_state);
  return xorwow_out(rng_state);
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
  states[id.x] = xorwow_seeded(id.x, params.seed);
}
